import { AsyncTools } from "./asynctools";
import { PromiseDelegate } from "@phosphor/coreutils";

/**
 * A locking, generic cache; used by StaticCache and the query Cache.
 *
 * @export
 * @class Cache
 * @template K Key type
 * @template T Cache data type. For good null hygiene, make sure this does not
 * include the `undefined` or `void` types!
 */
export class Cache<K, T> {
    private store = new Map<K, T>();
    private locks = new Map<K, Cache.LockManager>();

    /**
     * Whether the given key exists in the cache.
     *
     * NOTE: This does not check for locking, unlike the other methods.
     *
     * @param key Cache key
     * @returns Whether the key exists in the cache.
     */
    public has(key: K) {
        return this.store.has(key);
    }

    /**
     * Retrieve a value from the cache
     *
     * @param key Cache key
     * @param blocking Whether to check for a lock
     * @param [lockId] The ID of the lock to check. Optional.
     * @returns The value that exists in the cache, or undefined.
     */
    public get(key: K, blocking: boolean, lockId?: number) {
        const mgr = this.getManagerForKey(key);
        if (mgr.hasReadLock && !blocking) {
            //TODO: Error or maybe allow read only. It's possible you may want
            //to read the cache even if it's stale
        }

        if (blocking) {
            this.checkLock(mgr, lockId, false);
        }

        return this.store.get(key);
    }

    /**
     * Insert an item into the cache.
     *
     * @param key Cache key
     * @param value Value to insert
     * @param blocking Whether to check for a lock
     * @param [lockId] The ID of the lock to check. Optional.
     */
    public put(key: K, value: T, blocking: boolean, lockId?: number) {
        const mgr = this.getManagerForKey(key);

        if (blocking) {
            this.checkLock(mgr, lockId, true);
        }

        this.store.set(key, value);
    }

    /**
     * Delete an item from the cache.
     *
     * @param key Cache key
     * @param blocking Whether to check for a lock
     * @param [lockId] The ID of the lock to check. Optional.
     */
    public delete(key: K, blocking: boolean, lockId?: number) {
        const mgr = this.getManagerForKey(key);

        if (blocking) {
            this.checkLock(mgr, lockId, true);
        }

        this.store.delete(key);
        this.locks.delete(key);
    }

    /**
     * Clear all items in the cache.
     *
     */
    public clear() {
        this.store.clear();
        this.locks.clear();
    }

    /**
     * Acquire a lock against a particular key in the cache.
     *
     * @param key Cache key
     * @param isWrite Whether the lock requestor will write to the cache using this lock.
     * @returns A promise that resolves to a unique numeric ID associated with the lock.
     */
    public async lock(key: K, isWrite: boolean) {
        const mgr = this.getManagerForKey(key);

        return mgr.acquireLock(isWrite);
    }

    /**
     * Release a lock, allowing other requestors to make changes to the cache.
     *
     * @param key Cache key
     * @param lockId The ID of the lock to release
     */
    public unlock(key: K, lockId: number) {
        const mgr = this.getManagerForKey(key);
        const lock = mgr.findLock(lockId);

        if (lock == null) {
            console.warn("[Cache]", "Attempted to release an invalid lock");
            return;
        }

        lock.release();
        return;
    }

    /**
     * Get the lock for a particular key, if it exists.
     *
     * @param key Cache key
     * @param lockId The ID of the lock to retrieve.
     * @returns [[Mutex]], if the lock exists. `undefined` otherwise.
     */
    public getLock(key: K, lockId: number) {
        const mgr = this.getManagerForKey(key);
        return mgr.findLock(lockId);
    }

    /**
     * This method reports any issues with lock validity, but allows operations
     * to proceed anyway.
     */
    private checkLock(mgr: Cache.LockManager, lockId?: number, isWrite?: boolean) {
        const lock = mgr.findLock(lockId);
        if (lock == null || lock.isFree ) {
            console.error("[Cache]", "Performing blocking operation without a lock- this breaks cache atomicity");
            return;
        }
        if (isWrite && !lock.isWrite) {
            console.error("[Cache]", "Performing blocking operation with an wrong lock- readers should not write.");
            return;
        }
        if (!isWrite && lock.isWrite) {
            console.warn("[Cache]", "Writer lock performing a read operation- this is inefficient");
        }
    }

