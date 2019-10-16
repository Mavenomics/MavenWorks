import { GlobalsService } from "./GlobalsService";
import { WorkerWrapper, WorkerMessage, WorkerResponse } from "@mavenomics/mql-worker";
import { deserialize, serialize, Cache, CancelToken, CancelError } from "@mavenomics/coreutils";
import { IExpressionEvaluator } from "./evaluator";
import { UUID } from "@phosphor/coreutils";
import { IDisposable, DisposableDelegate } from "@phosphor/disposable";
import { Disposable } from "./Disposable";
import { StaticCacheMsg } from "@mavenomics/mql-worker/lib/interfaces";

enum TaskState {
    Pending,
    Running,
    Canceling,
    Completed
}

type WorkerTask = {
    //The group is used to identify which tasks to cancel when running a new task. E.g. <partid>-<optionid>
    groupId: string,
    id: string,
    state: TaskState,
    token: CancelToken<any>,
    globalNames: ReadonlyArray<string>,
    owner: MqlWorker | null,
    start: ((task: WorkerTask) => void),
    promise: Promise<any>,
    resolve: ((value?: any | PromiseLike<any>) => void),
    reject: ((reason?: any) => void)
};

type MqlWorker = {
    worker: WorkerWrapper,
    isBusy: boolean,
    lastUsed: Date,
    cleanup: IDisposable[],
};

class StaticCache {
    private cache = new Cache<string, string>();

    public sendMessage(
        getWorker: () => WorkerWrapper | null,
        id: string,
        result: StaticCacheMsg.IResult
    ) {
        const worker = getWorker();
        if (worker) {
            worker.postMessage({
                type: WorkerMessage.MsgType.StaticCacheCmdResult,
                id: id,
                result: result
            });
        }
    }

    /**
     * Handle command messages from the worker
     * @param attachWorkerItem Used to ensure locks are released if the owning worker is killed.
     * @param getWorker Returns the owning worker or null if the worker is dead.
     * @param id msg id
     * @param msgData msg data
     */
    public async handleMessage(
        attachWorkerItem: (item: IDisposable) => void,
        getWorker: () => WorkerWrapper | null,
        id: string,
        msgData: WorkerResponse.IStaticCacheRequest["data"]
    ) {
        switch (msgData.cmd) {
            case "LOCK": {
                const { key, isWrite } = msgData;
                const lock = await this.cache.lock(key, !!isWrite);
                attachWorkerItem(new DisposableDelegate(() => {
                    // Associate the lock with the worker. Disposes the lock
                    // when the worker dies.
                    this.cache.unlock(key, lock.lockId);
                }));

                if (lock.isFree) {
                    //Lock was released because the worker requesting the lock died.
                    console.debug("Worker died while acquiring StaticCache lock");
                    return;
                }
                this.sendMessage(getWorker, id, { type: "LOCK", lockId: lock.lockId });
                return;
            } case "UNLOCK": {
                const { key, lockId } = msgData;
                const lock = this.cache.getLock(key, lockId);
                if (lock) {
                    lock.release();
                } else {
                    console.warn("[StaticCache] Attempted to release an invalid lock");
                }
                this.sendMessage(getWorker, id, { type: "UNLOCK" });
                return;
            } case "GET": {
                const { key, blocking, lockId } = msgData;
                if (!this.cache.has(key)) {
                    return this.sendMessage(getWorker, id, {
                        type: "MISS"
                    });
                }
                const value = this.cache.get(key, !!blocking, lockId);
                this.sendMessage(getWorker, id, {
                    type: "HIT",
                    value
                });
                return;
            } case "PUT": {
                const { key, blocking, lockId, value } = msgData;
                this.cache.put(key, value, !!blocking, lockId);
                this.sendMessage(getWorker, id, { type: "HIT" });
                return;
            } case "DELETE": {
                const { key, blocking, lockId } = msgData;
                if (key === "*") {
                    this.cache.clear();
                } else {
                    this.cache.delete(key, !!blocking, lockId);
                }
                this.sendMessage(getWorker, id, { type: "HIT" });
                return;
            } default: {
                this.sendMessage(getWorker, id, { type: "UNKNOWN_CMD" });
                return;
            }
        }
    }
}

