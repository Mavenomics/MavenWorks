import { MqlWrapper } from "./wrapper";
import { Types, IterTools } from "@mavenomics/coreutils";
import { IFunction } from "../Function";
import { Row } from "@mavenomics/table";
import { functionArg, declareFunction, documentFunction } from "../FunctionDecorators";
import { RegisterFunction } from "../functionFactory";

//#region Functions for constant values
MqlWrapper(() => Math.PI, {
    name: "PI",
    returnType: Types.Number
}, [], {
    description: "Returns an approximate value of Pi, accurate to 16 decimal places"
});

MqlWrapper(() => Math.E, {
    name: "E",
    returnType: Types.Number
}, [], {
    description: "Returns an approximate value of Euler's constant, accurate to 15 decimal places"
});
//#endregion

//#region simple math

// The single-arg functions are auto-generated
for (let fn of [
    "sin",
    "cos",
    "tan",
    "asin",
    "acos",
    "atan",
    "abs",
    "ceil",
    "floor",
    "round",
    "sign",
    "sqrt",
] as const) {
    MqlWrapper((arg) => Math[fn](arg), {
        name: fn,
        returnType: Types.Number
    }, [{
        name: "arg",
        type: Types.Number
    }]);
}

//#region NaN and null checks
MqlWrapper(arg => Number.isNaN(arg), {
    name: "IsNaN",
    returnType: Types.Boolean
}, [{name: "Arg", type: Types.Number}], {
    description: "Tests whether a given value is Not A Number",
    remarks: `NaNs are a special case of IEEE floats, and in practice somewhat
rare. The MQL engine alone will not let you create NaNs (eg, all pure MQL
expressions either generate a real number, Infinity, or NULL), but they can be
introduced in FROM clauses or UDFs and bubble up to aggregates in a process
known as [NaN poisoning](https://en.wikipedia.org/wiki/NaN).

Dealing with this generically is a hard problem, but if you have data quality
isuses that lead to NaNs, you can use this function with \`ifelse\` to guard
against NaNs in aggregation functions and GROUP BY clauses`,
    examples: [`set @tbl = Subselect(<<MQL
    SELECT
        x,
        /* Make ~50% of values NaNs. We need to call out to JS to demonstrate
         * this, since MQL doesn't let you work with literal NaNs */
        JsEval('return Math.random() > 0.5 ? NaN : 1') as y
    FROM Lattice('x = 1 to 10 step 1')
MQL
)

SELECT
    Avg( ifelse(IsNaN(y), 0, y) ),
    y,
    IsNaN( JsEval('return NaN') ),
    IsNaN( 42 )
FROM
    @tbl
GROUP BY x WITH ROLLUP`]
});

MqlWrapper(arg => Number.isFinite(arg), {
    name: "IsFinite",
    returnType: Types.Boolean
}, [{name: "arg", type: Types.Number}], {
    description: "Checks whether the given number is finite",
    remarks: `In MQL, some expressions may return an infinite value instead of
a real-valued number. For instance, the expression \`1 / 0\` is \`Infinity\`,
and the expression \`-1 / 0\` is \`-Infinity\`. \`Infinity\` is also a valid
literal in MQL. Some aggregates, like Sum, will change their behavior if any
leaf contains Infinity. If you want to avoid this, you can use this function to
test for finite values and handle it accordingly.`,
    examples: [`SELECT
    IsFinite( Infinity ),
    IsFinite( 1 / 0 ),
    IsFinite( PI() )
FROM
    dual`]
});

// NOTE: MQL `col = null` checks, as hinted at below, don't catch `undefined`
// values. Undefined is not a literal in MQL, but like NaN can be introduced in
// FROM clauses and UDFs. This function also checks for NaN as a convenience.
MqlWrapper(arg => arg == null || Number.isNaN(arg), {
    name: "IsNull",
    returnType: Types.Boolean
}, [{name: "arg", type: Types.Any}], {
    description: "Checks whether the given value is null",
    remarks: `Nulls are a fact of life in many datasets and APIs, and you may
find yourself needing to check for them. You can use \`=\` to check for nulls,
but this function is more reliable and includes a few edge cases that
\`col = null\` doesn't catch.`
});

//#endregion

// radians and degrees conversions
MqlWrapper((arg: number) => arg * (Math.PI / 180), {name: "radians"}, [{name: "degrees"}], {
    description: "Converts Degrees to Radians. MQL Trig functions natively work in radians.",
    examples: ["SELECT radians(180) FROM dual"]
});

MqlWrapper((arg) => arg / (Math.PI / 180), {name: "degrees"}, [{name: "radians"}], {
    description: "Converts Radians to Degrees.",
    examples: ["SELECT degrees(PI() / 4) FROM dual"]
});

// Natural log, log w/ base
MqlWrapper(arg => Math.log(arg), {name: "ln"}, [{name: "arg"}], {
    description: "Returns the natural logarithm of the given value 'arg'.",
    examples: ["SELECT ln(2) FROM dual"]
});

MqlWrapper((arg, base = 10) => Math.log(arg) / Math.log(base), {name: "log"}, [
    {name: "arg"},
    {name: "base", default: 10}
], {
    description: "Returns the logarithm of the given number in a specified base. If the base isn't" +
    " provided, it will default to base 10",
    examples: ["SELECT log(8, 2) FROM dual", "SELECT log(100) FROM dual"]
});

MqlWrapper((arg, exp) => Math.pow(arg, exp), {name: "pow"}, [{name: "arg"}, {name: "exp"}], {
    description: "Returns `arg` to the `exp` power.",
    examples: ["SELECT pow(2, 4), pow(49, 0.5) FROM dual"]
});

//#endregion
abstract class MinMaxFunction extends IFunction {
    protected abstract readonly fn: (...args: number[]) => number;

    async eval(args: any) {
        const row = args["row"] as Row;
        const fn = args["fn"];
        if (!row || typeof fn !== "function") return 0;

        if (row.children.length === 0) return await fn(row);

        let extreme: number | null = null;
        for (const irow of IterTools.dfs_iter(row.children, i => i.children)) {
            if (irow.children.length > 0) continue;
            if (extreme == null) {
                extreme = await fn(irow);
            } else {
                extreme = this.fn(extreme, await fn(irow));
            }
        }
        return extreme;
    }
}

@declareFunction("min", void 0, Types.Number)
@functionArg("row", Types.Row)
@functionArg("fn", void 0, void 0, "Mql Function Expression")
@documentFunction({
    description: "Return the min of the given expression over the row subtree",
    examples: [`
SELECT
    x,
    y,
    min(x + y)
FROM
    Lattice('x = 1 to 3 step 1, y = 1 to 3 step 1')
GROUP BY x / y WITH ROLLUP`]
})
class MinFunction extends MinMaxFunction {
    protected fn = Math.min;
}
RegisterFunction("min", MinFunction);


@declareFunction("max", void 0, Types.Number)
@functionArg("row", Types.Row)
@functionArg("fn", void 0, void 0, "Mql Function Expression")
@documentFunction({
    description: "Return the max of the given expression over the row subtree",
    examples: [`
SELECT
    x,
    y,
    max(x + y)
FROM
    Lattice('x = 1 to 3 step 1, y = 1 to 3 step 1')
GROUP BY x / y WITH ROLLUP`]
})
class MaxFunction extends MinMaxFunction {
    protected fn = Math.max;
}
RegisterFunction("max", MaxFunction);
