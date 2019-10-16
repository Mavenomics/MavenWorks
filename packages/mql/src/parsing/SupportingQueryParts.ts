function needsBrackets(name) {
    return name.search(/^[a-zA-Z][a-zA-Z0-9_$.#]*$/) === -1;
}

function giveBrackets(name) {
    if (needsBrackets(name))
        return "[" + name + "]";
    else
        return name;
}

export interface Expression {
    toString(): string;
    toStringPrettyPrint(): string;
    toStringAccuratePrint(): string;
}

export class ArithmeticExpression {
    constructor(
        public left: Expression | undefined,
        public op,
        public right?: Expression
    ) { }

    public toStringAccuratePrint() {
        return this.toStringPrettyPrint();
    }

    public toStringPrettyPrint() {
        if (this.op === "-" && this.right == null)
            return this.op + this.left.toStringPrettyPrint();
        return (this.left && this.left.toStringPrettyPrint())
            + " " + this.op.toStringPrettyPrint()
            + " " + (this.right && this.right.toStringPrettyPrint());
    }
}

export class Column {
    public expression: Expression;
    public alias: string;
    public note: string;
    public format: object;

    constructor(
        expression: Expression,
        alias?: string,
        format?: object, // TODO: stricter type
    ) {
        // TODO: constructors shouldn't throw, and this won't be necessary
        // once the engine is more completely typed
        if (!expression) throw new Error("Expression cannot be null");
        this.expression = expression;
        this.alias = alias || "";
        this.note = "";
        this.format = format || {};
    }

    public toStringPrettyPrint(showFormatting: boolean) {
        let ret = "";

        if (this.expression)
            if (this.expression.hasOwnProperty("toStringPrettyPrint"))
                ret += this.expression.toStringPrettyPrint();
            else
                ret += this.expression.toString();
        else
            ret += "_";

        if (this.alias)
            ret += " as " + giveBrackets(this.alias);

        if (Object.keys(this.format).length > 0 && showFormatting) {
            ret += " format { ";
            for (let k in this.format)
                if (this.format.hasOwnProperty(k)) {
                    let f = this.format[k];
                    if (f)
                        ret += giveBrackets(k) +
                            " := " + (f.toStringPrettyPrint && f.toStringPrettyPrint() || f) + "; ";
                }
            ret = ret.replace(/;\s+$/, "");
            ret += " }";
        }

        return ret;
    }
}

export class GroupByRule {
    public rule: string | Expression;

    constructor(expression: string | Expression) {
        if (!expression) throw new Error("Expression cannot be null");
        this.rule = expression;
    }

    public toString() {
        return "GroupByRule: " + this.rule.toString();
    }

    public toStringAccuratePrint() {
        return typeof this.rule === "string" ? this.rule : this.rule.toStringAccuratePrint();
    }

    public toStringPrettyPrint() {
        return typeof this.rule === "string" ? this.rule : this.rule.toStringPrettyPrint();
    }
}

export class OrderByColumn {
    public rule: Expression;
    public ascending: boolean;

    constructor(expression: Expression, asc: boolean = true) {
        this.rule = expression;
        this.ascending = asc;
        return this;
    }

    public toString() {
        return "OrderByColumn: " + this.rule.toString();
    }

    public toStringAccuratePrint() {
        return this.rule.toStringAccuratePrint() + ((this.ascending) ? "" : " DESC");
    }

    public toStringPrettyPrint() {
        return this.rule.toStringPrettyPrint() + ((this.ascending) ? "" : " DESC");
    }
}

export class QueryVariableDefinition {
    public name;
    public body;
    public allowsDuplication: boolean;

    constructor(name, expressionBody) {
        this.name = name;
        this.body = expressionBody;
        this.allowsDuplication = false;
    }

    public toStringPrettyPrint = function () {
        return "set " + this.name.toStringPrettyPrint() + " = "
            + (this.body && this.body.toStringPrettyPrint());
    };

    public toStringAccuratePrint = function () {
        return this.toStringPrettyPrint();
    };
}

export class RegionVariableDefinition {
    public name;
    public body;
    public start;
    public allowsDuplication: boolean;

    constructor(name, expressionBody, start) {
        this.name = name;
        this.body = expressionBody;
        this.start = start;
        this.allowsDuplication = true;
    }

    public toStringPrettyPrint() {
        return this.start ? "#region " + this.name : "#endregion";
    }

    public toStringAccuratePrint() {
        return this.start ? "#region " + this.name : "#endregion";
    }
}

export class QueryFunctionDefinition {
    public name;
    public body;
    public arguments: Array<any>;

    constructor(name, args, expression) {
        this.name = name;
        this.body = expression;
        this.arguments = args;
    }

    public toStringPrettyPrint() {
        return "def @" + this.name + "(" + this.arguments.map(function (s) { return "@" + s; }).join(", ")
            + ") = " + this.body.toStringPrettyPrint();
    }

    public toStringAccuratePrint() {
        return "def @" + this.name + "(" + this.arguments.map(function (s) { return "@" + s; }).join(", ")
            + ") = " + this.body.toStringAccuratePrint();
    }
}

export class MqlFunction {
    public name;
    public options;

    constructor(name, operands = []) {
        this.name = name;
        this.options = operands;
    }

    public toStringPrettyPrint() {
        return this.name + "( " + this.options.map(function (s) {
            if (s != null)
                return s.toStringPrettyPrint ? s.toStringPrettyPrint() : s;
        }).join(", ") + " )";
    }

    public toStringAccuratePrint() {
        return this.toStringPrettyPrint();
    }
}

export class MqlTable {
    public expression: Expression | string;

    constructor(expression: Expression | string) {
        this.expression = expression;
    }

    public toStringPrettyPrint() {
        return typeof this.expression === "string"
            ? this.expression : this.expression.toStringPrettyPrint();
    }

    public toStringAccuratePrint() {
        return typeof this.expression === "string"
            ? this.expression : this.expression.toStringAccuratePrint();
    }
}

export class ParameterIdentifier {
    public name;

    constructor(name) {
        this.name = name;
    }

    public toStringPrettyPrint() {
        return "@" + giveBrackets(this.name);
    }

    public toStringAccuratePrint() {
        return "@" + giveBrackets(this.name);
    }
}

export class InExpression {
    public expression;
    public list;
    public negate;

    constructor(body, list, negate) {
        this.expression = body;
        this.list = list;
        this.negate = negate;
    }

    public toStringPrettyPrint() {
        let ret = "";
        let isLiteralNegative = this.expression < 0;

        if (isLiteralNegative)
            ret += "(";

        ret += this.expression.toStringPrettyPrint();

        if (isLiteralNegative)
            ret += ")";

        if (this.negate)
            ret += " not";

        ret += " in ( ";

        if (Array.isArray(this.list))
            ret += this.list.map(function (e) { return e.toStringPrettyPrint(); }).join(", ");
        else
            ret += this.list.toStringPrettyPrint();
        ret += " )";

        return ret;
    }

    public toStringAccuratePrint() { return this.toStringPrettyPrint(); }
}

export class HereDocument {
    public id;
    public text;

    constructor(id, text) {
        this.id = id;
        this.text = text;

        if (!text.search(/\r\n$/))
            text += "\r\n";
    }

    public toStringPrettyPrint() {
        return "<<" + this.id + "\r\n" + this.text + this.id + "\r\n";
    }

    public toStringAccuratePrint() {
        return this.toStringPrettyPrint();
    }
}

export class Literal {
    public value;

    constructor(value) {
        this.value = value;
    }

    public toStringPrettyPrint() {
        return this.print(true);
    }

    public toStringAccuratePrint() {
        return this.print(false);
    }

    private print(pretty: boolean) {
        switch (typeof this.value) {
            case "string":
                return "'" + this.value.replace(/\'/g, "''") + "'";

            case "boolean":
                return String(this.value)
                    .replace(/\w\S*/g, function (txt) {
                        return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
                    });
        }

        return this.value ?
            (pretty ?
                this.value.toStringPrettyPrint()
                : this.value.toStringAccuratePrint()
            )
            : String(this.value);
    }
}

export class NamedAssignment {
    public key;
    public value;

    constructor(key, value) {
        this.key = key;
        this.value = value;
    }

    public toStringPrettyPrint() {
        return this.key + " := " + this.value.toStringPrettyPrint();
    }

    public toStringAccuratePrint() {
        return this.toStringPrettyPrint();
    }
}
