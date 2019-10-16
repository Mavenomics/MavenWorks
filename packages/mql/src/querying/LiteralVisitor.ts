import { MqlParserVisitor } from "./MqlParserVisitor";

//Visitor which is used to check if the expression is a literal
export class LiteralVisitor extends MqlParserVisitor {
    //Override the base behavior. If a visitor returns undefined then we want to exit early and return undefined.
    visitChildren(ctx: any) {
        let result: any = [];
        let self = this;
        if (ctx.children) {
            for (let e of ctx.children) {
                let r = e.accept(self);
                if (r === void 0)
                    return;
                result.push(r);
            }
        } else {
            return; //calling visitChildren when there are no children will return undefined.
        }
        return result.length === 1 ? result[0] : result;
    }


    visitSelect_statement(ctx: any): any {
        return;
    }

    visitOrder_clause(ctx: any): any {
        return;
    }

    visitHash_statement(ctx: any): any {
        return;
    }

    visitDisplayed_column(ctx: any) {
        return;
    }

    visitInExpression(ctx: any): any {
        if (ctx.inExpr) {
            return;
        }
        return this.visit(ctx.prim);
    }

    //#endregion

    visitSet_statement(ctx: any): any {
        return;
    }

    visitDef_statement(ctx: any): any {
        return;
    }

    visitExpression_list(ctx: any): any {
        let vals = <[]>ctx.expression().map((e: any) => this.visit(e));
        // Ensure the array doesn't have any undefined elements.
        // Undefined elements means the expression list contained non-literals
        if (!vals.every(e => e !== void 0))
            return;
        return `[${vals.join(",")}]`;
    }

    visitAssignment_list_comma_separated(ctx: any) {
        return;
    }

    visitFunctionExpression(ctx: any): any {
        if (ctx.id != null) {
            return;
        }
        return this.visit(ctx.primaryExpression());
    }

    visitNormal_identifier(ctx: any): any {
    }

    visitEscaped_identifier(ctx: any): any {
    }

    visitAt_identifier(ctx: any): any {
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
        return super.visitMql_literal(ctx);
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
        // TODO: Where does literal_double come from?
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
        if (ctx.right.length > 0)
            return;
        return this.visit(ctx.left);
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

        if (opToken && opToken.text != null) {
            return;
        }
        return this.visit(ctx.prim);
    }

    //#endregion
}
