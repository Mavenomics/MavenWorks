import * as _ from "lodash";
import {
    IFunctionEvaluatorContext,
    declareFunction,
    functionArg,
    IFunction,
    evaluateRowOptionsFast,
    RegisterFunction,
    documentFunction,
} from "@mavenomics/mql";
import { deserialize, serialize, Types, StartTimingAsync, StartTimingSync } from "@mavenomics/coreutils";
import { Callbacks, MqlCallback } from "@mavenomics/mql/lib/callbackhelpers";
import { Row } from "@mavenomics/table";
import { StaticCacheMsg } from "../interfaces";

@declareFunction("KernelEval", 2, Types.Any)
@functionArg("row", Types.Row)
@functionArg("code", Types.String)
@functionArg("name", Types.Any)
@functionArg("value", Types.Any)
export class KernelEvalFunction extends IFunction {
    static id = 0;
    static pendingEvals: { [id: number]: { resolve: any, reject: any } } = {};

    eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext) {
        let row = options["row"];
        return evaluateRowOptionsFast(row, options, opts => {
            let names = opts["name"] || [];
            let values = opts["value"] || [];
            let kvs: any = _.zipObject(names, values);

            let serializedArgs = names.reduce((o: any, n: string) => (o[n] = serialize(kvs[n]), o), {});
            let id = ++KernelEvalFunction.id;
            postMessage(JSON.stringify({
                type: "KernelEvalRequest",
                taskId: context.userContext.id,
                id: id,
                code: opts["code"],
                serializedArgs: serializedArgs
            }));

            let resolve = null, reject = null;
            let queryFinished = new Promise((res, rej) => {
                resolve = res;
                reject = rej;
            });
            KernelEvalFunction.pendingEvals[id] = { resolve: resolve, reject: reject };
            return queryFinished;
        });
    }

}

RegisterFunction("KernelEval", KernelEvalFunction);

@declareFunction("Fetch")
@functionArg("row", Types.Row)
@functionArg("url", Types.String)
export class FetchFunction extends IFunction {
    static id = 0;
    static pendingEvals: { [id: number]: { resolve: any, reject: any } } = {};

    eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext) {
        let row = options["row"];
        return evaluateRowOptionsFast(row, options, opts => {
            let id = ++FetchFunction.id;
            postMessage(JSON.stringify({
                type: "FetchRequest",
                taskId: context.userContext.id,
                id: id,
                url: opts["url"]
            }));

            let resolve = null, reject = null;
            let queryFinished = new Promise((res, rej) => {
                resolve = res;
                reject = rej;
            });
            FetchFunction.pendingEvals[id] = { resolve: resolve, reject: reject };
            return queryFinished;
        });
    }

}
RegisterFunction("Fetch", FetchFunction);

@declareFunction("StaticCache")
@documentFunction({
    description: "Cache a value between queries.",
    remarks: `StaticCache uses a common cache across all queries and workers. It
comes with a performance hit because it must send messages to this cache with
each request. This trade-off is worth it for longer-running data that might be
shared between multiple queries or query runs (such as \`Fetch\`, common data
sources, etc.).

> #### Blocking
>
> Blocking allows multiple queries to reference the same cache without doing
> extra work when running simultaneously. This reduces performance, but again
> has a large payoff for long-running subselects and data sources.

> #### Cache modes
>
> The caching supports one of 4 modes:
>
>  - \`Normal\` - Try to get the cached value. On cache miss value will be
>    evaluated and put into the cache.
>  - \`WriteOnly\` - Evaluate value and write it to the cache.
>  - \`Delete\` - Deletes the cache for the given key. TEMP: All caches can be
>    deleted by using reserved key \`*\`.
>  - \`ReadOnly\` - Reads from the cache. This returns null if no value is
>    cached for the given key.
>
> The default cache mode is \`Normal\`.
`,
    examples: [`set @MyDataSource = StaticCache('foo', Lattice('x = 1 to 100 step 1'), true)

SELECT
    @MyDataSource,
    x
FROM
    Lattice('x = 1 to 10 step 1')`]
})
@functionArg("row", Types.Row)
@functionArg("key", Types.String)
@functionArg("value", Types.String)
@functionArg(
    "mode",
    Types.String,
    "Normal",
    "The cache mode. One of `Normal`, `WriteOnly`, `Delete`, or `ReadOnly`.")
@functionArg(
    "blocking",
    Types.Boolean,
    false,
    "Used to synchronize caches across multiple queries using the same cache key"
)
export class StaticCacheFunction extends IFunction {
    static id = 0;
    static pendingEvals: { [id: number]: { resolve: any, reject: any } } = {};

