import { IClientSession } from "@jupyterlab/apputils";
import { Kernel, KernelMessage } from "@jupyterlab/services";
import { AsyncTools } from "@mavenomics/coreutils";
import { JSONValue } from "@phosphor/coreutils";
import { IDisposable } from "@phosphor/disposable";
import { AttachedProperty } from "@phosphor/properties";
import { Observable, Subject, race, TimeoutError } from "rxjs";
import { first, timeout } from "rxjs/operators";

/**
 * Manage a comm for a session, reconnecting when necessary.
 *
 * MsgType - A type describing the shape of messages sent to the kernel
 * ResponseType - A type describing the shape of messages sent to the client
 *
 * @remarks
 *
 * Comm management is a very complex topic, covered here in some detail:
 * https://docs.google.com/document/d/1Wg6LHCb9aesxZ-WjHenZHejKbX-J6LeBktThsz2G87E/edit#
 *
 * A CommManager connects to a comm channel and handles the cross-cutting
 * concerns of keeping that comm alive and handling what to do when it dies.
 * This class only works for client-initiated, kernel-side comms.
 */
export class CommManager<
    MsgType extends JSONValue,
    ResponseType extends JSONValue = MsgType
> implements IDisposable {
    /** Create a new CommManager, or recycle an already-instantiated manager */
    public static Create<T extends JSONValue, U extends JSONValue>({
        session,
        commName
    }: CommManager.IOptions) {
        const opts = Private.InstanceMap.get(session);
        let candidate = opts.find(i => i.commName === commName);
        if (candidate != null) return candidate;
        candidate = new CommManager<T, U>({session, commName});
        // this will mutate the reference in the AttachedProperty
        opts.push(candidate!);
        return candidate;
    }

    private readonly _msgRecievedSrc$ = new Subject<ResponseType>();
    private readonly _msgRecieved: Observable<ResponseType>;
    private readonly _commClosedSrc$ = new Subject<never>();
    private readonly _commClosed: Observable<never>;
    private readonly _commOpenedSrc$ = new Subject<never>();
    private readonly _commOpened: Observable<never>;
    private readonly _commName: string;
    private readonly session: IClientSession;
    private comm: Kernel.IComm | null = null;
    private _isDisposed = false;
    private connectionLock: AsyncTools.Mutex;
    /** This is a flag to check for kernel setup.
     *
     * If this comm attempts to connect and fails, then `#connectToComm()` will
     * set this to `true` and wait for a special blob to arrive on the kernel
     * IOPub channel. This blob has a `mavenomics_state_ok` key in it's
     * `transient` dict, and is sent by the library `__init__` to signal that
     * the kernel is now setup and ready to accept connections. When that
     * happens, this will be cleared and the CommManager will again call
     * `#connectToComm()` to setup the channel.
     */
    private awaitingSetup = false;

    protected constructor({session, commName}: CommManager.IOptions) {
        this._commName = commName;
        this.session = session;
        this.connectionLock = new AsyncTools.Mutex();
        this._msgRecieved = this._msgRecievedSrc$.asObservable();
        this._commClosed = this._commClosedSrc$.asObservable();
        this._commOpened = this._commOpenedSrc$.asObservable();
        this.session.statusChanged.connect(this.onKernelStatusChanged, this);
        this.session.kernelChanged.connect(this.onKernelChanged, this);
        this.session.iopubMessage.connect(this.onIopubMsg, this);
        this.session.terminated.connect(this.dispose, this);
    }

    public dispose() {
        if (this._isDisposed) return;
        this._msgRecievedSrc$.complete();
        this._commClosedSrc$.complete();
        this._commOpenedSrc$.complete();
        this.session.iopubMessage.disconnect(this.onIopubMsg, this);
        this.session.statusChanged.disconnect(this.onKernelStatusChanged, this);
        this.session.kernelChanged.disconnect(this.onKernelChanged, this);
        const instances = Private.InstanceMap.get(this.session);
        // clear this instance from the recycler
        Private.InstanceMap.set(
            this.session,
            instances.filter(i => i.commName !== this.commName)
        );
        this._isDisposed = true;
    }

    /** The name of the comm channel that this manager communicates with */
    public get commName() { return this._commName; }
    /** Whether this manager has been cleaned up */
    public get isDisposed() { return this._isDisposed; }
    /** An Observable that emits whenever a message is sent by the kernel */
    public get msgRecieved() { return this._msgRecieved; }
    /** Throws an error whenever the comm has closed.
     *
     * @remarks
     *
     * This can happen if the comm is disposed (on either side), the
     * kernel-side of the comm encounters an unhandled exception, or if the
     * kernel itself crashes.
     *
     * If you don't want errors, pipe this observable through catchError.
     */
    public get commClosed() { return this._commClosed; }
    /** Emits when the comm has opened.
     *
     * @remarks
     *
     * Usually, the comm is only opened when needed. However, it can also be
     * opened via a push message from the kernel, signaling to the client that
     * the kernel can accept comms. When either of those events happen, this
     * observable will emit to signal that the comm is now open and ready for
     * communication. This observable exists to handle cases where the client
     * may need to eagerly sync state with the kernel, such as the SyncMetadata
     * comm.
     */
    public get commOpened() { return this._commOpened; }
    /** Whether this comm is online and ready to communicate. */
    public get isOpen() {
        // If the connection lock isn't free, something else is still trying to
        // setup the comm. This could mean that the comm only *appears* open,
        // esp. if the kernel is busy (and thus not able to process the close
        // instantaneously).
        return !this.awaitingSetup
            && this.comm != null
            && !this.comm.isDisposed
            && this.connectionLock.isFree;
    }

    /**
     * Send a message without expecting a response.
     *
     * @param msg The message to send to the kernel
     */
    public async send(msg: MsgType) {
        await this.connectToComm();
        const future = this.comm!.send(msg);
        const response = await future.done;
        future.dispose();
        return response;
    }

    /**
     * Send a message and wait for a response from the kernel.
     *
     * @param msg The message to send to the kernel
     * @param responsePredicate A predicate to select the desired response from the kernel
     * @param timeoutMs A timeout to reject if no response is recieved in.
     *
     * Note: The timeout is _not_ optional. Various things may cause comm death
     * and while this function will try it's best, not all cases can be
     * accounted for (such as the network disconnecting or the kernel freezing)
     */
    public async sendAndAwaitResponse<Resp extends ResponseType = ResponseType>(
        msg: MsgType,
        responsePredicate: (msg: ResponseType) => msg is Resp,
        timeoutMs = 20000,
    ) {
        await this.connectToComm();
        const onMsg = race(
            this.msgRecieved.pipe(
                first(responsePredicate),
                // if the above doesn't emit in 20 seconds, error
                timeout(timeoutMs)
            ),
            this.commClosed,
        ).toPromise();
        await this.send(msg);
        try {
            const response = await onMsg;
            return response;
        } catch (err) {
            console.log("[CommManager]", "Comm response error");
            console.log(err);
            if (err instanceof TimeoutError) {
                throw new Error("Timeout: expected a response from the kernel but recieved none");
            }
            throw new Error("Comm channel closed, expected a response from the kernel");
        }
    }

    private async connectToComm(_hasRerun = false) {
        if (this.isOpen) {
            return;
        }
        if (this.awaitingSetup) {
            // give a more long-form message since this is a bit complicated
            throw Error(Private.AWAITING_SETUP_ERR);
        }
        if (!_hasRerun && !this.connectionLock.isFree) {
            // the comm will be connected by something else
            await this.connectionLock.lock;
            if (!this.isOpen) {
                throw Error("Failed to connect to kernel");
            }
            return;
        }
        if (this.session.kernel == null) {
            throw Error("No kernel connected");
        }
        await this.session.ready;
        this.comm = this.session.kernel.connectToComm(this._commName);
        this.comm.onMsg = (msg) => {
            this._msgRecievedSrc$.next(msg.content.data as ResponseType);
        };
        const commFuture = this.comm.open();
        await commFuture.done;
        commFuture.dispose();
        // This is distinct from being open: By now, if the comm is ready, then
        // it'll be non-null and not-disposed. Finish setting it up, release the
        // mutex, and then it'll be "open".
        if (this.comm != null && !this.comm.isDisposed) {
            this.comm.onClose = () => {
                console.log("Comm closed");
                this._commClosedSrc$.error(new Error("Comm closed"));
            };
            this.connectionLock.release();
            this._commOpenedSrc$.next();
            return;
        }
        // the comm was immediately disposed, which happens when the kernel
        // didn't recognize the channel

        this.connectionLock.release();

        // If we previously re-ran it, then it won't work this time. Give up
        if (_hasRerun) {
            throw Error("Could not connect to kernel. Check your MavenWorks install");
        }
        // Otherwise, let's set a magic payload listener and re-try when that
        // listener comes back with a message.
        this.awaitingSetup = true;
        throw Error(Private.AWAITING_SETUP_ERR);
    }

    private async onIopubMsg(
        session: IClientSession,
        {content, header}: KernelMessage.IMessage
    ) {
        if (header.msg_type !== "display_data") return;
        if (this.isOpen) return;
        const {transient} = content as KernelMessage.IDisplayDataMsg["content"];
        if (!transient || !transient.hasOwnProperty("mavenomics_state_ok")) {
            return;
        }

        // we're good to connect now, the kernel assures us that everything
        // is setup and safe to use

        // wait for the connection lock, and re-check for status
        await this.connectionLock.lock;
        this.awaitingSetup = false;
        if (this.isOpen) {
            // all set, no need to do anything
            return;
        }
        this.connectToComm(true);
    }

    private onKernelChanged() {
        if (this.comm != null) {
            console.log("Comm closed: Kernel Changing");
            this._commClosedSrc$.error(new Error("Comm closed"));
        }
    }

    private onKernelStatusChanged(_: IClientSession, status: Kernel.Status) {
        if (this.comm != null && status === "restarting") {
            console.log("Comm closed: Kernel Restarting");
            this._commClosedSrc$.error(new Error("Comm closed"));
        }
    }
}

export namespace CommManager {
    export interface IOptions {
        session: IClientSession;
        commName: string;
    }
}

namespace Private {
    export const InstanceMap = new AttachedProperty<
        IClientSession,
        Array<CommManager<any>>
    >({
        create: () => [],
        name: "InstanceMap"
    });

    export const AWAITING_SETUP_ERR = (
        "Kernel not initialized!\n\nIf you are running Python, you " +
        "may need to import the library to use this feature. Try " +
        "running:\n\n```\nimport mavenworks\n```\n\nto clear this " +
        "error."
    );
}
