import {
    MqlParser,
} from "../../mqlparser_src";
import { MqlParserVisitor } from "./MqlParserVisitor";
import * as antlr4 from "antlr4";
import { ErrorListener } from "antlr4/error/ErrorListener";
import { LiteralVisitor } from "./LiteralVisitor";
import { MqlLexerImpl, ThrowErrorListener } from "../parsing";

export class MqlCompiler {

    static compile(text: string) {
        let parser = MqlCompiler.createParser(text);
        // TODO: query contextual types
        let result = (parser as any).mql_query();

        let setsDefs = new SetDefFinder();
        setsDefs.visitMql_query(result);

        let treeParser = new MqlTreeCompiler(setsDefs.sets, setsDefs.defs);
        let javaScript = treeParser.parseQuery(result);

        return new MqlCompilerResults(treeParser.getPrepends(), javaScript, treeParser.functionsToInline);
    }

    static compileExpression(text: string) {
        let parser = MqlCompiler.createParser(text);
        // TODO: query contextual types
        let result = (parser as any).expression();

        let treeParser = new MqlTreeCompiler();
        let javaScript = treeParser.parseExpression(result);

        return new MqlCompilerResults(treeParser.getPrepends(), javaScript, treeParser.functionsToInline);
    }

    static parse(text: string) {
        // Todo: Disable error recovery mode.
        // NOTE: If error recovery is disabled then SetDefFinder below needs to
        // be adjusted.
        //
        // DefaultErrorStrategy handles generating the error messages.
        // BailErrorStrategy bails without giving a nicely formatted error
        // message. That means we will need to implement our own ErrorStrategy
        // which is a mix of Default and Bail.
        //
        // Until then using DefaultErrorStrategy is fine since we can ignore the
        // recovery errors and only use the first error. A reason to use a
        // custom ErrorStrategy is just to improve parsing speed when there is
        // an error.

        let logger = new ErrorLogger();
        let chars = new antlr4.InputStream(text);
        let lexer = new MqlLexerImpl(chars);
        lexer.removeErrorListeners(); //removes console logger
        lexer.addErrorListener(logger);

        let tokens = new antlr4.CommonTokenStream(lexer);
        let parser = new MqlParser(tokens);
        parser.removeErrorListeners();
        parser.addErrorListener(logger);

        // TODO: query contextual types
        let result = (parser as any).mql_query();

        // With error recovery mode enabled we can walk a tree with syntax
        // errors and still get the sets/defs beyond the error
        /* E.g.
           set @x = 1
           st @y = 2
           set @z = 3

           will return "x" and "z".
         */
        let setsDefs = new SetDefFinder();
        setsDefs.visitMql_query(result);

        return { result: result, sets: setsDefs.sets, defs: setsDefs.defs, errors: logger.errors };
    }
    private static createParser(text: string) {
        let chars = new antlr4.InputStream(text);
        let lexer = new MqlLexerImpl(chars);
        lexer.addErrorListener(ThrowErrorListener.INSTANCE);
        let tokens = new antlr4.CommonTokenStream(lexer);
        let parser = new MqlParser(tokens);

        parser.addErrorListener(ThrowErrorListener.INSTANCE);

        // TODO: query contextual types
        return parser;
    }
}
export type Antlr4Error = {
    recognizer: antlr4.Recognizer;
    offendingSymbol: antlr4.Token;
    line: number;
    column: number;
    msg: string;
    e: any;
};
class ErrorLogger extends ErrorListener {
    public errors: Antlr4Error[] = [];
    syntaxError(
        recognizer: antlr4.Recognizer,
        offendingSymbol: antlr4.Token,
        line: number,
        column: number,
        msg: string,
        e: any
    ): void {
        this.errors.push({ recognizer, offendingSymbol, line, column, msg, e });
    }
    reportAmbiguity(
        recognizer: antlr4.Recognizer,
        dfa: any,
        startIndex: number,
        stopIndex: number,
        exact: any,
        ambigAlts: any,
        configs: any
    ): void {

    }
    reportAttemptingFullContext(
        recognizer: antlr4.Recognizer,
        dfa: any,
        startIndex: number,
        stopIndex: number,
        conflictingAlts: any,
        configs: any
    ): void {

    }
    reportContextSensitivity(
        recognizer: antlr4.Recognizer,
        dfa: any,
        startIndex: number,
        stopIndex: number,
        conflictingAlts: any,
        configs: any
    ): void {

    }
}

