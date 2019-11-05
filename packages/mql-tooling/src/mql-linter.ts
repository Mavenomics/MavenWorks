import { WorkerWrapper, IParsedQuery, IMqlFunctionMetadata, WorkerMessage } from "@mavenomics/mql-worker";
import { Types } from "@mavenomics/coreutils";
import { UUID } from "@phosphor/coreutils";
import * as CodeMirror from "codemirror";
import { getCommentLine, getGlobalsFromComment } from "@mavenomics/bindings";
import "codemirror/addon/lint/lint";
import "codemirror/addon/hint/show-hint";

const worker = new WorkerWrapper();
type WorkerMsg<T> = {
    id: string;
    resolve: ((value?: T | PromiseLike<T>) => void);
    reject: ((reason?: any) => void);
};
const workerMsgs: { [id: string]: WorkerMsg<any> } = {};
worker.onMessage.subscribe((msgData) => {
    const { id } = msgData;
    if (msgData.type === "parseQueryResult" && id) {
        const data = msgData.data;
        const msg = workerMsgs[id];
        if (!msg) {
            console.error("Received bad parse result", msg, id, data);
            return;
        }
        try {
            msg.resolve(JSON.parse(data) as IParsedQuery);
        } catch (e) {
            msg.reject(e);
        } finally {
            delete workerMsgs[id];
        }
    } else if (msgData.type === "getAvailableFunctionsResult" && id) {
        const data = msgData.data;
        const msg = workerMsgs[id];
        if (!msg) {
            console.error("Received bad parse result", msg, id, data);
            return;
        }
        try {
            const funcsJson = JSON.parse(data) as IMqlFunctionMetadata[];
            const infos = funcsJson.map(i => {
                return {
                    ...i,
                    returnType: Types.findType(i.returnTypeName) || Types.Any,
                    args: i.args.map(arg => {
                        return {
                            ...arg,
                            type: Types.findType(arg.typeName) || Types.Any
                        };
                    })
                };
            });
            msg.resolve(infos);
        } catch (e) {
            msg.reject(e);
        } finally {
            delete workerMsgs[id];
        }
    }
});
function parseQuery(query: string): Promise<any> {
    const id = UUID.uuid4();

    let resolve: (value?: any | PromiseLike<any>) => void;
    let reject: (reason?: any) => void;
    let promise = new Promise<any>((res, rej) => { resolve = res; reject = rej; });

    workerMsgs[id] = { id: id, reject: reject!, resolve: resolve! };
    worker.postMessage({
        type: WorkerMessage.MsgType.ParseQueryRequest,
        id: id,
        codeText: query
    });
    return promise;
}
export function getAvailableFunctions(): Promise<IMqlFunctionMetadata[]> {
    const id = UUID.uuid4();

    let resolve: (value?: any[] | PromiseLike<any[]>) => void;
    let reject: (reason?: any) => void;
    let promise = new Promise<any[]>((res, rej) => { resolve = res; reject = rej; });

    workerMsgs[id] = { id: id, reject: reject!, resolve: resolve! };
    worker.postMessage({
        type: WorkerMessage.MsgType.GetFunctionsRequest,
        id: id
    });
    return promise;
}
const mqlLinter = (text: string, resolve: (annotations: any) => void, config: any, cm: CodeMirror.Editor) => {
    parseQuery(text).then(data => {
        //Expose the sets/defs to the autocomplete
        cm.state.MqlSetsDefs = data;
        const errors = data.errors;
        if (errors.length > 0) {
            //We only care about the first error since the other errors are typically from recovery mode.
            const error = errors[0];

            let tokenLength = error.token && error.token.text ? error.token.text.length : 0;

            resolve([{
                message: error.msg,
                severity: "error",
                from: CodeMirror.Pos(error.line - 1, error.column),
                to: CodeMirror.Pos(error.line - 1, error.column + tokenLength)
            }]);
        } else {
            resolve([]);
        }
    }).catch((err) => {
        console.error("Unhandled parse error", err);
        resolve([]);
    });

};
mqlLinter.async = true; //In this mode the linter will throw away stale lint results.
CodeMirror.registerHelper("lint", "mql", mqlLinter);