export class MqlWorkerPool extends Disposable {
    private static StaticCache: StaticCache = new StaticCache();

    private static CLEANUP_INTERVAL_MS = 5000;
    private static CLEANUP_KILL_AFTER_MS = 30000;
    private static SOFT_WORKER_COUNT = 1; //Number of idle workers to keep around.
    workers: MqlWorker[];
    tasks: WorkerTask[];
    evaluator: IExpressionEvaluator | null;
    cleanupTimer: any;

    /**
     *
     * @param globals
     * @param session
     * @param maxWorkerCount number of workers to spawn
     * @param cancelTimeout duration in ms to wait for a cancel to complete before killing the task and worker.
     */
    constructor(
        private globals: GlobalsService,
        evaluator: IExpressionEvaluator | undefined,
        private maxWorkerCount: number,
        private cancelTimeout: number) {
        super();

        this.workers = [];
        this.tasks = [];

        this.evaluator = evaluator || null;

        this.fillWorkerPool();

        this.cleanupTimer = setInterval(this.cleanupWorkers.bind(this), MqlWorkerPool.CLEANUP_INTERVAL_MS);
    }

    cleanupWorkers() {
        let idleCount = 0;
        for (let i = 0; i < this.workers.length; i++) {
            let worker = this.workers[i];
            let idleMs = new Date().getTime() - worker.lastUsed.getTime();
            if (!worker.isBusy && idleMs > MqlWorkerPool.CLEANUP_KILL_AFTER_MS) {
                //Stops killing an idle worker just to spin up a replacement.
                if (idleCount++ < MqlWorkerPool.SOFT_WORKER_COUNT)
                    continue;

                let runningTask = this.tasks.find(t => t.owner === worker);
                if (runningTask) {
                    this.killTask(runningTask, false);
                } else {
                    this.killWorker(worker, false);
                }
                i--;
            }
        }
        this.fillWorkerPool();
    }

    onMessage(owner: MqlWorker, msgData: WorkerResponse.IMsg) {
        const { type, id } = msgData;
        if ((msgData.type === "runEvalResult" || msgData.type === "runQueryResult") && id) {
            let task = this.getTask(id);
            if (!task) {
                console.warn(`Received message for non-existing task. Id: ${id} Type: ${type}`);
                return;
            }

            if (msgData.isCanceled) {
                this.onTaskCanceled(task);
                return;
            }

            if (msgData.error) {
                this.onTaskError(task, deserialize(msgData.error));
            } else {
                this.OnTaskCompleted(task, deserialize(msgData.result));
            }
            //Todo: Move these request messages.
            //Instead there should be a generic RPC class which handles messaging via a web worker.
        } else if (msgData.type === "KernelEvalRequest" && id) {
            const { taskId, code } = msgData;
            let task = this.getTask(taskId);
            if (!task) {
                console.warn(`Received message for non-existing task. Id: ${id} Type: ${type}`);
                return;
            }

            if (this.evaluator == null) {
                owner.worker.postMessage({
                    type: WorkerMessage.MsgType.KernelEvalResult,
                    id: id,
                    error: serialize(new Error("KernelEval is currently disabled in this environment"))
                });
                return;
            }
            this.evaluator.evaluate(code, task.globalNames)
                .then((result) => {
                    owner.worker.postMessage({
                        type: WorkerMessage.MsgType.KernelEvalResult,
                        id: id,
                        result: serialize(result)
                    });
                })
                .catch(err => {
                    // TODO: genericize error handling? Part overlays also do this
                    if ((err as any)["prettyTraceback"] !== null) {
                        err = new Error(err.message + "\n\n" + err.traceback);
                    }
                    owner.worker.postMessage({
                        type: WorkerMessage.MsgType.KernelEvalResult, id: id, error: serialize(err)
                    });
                });
        } else if (msgData.type === "FetchRequest" && id) {
            const { taskId, url } = msgData;
            let task = this.getTask(taskId);
            if (!task) {
                console.warn(`Received message for non-existing task. Id: ${id} Type: ${type}`);
                return;
            }

            let abortControl = new AbortController();
            let signal = abortControl.signal;
            task.token.onCancel(() => {
                //Abort will cause an AbortError which will return an error to FetchResult
                abortControl.abort();
            });

            fetch(url, { signal })
                .then(resp => {
                    if (resp.status !== 200)
                        throw new Error("Server response: " + resp.statusText);
                    return resp.text();
                })
                .then(text => {
                    owner.worker.postMessage({
                        type: WorkerMessage.MsgType.FetchResult,
                        id: id,
                        result: serialize(text)
                    });
                })
                .catch(err => {
                    owner.worker.postMessage({
                        type: WorkerMessage.MsgType.FetchResult,
                        id: id,
                        error: serialize(err)
                    });
                });
        } else if (msgData.type === "StaticCacheCmd" && id) {
            const { taskId, data } = msgData;
            let task = this.getTask(taskId);
            if (!task) {
                console.warn(`Received message for non-existing task. Id: ${id} Type: ${type}`);
                return;
            }

            const getWorkerOrNull = () => {
                let task = this.getTask(taskId);
                return task && task.owner ? task.owner.worker : null;
            };
            const attachItem = (item: IDisposable) => {
                let task = this.getTask(taskId);
                if (task && task.owner)
                    task.owner.cleanup.push(item);
                else
                    item.dispose();
            };

            MqlWorkerPool.StaticCache.handleMessage(attachItem, getWorkerOrNull, id, data);
        }
    }