export class MqlCompilerResults {
    prepends: string;
    javaScript: string;
    //Separating the id and function name lets us create an instance per call site.
    functions: { id: string, funcName: string }[];

    constructor(prepends: string, javaScript: string, functions: { id: string, funcName: string }[]) {
        this.prepends = prepends;
        this.javaScript = javaScript;
        this.functions = functions;
    }
}

export class SetDefFinder extends MqlParserVisitor {
    sets: any = [];
    defs: any = [];

    visitSet_statement(ctx: any): any {
        let name = ctx.name.getText().substr(1);
        this.sets.push(name);
    }

    visitDef_statement(ctx: any): any {
        let name = ctx.name.getText().substr(1);
        let paramNames = ctx.param ? ctx.param.map((e: any) => e.getText().substr(1)) : [];
        this.defs.push({ name, paramNames });
    }
}

export class MqlTreeCompiler extends MqlParserVisitor {

    static readonly binOpText = `let __binopNull = (isCond, opFunc, left, right) => {
    return !isCond && (left === null || right === null) ? null : opFunc(left, right);
};
let __binop = (isCond, left, right, opFunc, cb) => {
    return Callbacks.Reduce([left, right],
        ([left, right]) => __binopNull(isCond, opFunc, left, right),
        cb
    );
};`;
    static readonly unOpText = `let __unOpNull = (opFunc, left) => {
    return left === null ? null : opFunc(left);
};
let __unop = (left, opFunc, cb) => {
    left((err, res) => {
        if (err) return cb(err);
        return cb(void 0, __unOpNull(opFunc, res));
    })
};`;
    static readonly inExprText = `let __inExpr = (row, isNot, needle, haystack, cb) => {
        Callbacks.All([...haystack.map(i => i.bind(void 0, row)), needle.bind(void 0, row)], (err, res) => {
            if (err) return cb(err);
            const needle = res[0];
            const haystack = res.slice(1);
            return cb(void 0, !!(+(haystack.indexOf(needle) !== -1) ^ (+isNot)));
        })
    };
    let __inExprFast = (row, isNot, needleFunc, haystack, cb) => {
        needleFunc(row, (err, needle) => {
            if (err) return cb(err);
            return cb(void 0, !!(+(haystack.has(needle)) ^ (+isNot)));
        });
    };`;
    static readonly getValueOrNullText = `let __getValueOrNull = (row, col) => {
    if (row == null) throw new Error("Cannot SELECT " + col + " from null row. Did you mean to use @" + col + "?")
    let value = row.getValue(col);
    return typeof value !== 'undefined' ? value : null;
};`;

    static mapBinaryOperation(op: any): string {
        //Map tokens where the text representation in mql doesn't match javascript.
        switch (op.type) {
            case MqlParser.XOR:
                return "^";
            case MqlParser.OR_:
                return "||";
            case MqlParser.AND_:
                return "&&";
            case MqlParser.NOT:
                return "!";
            case MqlParser.CONCATINATION:
                return "+";
            case MqlParser.EQ:
                return "===";
            case MqlParser.NOT_EQ:
                return "!==";
            default:
                return op.text; //This handles cases where tokens match in both mql and javascript
        }
    }
    static binaryOpIsCond(token: number): boolean {
        switch (token) {
            case MqlParser.GE:
            case MqlParser.GT:
            case MqlParser.LE:
            case MqlParser.LT_:
            case MqlParser.EQ:
            case MqlParser.NOT_EQ:
            case MqlParser.AND_:
            case MqlParser.OR_:
                return true;
        }
        return false;
    }

    static mapUnaryOperation(token: number): string | null {
        switch (token) {
            case MqlParser.MINUS:
                return "-";
            case MqlParser.NOT:
                return "!";
        }
        return null;
    }

    functionsToInline: { id: string, funcName: string }[];
    sets: { [idx: string]: boolean };
    defs: { [idx: string]: boolean }; //Used in visitAt_identifier to tell @sets and @defs apart.
    prepend: string[];