function mqlTrim(str: string) {
    //Remove whitespace to handle the token under the cursor being only whitespace.
    //Also remove leading '.'. This is needed since the codemirror mql tokenizer isn't complete.
    str = str.replace(/^[\.\s]*/g, "");
    return str;
}
const getReferencedGlobals = (text: string) => {
    const comment = getCommentLine(text);
    return comment != null ? getGlobalsFromComment(comment) : null;
};
const generateMqlSignature = (func: IMqlFunctionMetadata) => {
    //Mql functions always start with a row arg.
    const args = func.args.slice(1);
    //Todo: Decide on a signature format.
    //Currently mql doesn't support defaults(optional args).
    //When that changes we will want to pick a better signature format.
    const requiredArgs = args;
    const repeatingArgs = args.slice(args.length - func.repeatingArgs);

    const requiredText = requiredArgs.map((a: any) => a.name + ": " + a.type.name).join(", ");
    const leadingComma = requiredArgs.length > 0 ? ", " : "";
    const repeatingText = repeatingArgs.length > 0 ?
        ` [${leadingComma}${repeatingArgs.map((a: any) => a.name + ": " + a.type.name).join(", ")}]+` :
        "";
    const signature = `(${requiredText}${repeatingText}): ${func.returnTypeName}`;
    return signature;
};
const generateDefSignature = (def: any) => {
    return `(${def.paramNames.map((e: string) => `@${e}`).join(", ")})`;
};
const mqlRenderHint = (element: HTMLElement, self: any, data: MqlCompletion) => {
    //self is the object containing {list, from, to, render, etc}.
    //data is the current completion from {list} being rendered.
    const containerEl = document.createElement("div");
    containerEl.className = "CodeMirror-hint-container";
    const nameEl = document.createElement("div");
    nameEl.className = "CodeMirror-hint-name";
    const sigEl = document.createElement("div");
    sigEl.className = "CodeMirror-hint-signature";

    nameEl.appendChild(document.createTextNode(data.name));
    sigEl.appendChild(document.createTextNode(data.signature || "")); //signature is optional
    containerEl.appendChild(nameEl);
    containerEl.appendChild(sigEl);
    element.appendChild(containerEl);
};
type MqlCompletion = {
    name: string;
    signature?: string;
};
const mqlHints = async (cm: CodeMirror.Editor, resolve: (completions: any) => void, config: any) => {
    //Todo: cache getAvailableFunctions since mqlHints is called as you type with the autocomplete dialog open
    const availableFuncs = await getAvailableFunctions();

    const options = (<any>cm).options;
    const globalsService = options && options.context ? options.context.globals : null;
    const allGlobals = globalsService ? Array.from(globalsService).map((g: any) => g.name) : [];
    const globals = getReferencedGlobals(cm.getDoc().getValue()) || allGlobals;

    const cur = cm.getDoc().getCursor();
    let token = cm.getTokenAt(cur);
    //Remove any of the token that appears after the cursor.
    //This allows you to autocomplete mid word.
    if (token.end > cur.ch) {
        token.end = cur.ch;
        token.string = token.string.slice(0, cur.ch - token.start);
    }

    let setsDefs = cm.state.MqlSetsDefs || { sets: [], defs: [] };

    //Combine the functions, sets, defs and reference globals into a MqlCompletion array
    let mqlFuncs = availableFuncs.map(fi => ({ name: fi.name, signature: generateMqlSignature(fi) }) as MqlCompletion);
    let sets = setsDefs.sets.map((e: any) => ({ name: `@${e}` }));
    //TODO: Display def signatures
    let defs = setsDefs.defs.map((e: any) => ({ name: `@${e.name}`, signature: generateDefSignature(e) }));
    let globalAtNames = globals.map((e: any) => ({ name: `@${e}` }));

    let completions = mqlFuncs.concat(sets, defs, globalAtNames);

    //Find functions that match the token.
    let word = mqlTrim(token.string);
    if (word.length > 0) {
        completions = completions.filter(fi => fi.name.toLowerCase().startsWith(word.toLowerCase()));
    }
    completions.sort((a, b) => a.name.localeCompare(b.name));

    let replaceToken = word.length > 0;

    resolve({
        list: completions.map(fi => ({ name: fi.name, signature: fi.signature, render: mqlRenderHint, text: fi.name })),
        from: replaceToken ? CodeMirror.Pos(cur.line, cur.ch - word.length) : cur,
        to: cur,
    });
};
mqlHints.async = true;
CodeMirror.registerHelper("hint", "mql", mqlHints);