    async runMql(groupId: string, mql: string, globalNames: ReadonlyArray<string>) {
        return this.startNewTask(groupId, globalNames, t => {
            t.owner!.worker.postMessage({
                type: WorkerMessage.MsgType.RunQueryRequest,
                id: t.id,
                queryText: mql,
                serializedGlobals: this.getSerializedGlobals(globalNames)
            });
        });
    }
    async runJs(groupId: string, code: string, globalNames: ReadonlyArray<string>) {
        return this.startNewTask(groupId, globalNames, t => {
            t.owner!.worker.postMessage({
                type: WorkerMessage.MsgType.RunEvalRequest,
                id: t.id,
                codeText: code,
                serializedGlobals: this.getSerializedGlobals(globalNames)
            });
        });
    }

    /**
     * Start running queued tasks if there are any available workers.
     */
    tryRunningTasks(): any {
        let availableWorkers = this.workers.filter(w => !w.isBusy);
        if (availableWorkers.length > 0) {
            let tasks = this.tasks.filter(t => t.state === TaskState.Pending);
            for (let worker of availableWorkers) {
                let task = tasks.shift();
                if (!task)
                    break;

                //worker is now busy and the task is started
                worker.isBusy = true;
                task.owner = worker;
                task.state = TaskState.Running;
                try {
                    task.start(task);
                } catch (err) {
                    this.onTaskError(task, err);
                }
            }
        }
    }

    /**
     * Request all tasks in this group to cancel.
     * Kill the tasks after the cancelTimeout if they cannot be gracefully stopped.
     * @param groupId
     */
    cancelTasks(groupId: string) {
        let tasks = this.tasks.filter(t => t.groupId === groupId);
        for (let task of tasks) {
            if (task.state === TaskState.Running) {
                task.state = TaskState.Canceling;
                task.token.cancel();
                //First ask the worker to cancel gracefully.
                task.owner!.worker.postMessage({ type: WorkerMessage.MsgType.CancelRequest });

                //Wait for a graceful cancel before terminating the worker.
                if (this.cancelTimeout > 0) {
                    setTimeout(() => {
                        //Worker didn't respond to a cancel request. (Task might be cpu bound)
                        //Kill the worker and spawn a new one.
                        if (task.state === TaskState.Canceling)
                            this.killTask(task, true);
                    }, this.cancelTimeout);
                }
            } else if (task.state === TaskState.Pending) {
                //Tasks that are pending can be canceled and removed immediately.
                this.onTaskCanceled(task);
            }
        }
    }

