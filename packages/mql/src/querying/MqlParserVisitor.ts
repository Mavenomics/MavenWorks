import { MqlParserVisitor as GeneratedMqlParserVisitor} from "../../mqlparser_src";
//Stub class from the antlr4 visitor generator.
export class MqlParserVisitor extends GeneratedMqlParserVisitor {
    static unescapeIdentifier(id: string) {
        if (id.startsWith("["))
            return id.substr(1, id.length - 2);
        return id;
    }
    static escapeDoubleQuoted(str: string) {
        return str.replace(/["\n\r\\]/g, (match) => {
            if (match === "\r") return "\\r";
            if (match === "\"") return "\\\"";
            if (match === "\\") return "\\\\";
            if (match === "\n") return "\\n";
            return match;
        });
    }
    visit(ctx: any) {
        return ctx.accept(this);
    }

    visitChildren(ctx: any) {
        let result: any = [];
        let self = this;
        if (ctx.children)
            ctx.children.forEach(function (e: any) {
                let r = e.accept(self);
                if (r) {
                    result.push(r);
                }
            });
        return result.length === 1 ? result[0] : result;
    }

    visitMql_query(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitSet_statement_list(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitDefinition_list(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitLiteral_table(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitLiteral_table_column(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitLiteral_table_row(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitFunction_definition(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitNon_at_param_set_statement_list(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitNon_at_param_set_statement(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitQuery_sets_defs_regions(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitQuery_sets_defs(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitSet_statement(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitDef_statement(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitImport_statement(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitHash_statement(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitRegion_statement(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitEndregion_statement(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitSelect_statement(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitSelect_list(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitWhere_clause(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitGroup_clause(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitHaving_clause(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitOrder_clause(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitSorted_def(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitRegion_or_displayed_column(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitDisplayed_column(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitFormat(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitAssignment_list_semicolon_separated(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitAssignment_list_comma_separated(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitAssignment(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitExpression_standalone(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitExpression_list(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitExpression(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitOrExpression(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitAndExpression(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitXorExpression(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitEqualityExpression(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitRelationExpression(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitAdditionExpression(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitMultiplicativeExpression(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitNegationExpression(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitNotExpression(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitInExpression(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitFunctionExpression(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitPrimaryExpression(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitNullLiteral(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitFalseLiteral(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitTrueLiteral(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitParenthesisExpression(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitIdentifier(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitNon_function_non_at_identifier(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitNormal_identifier(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitContextual_keywords(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitEscaped_identifier(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitAt_identifier(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitMql_literal(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitLiteral_string(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitNegative_literal_double(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitLiteral_double(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitFloat_vector(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitString_vector(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitCustom_literal(ctx: any) {
        return this.visitChildren(ctx);
    }

    visitHere_document(ctx: any) {
        return this.visitChildren(ctx);
    }
}
