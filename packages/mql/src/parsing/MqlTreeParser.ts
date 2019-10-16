import { Query } from "./Query";
import { MqlParserVisitor } from "../../mqlparser_src";
import { MqlParser } from "../../mqlparser_src";
import {
    Column,
    GroupByRule,
    QueryVariableDefinition,
    HereDocument,
    ParameterIdentifier,
    ArithmeticExpression,
    OrderByColumn,
    MqlTable,
    MqlFunction,
    NamedAssignment,
    Literal,
    InExpression
} from "./SupportingQueryParts";

//#region Engine polyfills
declare global {
    interface String {
        toStringAccuratePrint(): string;
        toStringPrettyPrint(): string;
        toProperCase(): string;
    }

    interface Number {
        toStringAccuratePrint(): string;
        toStringPrettyPrint(): string;
    }

    interface Boolean {
        toStringAccuratePrint(): string;
        toStringPrettyPrint(): string;
    }
}

String.prototype.toStringAccuratePrint = function () { return this.toString(); };
String.prototype.toStringPrettyPrint = function () { return this.toString(); };
String.prototype.toProperCase = function () {
    return this.replace(/\w\S*/g, function (txt) {return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase(); });
};

Number.prototype.toStringAccuratePrint = function () { return String(this); };
Number.prototype.toStringPrettyPrint = function () { return String(this); };

Boolean.prototype.toStringAccuratePrint = function () { return String(this).toProperCase(); };
Boolean.prototype.toStringPrettyPrint = function () { return String(this).toProperCase(); };
//#endregion


export class MqlTreeParser extends MqlParserVisitor {
    public visit(ctx) {
        return ctx.accept(this);
    }

    public visitChildren(ctx) {
        let result;
        let self = this;
        if (ctx.children)
            ctx.children.forEach(function (e) {
                let r = e.accept(self);
                if (r) {
                    if (result)
                        result = [result, r];
                    else
                        result = r;
                }
            });
        return result;
    }

    public parseQuery(ctx) {
        /** @type Query */
        let ret = this.visit(ctx.select);
        let self = this;
        ctx.defs.forEach(function (d) { ret.definitions.push(self.visit(d)); });
        return ret;
    }

    public parseColumn(ctx) {
        let cExpr = this.visit(ctx.expr);
        let alias = ctx.id != null ? this.visit(ctx.id) : "";
        let col = new Column(cExpr, alias);

        if (ctx.form != null) {
            col.format = this.parseFormatting(ctx.form);
        }

        if (ctx.note != null) {
            col.note = this.visit(ctx.note);
        }

        return col;
    }

    public parseExpression(ctx) {
        let ret = this.visit(ctx.expression);
        return ret;
    }

    public parseLiteralTable(ctx) {

    }

    public parseFormatting(ctx) {
        let list = [];

        let formatting = {};
        ctx.assignment_list_semicolon_separated().assignment().forEach(function (f) {
            let r = this.visit(f);
            formatting[r[0]] = r[1];
        }.bind(this));
        return formatting;
    }

    public parseExpressionList(ctx) {
        let self = this;
        return ctx.expression().map(function (e) { return self.visit(e); });
    }

    public visitLiteral_table(ctx) {
        let self = this;
        return ctx._rows.map(function (r) { return r._columns.map(function (c) { return self.visit(c.literal); }); });
    }

    public visitSelect_statement(ctx) {
        let ret = new Query();
        ret.distinct = ctx.distinct != null;

        ret.top = ctx.top != null ? Number(ctx.topNum.text) : -1;

        let self = this;

        if (ctx.selectStar == null) {
            ctx.columns.regionOrColumn.forEach(function (rc) {
                rc.hash1.forEach(function (h) {
                    ret.selectedColumnsOrRegions.push(self.visit(h));
                });

                let col = self.parseColumn(rc.column);
                ret.selectedColumnsOrRegions.push(col);

                rc.hash2.forEach(function (h) {
                    ret.selectedColumnsOrRegions.push(self.visit(h));
                });
            });

            ret.selectedColumnsOrRegions.forEach(function (c) {
                if (c instanceof Column)
                    ret.selectedColumns.push(c);
            });
        } else
            ret.isSelectStar = true;

        ret.from = new MqlTable(this.visit(ctx.from));
        ret.preserveGrouping = ctx.preserveGrouping != null;

        if (ctx.where != null)
            ret.whereCondition = this.visit(ctx.where);

        if (ctx.group != null) {
            ret.withRollup = ctx.group.rollup != null;
            ret.noLeaves = ctx.group.noLeaves != null;
            ret.groupByRules = this.parseExpressionList(ctx.group.list).map(function (e) {return new GroupByRule(e); });
        }

        if (ctx.having != null)
            ret.havingCondition = this.visit(ctx.having);

        if (ctx.order != null) {
            let r = this.visit(ctx.order);
            if (Array.isArray(r))
                ret.orderByExpressions = r;
            else
                ret.orderByExpressions = [r];
        }

        return ret;
    }

    public visitOrder_clause(ctx) {
        return ctx.defs.map(function (def) {
            return def.sort != null
                ? new OrderByColumn(this.visit(def.expr), def.sort.type === MqlParser.ASC)
                : new OrderByColumn(this.visit(def.expr));
        }.bind(this));
    }

    public visitFunctionExpression(ctx) {
        if (ctx.id != null) {
            let id = this.visit(ctx.id);

            if (ctx.exprs != null)
                return new MqlFunction(id, this.parseExpressionList(ctx.exprs));

            if (ctx.named != null)
                return new MqlFunction(id, this.visit(ctx.named));
            return new MqlFunction(id);
        }

        return this.visit(ctx.primaryExpression());
    }