    /**
     * Kills the task's worker and signals that the task has been canceled.
     * @param task
     */
    killTask(task: WorkerTask, startNew: boolean): any {
        this.killWorker(task.owner!, startNew);
        this.onTaskCanceled(task);
    }

    /**
     * Terminate the worker and start a new one to replace it.
     * @param mqlWorker worker to terminate and remove from pool
     * @param startNew if true, fill the worker pool
     */
    killWorker(mqlWorker: MqlWorker, startNew: boolean): any {
        mqlWorker.cleanup.forEach(d => d.dispose());
        mqlWorker.cleanup = [];
        mqlWorker.worker.terminate();
        this.workers = this.workers.filter(w => w !== mqlWorker);
        if (startNew)
            this.fillWorkerPool();
    }

    protected disposed(): void {
        clearInterval(this.cleanupTimer);

        //Kill any pending tasks
        for (let task of this.tasks) {
            this.killTask(task, false);
        }
        //Kill idle workers
        for (let worker of this.workers) {
            this.killWorker(worker, false);
        }
    }

    protected getSerializedGlobals(globals: ReadonlyArray<string>) {
        const serializedGlobals: Record<string, any> = {};
        for (const global of globals) {
            if (!this.globals.has(global)) {
                console.warn("Unknown referenced global: @" + global);
                continue;
            }
            serializedGlobals[global] = serialize(this.globals.get(global));
        }
        return serializedGlobals;
    }

    /**
     * Cancel tasks in this group and queue the new task
     * @param groupId
     * @param start
     */
    private startNewTask(groupId: string, globalNames: ReadonlyArray<string>, start: (task: WorkerTask) => void) {
        //Cancel queries that are running or pending in this group
        this.cancelTasks(groupId);

        let resolve: (value?: any | PromiseLike<any>) => void;
        let reject: (reason?: any) => void;
        let promise = new Promise<any>((res, rej) => { resolve = res; reject = rej; });
        let cancelToken = new CancelToken<any>();
        let task = <WorkerTask>{
            groupId: groupId,
            id: UUID.uuid4(),
            promise: promise,
            resolve: resolve!,
            reject: reject!,
            state: TaskState.Pending,
            globalNames: globalNames,
            token: cancelToken,
            owner: null,
            start: start
        };

        this.tasks.push(task);
        this.fillWorkerPool();
        this.tryRunningTasks();
        return task.promise;
    }

    private onTaskError(task: WorkerTask, error: any) {
        this.removeTask(task);
        task.reject(error);
    }

    private onTaskCanceled(task: WorkerTask) {
        this.removeTask(task);
        task.reject(new CancelError("Task Canceled"));
    }

    private OnTaskCompleted(task: WorkerTask, value: any) {
        this.removeTask(task);
        task.resolve(value);
    }

    private getTask(id: string) {
        return this.tasks.find(t => t.id === id);
    }

    /**
     * Remove the task from the queue and mark the owning worker as free.
     * @param task
     */
    private removeTask(task: WorkerTask) {
        //Mark the task as completed.
        task.state = TaskState.Completed;

        //Mark the owning worker as no longer busy
        if (task.owner) {
            task.owner.isBusy = false;
            task.owner.lastUsed = new Date();
        }

        this.tasks = this.tasks.filter(t => t.id !== task.id);
        //since a worker is free we should try starting a new task.
        this.tryRunningTasks();
    }

    /**
     * Called to initially fill the worker pool and called when a worker dies.
     */
    private fillWorkerPool(): any {
        if (this.isDisposed)
            return;

        const maxWorkersToSpawn = Math.min(this.tasks.length + MqlWorkerPool.SOFT_WORKER_COUNT, this.maxWorkerCount);
        while (this.workers.length < maxWorkersToSpawn) {
            let worker = new WorkerWrapper();
            let mqlWorker = {
                worker: worker,
                isBusy: false,
                lastUsed: new Date(),
                cleanup: []
            } as MqlWorker;
            worker.onMessage.subscribe(msg => this.onMessage(mqlWorker, msg));
            this.workers.push(mqlWorker);
        }
    }
}
