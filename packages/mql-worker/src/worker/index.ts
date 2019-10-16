import * as _ from "lodash";
import { deserialize, serialize, CancelToken } from "@mavenomics/coreutils";
import { Token } from "antlr4";
import {
    FunctionEvaluatorResults,
    RunMql,
    CreateJsFunc,
    GetAllFunctions,
    MqlCompiler
} from "@mavenomics/mql";
import { KernelEvalFunction, FetchFunction, StaticCacheFunction } from "./functions";
import { WorkerMessage, IMqlFunctionMetadata } from "../interfaces";

let currentToken: CancelToken<any>;

console.info(`MQL Worker spawned.
Branch   ${process.env.GIT_BRANCH}
Built on ${new Date(+process.env.BUILD_DATE).toLocaleDateString()}
Build    #${process.env.BUILD_NUMBER}
Commit   ${process.env.GIT_COMMIT.substr(0, 8)}
`);

onmessage = (ev: any) => {
    const data = JSON.parse(ev.data) as WorkerMessage.IMsg;
    if (data.type == null) {
        return;
    }
    if (data.type === "cancelRequest") {
        if (currentToken) {
            currentToken.cancel();
        }
    } else if (data.type === "runQuery") {
        const { queryText, id, serializedGlobals } = data;
        if (currentToken) {
            console.error("Received a run request while already running a task");
            return;
        }
        currentToken = new CancelToken<FunctionEvaluatorResults>();
        Promise.resolve()
            .then(() => {
                let globals: any = {};
                for (let key in serializedGlobals) {
                    globals[key] = deserialize(serializedGlobals[key]);
                }

                let context = { id: id, token: currentToken };
                return RunMql(queryText, globals, context, currentToken);
            })
            .then((result: any) => {
                postMessage(JSON.stringify({
                    type: "runQueryResult",
                    id: id,
                    result: serialize(result),
                    isCanceled: currentToken.isCanceled
                }));
                currentToken = null;
            })
            .catch((err: any) => {
                if (!(err instanceof Error)) {
                    err = new Error(err);
                    err.message = `Unknown ${err.message} (thrown by value)`;
                }
                postMessage(JSON.stringify({
                    type: "runQueryResult",
                    id: id,
                    error: serialize(err),
                    isCanceled: currentToken.isCanceled
                }));
                currentToken = null;
            });
    } else if (data.type === "runEval") {
        const { codeText, id, serializedGlobals } = data;
        if (currentToken) {
            console.error("Received a run request while already running a task");
            return;
        }
        currentToken = new CancelToken<FunctionEvaluatorResults>();
        Promise.resolve()
            .then(() => {
                let globals: any = {};
                for (let key in serializedGlobals) {
                    globals[key] = deserialize(serializedGlobals[key]);
                }
                let context = { id: id, token: currentToken };
                let func = CreateJsFunc(codeText, []);
                return func(globals, context, []);
            })
            .then((result: any) => {
                postMessage(JSON.stringify({
                    type: "runEvalResult",
                    id: id,
                    result: serialize(result),
                    isCanceled: currentToken.isCanceled
                }));
                currentToken = null;
            })
            .catch((err: any) => {
                if (!(err instanceof Error)) {
                    err = new Error(err);
                    err.message = `Unknown ${err.message} (thrown by value)`;
                }
                postMessage(JSON.stringify({
                    type: "runEvalResult",
                    id: id,
                    error: serialize(err),
                    isCanceled: currentToken.isCanceled
                }));
                currentToken = null;
            });
    } else if (data.type === "KernelEvalResult") {
        const { result, error, id } = data;
        let pending = KernelEvalFunction.pendingEvals[id];
        if (!pending) {
            console.error("Received query result for non-existing query. Id: " + id);
            return;
        }

        try {
            if (error) {
                pending.reject(deserialize(error));
            } else {
                pending.resolve(deserialize(result));
            }
        } catch (err) {
            pending.reject(err);
        }
    } else if (data.type === "FetchResult") {
        const { result, error, id } = data;
        let pending = FetchFunction.pendingEvals[id];
        if (!pending) {
            console.error("Received fetch result for non-existing fetch. Id: " + id);
            return;
        }

        try {
            if (error) {
                pending.reject(deserialize(error));
            } else {
                pending.resolve(deserialize(result));
            }
        } catch (err) {
            pending.reject(err);
        }
    } else if (data.type === "StaticCacheCmdResult") {
        const { result, id } = data;
        let pending = StaticCacheFunction.pendingEvals[id];
        if (!pending) {
            console.error("Received StaticCache result for non-existing fetch. Id: " + id);
            return;
        }

        try {
            pending.resolve(result);
        } catch (err) {
            pending.reject(err);
        }
    } else if (data.type === "parseQuery") {
        const { codeText, id } = data;
        const parseResult = MqlCompiler.parse(codeText);
        //Trim down the errors to prevent serialization issues. We only care about line, column, msg at the moment.
        const safeToken = (token: Token) => token ? ({ text: token.text, start: token.start, stop: token.stop }) : null;
        const errors = parseResult.errors.map(e => ({
            token: safeToken(e.offendingSymbol),
            line: e.line,
            column: e.column,
            msg: e.msg
        }));
        postMessage(JSON.stringify({
            type: "parseQueryResult",
            id: id,
            data: JSON.stringify({ sets: parseResult.sets, defs: parseResult.defs, errors })
        }));
    } else if (data.type === "getAvailableFunctions") {
        const { id, includeDocs } = data;
        GetAllFunctions().then(funcs => {
            const functions = Object.values(funcs)
                .map((func: any) => {
                    const obj = {
                        name: func.functionName,
                        args: func.functionArgs.map(i => i.toJson()),
                        repeatingArgs: func.functionRepeatingArgs,
                        returnTypeName: func.returnType.serializableName,
                    } as IMqlFunctionMetadata;
                    if (includeDocs) {
                        obj.returnDescription = func.returnDescription;
                        obj.description = func.description;
                        obj.examples = func.examples.slice();
                        obj.remarks = func.remarks;
                    }
                    return obj;
                });

            postMessage(JSON.stringify({
                type: "getAvailableFunctionsResult",
                id: id,
                data: JSON.stringify(functions)
            }));
        });

    }
};