    public visitSet_statement(ctx) {
        let id = this.visit(ctx.name);
        let body = this.visit(ctx.body);
        return new QueryVariableDefinition(id, body);
    }

    public visitAssignment_list_comma_separated(ctx) {
        let list = [];

        ctx.assignment().forEach(function (a) {
            let kv = this.visit(a);
            list.push(new NamedAssignment(kv[0], kv[1]));
        }.bind(this));

        return list;
    }

    public visitNon_at_param_set_statement(ctx) {
        let id = this.visit(ctx.id);
        let body = this.visit(ctx.body);
        return new QueryVariableDefinition(id, body);
    }

    public visitQuery_sets_defs_regions(ctx) {
        return ctx.setDef != null
            ? this.visit(ctx.setDef)
            : this.visit(ctx.hash);
    }

    public visitQuery_sets_defs(ctx) {
        return ctx.set != null
            ? this.visit(ctx.set)
            : this.visit(ctx.def);
    }

    public visitAt_identifier(ctx) {
        return new ParameterIdentifier(ctx.getText().substr(1));
    }

    public visitTerminal(ctx) {
        return this.visitChildren(ctx);
    }

    public visitNormal_identifier(ctx) {
        return ctx.getText();
    }

    public visitEscaped_identifier(ctx) {
        let t = ctx.getText();
        return t.substr(1, t.length - 2);
    }

    public visitLiteral_double(ctx) {
        let nlitnan = ctx.NAN();
        let nlitinf = ctx.INFINITY();
        let nlitf = ctx.NUM_FLOAT();
        let nlitd = ctx.NUM_INT();

        let l;

        if (nlitf != null)
            return new Literal(Number(nlitf.getText()));
        else if (nlitd != null)
            return new Literal(Number(nlitd.getText()));
        else if (nlitinf != null)
            return new Literal(Number.POSITIVE_INFINITY);
        else if (nlitnan != null)
            return new Literal(Number.NaN);

        return l;
    }

    public visitNegative_literal_double(ctx) {
        let double = ctx.literal_double();
        let nlitnan = double.NAN();
        let nlitinf = double.INFINITY();
        let nlitf = double.NUM_FLOAT();
        let nlitd = double.NUM_INT();

        let l;

        if (nlitf != null)
            return new Literal(-Number(nlitf.getText()));
        else if (nlitd != null)
            return new Literal(-Number(nlitd.getText()));
        else if (nlitinf != null)
            return new Literal(Number.NEGATIVE_INFINITY);
        else if (nlitnan != null)
            return new Literal(Number.NaN);

        return l;
    }

    public visitLiteral_string(ctx) {
        let text = ctx.sl.text;
        if (text != null)
            return new Literal(text.substr(1, text.length - 2).replace(/\'\'/g, "'"));
    }

    public visitString_vector(ctx) {
        let list = [];
        ctx.literal_string().forEach(function (expr) {
            let item = this.visit(expr);
            if (item != null)
                list.push(new Literal(item));
        }.bind(this));
        return list;
    }

    public visitInExpression(ctx) {
        if (ctx.inExpr != null) {
            let body = this.visit(ctx.inExpr);
            let negate = ctx.not != null;

            if (ctx.exprs != null) {
                let list = this.parseExpressionList(ctx.exprs);
                return new InExpression(body, list, negate);
            } else {
                let sub = this.visitSelect_statement(ctx.subQuery);
                return new InExpression(body, sub, negate);
            }
        }
        return this.visit(ctx.prim);
    }

    public visitAdditionExpression(ctx) {
        return this.binaryExprToExpression(ctx);
    }

    public visitMultiplicativeExpression(ctx) {
        return this.binaryExprToExpression(ctx);
    }

    public visitEqualityExpression(ctx) {
        return this.binaryExprToExpression(ctx);
    }

    public visitAndExpression(ctx) {
        return this.binaryExprToExpression(ctx);
    }

    public visitOrExpression(ctx) {
        return this.binaryExprToExpression(ctx);
    }

    public visitXorExpression(ctx) {
        return this.binaryExprToExpression(ctx);
    }

    public visitRelationExpression(ctx) {
        return this.binaryExprToExpression(ctx);
    }

    public visitNotExpression(ctx) {
        return this.unaryExprToExpression(ctx);
    }

    public visitNegationExpression(ctx) {
        return this.unaryExprToExpression(ctx);
    }

    public binaryExprToExpression(ctx) {
        let left = this.visit(ctx.left);
        for (let i = 0; i < ctx.right.length; i++) {
            let op = ctx.binop[i].text;
            let right = this.visit(ctx.right[i]);
            left = new ArithmeticExpression(left, op, right);
        }
        return left;
    }

    public unaryExprToExpression(ctx) {
        let opToken = ctx.unaryop;

        if (opToken)
            if (opToken.text != null) {
                opToken = opToken.text;
                return new ArithmeticExpression(this.visit(ctx.left), opToken);
            }
        return this.visit(ctx.prim);
    }

    public visitTrue(ctx) {
        return new Literal(true);
    }

    public visitFalse(ctx) {
        return new Literal(false);
    }

    public visitNull(ctx) {
        return new Literal(null);
    }

    public visitNullLiteral(ctx) {
        return new Literal(null);
    }

    public visitHere_document(ctx) {
        let start = ctx.start.text;
        let end = ctx.end.text;

        let idToken = start.substr(2).trim();
        let text = ctx.getText();

        let startLength = start.length;
        let endLength = end.length;

        if (text[text.length - endLength - 1] === "\r")
            endLength++;

        let hereDoc = endLength + startLength < text.length
            ? text.substr(startLength, text.length - (startLength + endLength))
            : "";
        return new HereDocument(idToken, hereDoc);
    }
}
