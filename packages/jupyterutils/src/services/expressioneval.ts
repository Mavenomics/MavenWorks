import { IClientSession } from "@jupyterlab/apputils";
import { GlobalsService, IExpressionEvaluator } from "@mavenomics/bindings";
import { JSONObject, Converters } from "@mavenomics/coreutils";
import { JSONObject as JSONDataObject, UUID } from "@phosphor/coreutils";
import { IDisposable } from "@phosphor/disposable";
import { CommManager, KernelError } from "../utils";

export class KernelExpressionEvaluator implements IDisposable, IExpressionEvaluator {
    private readonly session: IClientSession;
    private _globals: GlobalsService | null = null;
    private readonly comm: CommManager<
        KernelExpressionEvaluator.ICommSendMsg & JSONDataObject,
        KernelExpressionEvaluator.ICommRecvMsg & JSONDataObject
    >;
    private _isDisposed = false;

    constructor({session}: KernelExpressionEvaluator.IOptions) {
        this.session = session;
        this.comm = CommManager.Create({ session, commName: "expression_evaluator" });
    }

    public get globals() {
        return this._globals;
    }

    public set globals(newValue: GlobalsService | null) {
        this._globals = newValue;
    }

    public get isDisposed() { return this._isDisposed; }

    public dispose() {
        if (this._isDisposed) return;
        this.comm.dispose();
        delete (this as any).session;
        delete (this as any).globals;
        this._isDisposed = true;
    }

    public async evaluate(expr: string, globals: ReadonlyArray<string>) {
        const serializedGlobals: {[name: string]: JSONObject} = {};
        const uuid = UUID.uuid4();
        if (this.globals == null) {
            throw Error("Could not access globals: KernelExpressionEvaluator incompletely setup");
        }
        for (const global of globals) {
            if (!this.globals.has(global)) {
                console.warn("Unknown global referenced: ", global);
                continue; // skip this global after complaining about it
            }
            const val = Converters.serialize(this.globals.get(global), this.globals.getType(global));
            if (val == null) {
                serializedGlobals[global] = {typeName: "Any", value: null};
            } else {
                serializedGlobals[global] = val;
            }
        }
        const returnMsg = await this.comm.sendAndAwaitResponse({
                msg_type: "evaluate_expr",
                globals: serializedGlobals,
                expr: expr || "",
                uuid
            } as KernelExpressionEvaluator.ICommSendMsg & JSONDataObject,
            (i): i is KernelExpressionEvaluator.ICommRecvMsg & JSONDataObject => i.parent === uuid,
            20000
        );
        const value = Converters.deserialize(returnMsg.payload);
        if (returnMsg.msg_type === "expr_error") {
            const err = await KernelError.Create(value, this.session.kernelDisplayName);
            throw err;
        } else {
            return value;
        }
    }

    public getMetadata() {
        return {
            editorMode: "" + this.session.kernel!.info!.language_info.mimetype
        };
    }
}

export namespace KernelExpressionEvaluator {
    export interface IOptions {
        session: IClientSession;
    }

    export type ICommRecvMessageTypes = "expr_value" | "expr_error";
    export type ICommSendMessageTypes = "evaluate_expr";

    export interface ICommMsg {
        msg_type: string;
    }

    export interface ICommRecvMsg extends ICommMsg {
        msg_type: ICommRecvMessageTypes;
        payload: JSONObject;
        parent: string;
    }

    export interface ICommSendMsg extends ICommMsg {
        msg_type: ICommSendMessageTypes;
        expr: string;
        globals: {[globalName: string]: JSONObject};
        uuid: string;
    }
}