    private getManagerForKey(key: K) {
        if (this.locks.has(key)) {
            return this.locks.get(key)!;
        } else {
            const mgr = new Cache.LockManager();
            this.locks.set(key, mgr);
            return mgr;
        }
    }
}

export namespace Cache {
    export class LockManager {
        /** An array of locks that the manager currently holds.
         *
         * This list is drained as locks are released.
         */
        held: CacheLock[] = [];
        /** An array of locks that the manager does not hold.
         *
         * When acquiring a cache lock, the lock may be added to this array if:
         *
         *  - the new lock is a write lock and there are currently held locks
         *  - the new lock is a read lock and there is a write lock being held
         *
         * This array is drained when a lock releases, using the following algorithm:
         *
         *  - If any write locks exist, then the first write lock in the array will
         * be acquired and moved to the held array.
         *  - If no write locks remain, the rest of the locks are acquired all at
         * once and moved to the held array.
         */
        waiting: CacheLock[] = [];
        /** An array of locks that the manager is currently trying to acquire */
        acquiring: CacheLock[] = [];
        nextLockId = 1;

        public get hasWriteLock() {
            return this.held.concat(this.waiting, this.acquiring).some(l => l.isWrite);
        }

        public get hasReadLock() {
            return this.held.length + this.acquiring.length + this.waiting.length !== 0;
        }

        public findLock(lockid: number | undefined) {
            return this.held.find(l => l.lockId === lockid)
                || this.waiting.find(l => l.lockId === lockid)
                || this.acquiring.find(l => l.lockId === lockid);
        }

        public async acquireLock(isWrite: boolean): Promise<CacheLock> {
            let canWrite = isWrite && this.held.length === 0;
            let canRead = !isWrite && this.held.every(l => !l.isWrite);
            if (canWrite || canRead) {
                let lock = new CacheLock(this.nextLockId++, isWrite);
                lock.released.then(() => this.onReleaseLock(lock));
                this.held.push(lock);
                await lock.aquire();
                return lock;
            } else {
                let lock = new CacheLock(this.nextLockId++, isWrite);
                lock.released.then(() => this.onReleaseLock(lock));
                this.waiting.push(lock);
                await lock.aquired;
                return lock;
            }
        }

        protected async onReleaseLock(lock: CacheLock) {
            this.held = this.held.filter(l => l !== lock);
            if (this.waiting.length === 0)
                return;

            let nextWrite = this.waiting.find(l => l.isWrite);
            if (nextWrite) {
                //There is a write lock waiting
                await nextWrite.aquire();
                this.waiting = this.waiting.filter(l => l !== nextWrite);
                this.held.push(nextWrite);
            } else {
                //There are only read locks waiting
                const lockFutures: Promise<void>[] = [];
                const locks: CacheLock[] = [];
                for (let next of this.waiting) {
                    lockFutures.push(next.aquire());
                    locks.push(next);
                }
                this.waiting = [];
                this.acquiring = locks;
                // make the operation atomic
                await Promise.all(lockFutures);
                this.held = this.held.concat(locks);
                this.acquiring = [];
            }
        }
    }

    export class CacheLock
        extends AsyncTools.Mutex
    // tslint:disable-next-line: one-line
    {
        public readonly lockId: number;
        public readonly isWrite: boolean;
        private _aquired = new PromiseDelegate<void>();
        private _released = new PromiseDelegate<void>();

        constructor(id: number, isWrite: boolean) {
            super();
            this.lockId = id;
            this.isWrite = isWrite;
        }

        public get aquired() { return this._aquired.promise; }
        public get released() { return this._released.promise; }

        public async aquire() {
            await super.aquire();
            this.lock.then(() => {
                this._released.resolve();
                this._released = new PromiseDelegate<void>();
            });
            this._aquired.resolve();
            this._aquired = new PromiseDelegate<void>();
        }
    }
}
