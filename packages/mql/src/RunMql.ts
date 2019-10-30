import { evaluateRowOptionsFast } from "./functions/helpers";
import { FunctionEvaluatorResults, IFunctionEvaluatorContext } from "./functionExecution";
import { FindFunctionInfo, GetAllFunctions } from "./functionFactory";
import { declareFunction, functionArg } from "./FunctionDecorators";
import { CancelToken, Types } from "@mavenomics/coreutils";
import { RunEmbeddedMql } from "./TableFunctions";
import { Table, TableHelper } from "@mavenomics/table";

export function RunMql(queryText, kvargs, userContext, cancelToken: CancelToken<FunctionEvaluatorResults>) {
    let runEmb = new RunEmbeddedMql();
    kvargs = kvargs || {};
    let keys = Object.keys(kvargs);
    let vals = keys.map(k => kvargs[k]);
    let locals = {};
    let context: IFunctionEvaluatorContext = {
        FindFunctionInfo: FindFunctionInfo,
        GetAllFunctions: GetAllFunctions,
        cancelToken: cancelToken,
        evaluate: null,
        user: null,

        userContext: userContext,

        setGlobal: (name, val) => kvargs[name] = val,
        getGlobal: (name) => kvargs[name],
        getGlobalKeys: () => keys,

        setLocal: (name, val) => locals[name] = val,
        getLocal: (name) => locals[name],

    };
    return runEmb.eval({ mql: queryText, name: keys, value: vals }, context);
}

function MqlExprFunction(func) {
    if (typeof func === "function") {
        Object.defineProperty(func, "passExprs", {
            configurable: false,
            enumerable: false,
            value: true,
            writable: false
        });
        return func;
    } else {
        throw new Error(`Expected function, got ${Object.prototype.toString.call(func)}`);
    }
}

function RunMqlTemplate(context) {
    return (strings: string[], ...vals: any[]) => {
        let keys = vals.map((val, i) => `@Generated${typeof val === "function" ? "_Function" : ""}_${i}`);
        let query = [strings[0]];
        keys.forEach((key, i) => {
            query.push(key, strings[i + 1]);
        });
        let kvs = keys.reduce((o, k, i) => {
            o[k] = vals[i];
            return o;
        }, {});
        return RunMql(query.join(""), kvs, context, context.token);
    };
}

// A global MQL template runner
export const mql = RunMqlTemplate({});
// Alias for the expr wrapper
export const fexpr = MqlExprFunction;

//Todo: Support more import types (E.g. global, self, window, etc)
//Also make sure we are following the correct conventions
enum ImportType {
    Export = "EXPORT",
    Module = "MODULE"
}
async function ImportScriptFromUrl(url: string, type?: ImportType): Promise<any> {
    type = type || ImportType.Export;

    const resp = await fetch(url);
    const data = await resp.text();

    if (type === ImportType.Export) {
        const func = new Function("exports", "module", data);
        const exp = {};
        func(exp, {});
        return exp;
    } else if (type === ImportType.Module) {
        const func = new Function("exports", "module", data);
        const mod = {} as any;
        func({}, mod);
        return mod.exports;
    } else {
        throw new Error("Unsupported ImportType: " + type);
    }
}

export type CompiledJsFunc = (globals: any, userContext: any, values: any[]) => any;
export function CreateJsFunc(codeText: string, names: string[]) {
    //The following Function eval wrapper is because "Object.getPrototypeOf(async function(){}).constructor"
    //gets compiled to a generator function instead of an async function.
    let AsyncFunction = Object.getPrototypeOf((new Function("return async function(){}"))()).constructor;

    let copyWindowToGlobalScope = `
for(let key in window) {
    let val = window[key];
    eval(key + " = val;");
}
`;

    let func: Function = new (Function.prototype.bind.apply(AsyncFunction, [
        null,
        "window",
        "global",
        "self",
        ...names,
        copyWindowToGlobalScope + codeText]));

    return (globals: any, userContext: any, values: any[]) => {
        //Give the js function an easy to use RunMql.
        const runMql = (queryText, kvargs) => RunMql(queryText, kvargs, userContext, userContext.token);

        const fakeWindow = {
            ImportScriptFromUrl,
            Table,
            TableHelper,
            Types,
            RunMql: runMql,
            mql: RunMqlTemplate(userContext),
            globals,
            expr: MqlExprFunction,
            context: userContext
        };

        return func.apply(this, [
            fakeWindow,
            {},
            {},
            ...values]);
    };
}

export { declareFunction, functionArg, evaluateRowOptionsFast };
