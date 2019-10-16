import { JSONObject, JSONExt } from "@phosphor/coreutils";
import { filter } from "rxjs/operators";
import { KernelError } from "../util/PythonError";
import { Converters, JSONObject as SerializedObject } from "@mavenomics/coreutils";
import { Part, OptionsBag } from "@mavenomics/parts";
import { CommManager } from "../util/CommManager";
import { MimeModel, IRenderMime } from "@jupyterlab/rendermime";

/**
 * This part is a proxy/wrapper around kernel parts that live on the Kernel.
 * The KPP uses a comm to connect to a kernel-side KernelPartManager, and use
 * that to manage the lifecycle of a kernelside part.
 *
 * Each part connects over the same comm, and that comm provides some helpers
 * for syncing the available parts with the client-side part factory
 */
export abstract class KernelProxyPart extends Part {
    protected readonly type: string;
    private comm: CommManager<Msg.KernelProxyMessage, Msg.KernelResponseMessage>;
    private bag: OptionsBag | null = null;
    private msgId: string; // A unique ID for kernel comms
    private model: MimeModel | null = null;
    private renderer: IRenderMime.IRenderer | null = null;

    constructor(opts: Part.IOptions) {
        super(opts);
        this.msgId = this.context.dashboardId + " " + this.uuid;
        this.type = "";
        if (this.context.session == null) {
            throw Error("Kernel not found!");
        }
        if (this.context.rendermime == null) {
            throw Error("Rendermime registry not found!");
        }
        this.comm = CommManager.Create({
            commName: "kernel_proxy_part",
            session: this.context.session
        });
    }

    public getName() { return this.type; }

    public async setup() {
        const uuid = this.msgId;
        await this.comm.send({
            uuid,
            msg_type: "create",
            payload: this.type
        });
    }

    public async initialize() {
        await this.setup();
        const uuid = this.msgId;
        this.comm.msgRecieved.pipe(
            filter((i): i is Msg.IStaleMsg => i.msg_type === "stale" && i.uuid === uuid),
        ).subscribe(i => {
            if (this.bag != null) {
                this.bag.set(i.payload.name, Converters.deserialize(i.payload.value));
            }
        });
        const res = await this.comm.sendAndAwaitResponse({
            uuid,
            msg_type: "initialize",
            payload: null
        }, (i): i is Msg.IInitDoneMsg => i.msg_type === "initialize_done" && i.uuid === uuid);
        if (!!res.error) {
            throw await KernelError.Create(res.error, this.context.session!.kernelDisplayName);
        }
    }

    public async render(opts: OptionsBag) {
        this.bag = opts;
        const uuid = this.msgId;
        while (this.layout.widgets.length > 1) {
            this.layout.removeWidgetAt(1);
        }
        const serializedOptions: {[name: string]: SerializedObject | null} = {};
        for (const opt of opts) {
            serializedOptions[opt.name] = Converters.serialize(opt.value, opt.type);
        }
        const res = await this.comm.sendAndAwaitResponse({
            uuid,
            msg_type: "render",
            payload: serializedOptions as JSONObject
        }, (i): i is Msg.IRenderDoneMsg => i.msg_type === "render_done" && i.uuid === uuid);
        if (!!res.error) {
            throw await KernelError.Create(res.error, this.context.session!.kernelDisplayName);
        }

        const mimetype = this.context.rendermime!.preferredMimeType(res.payload.data, "any") || "text/plain";

        if (this.model && this.renderer
            && JSONExt.deepEqual(this.model.data[mimetype], res.payload.data[mimetype])
            && JSONExt.deepEqual(this.model.metadata[mimetype], res.payload.metadata[mimetype])
        ) {
            // Don't re-render, the model hasn't changed
            return;
        }
        if (this.renderer) {
            // clean up last render
            this.renderer.dispose();
        }

        this.renderer = this.context.rendermime!.createRenderer(mimetype);
        this.model = this.context.rendermime!.createModel({
            data: res.payload.data,
            metadata: res.payload.metadata,
            trusted: true
        });
        await this.renderer.renderModel(this.model);
        this.layout.insertWidget(0, this.renderer);
    }

    public dispose() {
        if (this.isDisposed) {
            return;
        }
        if (!this.comm.isDisposed && this.comm.isOpen) {
            this.comm.send({
                msg_type: "dispose",
                uuid: this.msgId,
                payload: null
            });
        }
        this.comm.dispose();
        super.dispose();
    }
}

namespace Msg {
    interface IProxyMsg extends JSONObject {
        uuid: string;
    }

    export interface ICreateMsg extends IProxyMsg {
        msg_type: "create";
        payload: string;
    }

    export interface IInitMsg extends IProxyMsg {
        msg_type: "initialize";
        payload: null;
    }

    export interface IDisposeMsg extends IProxyMsg {
        msg_type: "dispose";
        payload: null;
    }

    export interface IRenderMsg extends IProxyMsg {
        msg_type: "render";
        payload: JSONObject;
    }

    export type KernelProxyMessage = ICreateMsg | IInitMsg | IRenderMsg | IDisposeMsg;

    interface IReponseMsg extends JSONObject {
        uuid: string;
        error?: any;
    }

    export interface IInitDoneMsg extends IReponseMsg {
        msg_type: "initialize_done";
    }

    export interface IRenderDoneMsg extends IReponseMsg {
        msg_type: "render_done";
        payload: {
            data: JSONObject;
            metadata: JSONObject;
        };
    }

    export interface IStaleMsg extends IReponseMsg {
        msg_type: "stale";
        payload: {
            name: string;
            value: any;
        };
    }

    export type KernelResponseMessage = IInitDoneMsg | IRenderDoneMsg | IStaleMsg;
}