    evalCall(
        row: Row,
        optionLookup: {
            [id: string]: (row: Row, cb: MqlCallback) => void;
        },
        context: IFunctionEvaluatorContext,
        cb: MqlCallback
    ): any {
        Callbacks.All<any>([
            optionLookup["key"].bind(void 0, row),
            optionLookup["mode"].bind(void 0, row),
            optionLookup["blocking"].bind(void 0, row)
        ], (err, [key, mode, blocking]) => {
            if (err) return cb(err);

            if (!key || key.length < 1)
                return cb(new Error("Cache key cannot be empty"));
            key = typeof key !== "string" ? key.toString() : key;
            blocking = blocking === true ? blocking : false;

            return void StartTimingAsync("StaticCacheLock", async () => {
                if (key === "*" && mode !== "Delete") {
                    return cb(new Error("Cache key cannot be * for operations other than delete"));
                }

                //Acquire lock if we are blocking
                let lockId = void 0;
                let isLocked = false;

                if (blocking) {
                    let isWrite = mode !== "ReadOnly";
                    let lock = await this.SendMessage({
                        cmd: "LOCK",
                        blocking,
                        isWrite,
                        key,
                        mode
                    }, context);
                    lockId = (lock as any).lockId;
                    isLocked = true;
                }

                const self = this;
                function unlockIfLocked() {
                    if (!isLocked) return;
                    return self.SendMessage({
                        cmd: "UNLOCK",
                        blocking,
                        lockId,
                        key,
                        mode
                    }, context);
                }

                if (mode === "WriteOnly") {
                    optionLookup["value"](row, (err, value) => {
                        if (!err && value instanceof Error) {
                            err = value;
                        }
                        if (err) {
                            unlockIfLocked();
                            return cb(err);
                        }
                        return Callbacks.AsCallback(
                            this.SendMessage({
                                    cmd: "PUT",
                                    key,
                                    blocking,
                                    lockId,
                                    value: JSON.stringify(serialize(value))
                                },
                                context
                            )
                            .then(unlockIfLocked, (err) => { unlockIfLocked(); return Promise.reject(err); })
                            .then(() => value)
                        )(cb);
                    });
                } else if (mode === "Delete") {
                    return Callbacks.AsCallback(
                        this.SendMessage({
                            cmd: "DELETE",
                            key,
                            blocking,
                            lockId,
                        }, context)
                        .then(unlockIfLocked, (err) => { unlockIfLocked(); return Promise.reject(err); })
                    )(cb);
                }

                return Callbacks.AsCallback(
                    this.SendMessage({
                        cmd: "GET",
                        key,
                        blocking,
                        lockId,
                    }, context),
                )((err, resp: any) => {
                    if (err) {
                        unlockIfLocked();
                        return cb(err);
                    }

                    //Cache miss
                    if (resp.type === "MISS") {
                        //Cache miss in readonly mode results in a null return
                        if (mode === "ReadOnly") {
                            unlockIfLocked();
                            return cb(void 0, null);
                        }

                        //Cache miss, lets evaluate value and update the cache
                        optionLookup["value"](row, (err, res) => {
                            // don't cache errors
                            if (!err && res instanceof Error) {
                                err = res;
                            }
                            if (err) {
                                unlockIfLocked();
                                return cb(err);
                            }
                            return Callbacks.AsCallback(
                                this.SendMessage({
                                        cmd: "PUT",
                                        key,
                                        blocking,
                                        lockId,
                                        value: JSON.stringify(serialize(res))
                                    },
                                    context
                                )
                                .then(unlockIfLocked, (err) => { unlockIfLocked(); return Promise.reject(err); })
                                .then(() => res)
                            )(cb);
                        });
                    } else {
                        //Eagerly unlock the cache key. That way other workers
                        // can access the cache while we deserialize.
                        unlockIfLocked();
                        StartTimingAsync("StaticCacheLock_Deserialize", async () => {
                            return deserialize(JSON.parse(resp.value));
                        }).then(val => cb(void 0, val), err => cb(err));
                    }
                });
            });
        });
    }

    public eval() { throw Error("not implemented"); }

    private SendMessage(
        data: any,
        context: IFunctionEvaluatorContext
    ) {
        let id = ++StaticCacheFunction.id;
        let resolve = null, reject = null;
        let queryFinished = new Promise<StaticCacheMsg.IResult>((res, rej) => {
            resolve = res;
            reject = rej;
        });
        StaticCacheFunction.pendingEvals[id] = { resolve: resolve, reject: reject };

        postMessage(JSON.stringify({
            type: "StaticCacheCmd",
            taskId: context.userContext.id,
            id: id,
            data: data
        }));

        return queryFinished;
    }


}
RegisterFunction("StaticCache", StaticCacheFunction);

