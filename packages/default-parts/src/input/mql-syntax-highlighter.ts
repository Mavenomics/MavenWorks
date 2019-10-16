/**
 * This file contains a CodeMirror highlighter for MQL, a custom flavor of SQL
 * that MavenWorks includes (along with an in-browser query engine to run
 * it). It will not run semantics checks.
 *
 * A note on the provenance of this file:
 *
 * It began life as a MySQL highlighter for CodeMirror, was adapted to a 2015
 * experiment using MQL inside TwoSigma Beaker, and adapted again for MavenWorks.
 * The original license headers and footers are kept from MySQL.
 */

// CodeMirror, copyright (c) by Marijn Haverbeke and others
// Distributed under an MIT license: http://codemirror.net/LICENSE
///<reference path="jshint.d.ts"/>
import * as CodeMirror from "codemirror";
import { StringStream } from "codemirror";
import "codemirror/mode/javascript/javascript";
import "codemirror/addon/mode/multiplex";
import "codemirror/addon/lint/lint";
import "codemirror/addon/hint/show-hint";
import { JSHINT } from "jshint/dist/jshint.js";
if (window)
    (<any>window).JSHINT = JSHINT;
import "codemirror/addon/lint/javascript-lint";
import { InitAddon } from "./javascript-hint";
InitAddon(CodeMirror);

import { WorkerWrapper, IParsedQuery, IMqlFunctionMetadata, WorkerMessage } from "@mavenomics/mql-worker";
import { UUID } from "@phosphor/coreutils";
import { TableHelper } from "@mavenomics/table";

import { getCommentLine, getGlobalsFromComment  } from "@mavenomics/bindings";
import { Types } from "@mavenomics/coreutils";

