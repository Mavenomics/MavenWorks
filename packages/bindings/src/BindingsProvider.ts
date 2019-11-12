import * as _ from "lodash";
import { GlobalsService } from "./GlobalsService";
import { IDisposable } from "@phosphor/disposable";
import { Disposable } from "./Disposable";
import { IExpressionEvaluator } from "./evaluator";
import { MqlWorkerPool } from "./MqlWorkerPool";

/**
 * Helper function to retrieve the leading comment from a string.
 *
 * This function uses C-style comments by default, but can be overridden with
 * different characters or no support at all.
 *
 * @param src The full text of the binding
 * @param lineComment The style of line comments to use. Must be regex-escaped.
 * Defaults to C-style, set to 'null' to disable line comments.
 * @param blockStart The style of block comment start tokens. Must be regex-
 * escaped. Defaults to C-style, set to 'null' to disable block comments entirely.
 * @param blockEnd The style of block comment end tokens. Must be regex-escaped.
 * Defaults to C-style, set to 'null' to disable block comments entirely.
 * @returns A string containing the comment text, or null if there wasn't a comment
 */
export function getCommentLine(
    src: string,
    lineComment: string | null = "\\/\\/",
    blockStart: string | null = "\\/\\*",
    blockEnd: string | null = "\\*\\/"
): string | null {
    src = src.trim();
    if (lineComment != null) {
        // check for line comments first
        const regex = new RegExp(String.raw`^\s*${lineComment}.*`);
        let res = src.match(regex);
        if (res) {
            return res[1].trim();
        }
        // fall through to block comment handling
    }
    if (blockStart && blockEnd) {
        const regex = new RegExp(String.raw`^\s*${blockStart}([^${blockEnd}]*)${blockEnd}`);
        let res = src.match(regex);
        if (res) {
            return res[1].trim();
        }
    }
    // no matches
    return null;
}

// TODO: We should have this in a more centralized location
const GLOBAL_TOKEN = /[A-Za-z][A-Za-z0-9_]*/;
const ATPARAM_TOKEN = new RegExp("\@(" + GLOBAL_TOKEN.source + ")");
/**
 * Helper function to fetch globals from a leading comment string
 *
 * @param src The content of the magic comment
 * @returns A list of globals found in the string.
 */
export function getGlobalsFromComment(src: string) {
    let match = null;
    let matchedGlobals = [];
    let regex = new RegExp(ATPARAM_TOKEN.source, "g");
    while (match = regex.exec(src)) {
        matchedGlobals.push(match[1]);
    }
    return matchedGlobals;
}

export abstract class BaseBindingsEvaluator extends Disposable implements IBindingsEvaluator {
    abstract get name(): string;

    disposed(): void {
    }

    abstract evaluate(group: string, expr: any, globals: ReadonlyArray<string>): Promise<any>;

    abstract getGlobalsForBinding(expr: any): string[];

    abstract cancel(group: string): void;

    public getMetadata() {
        return;
    }
}

export interface IBindingsEvaluator extends IDisposable {
    readonly name: string;

    //Todo: Allow IBindingEvaluators to return an error when parsing globals.
    getGlobalsForBinding(expr: any): string[];

    evaluate(group: string, expr: any, globals: ReadonlyArray<string>): Promise<any>;

    cancel(group: string): void;

    getMetadata(): void | {editorMode: string};
}

class EvalBindingsEvaluator extends BaseBindingsEvaluator {
    private readonly evaluator: IExpressionEvaluator;

    constructor(globals: GlobalsService, evaluator: IExpressionEvaluator) {
        super();
        this.evaluator = evaluator;
    }

    async evaluate(group: string, expr: any, globals: ReadonlyArray<string>): Promise<any> {
        return await this.evaluator.evaluate(expr, globals);
    }

    cancel(group: string) {
        //KernelEval doesn't currently support cancel
    }

    public dispose() {
        if (this._isDisposed) return;
        this.evaluator.dispose();
        super.dispose();
    }

    get name(): string {
        return "Eval";
    }

    getGlobalsForBinding(expr: any): string[] {
        //Todo: caching
        const comment = getCommentLine(expr, "#", null, null);
        if (comment != null) {
            return getGlobalsFromComment(comment);
        }
        let match: RegExpExecArray | null;
        let globalRegex = new RegExp(ATPARAM_TOKEN.source, "g");
        const newGlobals = [];
        while ((match = globalRegex.exec(expr || "")) != null) {
            newGlobals.push(match[1]);
        }
        return newGlobals;
    }

    public getMetadata() {
        return this.evaluator.getMetadata();
    }
}

class JavaScriptBindingsEvaluator extends BaseBindingsEvaluator {
    constructor(private globals: GlobalsService, private pool: MqlWorkerPool) {
        super();
    }

