import { Subject } from "rxjs";
import { IDisposable } from "@phosphor/disposable";
import { WorkerResponse, WorkerMessage } from "./interfaces";
import * as Worker from "worker-loader!../mql.worker.js";
import { Observable } from "rxjs";

/**
 * A wrapper class around the MQL worker that provides a typed RPC interface.
 *
 * TODO: Add helper functions to clean up the API (eg, `#parseQuery()` instead
 * of sending a `"parseQuery"` message).
 *
 * @export
 * @class WorkerWrapper
 */
export class WorkerWrapper implements IDisposable {
    private worker: Worker;
    private onMessageSrc = new Subject<WorkerResponse.IMsg>();
    private _isDisposed = false;

    constructor() {
        this.worker = new (<any>Worker)();
        this.worker.onmessage = (ev) => {
            const msgData = JSON.parse(ev.data) as WorkerResponse.IMsg;
            this.onMessageSrc.next(msgData);
        };
    }

    public get isDisposed() { return this._isDisposed; }

    public get onMessage(): Observable<WorkerResponse.IMsg> { return this.onMessageSrc; }

    public postMessage(msg: WorkerMessage.IMsg) {
        this.worker.postMessage(JSON.stringify(msg));
    }

    public dispose() {
        if (this._isDisposed) return;
        this.worker.terminate();
        this.onMessageSrc.complete();
        this._isDisposed = true;
    }

    public terminate() {
        this.dispose();
    }
}
