import {
    Column,
    QueryVariableDefinition,
    ParameterIdentifier,
    Expression,
} from "./SupportingQueryParts";

let T = "\t";
let NL = "\r\n";
let NLT = NL + "\t";

export class Query {
    public selectedColumnsOrRegions = [];
    public selectedColumns = [];
    public groupByRules = [];
    public withRollup = false;
    public orderByExpressions = [];
    public distinct = false;
    public noLeaves = false;
    public top = -1;
    public definitions = [];
    public namespaceImports = [];
    public isSelectStar = false;
    public from: Expression;
    public preserveGrouping = false;
    public whereCondition = null;
    public havingCondition = null;
    public showFormatting = true;

    public toString() {
        return this.toStringAccuratePrint();
    }

    public toStringAccuratePrint() {
        // TODO this needs to actually accurate print instead of this cheating replace method
        return this.toStringPrettyPrint().replace(/\t/g, "").replace(/\r\n/g, " ").replace(/\ \ /g, " ");
    }

    public toStringPrettyPrint() {
        let ret = "";
        this.namespaceImports.forEach(function (namespaceImport) {
            ret += "IMPORT " + namespaceImport + NL;
        });

        this.definitions.forEach(function (definition) {
            ret += definition.toStringPrettyPrint() + NL;
        });

        ret += "SELECT " + NL;
        if (this.distinct)
            ret += "  DISTINCT " + NLT;

        if (this.top !== -1)
            ret += "  TOP " + this.top + NLT;

        ret += this.isSelectStar ? "* " : this.columnListWithRegionsIfPossible(true, this.showFormatting);

        if (this.from) {
            ret += NL + "FROM " + NLT + this.from.toStringPrettyPrint();
            if (this.preserveGrouping)
                ret += "  PRESERVE GROUPING" + NLT;
        }

        if (this.whereCondition)
            ret += NL + "WHERE " + NLT + this.whereCondition.toStringPrettyPrint();

        if (this.groupByRules.length > 0) {
            ret += NL + "GROUP BY " + NLT;
            ret += this.groupByRules.map(function (e) {return e.toStringPrettyPrint(); }).join(", " + NLT);

            if (this.withRollup)
                ret += NL + "  WITH ROLLUP ";

            if (this.withRollup && this.noLeaves)
                ret += NL + "  NO LEAVES ";
        }

        if (this.havingCondition) {
            ret += NL + "HAVING " + NLT;
            ret += this.havingCondition.toStringPrettyPrint();
        }

        if (this.orderByExpressions.length > 0) {
            ret += NL + "ORDER BY " + NLT;
            ret += this.orderByExpressions.map(function (e) {return e.toStringPrettyPrint(); }).join(", " + NLT);
        }

        return ret;
    }

    public columnListWithRegionsIfPossible(pretty, showFormatting) {
        let columns = this.selectedColumnsOrRegions.filter(function (c) { return c instanceof Column; });
        let haveColumnsChanged = !(
            columns.map(function (c) {return c.toStringPrettyPrint(); })
            ===
            this.selectedColumns.map(function (c) { return c.toStringPrettyPrint(); }));

        let separator = pretty ? " " + NL : " ";

        if (haveColumnsChanged)
            return pretty
                ? this.selectedColumns
                    .map(function (c) { return T + c.toStringPrettyPrint(showFormatting); }).join("," + separator)
                : this.selectedColumns.map(function (c) { return c.toStringAccuratePrint(); }).join("," + separator);

        let selectRegionStrings = [];
        let colCount = 0;
        let self = this;

        this.selectedColumnsOrRegions.forEach(function (o) {
            if (o instanceof Column) {
                let c = self.selectedColumns[colCount];

                let colAsString = pretty
                    ? T + c.toStringPrettyPrint()
                    : c.toStringAccuratePrint();

                colCount++;
                if (colCount === self.selectedColumns.length)
                    selectRegionStrings.push(colAsString);
                else
                    selectRegionStrings.push(colAsString + ",");
            } else
                selectRegionStrings.push(pretty ? o.toStringPrettyPrint() : o.toStringAccuratePrint());
        });
    }

    public addDefinition(key: object | string, value) {
        if (typeof key === "object") {
            // TODO refactor this when ECMA 6 is out
            for (let k in key)
                if (key.hasOwnProperty(k))
                    this.definitions.push(new QueryVariableDefinition(new ParameterIdentifier(k), key[k]));
        } else
            this.definitions.push(new QueryVariableDefinition(new ParameterIdentifier(key), value));
    }

    public addDefinitions() {
        this.addDefinition.apply(this, arguments);
    }
}