CodeMirror.defineMode("mql", function (config, parserConfig) {
    let client = parserConfig.client || {},
        atoms = parserConfig.atoms || { "false": true, "true": true, "null": true },
        builtin = parserConfig.builtin || {},
        keywords = parserConfig.keywords || {},
        operatorChars = parserConfig.operatorChars || /^[*+\-%<>!=&|~^]/,
        support = parserConfig.support || {},
        hooks = parserConfig.hooks || {},
        dateSQL = parserConfig.dateSQL || { "date": true, "time": true, "timestamp": true };

    // the Codemirror typings don't seem to have whatever State is supposed to be
    function tokenBase(stream: StringStream, state: any) {
        let ch = stream.next()!;

        // call hooks from the mime type
        if (hooks[ch]) {
            let result = hooks[ch](stream, state);
            if (result !== false) return result;
        }

        if (support.hexNumber === true &&
            ((ch === "0" && stream.match(/^[xX][0-9a-fA-F]+/))
                || (ch === "x" || ch === "X") && stream.match(/^'[0-9a-fA-F]+'/))) {
            // hex
            // ref: http://dev.mysql.com/doc/refman/5.5/en/hexadecimal-literals.html
            return "number";
        } else if (support.binaryNumber === true &&
            (((ch === "b" || ch === "B") && stream.match(/^'[01]+'/))
                || (ch === "0" && stream.match(/^b[01]+/)))) {
            // bitstring
            // ref: http://dev.mysql.com/doc/refman/5.5/en/bit-field-literals.html
            return "number";
        } else if (ch.charCodeAt(0) > 47 && ch.charCodeAt(0) < 58) {
            // numbers
            // ref: http://dev.mysql.com/doc/refman/5.5/en/number-literals.html
            stream.match(/^[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?/);
            if (support.decimallessFloat === true) {
                stream.eat(".");
            }
            return "number";
        } else if (ch === "?" && (stream.eatSpace() || stream.eol() || stream.eat(";"))) {
            // placeholders
            return "variable-3";
        } else if (ch === "'") {
            // strings
            // ref: http://dev.mysql.com/doc/refman/5.5/en/string-literals.html
            state.tokenize = tokenLiteral(ch);
            return state.tokenize(stream, state);
        } else if ((((support.nCharCast === true && (ch === "n" || ch === "N"))
            || (support.charsetCast === true && ch === "_" && stream.match(/[a-z][a-z0-9]*/i)))
            && (stream.peek() === "'" || stream.peek() === "\""))) {
            // charset casting: _utf8'str', N'str', n'str'
            // ref: http://dev.mysql.com/doc/refman/5.5/en/string-literals.html
            return "keyword";
        } else if (/^[\(\),\;\[\]]/.test(ch)) {
            // no highlightning
            return null;
        } else if (support.commentSlashSlash && ch === "/" && stream.eat("/")) {
            // 1-line comment
            stream.skipToEnd();
            return "comment";
        } else if ((support.commentHash && ch === "#")
            || (ch === "-" && stream.eat("-") && (!support.commentSpaceRequired || stream.eat(" ")))) {
            // 1-line comments
            // ref: https://kb.askmonty.org/en/comment-syntax/
            stream.skipToEnd();
            return "comment";
        } else if (ch === "/" && stream.eat("*")) {
            // multi-line comments
            // ref: https://kb.askmonty.org/en/comment-syntax/
            state.tokenize = tokenComment;
            return state.tokenize(stream, state);
        } else if (ch === ".") {
            // .1 for 0.1
            if (support.zerolessFloat === true && stream.match(/^(?:\d+(?:e[+-]?\d+)?)/i)) {
                return "number";
            }
            // .table_name (ODBC)
            // // ref: http://dev.mysql.com/doc/refman/5.6/en/identifier-qualifiers.html
            if (support.ODBCdotTable === true && stream.match(/^[a-zA-Z_]+/)) {
                return null;
            }
        } else if (operatorChars.test(ch)) {
            // operators
            stream.eatWhile(operatorChars);
            return null;
        } else if (ch === "{" &&
            (stream.match(/^( )*(d|D|t|T|ts|TS)( )*'[^']*'( )*}/)
                || stream.match(/^( )*(d|D|t|T|ts|TS)( )*"[^"]*"( )*}/))) {
            // dates (weird ODBC syntax)
            // ref: http://dev.mysql.com/doc/refman/5.5/en/date-and-time-literals.html
            return "number";
        } else {
            stream.eatWhile(/^[_\w\d]/);
            let word = stream.current().toLowerCase();
            // dates (standard SQL syntax)
            // ref: http://dev.mysql.com/doc/refman/5.5/en/date-and-time-literals.html
            if (dateSQL.hasOwnProperty(word) && (stream.match(/^( )+'[^']*'/) || stream.match(/^( )+"[^"]*"/)))
                return "number";
            if (atoms.hasOwnProperty(word)) return "atom";
            if (builtin.hasOwnProperty(word)) return "builtin";
            if (keywords.hasOwnProperty(word)) return "keyword";
            if (client.hasOwnProperty(word)) return "string-2";
            return null;
        }
    }

    // 'string', with char specified in quote escaped by '\'
    function tokenLiteral(quote: string) {
        return function (stream: StringStream, state: any) {
            let escaped = false, ch;
            while ((ch = stream.next()) != null) {
                if (ch === quote && !escaped) {
                    state.tokenize = tokenBase;
                    break;
                }
                escaped = !escaped && ch === "\\";
            }
            return "string";
        };
    }
    function tokenComment(stream: StringStream, state: any) {
        while (true) {
            if (stream.skipTo("*")) {
                stream.next();
                if (stream.eat("/")) {
                    state.tokenize = tokenBase;
                    break;
                }
            } else {
                stream.skipToEnd();
                break;
            }
        }
        return "comment";
    }

    function pushContext(stream: StringStream, state: any, type: any) {
        state.context = {
            prev: state.context,
            indent: stream.indentation(),
            col: stream.column(),
            type: type
        };
    }

    function popContext(state: any) {
        state.indent = state.context.indent;
        state.context = state.context.prev;
    }

    return {
        startState: function () {
            return { tokenize: tokenBase, context: null };
        },

        token: function (stream, state) {
            if (stream.sol()) {
                if (state.context && state.context.align == null)
                    state.context.align = false;
            }
            if (stream.eatSpace()) return null;

            let style = state.tokenize(stream, state);
            if (style === "comment") return style;

            if (state.context && state.context.align == null)
                state.context.align = true;

            let tok = stream.current();
            if (tok === "(")
                pushContext(stream, state, ")");
            else if (tok === "[")
                pushContext(stream, state, "]");
            else if (state.context && state.context.type === tok)
                popContext(state);
            return style;
        },

        indent: function (state, textAfter) {
            let cx = state.context;
            if (!cx) return CodeMirror.Pass;
            let closing = textAfter.charAt(0) === cx.type;
            if (cx.align) return cx.col + (closing ? 0 : 1);
            else return cx.indent + (closing ? 0 : config.indentUnit);
        },

        blockCommentStart: "/*",
        blockCommentEnd: "*/",
        lineComment: support.commentSlashSlash ? "//" : support.commentHash ? "#" : undefined
    };
});

CodeMirror.defineMode("jsmql", (config, parserConfig) => {
    const jsMode = CodeMirror.getMode(config, { name: "javascript" });
    let mqlMode = CodeMirror.getMode(config, { name: "text/x-mql" });
    // cf. https://github.com/jupyterlab/jupyterlab/blob/master/packages/codemirror/src/codemirror-ipythongfm.ts
    return (CodeMirror as any).multiplexingMode(
        jsMode,
        {
            open: "mql`",
            close: "`",
            mode: mqlMode
        }
    );
});

// variable token
function hookVar(stream: StringStream) {
    // variables
    // @@prefix.varName @varName
    // varName can be quoted with ` or ' or "
    // ref: http://dev.mysql.com/doc/refman/5.5/en/user-variables.html
    if (stream.eat("@")) {
        stream.match(/^session\./);
        stream.match(/^local\./);
        stream.match(/^global\./);
    }

    if (stream.eat("'")) {
        stream.match(/^.*'/);
        return "variable-2";
    } else if (stream.eat("\"")) {
        stream.match(/^.*"/);
        return "variable-2";
    } else if (stream.eat("`")) {
        stream.match(/^.*`/);
        return "variable-2";
    } else if (stream.match(/^[0-9a-zA-Z$\.\_]+/)) {
        return "variable-2";
    }
    return null;
}

// these keywords are used by all SQL dialects (however, a mode can still overwrite it)
let sqlKeywords = "select from as where group order by def set fun on in " +
    "asc desc format distinct top with rollup no leaves having";

let builtin = "average wavg single one count max min sum arr_add arr_div " +
    "arr_log arr_mult arr_sub filter map foldl foldr pow sqrt ifelse";

// turn a space-separated list into an array
function set(str: string) {
    let obj = {} as { [index: string]: boolean };
    let words = str.split(" ");
    for (let i = 0; i < words.length; ++i) obj[words[i]] = true;
    return obj;
}

// Created to support specific hive keywords
CodeMirror.defineMIME("text/x-mql", {
    name: "mql",
    keywords: set(sqlKeywords),
    builtin: set(builtin),
    atoms: set("and not or xor null"),
    operatorChars: /^[*+\-%<>!=]/,
    dateSQL: set("date time timestamp"),
    support: set("ODBCdotTable doubleQuote binaryNumber hexNumber"),
    hooks: {
        "@": hookVar
    }
});
CodeMirror.defineMIME("text/x-jsmql", "jsmql");

// for some reason, defineMime doesn't touch this modeInfo object, which is
// used by various CodeMirror helpers to resolve a MIME highlighting mode
// from the `mode` option (for a friendlier, more forgiving external API).
// CodeMirrorEditorServices relies on this entirely, and if it's not in the
// modeInfo object, the CodeMirrorWrapper will fall back on text/plain.
// Further, this is executed on the tick after parsing to try and ensure that it
// is setup _after_ the CodeMirrorEditorServices. I can't simply import the meta
// package, since if EditorServices runs afterwards, it'll overwrite the mode
// metadata.
(async function () {
    await new Promise(resolve => setTimeout(resolve));
    let modeInfo: Array<{ name: string, mime: string, mode: string }>;
    modeInfo = (CodeMirror as any).modeInfo;
    if (modeInfo == null) {
        console.warn("Could not register MQL highlighter with modeInfo- this highlighter won't work");
        return;
    }
    modeInfo.push({
        name: "MQL",
        mime: "text/x-mql",
        mode: "mql"
    });
    modeInfo.push({
        name: "MQL.js",
        mime: "text/x-jsmql",
        mode: "jsmql"
    });
})();

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
function getAvailableFunctions(): Promise<IMqlFunctionMetadata[]> {
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


//Todo: Move mql-syntax-highlighter.ts into a separate package. default-parts shouldn't depend on mql.
//Todo: InputWidgets.Code should use a service to generate the codemirror config.
//That way the following code can be registered with the service instead of using this InitHook hack.
//Essentially making InputWidgets.Code pluginable.
function getJavaScriptReferencedGlobals(text: any): string[] | null {
    const comment = getCommentLine(text, null);
    return comment != null ? getGlobalsFromComment(comment) : null;
}
//Todo: Subscribe to the globals service and only update when globals are added/removed.
function updateGlobalsCompletion(cm: any) {
    const options = cm.options;
    if (options) {
        let hintOpts = options.hintOptions;
        if (hintOpts && hintOpts.globalScope && hintOpts.additionalContext) {
            const globalsService = options && options.context ? options.context.globals : null;
            const allGlobals = globalsService ? Array.from(globalsService).map((g: any) => g.name) : [];
            //Try to find explicitly referenced globals.
            //If there are no explicitly referenced globals then we show all globals.
            const globals = getJavaScriptReferencedGlobals(cm.getDoc().getValue()) || allGlobals;
            let globalsObj = globals.reduce((o: any, n: string) => (o[n] = "", o), {});
            hintOpts.globalScope.globals = globalsObj;
            hintOpts.additionalContext.globals = globalsObj;
        }
    }

}
CodeMirror.defineInitHook((cm: CodeMirror.Editor) => {
    CodeMirror.on(cm, "optionChange", (cm: any, option: any) => {
        if (option === "mode") {
            if (cm.getOption("mode") === "text/x-jsmql" && cm.options && cm.options.hintOptions) {
                cm.options.hintOptions.esversion = 9; //Enable es9. This is for await and mql templates support
                //This gives us autocomplete for TableHelper.<x>
                cm.options.hintOptions.additionalContext = { TableHelper: TableHelper };

                //Copy window so that we can add globals
                let windowClone: any = {};
                for (let key of Reflect.ownKeys(window)) {
                    windowClone[key] = (<any>window)[key];
                }

                //Add TableHelper, RunMql, etc
                cm.options.hintOptions.globalScope = Object.assign({}, windowClone, {
                    TableHelper: TableHelper,
                    RunMql: function () { },
                    mql: "",
                    expr: function () { },
                    ImportScriptFromUrl: function () { },
                });

                updateGlobalsCompletion(cm);
                cm.on("change", updateGlobalsCompletion);
            } else {
                cm.off("change", updateGlobalsCompletion);
            }
        }
    });

});


// tslint:disable: max-line-length
/*
  How Properties of Mime Types are used by SQL Mode
  =================================================
  keywords:
    A list of keywords you want to be highlighted.
  builtin:
    A list of builtin types you want to be highlighted (if you want types to be of class "builtin" instead of "keyword").
  operatorChars:
    All characters that must be handled as operators.
  client:
    Commands parsed and executed by the client (not the server).
  support:
    A list of supported syntaxes which are not common, but are supported by more than 1 DBMS.
    * ODBCdotTable: .tableName
    * zerolessFloat: .1
    * doubleQuote
    * nCharCast: N'string'
    * charsetCast: _utf8'string'
    * commentHash: use # char for comments
    * commentSlashSlash: use // for comments
    * commentSpaceRequired: require a space after -- for comments
  atoms:
    Keywords that must be highlighted as atoms,. Some DBMS's support more atoms than others:
    UNKNOWN, INFINITY, UNDERFLOW, NaN...
  dateSQL:
    Used for date/time SQL standard syntax, because not all DBMS's support same temporal types.
*/

  // CodeMirror, copyright (c) by Marijn Haverbeke and others
  // Distributed under an MIT license: http://codemirror.net/LICENSE