    constructor(sets?: string[], defs?: { name: string, paramNames: string[] }[]) {
        super();
        this.functionsToInline = [];
        this.sets = (sets || []).reduce((o: any, n) => {
            o[n] = true;
            return o;
        }, {});
        this.defs = (defs || []).reduce((o: any, d) => {
            o[d.name] = true;
            return o;
        }, {});
        this.prepend = [];
    }

    getPrepends() {
        return `${MqlTreeCompiler.binOpText}
${MqlTreeCompiler.unOpText}
${MqlTreeCompiler.inExprText}
${MqlTreeCompiler.getValueOrNullText}
${this.prepend.join("\n")}`;
    }

    parseQuery(ctx: any): string {
        this.functionsToInline = [];

        let setsDefs = ctx.query_sets_defs_regions().map((e: any) => this.visit(e)).join("\n");
        let queryBody = this.visitSelect_statement(ctx.select);
        return `${setsDefs}
${queryBody}`;
    }

    parseExpressionList(ctx: any) {
        return ctx.expression().map((e: any) => this.visit(e));
    }

    parseExpression(ctx: any): string {
        return this.visit(ctx);
    }

    //#region querying

    groupByToArray(ctx: any) {
        return `[${this.parseExpressionList(ctx.group.list).map((e: string) => `(row, cb) =>(${e})`).join(", ")}]`;
    }



