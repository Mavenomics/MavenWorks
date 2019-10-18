import { IClientSession, ISanitizer } from "@jupyterlab/apputils";
import { IRenderMimeRegistry } from "@jupyterlab/rendermime";
import { Session, Kernel, KernelMessage } from "@jupyterlab/services";
import { IDisposable } from "@phosphor/disposable";
import { AttachedProperty } from "@phosphor/properties";
import { Subject, Observable } from "rxjs";
import { DisplayHandle } from "./handle";

export class DisplayHandleManager implements IDisposable {
    public static GetManager(session: IClientSession) {
        let inst = this.Outputs.get(session);
        if (inst == null) {
            inst = new DisplayHandleManager({ session });
            this.Outputs.set(session, inst);
        }
        return inst;
    }

    private static Outputs = new AttachedProperty<IClientSession, DisplayHandleManager | null>({
        name: "DisplayOutputs",
        create: () => null,
        changed: (_, oldValue) => {
            if (oldValue && !oldValue.isDisposed) {
                oldValue.dispose();
            }
        },
    });

    private _isDisposed = false;
    private readonly session: IClientSession;
    private readonly idToName = new Map<string, string>();
    private readonly onHandleUpdatedSrc$ = new Subject<DisplayHandle.IRenderData>();
    private readonly _onHandleUpdated: Observable<DisplayHandle.IRenderData>;

    protected constructor({session}: DisplayHandleManager.IOptions) {
        this.session = session;
        if (session.kernel) {
            this.setupKernelHooks(session.kernel as Kernel.IKernel);
        }
        session.kernelChanged.connect(this.onKernelChanged, this);
        this._onHandleUpdated = this.onHandleUpdatedSrc$.asObservable();
    }

    public get isDisposed() { return this._isDisposed; }
    public get onHandleUpdated() { return this._onHandleUpdated; }

    public dispose() {
        if (this._isDisposed) return;

        this.session.kernelChanged.disconnect(this.onKernelChanged, this);
        if (this.session.kernel) {
            this.destroyKernelHooks(this.session.kernel as Kernel.IKernel);
        }
        this.onHandleUpdatedSrc$.complete();
    }

    public registerIdForName(id: string, name: string) {
        this.idToName.set(id, name);
    }

    public getAllNamedHandles() {
        return this.idToName.values();
    }

    public createHandle(
        name: string,
        registry: IRenderMimeRegistry,
        sanitizer: ISanitizer
    ) {
        return new DisplayHandle({
            name,
            registry,
            sanitizer,
            onUpdated: this.onHandleUpdated
        });
    }

    private onKernelChanged(_: unknown, {oldValue, newValue}: Session.IKernelChangedArgs) {
        if (oldValue != null) {
            this.destroyKernelHooks(oldValue as Kernel.IKernel);
        }
        if (newValue != null) {
            this.setupKernelHooks(newValue as Kernel.IKernel);
        }
    }

    private setupKernelHooks(kernel: Kernel.IKernel) {
        kernel.iopubMessage.connect(this.onKernelMsg, this);
    }

    private destroyKernelHooks(kernel: Kernel.IKernel) {
        kernel.iopubMessage.disconnect(this.onKernelMsg, this);
        this.idToName.clear();
    }

    private onKernelMsg(kernel: Kernel.IKernel, msg: KernelMessage.IIOPubMessage) {
        if (!KernelMessage.isUpdateDisplayDataMsg(msg)) {
            return;
        }
        const displayId = msg.content.transient.display_id;
        const name = this.idToName.get(displayId);
        if (name == null) {
            return;
        }
        const { data, metadata } = msg.content;
        // we know what the name is, so report it
        this.onHandleUpdatedSrc$.next({
            data,
            metadata,
            name
        });
    }
}

export namespace DisplayHandleManager {
    export interface IOptions {
        session: IClientSession;
    }
}