    async evaluate(group: string, expr: any, globalNames: ReadonlyArray<string>): Promise<any> {
        return this.pool.runJs(group, expr, globalNames);
    }

    cancel(group: string) {
        this.pool.cancelTasks(group);
    }

    getGlobalsForBinding(expr: any): string[] {
        const comment = getCommentLine(expr);
        if (comment != null) {
            return getGlobalsFromComment(comment);
        }
        let match = null;
        const globals: string[] = [];
        const regex = new RegExp("globals\.(" + GLOBAL_TOKEN.source + ")", "g");
        while (match = regex.exec(expr)) {
            globals.push(match[1]);
        }
        return globals;
    }

    get name(): string {
        return "JavaScript";
    }

    disposed() {
    }

    public getMetadata() {
        return {
            editorMode: "MQL.js"
        };
    }
}

class MqlEvaluator extends BaseBindingsEvaluator {
    constructor(private globals: GlobalsService, private pool: MqlWorkerPool) {
        super();
    }

    async evaluate(group: string, expr: any, globalNames: ReadonlyArray<string>): Promise<any> {
        return this.pool.runMql(group, expr, globalNames);
    }

    cancel(group: string) {
        this.pool.cancelTasks(group);
    }

    get name(): string {
        return "Mql";
    }

    getGlobalsForBinding(expr: any): string[] {
        const comment = getCommentLine(expr, null);
        if (comment != null) {
            return getGlobalsFromComment(comment);
        }
        let match: RegExpExecArray | null;
        const globalRegex = new RegExp(ATPARAM_TOKEN.source, "g");
        const newGlobals = new Set<string>();
        while (match = globalRegex.exec(expr)) {
            newGlobals.add(match[1]);
        }
        const setOrDefRegex = new RegExp(String.raw`^(?:set|def)\s+${ATPARAM_TOKEN.source}`, "g");
        // try to filter out all the sets and defs
        while (match = setOrDefRegex.exec(expr)) {
            newGlobals.delete(match[1]);
        }
        return [...newGlobals];
    }

    disposed() {
    }

    public getMetadata() {
        return {
            editorMode: "mql"
        };
    }
}

class GlobalBindingsEvaluator extends BaseBindingsEvaluator {
    constructor(private globals: GlobalsService) {
        super();
    }

    async evaluate(group: string, expr: any, globals: ReadonlyArray<string>): Promise<any> {
        return this.globals.get(expr);
    }

    get name(): string {
        return "Global";
    }

    getGlobalsForBinding(expr: any): string[] {
        return [expr];
    }

    cancel(group: string) {
    }
}

class NoneBindingsEvaluator extends BaseBindingsEvaluator {
    evaluate(group: string, expr: any, globals: ReadonlyArray<string>): Promise<any> {
        return Promise.resolve(null);
    }

    get name(): string {
        return "None";
    }

    getGlobalsForBinding(expr: any): string[] {
        return [];
    }

    cancel(group: string) {
    }
}

export class BindingsProvider extends Disposable {
    evaluators: { [name: string]: IBindingsEvaluator };
    workerPool: MqlWorkerPool;

    constructor(globals: GlobalsService, evaluator?: IExpressionEvaluator) {
        super();
        this.workerPool = new MqlWorkerPool(globals, evaluator, 8, 15000);
        let builtin = [
            new GlobalBindingsEvaluator(globals),
            new NoneBindingsEvaluator(),
            new JavaScriptBindingsEvaluator(globals, this.workerPool),
            new MqlEvaluator(globals, this.workerPool),
        ];
        if (evaluator != null) {
            builtin.push(
                new EvalBindingsEvaluator(globals, evaluator)
            );
        }
        this.evaluators = builtin.reduce((o: { [name: string]: IBindingsEvaluator }, e) => {
            o[e.name] = e;
            return o;
        }, {});
    }

    public getBindingNames(): string[] {
        return _.values(this.evaluators).map((ev: IBindingsEvaluator) => ev.name);
    }

    public getBindingEvaluator(type: string): IBindingsEvaluator {
        return this.evaluators[type] || new ErrorBindingsEvaluator(type);
    }

    protected disposed(): void {
        for (let e of _.values(this.evaluators))
            e.dispose();
        this.workerPool.dispose();
    }
}


export class ErrorBindingsEvaluator extends BaseBindingsEvaluator {
    constructor(private type: string) {
        super();
    }

    get name(): string {
        throw new Error("Not Supported");
    }

    evaluate(group: string, expr: any): Promise<any> {
        return Promise.reject("Unknown binding type: " + this.type);
    }

    cancel() {
    }

    getGlobalsForBinding(expr: any): string[] {
        return [];
    }
}


