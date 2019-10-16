import { JSONObject as SerializedJSONObject, Types, Converters } from "@mavenomics/coreutils";
import { JSONObject, PromiseDelegate } from "@phosphor/coreutils";
import { IDisposable } from "@phosphor/disposable";
import { IClientSession } from "@jupyterlab/apputils";
import { KernelProxyPart } from "../parts/KernelProxyPart";
import { PartFactory, Part } from "@mavenomics/parts";
import { DisplayHandleManager } from "./displayhandle/handlemanager";
import { CommManager } from "../util/CommManager";

export class SyncMetadata implements IDisposable {
    private _isDisposed = false;
    private _ready?: PromiseDelegate<void>;
    private comm: CommManager<SyncMetadata.ISendMsg, SyncMetadata.IRecvMsg>;
    private session: IClientSession;
    private isSetup = false;
    private kernelParts = new Set<string>();
    private factory: PartFactory;
    private handleManager: DisplayHandleManager;

    constructor(session: IClientSession, factory: PartFactory, handleManager: DisplayHandleManager) {
        this.comm = CommManager.Create({session, commName: "maven_metadata"});
        this.session = session;
        this.factory = factory;
        this.handleManager = handleManager;
        this.session.ready.then(() => this.hookUpdater());
        this.comm.msgRecieved.subscribe(msg => {
            switch (msg.msg_type) {
                case "new_part":
                    this.registerPart(msg.payload);
                    break;
                case "named_display_handle":
                    this.handleManager.registerIdForName(
                        msg.handle_id,
                        msg.handle_name
                    );
                    break;
            }
        });
        this.comm.commClosed.subscribe(null, () => this.unregisterKernelParts());
        this.comm.commOpened.subscribe(() => this.hookUpdater());
    }

    public get isDisposed() { return this._isDisposed; }
    /** Resolves when the part metadata has been synced with the kernel. */
    public get ready() { return this._ready ? this._ready.promise : Promise.resolve(); }

    public dispose() {
        if (this._isDisposed) {
            return;
        }
        this.comm.dispose();
        this.unregisterKernelParts();
        this._isDisposed = true;
    }

    private unregisterKernelParts() {
        this.isSetup = false;
        for (const part of this.kernelParts) {
            this.factory.unregisterPart(part);
        }
        this.kernelParts.clear();
    }

    private async hookUpdater() {
        if (this.isSetup) return;
        this._ready = new PromiseDelegate<void>();
        try {
            await this.comm.sendAndAwaitResponse({
                    msg_type: "send_parts"
                },
                (i): i is SyncMetadata.IRecvMsg => i.msg_type === "kernel_parts_sent",
                10000
            );
            this.isSetup = true;
        } catch (err) {
            console.warn("Sync Error", err);
        }
        this._ready.resolve();
    }

    private registerPart(part: SyncMetadata.INewPartMsg["payload"]) {
        this.kernelParts.add(part.name);
        const subclassPart = class extends KernelProxyPart {
            public static GetMetadata() {
                const metadata = KernelProxyPart.GetMetadata();
                for (const optName in part.options) {
                    const option = part.options[optName];
                    const type = Types.findType(option.type) || Types.Any;
                    const value = Converters.deserialize(option.value);
                    metadata.addOption(option.name, type, value);
                }
                return metadata;
            }

            protected readonly type: string = part.name;

            constructor(args: Part.IOptions) {
                super(args);
                this.title.label = part.name;
            }
        };
        this.factory.registerPart(part.name, subclassPart);
    }
}

export namespace SyncMetadata {
    export interface INewPartMsg extends JSONObject {
        msg_type: "new_part";
        payload: JSONObject & {
            name: string;
            options: Array<{
                name: string;
                type: string;
                value: SerializedJSONObject
            }>,
        };
    }

    interface IPartsSent extends JSONObject {
        msg_type: "kernel_parts_sent";
    }

    interface IPartsRequest extends JSONObject {
        msg_type: "send_parts";
    }

    interface INewDisplayHandle extends JSONObject {
        msg_type: "named_display_handle";
        handle_id: string;
        handle_name: string;
    }

    export type ISendMsg = IPartsRequest | INewPartMsg;
    export type IRecvMsg = IPartsSent | INewPartMsg | INewDisplayHandle;
}
