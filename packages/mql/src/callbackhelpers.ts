import { PromiseDelegate } from "@phosphor/coreutils";

export type MqlCallback<T = any> = (this: void, err?: Error, result?: T) => void; // ?

export namespace Callbacks {
    export function All<T>(
        callbacks: ((cb: MqlCallback<T>) => void)[],
        callback: MqlCallback<T[]>
    ) {
        if (callbacks.length === 0) return callback(void 0, []);
        const results = new Array(callbacks.length);
        let didError = false;
        let settled = 0;

        for (let i = 0; i < results.length; i++) {
            const cb = callbacks[i];
            try {
                cb.call(void 0, ((err, res) => {
                    settled++;
                    if (didError) return;
                    if (err) {
                        didError = true;
                        callback.call(void 0, err);
                    }
                    results[i] = res;
                    if (settled === results.length) {
                        callback.call(void 0, void 0, results);
                    }
                }) as typeof cb);
            } catch (err) {
                // If this happens, it might've actually started somewhere else,
                // so it's important to know if you debug errors in callbacks.
                console.warn("Synchronous callback error");
                didError = true;
                callback.call(void 0, err);
            }
        }
    }

    export function Map<T, R>(
        callbacks: MqlCallback<T>[],
        fn: (res: T) => R,
        cb: MqlCallback<R>
    ) {
    }

    // Callbacks.All(callbacks, (vals => cb(void 0, vals.reduce(fn)))
    export function Reduce<T, A>(
        callbacks: ((cb: MqlCallback<T>) => void)[],
        fn: (next: T[]) => A,
        cb: MqlCallback<A>
    ) {
        return Callbacks.All(callbacks, (err, res) => {
            if (err) return cb.call(void 0, err);

            let agg: A;
            try {
                agg = fn.call(void 0, res);
                return cb.call(void 0, void 0, agg);
            } catch (err) {
                return cb.call(void 0, err);
            }
        });
    }

    export function Chain<T>(
        callback: (cb: MqlCallback<T>) => void,
        fn: (val: T) => void,
        cb: MqlCallback<T>
    ) {
        callback.call(void 0, (err, res) => {
            if (err) return void cb(err);
            try {
                fn(res);
            } catch (err) {
                return void cb(err);
            }
            return void cb(void 0, res);
        });
    }

    export function AsCallback<R>(
        promise: Promise<R>
    ): (cb: MqlCallback<R>) => void {
        return function(cb: MqlCallback<R>) {
            promise.then(
                (val) => void (cb.call(void 0, void 0, val)),
                (err) => void cb.call(void 0, err)
            );
        };
    }


    /**
     * Given a callback lambda, returns the same lambda wrapped in a Try/Catch.
     *
     * The Try/Catch can help with catching synchronous errors, which would
     * otherwise be uncaught by the framework.
     *
     * @export
     * @template T The return type of the callback
     * @param f The lambda to wrap
     * @returns A lambda that will plumb errors to the callback
     */
    export function Trap<T>(
        f: (cb: MqlCallback<T>) => void,
    ): (cb: MqlCallback<T>) => void {
        return function(cb: MqlCallback<T>) {
            try {
                return void f.call(void 0, cb);
            } catch (err) {
                console.warn("Synchronous error caught in Error Trap:");
                console.warn(err);
                return void cb.call(void 0, err);
            }
        };
    }

    /**
     * Like [Trap], but this will plumb errors as Results instead.
     *
     * This is useful if you want to share the Error as a meaningful result
     * (for instance, cell-level errors in queries).
     *
     * Any errors are asserted as Errors- that is, if the value in a catch or
     * error callback isn't an instance of an error, it will be wrapped in one.
     * This may lead to misleading stack traces, though. It's always better
     * to use real Errors instead of throw-by-value.
     *
     * @export
     * @template T The return type of the callback
     * @param f The lambda to wrap
     * @returns A wrapped lambda that will never throw or use the error callback
     */
    export function TrapAsResult<T>(
        f: (cb: MqlCallback<T>) => void,
    ): (cb: MqlCallback<T>) => void {
        return function(cb: MqlCallback<T>) {
            Trap(f)((err, res) => {
                if (err != null && !(err instanceof Error)) {
                    console.warn("Unwrapped error in TrapAsResult");
                    console.warn(err);
                    err = new Error(err);
                    err.stack = "  <unknown>";
                }
                return cb.call(void 0, void 0, err || res);
            });
        };
    }

    export function AsAsync<R>(
        fn: (...args: any[]) => void
    ): (...args: any[]) => Promise<R> {
        return function() {
            const args = Array.from(arguments);
            const delegate = new PromiseDelegate<R>();
            const cb: MqlCallback<R> = (err, res) => {
                if (err) return delegate.reject(err);
                return delegate.resolve(res);
            };
            try {
                fn.call(void 0, ...args, cb);
            } catch (err) {
                delegate.reject(err);
            }
            return delegate.promise;
        };
    }
}
