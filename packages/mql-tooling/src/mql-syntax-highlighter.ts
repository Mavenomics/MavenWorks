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

import * as CodeMirror from "codemirror";
import { StringStream } from "codemirror";
import "codemirror/mode/javascript/javascript";
import "codemirror/addon/mode/multiplex";

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
