import { IDisposable } from "@phosphor/disposable";

/**
 * @deprecated Use IDisposable instead
 */
export abstract class Disposable implements IDisposable {
    _isDisposed = false;
    get isDisposed(): boolean {
        return this._isDisposed;
    }

    dispose(): void {
        if (this._isDisposed)
            return;
        this._isDisposed = true;
        this.disposed();
    }

    protected abstract disposed(): void;
}
