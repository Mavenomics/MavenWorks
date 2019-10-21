import { PromiseDelegate } from "@phosphor/coreutils";

/**
 * A set of utilities for working with asynchronous things.
 */
export namespace AsyncTools {
    /**
     * Wait some number of milliseconds before continuing.
     *
     * This returns a promise that resolves when at least 1 VM turn has passed- this
     * means that wait cannot wait for any shorter than ~1-4ms depending on browser.
     */
    export function wait(ms?: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Like [[wait]], except it will wait for the next frame paint before resolving.
     *
     * @export
     */
    export function waitForFrame() {
        return new Promise(resolve => requestAnimationFrame(resolve));
    }

    /**
     * Wait until a predicate returns true.
     *
     * Like `wait`, this returns a promise that resolves when at least 1 VM turn
     * has passed. This promise is rejected if the timeout is reached before the
     * predicate becomes true. By default, the predicate is run every 25ms, but is
     * configurable.
     *
     * For user actions, use a timeout of ~300ms to prevent studder
     */
    export async function waitUntil(predicate: () => boolean, timeout: number, interval: number = 25) {
        const timeoutPromise = new Promise((_resolve, reject) => setTimeout(
            () => reject(
                Error("Timeout: Predicate did not become true within " + interval + "ms")
            ),
            timeout)
        );
        let delegate = new PromiseDelegate<void>();
        let intervalId = setInterval(() => {
            try {
                if (predicate.call(void 0)) {
                    delegate.resolve(void 0);
                }
            } catch (e) {
                delegate.reject(e);
            }
        }, interval);
        try {
            await Promise.race([delegate.promise, timeoutPromise]);
        }
        finally {
            clearInterval(intervalId);
        }
    }

    /** An async Mutex lock
     *
     * Consumers can aquire locks, and can `await` the lock to be notified when it
     * is released.
     *
    */
    export class Mutex {
        private _lock?: Promise<void>;
        private resolve?: () => void;

        public get lock() {
            return this._lock || Promise.resolve();
        }

        public get isFree() {
            return this._lock === undefined;
        }

        /**
         * Request the lock
         *
         * @returns A promise that will not resolve until a single requestor has been granted the lock.
         *
         * ...just pretend I didn't misspell acquire
         */
        public async aquire(): Promise<void> {
            if (this._lock != null) {
                await this._lock;
                // re-attempt to get the lock. This opens a stack overflow issue
                // with deadlocks, where a lock with sufficient churn and a large
                // number of requestors might break. I think that's rather
                // unlikely given our use cases, but worth noting down.
                return this.aquire();
            }
            this._lock = new Promise((resolve) => {
                this.resolve = resolve;
            });
        }

        public release() {
            if (this.resolve == null) {
                // nothing to do, lock has already been released
                return;
            }
            this.resolve();
            this._lock = undefined;
        }
    }
}