    visitSelect_statement(ctx: any): any {
        let output = "";

        output += "let qe = new QueryEngine();\n";

        //Todo: We should instead be generating an intermediate tree that we then stringify.
        // The issue with building the string output inline is cases like this
        // is that we can't do visit(ctx.from) and check if it's an ID
        // expression Also we can't translate the output to another language.
        // Something to investigate would be looking into babel and
        // seeing if we can use that to build an AST which can be compiled into multiple languages.

        let fromText = ctx.from.getText();
        if (fromText.match(/^[a-zA-Z][a-zA-Z0-9_$#.]*$/)) {
            let id = fromText;
            let newId = this.inlineFunction(id);
            output += `qe.fromTable = (row, cb) =>inline.${MqlParserVisitor.unescapeIdentifier(newId)}(row, [], cb);\n`;
        } else {
            //Todo: We shouldn't have the row arg here. Instead we can contextual
            // add row to functions when in an implicit row context.
            output += `qe.fromTable = (row, cb) =>(${this.visit(ctx.from)});\n`;
        }

        if (ctx.top) {
            output += `qe.top = ${ctx.topNum.text};\n`;
        }

        if (ctx.where)
            output += `qe.whereClause = (row, cb) =>(${this.visit(ctx.where)});\n`;
        if (ctx.group) {
            let withRollup = ctx.group.rollup != null;
            let withLeaves = ctx.group.noLeaves == null;
            output += `qe.groupByClause = qe.makeGroupBy(${this.groupByToArray(ctx)}, ${withRollup}, ${withLeaves});\n`;
        }
        if (ctx.having)
            output += `qe.havingClause = (row, cb) =>(${this.visit(ctx.having)});\n`;
        if (ctx.order)
            output += `qe.orderByClause = qe.makeOrderBy(${this.visit(ctx.order)});\n`;

        let columnDefs: string[];
        if (ctx.selectStar) {
            columnDefs = ["qe.makeSelectStar()"];
        } else {
            columnDefs = ctx.columns.regionOrColumn.map((e: any) => this.visit(e)).filter((e: string) => e != null);
        }
        //Todo: select star?
        output += `qe.selectClause =  [${columnDefs.join(",")}];\n`;
        output += `return qe.execute();`;
        return output;
    }

    visitOrder_clause(ctx: any): any {
        return "[" +
            ctx.defs
                .map((def: any) => `[(row, cb) =>${
                        this.visit(def.expr)
                    }, ${
                        !(def.sort != null && def.sort.type === MqlParser.DESC)
                    }]`)
                .join(",") +
            "]";
    }

    visitHash_statement(ctx: any): any {
        return null;
    }

    visitDisplayed_column(ctx: any) {
        let cExpr = this.visit(ctx.expr);
        let alias = ctx.id != null ?
            MqlParserVisitor.unescapeIdentifier(ctx.id.getText()) :
            MqlParserVisitor.unescapeIdentifier(ctx.expr.getText());
        return `qe.makeColumnDef("${MqlParserVisitor.escapeDoubleQuoted(alias)}", (row, cb) =>(${cExpr}))`;

        //Todo: Use the formatting? E.g. store the formatting on the result table.
        /*if (ctx.form != null) {
            col.format = this.parseFormatting(ctx.form);
        }

        if (ctx.note != null) {
            col.note = this.visit(ctx.note);
        }*/
    }

    visitInExpression(ctx: any): any {
        if (ctx.inExpr) {
            //Todo: Implement subquery inexprs
            if (ctx.exprs == null)
                throw new Error("sub select inexpressions aren't currently supported.");
            //Todo: Optimize the case where we only have constants.
            let needleExpr = this.visit(ctx.inExpr);
            let hayStack = this.visit(ctx.exprs);
            let isNot = ctx.not != null;

            //Optimize the case where ctx.exprs is a list of literals
            let literals = new LiteralVisitor().visitExpression_list(ctx.exprs);
            if (literals !== void 0) {
                const hashName = `inExprSet_${this.prepend.length}`;
                this.prepend.push(`let ${hashName} = new Set(${literals});`);
                return `__inExprFast(row, ${isNot}, (row, cb) =>${needleExpr}, ${hashName}, cb)`;
            }
            return `__inExpr(row, ${isNot}, (row, cb) =>${needleExpr}, ${hayStack}, cb)`;
        }
        return this.visit(ctx.prim);
    }

    //#endregion

    visitSet_statement(ctx: any): any {
        let name = ctx.name.getText().substr(1);
        let body = this.visit(ctx.body);
        return `let _${name} = (row, cb) =>${body};`;
    }

    visitDef_statement(ctx: any): any {
        let name = ctx.name.getText().substr(1);
        let body = this.visit(ctx.body);
        let paramNames = ctx.param ? ctx.param.map((e: any) => "_" + e.getText().substr(1)) : [];
        let unwrapParams = paramNames.length > 0 ?
            paramNames.map((p: string, i: number) => `let ${p} = args[${i}];`).join("") :
            "";
        //Todo: arg count should be a compile-time check
        let argCountCheck = `if (args.length !== ${paramNames.length})
  throw new Error("Invalid number of args. '@${name}' got '" + args.length + "' expected '${paramNames.length}'");`;
        return `let _${name} = (row, args, cb) => {${argCountCheck} ${unwrapParams}; ${body}; }`;
    }

    visitExpression_list(ctx: any): any {
        return `[${ctx.expression().map((e: any) => `(row, cb) =>${this.visit(e)}`).join(",")}]`;
    }

    visitAssignment_list_comma_separated(ctx: any) {
        let uniques: any = {};
        ctx.assignment().forEach((e: any) => {
            uniques[MqlParserVisitor.unescapeIdentifier(e.id.getText())] = this.visit(e.expr);
        });
        return `{ ${Object.keys(uniques)
            .map(key => `"${MqlParserVisitor.escapeDoubleQuoted(key)}": (row, cb) =>${uniques[key]}`)
            .join(", ")} }`;
    }

    inlineFunction(funcName: string) {
        let id = funcName + "_" + this.functionsToInline.filter(e => e.funcName === funcName).length;
        this.functionsToInline.push({ funcName: funcName, id: id });
        return id;
    }

    visitFunctionExpression(ctx: any): any {
        if (ctx.id != null) {
            let id = ctx.id.getText();
            if (id.startsWith("@")) {
                let idWithoutAt = id.substr(1);
                let args = ctx.exprs ? this.visit(ctx.exprs) : null;
                if (!args)
                    throw new Error(`Cannot call local function '${id}' with named arguments`);
                return `_${idWithoutAt}(row, ${args}, cb)`;
            } else {
                let args = ctx.exprs ? this.visit(ctx.exprs) : this.visit(ctx.named);
                let newId = this.inlineFunction(id);
                return `inline.${MqlParserVisitor.unescapeIdentifier(newId)}(row, ${args}, cb)`;
            }
        }
        return this.visit(ctx.primaryExpression());
    }

    visitNormal_identifier(ctx: any): any {
        return `cb(void 0, __getValueOrNull(row, "${ctx.getText()}"))`;
    }

    visitEscaped_identifier(ctx: any): any {
        return `cb(void 0, __getValueOrNull(row, "${MqlParserVisitor
            .escapeDoubleQuoted(
                MqlParserVisitor.unescapeIdentifier(ctx.getText())
            )
        }"))`;
    }

    visitAt_identifier(ctx: any): any {
        let name = ctx.getText().substr(1);
        return this.defs[name] ? `cb(void 0, _${name})` : `_${name}(row, cb)`;
    }



    //#region literals

    visitNullLiteral(ctx: any): any {
        return "null";
    }

    visitFalseLiteral(ctx: any): any {
        return "false";
    }

    visitTrueLiteral(ctx: any): any {
        return "true";
    }

    //this is the encapsulation of all literals
    visitMql_literal(ctx: any): any {
        return "cb(void 0, " + super.visitMql_literal(ctx) + ")";
    }

    visitLiteral_string(ctx: any): any {
        let text = ctx.STRING_LITERAL().getText();
        //Remove the ' and unescape the ''
        text = text.substr(1, text.length - 2);
        text = text.replace(/''/g, "'");

        return "\"" + MqlParserVisitor.escapeDoubleQuoted(text) + "\"";
    }

    visitHere_document(ctx: any): any {
        let text = (ctx.HEREDOC_TEXT() || []).join("");

        //Removing the trailing new line.
        let match = text.match(/\r?\n$/);
        if (match)
            text = text.substr(0, text.length - match[0].length);

        return "\"" + MqlParserVisitor.escapeDoubleQuoted(text) + "\"";
    }

    visitNegative_literal_double(ctx: any): any {
        // TODO: Where does this come from?
        return "-" + this.visitLiteral_double((this as any).literal_double);
    }

    visitCustom_literal(ctx: any): any {
        return super.visitCustom_literal(ctx);
    }

    visitLiteral_double(ctx: any) {
        let nlitnan = ctx.NAN();
        let nlitinf = ctx.INFINITY();
        let nlitf = ctx.NUM_FLOAT();
        let nlitd = ctx.NUM_INT();
        let num: string;
        if (nlitf != null)
            num = nlitf.getText();
        else if (nlitd != null)
            num = nlitd.getText();
        else if (nlitinf != null)
            num = "Number.POSITIVE_INFINITY";
        else if (nlitnan != null)
            num = "Number.NaN";
        else throw Error("Error parsing literal double");

        return num;
    }

    //#endregion

    //#region Binary exprs
    visitAdditionExpression(ctx: any) {
        return this.binaryExprToExpression(ctx);
    }

    visitMultiplicativeExpression(ctx: any) {
        return this.binaryExprToExpression(ctx);
    }

    visitEqualityExpression(ctx: any) {
        return this.binaryExprToExpression(ctx);
    }

    visitOrExpression(ctx: any) {
        return this.binaryExprToExpression(ctx);
    }

    visitAndExpression(ctx: any) {
        return this.binaryExprToExpression(ctx);
    }

    visitXorExpression(ctx: any) {
        return this.binaryExprToExpression(ctx);
    }

    visitRelationExpression(ctx: any) {
        return this.binaryExprToExpression(ctx);
    }

    binaryExprToExpression(ctx: any): string {
        let left = this.visit(ctx.left);
        for (let i = 0; i < ctx.right.length; i++) {
            let op = ctx.binop[i];
            let right = this.visit(ctx.right[i]);
            let opText = MqlTreeCompiler.mapBinaryOperation(op);
            let isCond = MqlTreeCompiler.binaryOpIsCond(op.type);
            // tslint:disable-next-line: max-line-length
            left = `__binop(${isCond}, (cb) => ${left}, (cb) => ${right}, (left, right) => left ${opText} right, cb)`;
        }
        return left;
    }

    //#endregion

    //#region Unary exprs

    visitNotExpression(ctx: any) {
        return this.unaryExprToExpression(ctx);
    }

    visitNegationExpression(ctx: any) {
        return this.unaryExprToExpression(ctx);
    }

    unaryExprToExpression(ctx: any) {
        let opToken = ctx.unaryop;

        if (opToken)
            if (opToken.text != null) {
                let opText = MqlTreeCompiler.mapUnaryOperation(opToken.type);
                let left = this.visit(ctx.left);
                return `__unop((cb) => ${left}, (left) => ${opText} left, cb)`;
            }
        return this.visit(ctx.prim);
    }

    //#endregion
}
