/** Built in UDFs for the MavenScape engine.
 *
 * NOTE: If you're looking for an overview of all the functions, please refer
 * to the in-app help (F1). This tells you about _all_ the functions, and how
 * to call them in MQL.
 *
 */

import { IFunction } from "./Function";
import { IFunctionEvaluatorContext } from "./functionExecution";
import { declareFunction, functionArg, PositionalToKeyValue, documentFunction } from "./FunctionDecorators";
import { MqlCompiler, MqlCompilerResults } from "./querying/MqlCompiler";
import { QueryEngine } from "./querying/QueryEngine";
import { LatticeFunction } from "./LatticeFunction";
import { ReadPastedCsvFunction } from "./ReadPastedCsvFunction";
import { StringFormatFunction } from "./StringFormatFunction";
import * as _ from "lodash";
import * as Papa from "papaparse";
import { Table, TableHelper, Row, JoinType } from "@mavenomics/table";
import {
    Types,
    StartTiming,
    StartTimingSync,
    StartTimingAsync,
    AsyncTools,
    IterTools,
    Cache,
    serialize,
} from "@mavenomics/coreutils";
import * as moment from "moment";
import { evaluateRowOptionsFast } from "./functions/helpers";
import { CreateJsFunc, CompiledJsFunc } from "./RunMql";
import { MqlCallback, Callbacks } from "./callbackhelpers";
import { UUID } from "@phosphor/coreutils";

// tslint:disable: max-line-length
@declareFunction("RunEmbeddedMql", 2)
@functionArg("mql")
@functionArg("name")
@functionArg("value")
export class RunEmbeddedMql extends IFunction {

    static validateIds(names: string[]) {
        names.forEach(name => {
            if (name.match(/^[a-zA-Z][a-zA-Z0-9_$#.]*$/) == null)
                throw new Error(`Invalid argument name '${name}'`);
        });
    }

    public eval(optionLookup: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let mql = optionLookup["mql"];

        let mqlRes = StartTimingSync("MqlParsing", () => MqlCompiler.compile(mql));

        let names: string[] = optionLookup["name"] || [];
        let values: any[] = optionLookup["value"] || [];

        //Remove starting @ sign
        names = names.map(name => name.replace(/^@/, ""));

        RunEmbeddedMql.validateIds(names);

        return StartTiming("GetAllFunctions", () => context.GetAllFunctions()).then(funcs => {
            let inlineFuncs: {[id: string]: (row: Row, args: any, done: MqlCallback) => void} = {};
            //HACK: This is to support lowercase names such as sum/ifelse/etc for now.
            let findFunctionName = (name: string) => {
                let keys = Object.keys(funcs);
                let idx = keys.findIndex((s: string) => s.toLowerCase() === name);
                return idx !== -1 ? keys[idx] : name;
            };
            let functions = mqlRes.functions.map(
                n => ({ funcName: !funcs.hasOwnProperty(n.funcName) ? findFunctionName(n.funcName) : n.funcName, id: n.id }));
            return Promise.all(functions.map(n => context.FindFunctionInfo(n.funcName))).then(infos => {
                functions.forEach((e, i) => {
                    let name = e.funcName;
                    let id = e.id;
                    if (!funcs.hasOwnProperty(name)) {
                        //Todo: Compile time errors for referencing functions that don't exist?
                        inlineFuncs[id] = (row: any, args: any) => { throw new Error(`Referenced unknown function '${name}'`); };
                    } else {
                        let inst = new funcs[name] as IFunction;
                        inlineFuncs[id] =
                            (row: any, args: any, done) => inst.evalCall(
                                row,
                                Array.isArray(args) ?
                                    PositionalToKeyValue(
                                        infos[i],
                                        [row].concat(args || [])
                                    ) : Object.assign({}, args, { row: row }),
                                context,
                                done
                            );
                    }
                });

                let referencedPrependText = names.map((name: string) => `let _${name} = referenced.${name};`).join("");
                let referencedInst = names.reduce((o: any, name: string, i: number) => {
                    const val = values[i];
                    //The default behavior when a function is passed is to resolve the parameters using the row parameter.
                    //If you want the expr functions then the function needs the passExprs property defined.
                    if (typeof val === "function") {
                        if (val.passExprs) {
                            o[name] = (row: Row, args: any[], cb: MqlCallback) => {
                                try {
                                    const value = val.call(void 0, row, ...(args || []));
                                    if (value instanceof Promise) {
                                        return Callbacks.AsCallback(value)(cb);
                                    } else {
                                        return cb(void 0, value);
                                    }
                                } catch (err) {
                                    cb(err);
                                }
                            };
                        } else {
                            o[name] = (row: Row, args: any[], cb: MqlCallback) => {
                                Callbacks.All(args.map(i => i.bind(void 0, row)), (err, args) => {
                                    if (err) return cb(err);
                                    try {
                                        const value = val.call(void 0, row, ...(args || []));
                                        if (value instanceof Promise) {
                                            return Callbacks.AsCallback(value)(cb);
                                        } else {
                                            return cb(void 0, value);
                                        }
                                    } catch (err) {
                                        cb(err);
                                    }
                                });
                            };
                        }
                    } else {
                        o[name] = ((_row: Row, cb: MqlCallback) => cb(void 0, val));
                    }
                    return o;
                }, {});


                let func = new Function(
                    "context",
                    "QueryEngine",
                    "inline",
                    "Callbacks",
                    "referenced",
                    referencedPrependText + mqlRes.prepends + mqlRes.javaScript
                );
                try {
                    return func(context, QueryEngine, inlineFuncs, Callbacks, referencedInst);
                } catch (err) {
                    return Promise.reject(err);
                }
            });
        });

    }
}

type CompiledMqlFunc = ((context: IFunctionEvaluatorContext, referenced: any, cb: MqlCallback<any>) => void);
const getReferencedValues = (names: string[], values: any[]) => {
    return names.reduce((o: any, name: string, i: number) => {
        const val = values[i];
        //The default behavior when a function is passed is to resolve the parameters using the row parameter.
        //If you want the expr functions then the function needs the passExprs property defined.
        if (typeof val === "function") {
            if (val.passExprs) {
                o[name] = (row, args, cb) => {
                    try {
                        cb(void 0, val.call(void 0, row, ...(args || [])));
                    } catch (err) {
                        cb(err);
                    }
                };
            } else {
                o[name] = (row, args, cb) => {
                    try {
                        return void Callbacks.All(
                            (args || []).map(i => i.bind(void 0, row)),
                            (err, args) => {
                                if (err) return void cb(err);
                                return cb(void 0, val.call(void 0, row, ...(args || [])));
                            }
                        );
                    } catch (err) {
                        cb(err);
                    }
                };
            }
        } else {
            o[name] = ((row: any, cb) => cb(void 0, val));
        }
        return o;
    }, {});
};

@declareFunction("MqlEval", 2)
@functionArg("row")
@functionArg("mqlExpr", Types.String)
@functionArg("name", Types.String)
@functionArg("value", Types.Any)
@documentFunction({
    description: "Evaluate a string as an MQL expression, returning the result.",
    remarks: `Note that this function will *not* allow the expression to reference
columns in the from table. This means that the following query will fail:

\`\`\`mql
SELECT
  x,
  MqlEval("x + 1")
FROM
  Lattice('x = 1 to 10 step 1')
\`\`\`

In order to reference a column, you must instead pass it as a parameter. Parameters
in MQL are given as \`SET\`s, so your query will look like this:

\`\`\`mql
SELECT
  x,
  MqlEval('@x + 1', 'x', x)
FROM
  Lattice('x = 1 to 10 step 1')
\`\`\`

Here we tell \`MqlEval\` that it will recieve a parameter named \`x\`, and the
value of that parameter will be the column \`x\`. Inside, we reference it as if
it were a SET, with the at-sign (\`@\`).
`,
    examples: [
`SELECT
    MqlEval('@foo||@bar', 'foo', 'Hello, ', 'bar', 'MQL!')
FROM
    dual`,
`SET @nouns = StringVector(
    'World',
    'MQL',
    'foo',
    'bar',
    'baz',
    'bat'
)

SELECT
    MqlEval(
        '''Hello ''||@noun||''!''',
        'noun',
        Idx(@nouns, x)
    ) as greeting
FROM Lattice('x = 0 to '||(Length(@nouns) - 1)||' step 1')`,
`SELECT
    x,
    MqlEval('@x + 1', 'x', x)
FROM
    Lattice('x = 1 to 10 step 1')`]
})
export class MqlEvalExpressionFunction extends IFunction {

    static validateIds(names: string[]) {
        names.forEach(name => {
            if (name.match(/^[a-zA-Z][a-zA-Z0-9_$#.]*$/) == null)
                throw new Error(`Invalid argument name '${name}'`);
        });
    }

    compiledCache = new Map<string, CompiledMqlFunc | Promise<CompiledMqlFunc>>();

    public eval(opts: { [id: string]: any; }, context: IFunctionEvaluatorContext, done: MqlCallback): any {
        let mql = opts["mqlExpr"];
        let names: string[] = opts["name"] || [];
        let values: any[] = opts["value"] || [];

        //Eval is compiling or has already compiled.
        let cached = this.compiledCache.get(mql);
        if (cached) {
            if (cached instanceof Promise) {
                return cached.then(func => {
                    let referencedInst = getReferencedValues(names, values);
                    return void Callbacks.Trap(func.bind(void 0, context, referencedInst))(done);
                });
            } else {
                let referencedInst = getReferencedValues(names, values);
                return void Callbacks.Trap(cached.bind(void 0, context, referencedInst))(done);
            }
        }

        let resolve: (value?: CompiledMqlFunc | PromiseLike<CompiledMqlFunc>) => void;
        let reject: (reason?: any) => void;
        let compilePromise = new Promise<CompiledMqlFunc>((res, rej) => {resolve = res; reject = rej; });
        //Mark this mql text as compiling.
        this.compiledCache.set(mql, compilePromise);

        let mqlRes: MqlCompilerResults;
        try {
            mqlRes = StartTimingSync("MqlParsing", () => MqlCompiler.compileExpression(mql));
        } catch (err) {
            reject(err);
            return void done(err);
        }

        //Remove starting @ sign
        names = names.map(name => name.replace(/^@/, ""));

        RunEmbeddedMql.validateIds(names);

        return void StartTiming("GetAllFunctions", () => context.GetAllFunctions()).then(funcs => {
            let inlineFuncs: any = {};
            //HACK: This is to support lowercase names such as sum/ifelse/etc for now.
            let findFunctionName = (name: string) => {
                let keys = Object.keys(funcs);
                let idx = keys.findIndex((s: string) => s.toLowerCase() === name);
                return idx !== -1 ? keys[idx] : name;
            };
            let functions = mqlRes.functions.map(
                n => ({ funcName: !funcs.hasOwnProperty(n.funcName) ? findFunctionName(n.funcName) : n.funcName, id: n.id }));
            return Promise.all(functions.map(n => context.FindFunctionInfo(n.funcName))).then(infos => {
                functions.forEach((e, i) => {
                    let name = e.funcName;
                    let id = e.id;
                    if (!funcs.hasOwnProperty(name)) {
                        //Todo: Compile time errors for referencing functions that don't exist?
                        inlineFuncs[id] = (
                            row: any, args: any, cb: MqlCallback) => { return void cb(new Error(`Referenced unknown function '${name}'`)); };
                    } else {
                        let inst = new funcs[name];
                        inlineFuncs[id] =
                            (row: any, args: any, cb: MqlCallback) => inst.evalCall(
                                row,
                                Array.isArray(args) ?
                                    PositionalToKeyValue(infos[i], [row].concat(args || [])) :
                                    Object.assign({}, args, { row: row }),
                                context,
                                cb);
                    }
                });

                let referencedPrependText = names.map((name: string) => `let _${name} = referenced.${name};`).join("");
                let referencedInst = getReferencedValues(names, values);

                let exprJsText = `${mqlRes.prepends}\nreturn (\n${mqlRes.javaScript}\n);`;

                console.log("MqlEval", referencedPrependText, exprJsText);

                let func = new Function(
                    "context",
                    "QueryEngine",
                    "inline",
                    "referenced",
                    "row", //Pass a null row variable since the compiled expression depends on a row variable being defined.
                    "Callbacks",
                    "cb",
                    referencedPrependText + exprJsText
                );
                let cachedFunc = (ctx, referenced, cb) => func(ctx, QueryEngine, inlineFuncs, referenced, null, Callbacks, cb);
                this.compiledCache.set(mql, cachedFunc);
                //Note: resolving here will likely cause the Evals to return out of order
                //However we don't currently guarantee execution order anyways
                resolve(cachedFunc);
                return func(context, QueryEngine, inlineFuncs, referencedInst, null, Callbacks, done);
            });
        })
        .catch(err => {
            reject(err);
            done(err);
        });
    }
}


@declareFunction("JsEval", 2)
@functionArg("row")
@functionArg("javascript")
@functionArg("name")
@functionArg("value")
export class JsEvalExpressionFunction extends IFunction {
    compiledCache = new Map<string, CompiledJsFunc>();

    public eval(optionLookup: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        return evaluateRowOptionsFast(optionLookup["row"], optionLookup, opts => {
            let codeText = opts["javascript"];
            let names: string[] = opts["name"] || [];
            let values: any[] = opts["value"] || [];

            let userContext = context.userContext || { id: UUID.uuid4(), token: context.cancelToken };

            let cacheKey = codeText + names.join("||");

            let func = this.compiledCache.get(cacheKey);
            if (!func) {
                func = CreateJsFunc(codeText, names);
                this.compiledCache.set(cacheKey, func);
            }

            return func({}, userContext, values);
        });

    }
}

@declareFunction("Subselect", 2, Types.Table, "The subquery result")
@functionArg("row")
@functionArg("mql", Types.String, "", "Query to run")
@functionArg("name", Types.String, "", "Parameter name to pass into the query")
@functionArg("value", Types.Any, void 0, "Parameter value")
@documentFunction({
    description: "Run an MQL query inside another query",
    examples: [`SET @MyTable = Subselect(<<MQL
SELECT x, @myValue FROM Lattice('x = 1 to 10 step 1')
MQL
, 'myValue', 42)

SELECT
    *
FROM
    @MyTable`]
})
export class SubSelectFunction extends IFunction {
    public eval(optionLookup: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        //Todo: We should create a sub context. That way subqueries aren't running in the same context.
        let inst = new RunEmbeddedMql();
        return inst.eval({
            "mql": optionLookup["mql"],
            "name": optionLookup["name"],
            "value": optionLookup["value"]
        }, context);
    }
}

@declareFunction("ScalarSubselect", 2)
@functionArg("row")
@functionArg("mql", Types.String)
@functionArg("name", Types.String)
@functionArg("value")
@documentFunction({
    description: "Returns a single cell from the execution of a subquery string.",
    remarks: `
Additional optional data can be passed to the subquery through a list of
parameter names for the values. If provided, they are first evaluated in the
outer query before being passed in with the specified paramNames to the subquery
execution.

An error will be returned if the subquery returns zero rows or more than one row
or column.`,
    examples: [`set @quantityTable = <<csv
productNumber,quantity
1, 10
2, 15
3, 10
4, 20
csv

set @supplierTable = <<csv
supplierNumber,productNumber,supplierCity
99, 1, Boston
22, 3, New York
57, 2, Beijing
9, 4, Paris
14, 6, Los Angeles
csv

SELECT
	productNumber,
	quantity,
	ScalarSubselect('SELECT supplierCity FROM CsvToTable(@supplierTable) WHERE productNumber = @quantityTableProductNumber', '@supplierTable', @supplierTable,'@quantityTableProductNumber', productNumber) as [Supplier City]
FROM
	CsvToTable(@quantityTable)`]
})
export class ScalarSubselectFunction extends IFunction {
    public eval(optionLookup: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let inst = new SubSelectFunction();
        let res = inst.eval(optionLookup, context);

        let processTable = (table: Table) => {
            if (table == null || !Array.isArray(table.rows))
                throw new Error("ScalarSubselect didn't return a table");
            if (table.rows.length > 1 || table.columnNames.length > 1)
                throw new Error("Results of a scalar subselect didn't contain exactly one row and one column.");
            return table.rows[0].getValue(0);
        };

        return res.then(processTable);
    }
}

// @declareFunction("Coalesce", 1)
// @functionArg("row")
// @functionArg("values")
// @documentFunction({
//     description: "Returns the first non-`null` value among its arguments. If all" +
//         " of the arguments are `null`, `coalesce` will return `null`.",
//     remarks: "After coalesce evaluates the first non-LiteralNull argument," +
//         " coalesce does not evaluate any additional arguments.",
//     examples: [`def @delay(@SecondsToWait) = delay( @SecondsToWait * 1000 )
// set @val = 42
// SELECT
//     coalesce( null, null ) note 'returns null',
//     coalesce( null, null, 3, null ) note 'returns 3',
//     coalesce(null, @val, 10) note 'returns @table',
//     coalesce('foo', @delay(10) ) note 'returns ''foo'', doesn''t call @delay',
//     coalesce( null, 1, @InvalidVariable ) note 'returns 1, doesn''t call @table'
// FROM
// 	dual`]
// })
// export class MqlCoalesceFunction extends IFunction {
//     public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
//         let row = options["row"];
//         let values = options["values"];
//         if (values.length === 0)
//             return null;

//         let nextValue = (idx: number): any => {
//             if (idx >= values.length)
//                 return makeObservable(null);

//             return makeObservable(values[idx](row)).mergeMap(e => {
//                 if (e != null)
//                     return makeObservable(e);
//                 return nextValue(idx + 1);
//             });
//         };
//         return nextValue(0);
//     }
// }

@declareFunction("RemoveColumns", 1, Types.Table)
@functionArg("row")
@functionArg("table", Types.Table)
@functionArg("columns", Types.String)
@documentFunction({
    description: "Returns a copy of the specified datatable with the specified" +
        " columns removed. It will throw an exception if any of the column names" +
        " can't be found.",
    examples: [`set @table = Lattice( 'x = 1 to 4 step 1, y = 2 to 5 step 1, z = 3 to 6 step 1' )
SELECT
    *
FROM
    RemoveColumns( @table, 'x', 'z' )`]
})
export class RemoveColumnsFunction extends IFunction {
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let table = <Table>options["table"];
        if (table == null) throw Error("Table must be provided");
        if (!(table instanceof Table)) {
            console.error(table);
            throw Error("Provided table is not a table");
        }
        let columns = options["columns"];

        let newColumns = table.columnNames
            .map((c, i) => ({ name: c, idx: i }))
            .filter(e => columns.indexOf(e.name) === -1);

        let newTable = new Table();
        newTable.setColumns(newColumns.map(e => e.name));
        for (let i = 0; i < table.rows.length; i++) {
            let oldRow = table.rows[i];
            let newRow = newTable.createRow(oldRow.name);
            newTable.appendRow(newRow);
            for (let j = 0; j < newColumns.length; j++) {
                newRow.setValue(j, oldRow.getValue(newColumns[j].idx));
            }
        }

        return newTable;
    }
}

@declareFunction("Sum", void 0, Types.Number)
@functionArg("row")
@functionArg("func", void 0, void 0, "MQL Function Expression")
@documentFunction({
    description: "Returns the sum of the `func` expression evaluated on the"
        + " leaves of the current node, ignoring non-numeric values.",
    examples: [`SELECT
	x,
	y,
	sum( x*y )
FROM
	Lattice( 'x = 1 to 5 step 1, y = 6 to 10 step 1' )
GROUP BY
	x
WITH ROLLUP`]
})
export class SumFunction extends IFunction {
    private cache = new WeakMap<Row, number>();

    public evalCall(
        row: Row,
        optionLookup: {
            [id: string]: (row: Row, cb: MqlCallback) => void;
        },
        context: IFunctionEvaluatorContext,
        done: MqlCallback
    ) {
        if (this.cache.has(row)) {
            return void done(void 0, this.cache.get(row));
        }
        let func = optionLookup["func"];

        if (!row || typeof func !== "function")
            return void done(void 0, 0);

        let callbacks:  ((cb: MqlCallback<number>) => void)[] = [];

        for (const irow of IterTools.dfs_iter([row], row => row.children)) {
            callbacks.push(func.bind(void 0, irow));
        }

        return Callbacks.All(callbacks, (err, res) => {
            if (err) return done(err);
            let sum = 0;
            for (let i = 0; i < res.length; i++) {
                const val = res[i];
                if (res === null || res === undefined) continue;
                sum += val;
            }
            this.cache.set(row, sum);
            return void done(void 0, sum);
        });
    }

    // TODO: Cleanup the IFunction interface
    public eval(): void {
        throw Error("not implemented");
    }
}

@declareFunction("GetLevel")
@functionArg("row")
@documentFunction({
    description: "Returns the branch level of each row in a table, with the root being level 0.",
    examples: [`SELECT
	x,
	y,
	GetLevel(  )
FROM
	Lattice( 'x = 1 to 10 step 1, y = 1 to 10 step 1' )
GROUP BY
	x,
	y
WITH ROLLUP`]
})
export class GetLevelFunction extends IFunction {
    public eval(optionLookup: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let row = optionLookup["row"];
        if (!row)
            return 0;

        return row.level;
    }

}

@declareFunction("CsvToTable", void 0, Types.Table)
@functionArg("row")
@functionArg("csv", Types.String)
@functionArg("inferTypes", Types.Boolean, void 0, "Whether to infer types on the " +
    "CSV. Greatly improves performance, but may cause issues with some CSVs")
@documentFunction({
    description: "Parses a CSV string to a table."
})
export class CsvToTableFunction extends IFunction {
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let readCsv = new ReadPastedCsvFunction();
        const inferTypes = options["inferTypes"] == null ? true : options["inferTypes"];
        let csv = options["csv"];
        return readCsv.eval({ "TableOutput": csv, inferTypes }, context);
    }
}

@declareFunction("ExcelCsvToTable")
@functionArg("row")
@functionArg("csv")
export class ExcelCsvToTableFunction extends IFunction {
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        return evaluateRowOptionsFast(null, options, opts => {
            let csv = opts["csv"];
            try {
                let table = Papa.parse(csv.replace(/^\uFEFF/, ""), { header: true, dynamicTyping: true });
                //Parses formats like `100%`, `(123,456)` and `123,324`
                //This regex matches excel formats like `(123,456)`, `123,324` and `123456`
                let regex = new RegExp(/^(\s*\(\s*(\d+(,\d{3})*)\s*\)\s*|\s*(\d+(,\d{3})*)\s*|\s*(\d+)\s*)$/);
                for (let i = 0; i < table.data.length; i++) {
                    let row = table.data[i];
                    for (let key in row) {
                        let val = row[key];
                        if (typeof val === "string") {
                            if (val.endsWith("%")) {
                                row[key] = Number.parseFloat(val.substr(0, val.length - 1)) / 100;
                            } else if (regex.exec(val)) {
                                let num = Number.parseFloat(val.replace(/[(),]/g, ""));
                                if (val.trim().startsWith("("))
                                    num = -num;
                                row[key] = num;
                            }
                        }
                    }
                }
                return TableHelper.fromObjectArray(table.data);
            } catch (e) {
                throw EvalError("Could not parse pasted CSV. Is it valid?");
            }
        });
    }
}

@declareFunction("Lattice")
@functionArg("row")
@functionArg("def")
@documentFunction({
    description: "Creates a table of values based on the specified variables.",
    remarks: `
The expression has the following form:

\`\`\`
<VAR> = <MIN> to <MAX> step <STEP SIZE> [, <VAR> = <MIN> to <MAX> step <STEP SIZE>]+
\`\`\``,
    examples: [`SELECT
	*
FROM
    Lattice( 'x = 1 to 10 step 1, y = 1 to 10 step 1' )`]
})
export class MqlLatticeFunction extends IFunction {
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let lat = new LatticeFunction();
        return evaluateRowOptionsFast(null, options, opts => {
            let def = opts["def"];
            return lat.eval({ "Lattice Definition": def }, context);
        });
    }

}

@declareFunction("Invoke", 1)
@functionArg("row")
@functionArg("name")
@functionArg("args")
export class MqlInvokeFunction extends IFunction {
    public async eval(optionLookup: { [id: string]: any; }, context: IFunctionEvaluatorContext): Promise<any> {
        //Todo: Optimize the case where every arg is synchronous
        let name = optionLookup["name"];
        let args: any[] = optionLookup["args"];
        let funcInfo = await context.FindFunctionInfo(name);
        if (funcInfo == null)
            throw new Error(`Cannot call function "${name}" with positional arguments`);

        let options = PositionalToKeyValue(funcInfo, args);
        return context.evaluate(name, options);
    }

}

@declareFunction("Avg", void 0, Types.Number)
@functionArg("row", Types.Row)
@functionArg("func", /* todo: we don't have a fexpr type */ void 0, void 0, "MQL Function Expression")
@documentFunction({
    description: "Evaluates the specified expression on all leaf nodes under the current node" +
        " and returns the arithmetic average of the results, ignoring non-numeric values.",
    examples: [
        `set @table = <<csv
Country,Continent,GDPPerCapita,InfantMortalityRate
US, North America, 49965, 7
Rwanda, Africa, 620, 55
India, Asia, 1489, 56
Chile, South America, 15356, 9
Turkey, Europe, 10666, 14
Ukraine, Europe, 3867, 11
Haiti, North America, 771, 76
csv

SELECT
    Country,
    Continent,
    GDPPerCapita as [GDP Per Capita],
    InfantMortalityRate as [Infant Mortality Rate],
    RootVal(avg(GDPPerCapita)) as [Average GDP Per Capita],
    RootVal(avg(InfantMortalityRate)) as [Average Infant Mortality Rate]
FROM
    CsvToTable(@table)`]
})
export class AvgFunction extends IFunction {
    public evalCall(
        row: Row,
        optionLookup: {
            [id: string]: (row: Row, cb: MqlCallback) => void;
        },
        _context: IFunctionEvaluatorContext,
        done: MqlCallback
    ) {
        let func = optionLookup["func"];

        if (!row || typeof func !== "function")
            return 0;

        const deferrals: ((cb: MqlCallback<number>) => void)[] = new Array();

        for (const irow of IterTools.dfs_iter([row], row => row.children)) {
            if (irow.children.length > 0) continue;
            deferrals.push(func.bind(void 0, irow));
        }

        Callbacks.Reduce(deferrals, vals => {
            // TBD: spec choice. For now, I'm matching the old behavior
            if (vals.length === 0) return 0;
            let sum = 0;
            let items = 0;
            for (let i = 0; i < vals.length; i++) {
                const val = vals[i];
                if (val === null || val === undefined) continue;
                items++;
                sum += vals[i];
            }
            sum /= items;
            return sum;
        }, done);
    }

    // TODO: Cleanup the IFunction interface
    public eval(): void {
        throw Error("not implemented");
    }
}

@declareFunction("Wavg")
@functionArg("row")
@functionArg("values")
@functionArg("weights")
@documentFunction({
    description: "Returns the weighted average of the leaves, ignoring non-numeric values.",
    examples: [`set @testscores = <<csv
TestScore,NumberOfStudents
90, 30
75, 12
70, 6
50, 1
80, 25
100, 10
csv

SELECT
	TestScore as [Test Score],
	NumberOfStudents as [Number Of Students That Received The Test Score],
	RootVal(wavg(TestScore, NumberOfStudents)) as [Weighted Average Of Test Scores],
	RootVal(avg(TestScore)) as [Simple Average Of Test Scores]
FROM
	CsvToTable( @testscores )`]
})
export class WavgFunction extends IFunction {
    // Takes an array of values and an array of weights and returns the weighted average
    public evalCall(
        row: Row,
        optionLookup: {
            [id: string]: (row: Row, cb: MqlCallback) => void;
        },
        _context: IFunctionEvaluatorContext,
        done: MqlCallback
    ) {
        let weights = optionLookup["weights"];
        let values = optionLookup["values"];

        if (!row || !weights)
            return 0;

        const wtDeferrals: ((cb: MqlCallback<number>) => void)[] = new Array();
        const valDeferrals: ((cb: MqlCallback<number>) => void)[] = new Array();

        for (const irow of IterTools.dfs_iter([row], row => row.children)) {
            if (irow.children.length > 0) continue;
            wtDeferrals.push(weights.bind(void 0, irow));
            valDeferrals.push(values.bind(void 0, irow));
        }

        Callbacks.Reduce([
            Callbacks.All.bind(void 0, wtDeferrals) as (cb: MqlCallback<number[]>) => void,
            Callbacks.All.bind(void 0, valDeferrals) as (cb: MqlCallback<number[]>) => void
        ], ([weights, values]) => {
            if (weights.length === 0) {
                return 0;
            }
            let sum = 0;
            let totWt = 0;
            for (let i = 0; i < values.length; i++) {
                const val = values[i], wt = weights[i];
                if (val === null || val === undefined || wt === null || wt === undefined) {
                    continue; // skip nulls
                }
                sum += values[i] * weights[i];
                totWt += weights[i];
            }
            sum /= totWt;
            return sum;
        }, done);
    }

    // TODO: Cleanup the IFunction interface
    public eval(): void {
        throw Error("not implemented");
    }
}

@declareFunction("RootVal")
@functionArg("row")
@functionArg("func")
@documentFunction({
    description: "Returns the result of an expression evaluated at the root level.",
    examples: [`set @table = Lattice( 'x = 1 to 3 step 1, y = 7 to 10 step 1' )
SELECT
	x,
	y,
	sum( x + y ),
	ParentVal( sum( x + y ) ),
	RootVal( sum( x + y ) )
FROM
	@table
GROUP BY
	x
WITH ROLLUP`],
    remarks: `\`sum( x + y )\` returns the sum of x and y at the leaf level,
\`ParentVal( sum( x + y ) )\` returns the sum of x and y at the leaf's parent
level, and \`RootVal( sum( x + y ) )\` returns the sum of x and y at the root
level.

If there was no GROUP BY statement in the example query,
\`ParentVal( sum( x + y ) )\` and \`RootVal( sum( x + y ) )\` would return the
same value since the leaf's parent would also be the root.`
})
export class RootVal extends IFunction {
    public evalCall(
        row: Row,
        optionLookup: {
            [id: string]: (row: Row, cb: MqlCallback) => void;
        },
        context: IFunctionEvaluatorContext,
        done: MqlCallback
    ) {
        let func = optionLookup["func"];

        if (!row || typeof func !== "function")
            return 0;

        let node = row;
        while (node.parent != null) {
            node = node.parent;
        }

        return func.call(void 0, node, done);
    }
    public eval() {
        throw Error("not implemented");
    }
}

@declareFunction("ParentVal")
@functionArg("row")
@functionArg("func")
@documentFunction({
    description: "Returns the result of an expression evaluated on row's parent.",
    // There's no intercept function in MqlJs right now
    //     examples: [`set @line = 2 * x + 5
    // SELECT
    //     x,
    //     @line,
    //     ParentVal( intercept( x, @line ) )
    // FROM
    //     Lattice( 'x = 1 to 10 step 1' )
    // GROUP BY
    //     1
    // WITH ROLLUP`]
})
export class ParentValFunction extends IFunction {
    public evalCall(
        row: Row,
        optionLookup: {
            [id: string]: (row: Row, cb: MqlCallback) => void;
        },
        context: IFunctionEvaluatorContext,
        done: MqlCallback
    ) {
        let func = optionLookup["func"];

        if (!row || typeof func !== "function")
            return 0;

        let node = row.parent;

        return node != null ? func.call(void 0, node, done) : done(void 0, null);
    }
    public eval() {
        throw Error("not implemented");
    }
}

@declareFunction("Dual")
@functionArg("row")
export class DualTableFunction extends IFunction {
    public eval(optionLookup: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let table = new Table();
        table.setColumns(["X"]);
        let row = table.createRow(null);
        row.setValue(0, null);
        table.appendRow(row);
        return table;
    }
}

@declareFunction("RenameColumn", 2, Types.Table)
@functionArg("row")
@functionArg("table", Types.Table)
@functionArg("oldName", Types.String, void 0, "The column to rename.")
@functionArg("newName", Types.String, void 0, "The new name the column should take on.")
@documentFunction({
    description: "Renames one or more columns in a table.",
    examples: [`SELECT
    w,
    z
FROM
    RenameColumn( Lattice( 'x = 0 to 3 step 1, y = 0 to 3 step 1' ), 'x', 'w', 'y', 'z' )`]
})
export class RenameColumnFunction extends IFunction {
    public eval(opts: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let table = opts["table"];
        let oldNames = opts["oldName"];
        let newNames = opts["newName"];
        let copy = (<Table>table).copyTable();
        let mapping = oldNames.reduce((o: any, name: string, i: number) => {
            o[name] = newNames[i];
            return o;
        }, {});
        copy.setColumns(copy.columnNames.map(name => mapping[name] || name));
        return copy;
    }

}

@declareFunction("InnerNaturalJoin", 1, Types.Table)
@functionArg("row")
@functionArg("columnOrTable")
@documentFunction({
    description: "Performs a SQL-style equi-join on the specified tables using" +
        " the specified columns as keys."
})
export class InnerNaturalJoinFunction extends IFunction {
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let row = options["row"];
        return evaluateRowOptionsFast(row, options, opts => {
            let columnOrTables = opts["columnOrTable"];
            let columns: string[] = columnOrTables.filter((e: any) => typeof e === "string");
            let tables: Table[] = columnOrTables.filter((e: any) => typeof e !== "string");
            if (columns.length > 2)
                throw new Error("InnerNaturalJoin currently only supports providing a left and right key");
            if (tables.length !== 2)
                throw new Error("InnerNaturalJoin currently only supports joining 2 tables");

            let leftKey = columns[0];
            let rightKey = columns.length > 1 ? columns[1] : leftKey;

            return TableHelper.Join(tables[0], tables[1], JoinType.InnerJoin, leftKey, rightKey);
        });
    }

}

@declareFunction("FullOuterNaturalJoin", 1, Types.Table)
@functionArg("row")
@functionArg("columnOrTable")
@documentFunction({
    description: "Performs a SQL-style full-outer equi-join on the specified tables using the specified column as keys",
    examples: [
        `SELECT
  x,
  y,
  z
FROM
    FullOuterNaturalJoin(
        'x',
        Lattice( 'x = 1 to 3 step 1, z = 1 to 2 step 1' ),
        Lattice( 'x = 1 to 3 step 1, y = 1 to 2 step 1' )
    )`],
    remarks: `If a table doesn't have the key column, the functor will throw an exception.`
})
export class FullOuterNaturalJoinFunction extends IFunction {
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let row = options["row"];
        return evaluateRowOptionsFast(row, options, opts => {
            let columnOrTables = opts["columnOrTable"];
            let columns: string[] = columnOrTables.filter((e: any) => typeof e === "string");
            let tables: Table[] = columnOrTables.filter((e: any) => typeof e !== "string");
            if (columns.length > 2)
                throw new Error("FullOuterNaturalJoin currently only supports providing a left and right key");
            if (tables.length !== 2)
                throw new Error("FullOuterNaturalJoin currently only supports joining 2 tables");

            let leftKey = columns[0];
            let rightKey = columns.length > 1 ? columns[1] : leftKey;

            return TableHelper.Join(tables[0], tables[1], JoinType.FullOuterJoin, leftKey, rightKey);
        });
    }
}

@declareFunction("CrossJoin", 1, Types.Table)
@functionArg("row")
@functionArg("table", Types.Table)
@documentFunction({
    description: "Performs a cross join on two or more tables.",
    remarks: `If 2 tables share a column with the same name, CrossJoin will
overwrite the column in the first table with the identically-named column in the
second.`,
    examples: [`set @tableA = Lattice( 'x = 1 to 3 step 1, y = 10 to 12 step 1' )
set @tableB = Lattice( 'z = 4 to 5 step 1, q = 20 to 22 step 1' )
set @tableC = Lattice( 'x = 30 to 33 step 1, p = 43 to 47 step 1' )
SELECT
    *
FROM
    /* CrossJoin replaces the 'x' column in @tableA
    with the 'x' column in @tableC */
    CrossJoin( @tableA, @tableB, @tableC )`]
})
export class CrossJoinFunction extends IFunction {

    static crossJoinTables(left: Table, right: Table) {
        let output = new Table();
        output.setColumns(_.uniq(left.columnNames.concat(right.columnNames)));

        for (let leftIdx = 0; leftIdx < left.rows.length; leftIdx++) {
            for (let rightIdx = 0; rightIdx < right.rows.length; rightIdx++) {
                let newNode = output.createRow(null);
                CrossJoinFunction.copyColumns(left.rows[leftIdx], newNode, left.columnNames);
                CrossJoinFunction.copyColumns(right.rows[rightIdx], newNode, right.columnNames);
                output.appendRow(newNode);
            }
        }
        return output;
    }

    static copyColumns(src: Row, target: Row, columns: string[]) {
        for (let i = 0; i < columns.length; i++)
            target.setValue(columns[i], src.getValue(columns[i]));
    }
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let row = options["row"];
        return evaluateRowOptionsFast(row, options, opts => {
            let tables = <Table[]>opts["table"];
            return tables.reduce((o, r) => o != null ? CrossJoinFunction.crossJoinTables(o, r) : r, null);
        });
    }
}

@declareFunction("Count", void 0, Types.Number)
@functionArg("row")
@functionArg("mode", Types.String, "leaves", "Counting mode, can be either 'leaves' or 'children'.")
@documentFunction({
    description: "Counts the number of 'leaves' or 'children' of this row, depending on `mode`.",
    examples: [`set @table = Lattice('x = 1 to 3 step 1, y = 7 to 10 step 1')
SELECT
	x,
	y,
	x * y,
	count( 'leaves' ),
	count( 'children' )
FROM
	@table
GROUP BY x * y WITH ROLLUP`]
})
export class CountFunction extends IFunction {
    static CountEval(row: Row, mode: string): number {
        if (row.children.length === 0 && mode === "leaves") {
            return 1;
        } else if (row.children.length === 0 && mode === "children") {
            return 0;
        } else if (mode === "siblings") {
            return row.parent != null ? row.parent.children.length : 1;
        } else if (row.children.length !== 0 && mode === "children") {
            return row.children.length;
        } else if (row.children.length !== 0 && mode === "leaves") {
            return row.children.reduce((t, r) => t + CountFunction.CountEval(r, mode), 0);
        } else {
            throw new Error("Unknown mode: " + mode);
        }
    }

    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let row = <Row>options["row"];
        return evaluateRowOptionsFast(row, options, opts => {
            let mode = opts["mode"] || "leaves";
            return CountFunction.CountEval(row, mode);
        });
    }


}

@declareFunction("VectorCorrelation")
@functionArg("row")
@functionArg("x", Types.Array)
@functionArg("y", Types.Array)
@documentFunction({
    description: "Returns the correlation of the elements in two numeric vectors.",
    // There's no FloatVector function so this example is also moot
    //     examples: [`set @floatVector1 = FloatVector( 1, 2, 3, 4, 5 )
    // set @floatVector2 = FloatVector( 20, 18, 5, 99, 2 )
    // SELECT
    // 	VectorCorrelation( @floatVector1, @floatVector2 )
    // FROM
    // 	dual`]
})
export class VectorCorrelationFunction extends IFunction {
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let row = options["row"];
        return evaluateRowOptionsFast(row, options, opts => {
            let xArr: number[] = opts["x"];
            let yArr: number[] = opts["y"];

            if (xArr.length === 0 || yArr.length === 0)
                throw new Error("VectorCorrelation: Vector must contain elements");

            if (xArr.length !== yArr.length)
                throw new Error("VectorCorrelation: Vector lengths must match");

            let avgX = xArr.reduce((r, n) => r + n, 0) / xArr.length;
            let avgY = yArr.reduce((r, n) => r + n, 0) / yArr.length;
            let sx = xArr.reduce((r, n) => r + Math.pow(n - avgX, 2), 0);
            let sy = yArr.reduce((r, n) => r + Math.pow(n - avgY, 2), 0);
            let stdDevX = Math.sqrt(sx / (xArr.length - 1));
            let stdDevY = Math.sqrt(sy / (yArr.length - 1));
            let sum = 0;
            for (let i = 0; i < xArr.length; i++) {
                sum += (xArr[i] - avgX) * (yArr[i] - avgY);
            }
            return sum / (xArr.length - 1) / stdDevX / stdDevY;

        });
    }
}

@declareFunction("UnionAllStrict", 1)
@functionArg("row")
@functionArg("table")
export class UnionAllStrictFunction extends IFunction {
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let row = options["row"];
        return evaluateRowOptionsFast(row, options, opts => {
            let tables = opts["table"];
            //Todo: Optimize the case when more than 2 tables are provided.
            return tables.reduce((left: Table, right: Table) => left == null ? right : TableHelper.Union(left, right, true), null);
        });
    }

}

@declareFunction("UnionAllOuter", 1, Types.Table)
@functionArg("row")
@functionArg("table", Types.Table, void 0)
export class UnionAllOuterFunction extends IFunction {
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let tables = options["table"] as Table[];
        //Todo: Optimize the case when more than 2 tables are provided.
        return tables.reduce((left: Table, right: Table) => left == null ? right : TableHelper.Union(left, right, false), null);
    }
}


@declareFunction("FilterTable", void 0, Types.Table)
@functionArg("row")
@functionArg("table", Types.Table)
@functionArg("filter", void 0, void 0, "MQL Function Expression")
@documentFunction({
    description: "Filters a LiteralDataTable by only returning rows where the specified expression is true.",
    examples: [
        `set @table = Lattice( 'col1 = 3 to 6 step 1, col2 = 100 to 105 step 1' )
SELECT
	FilterTable( @table, 'col2 = 103' )
FROM
	dual`]
})
export class FilterTableFunction extends IFunction {
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let row = options["row"];
        return evaluateRowOptionsFast(row, options, opts => {
            let table = opts["table"];
            let filter = options["filter"]; //Todo: Support async
            let newTable = new Table();
            newTable.setColumns(table.columnNames);
            for (let i = 0; i < table.rows.length; i++) {
                let oldRow = table.rows[i];
                if (filter(oldRow)) {
                    let copyRow = newTable.createRow(oldRow.name);
                    newTable.appendRow(copyRow);
                    for (let j = 0; j < newTable.columnNames.length; j++)
                        copyRow.setValue(j, oldRow.getValue(j));
                }
            }
            return newTable;
        });
    }

}

// Note that MavenBase (the C# engine) has `CreateDashboardLink`, which has a
// slightly different signature and featureset.
@declareFunction("DashboardLink", 2, Types.String, "A link to embed a dashboard inside a cell")
@functionArg("row", Types.Row)
@functionArg("path", Types.String, void 0, "Path to a dashboard to embed")
@functionArg("width", Types.Number, 400, "The desired width of the dashboard when displayed")
@functionArg("height", Types.Number, 300, "The desired height of the dashboard when displayed")
@functionArg("argNames", Types.String, void 0, "Name of parameter to override")
@functionArg("argValues", Types.Any, void 0, "Value of parameter to override")
@documentFunction({
    description: "Return a link to reference a dashboard inside this cell",
    remarks: `This feature is used by the SlickGrid to power dashboard hovers.
When a column display style is set to \`DashboardLink\`, SlickGrid will render
dashboard links as icons. When a user hovers over those icons with their mouse,
a dashboard hover will appear with the given width and height. Parameter
overrides will be applied as globals.

If no dashboard was found at \`path\`, then when the hover is created, an error
will be displayed instead.

\`path\` may be prepended with \`url:\` to load a dashboard from a src:url.`,
})
export class DashboardLinkFunction extends IFunction {
    public eval(
        {path, width, height, argNames, argValues}: { [id: string]: any; },
        context: IFunctionEvaluatorContext
    ) {
        if (!Array.isArray(argNames) || !Array.isArray(argValues)) {
            throw Error("Argument overrides must be arrays");
        }
        if (argNames.length !== argValues.length) {
            throw new Error(
                "Too many parameter " +
                (argNames.length > argValues.length ? "names" : "values") +
                ": Lengths must match"
            );
        }
        const src = ("" + path).startsWith("url:") ? "src:url" : "config";
        path = path.replace(/^url:/, "");
        return {
            type: "DashboardLink",
            path,
            src,
            width,
            height,
            overrides: argNames.reduce(
                (acc, key, i) => acc[key] = argValues[i],
                {} as Record<string, any>
            )
        };
    }
}

@declareFunction("Sparkline")
@functionArg("row")
@functionArg("value")
@functionArg("date")
@documentFunction({
    description: "Combines 2 expressions together to create a sparkline cell",
    remarks: `
This can be used in combination with SlickGrid to produce Sparklines in cells.
This function will create vectors from the expressions using the leaves of this
row and pair them together. Nominally, the first (y) vector is some value and
the second (x) is time.`
})
export class SparklineFunction extends IFunction {

    static isSparkline(arg: any) {
        return arg && Array.isArray(arg);
    }

    static walkLeafs(row: Row, cb: (row: Row) => void) {
        if (row.children.length > 0) {
            row.children.forEach((r) => { SparklineFunction.walkLeafs(r, cb); });
            return;
        }
        cb(row);
    }

    evalCall(
        row: Row,
        optionLookup: {
            [id: string]: (row: Row, cb: MqlCallback) => void;
        },
        context: IFunctionEvaluatorContext,
        cb: MqlCallback
    ): any {
        const valFunc = optionLookup["value"];
        const dateFunc = optionLookup["date"];

        const sparkLine: any[] = [];

        const valCbs = [];
        const dateCbs = [];

        for (const irow of IterTools.dfs_iter([row], r => r.children)) {
            if (irow.children.length > 0) continue;
            valCbs.push(valFunc.bind(void 0, irow));
            dateCbs.push(dateFunc.bind(void 0, irow));
        }
        Callbacks.All([
            Callbacks.All.bind(void 0, valCbs),
            Callbacks.All.bind(void 0, dateCbs),
        ] as ((cb: MqlCallback<number[]>) => void)[], (err, res) => {
            if (err) cb(err);
            const [values, dates] = res;
            for (let i = 0; i < Math.min(values.length, dates.length); i++) {
                sparkLine[i] = [new Date(dates[i]), values[i]];
            }
            cb(void 0, sparkLine);
        });
    }

    public eval() { throw Error("not implemented"); }
}

@declareFunction("Explode")
@functionArg("row")
@functionArg("table")
export class ExplodeFunction extends IFunction {

    static isSparkline(arg: any) {
        return arg && Array.isArray(arg);
    }

    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let row = options["row"];
        return evaluateRowOptionsFast(row, options, opts => {
            let tableOrSpark = opts["table"];
            if (ExplodeFunction.isSparkline(tableOrSpark)) {
                //Todo: Implement the case where we are passed a sparkline instead of a table.
            } else {
                let table = <Table>tableOrSpark;
                let exploded = new Table();
                exploded.setColumns(table.columnNames, table.columnTypes);
                if (table.columnNames.indexOf("Date") === -1)
                    exploded.appendColumn("Date");

                //Todo: Optimize
                for (let i = 0; i < table.rows.length; i++) {
                    let oldRow = table.rows[i];
                    let sparklineData = oldRow._data
                        .map((e, idx) => ({ data: e, idx: idx }))
                        .filter(e => ExplodeFunction.isSparkline(e.data));
                    let sparklineColumns = _.groupBy(sparklineData, d => d.idx);

                    if (sparklineData.length === 0) {
                        let newRow = exploded.createRow(oldRow.name);
                        for (let j = 0; j < table.columnNames.length; j++)
                            newRow.setValue(j, oldRow.getValue(j));
                        exploded.appendRow(newRow);
                    } else {
                        let flat: any = _.sortBy(_.flatMap(sparklineData, sparkData =>
                            sparkData.data.map((p: any) => ({ date: p[0], val: p[1], idx: sparkData.idx }))), o => o.date);
                        while (flat.length > 0) {
                            let curDate = flat[0].date;

                            let newRow = exploded.createRow(oldRow.name);
                            for (let j = 0; j < table.columnNames.length; j++) {
                                if (!sparklineColumns[j]) //Don't copy the sparkliens
                                    newRow.setValue(j, oldRow.getValue(j));
                            }
                            newRow.setValue(exploded.columnNames.length - 1, curDate); //Copy the date
                            exploded.appendRow(newRow);

                            while (flat.length > 0 && flat[0].date === curDate) {
                                newRow.setValue(flat[0].idx, flat[0].val);
                                flat.shift();
                            }
                        }

                    }
                }

                return exploded;

            }
        });
    }

}

@declareFunction("StringVector", 1, Types.Array)
@functionArg("row")
@functionArg("str", Types.String)
@documentFunction({
    description: "Returns a LiteralStringVector of passed LiteralStrings.",
    examples: [
        `SELECT  StringVector('foo', 'bar', 'baz', '1' )  FROM  dual`],
})
export class StringVectorFunction extends IFunction {
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let row = options["row"];
        return evaluateRowOptionsFast(row, options, opts => {
            return opts["str"];
        });
    }

}

@declareFunction("ToString", void 0, Types.String)
@functionArg("row")
@functionArg("value")
@documentFunction({
    description: "Returns a string that represents the passed Literal object.",
    remarks: ``,
    examples: [
        `set @stringVector = StringVector( 'Hello', 'World' )
SELECT
  ToString( 12 + 12 ) as [Expression to String],
  ToString( Date( 2015, 12, 1 ) ) as [Date to String],
  ToString( @stringVector ) as [Date Vector to String]
FROM
  dual`],
})
export class ToStringFunction extends IFunction {
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let row = options["row"];
        return evaluateRowOptionsFast(row, options, opts => {
            let val = opts["value"];
            if (typeof val === "undefined")
                return "undefined";
            if (val === null)
                return "null";
            return val.toString();
        });
    }

}

@declareFunction("First")
@functionArg("row")
@functionArg("value")
@documentFunction({
    description: "Returns the result of evaluating the specified expression on the first leaf of the current node.",
    examples: [
        `set @table = Lattice( 'x = 1 to 2 step 1, y = 3 to 4 step 1, z = 15 to 17 step 1' )
set @newZ = ifelse( z % 2 = 0, - z, z )
SELECT
	x,
	y,
	@newZ,
	first( x + y + @newZ )
FROM
	@table
GROUP BY
	x,
	y
WITH ROLLUP`],
})
export class FirstFunction extends IFunction {
    static firstLeaf(row: Row) {
        if (row.children.length === 0) {
            return row;
        }
        let leafs: any[] = row.children.map(c => FirstFunction.firstLeaf(c)).filter(e => e != null);
        return leafs.length > 0 ? leafs[0] : null;
    }

    evalCall(
        row: Row,
        optionLookup: {
            [id: string]: (row: Row, cb: MqlCallback) => void;
        },
        context: IFunctionEvaluatorContext,
        cb: MqlCallback
    ): any {
        let leaf = FirstFunction.firstLeaf(row);
        return optionLookup["value"](leaf, cb);
    }

    public eval() { throw Error("not implemented"); }

}

@declareFunction("StringJoin")
@functionArg("row")
@functionArg("delimiter")
@functionArg("stringVector")
@documentFunction({
    description: "Concatenates the values in the supplied collection, separating each value with the supplied string separator",
    examples: [
        `set @vec = StringVector('a','b','c','d')

SELECT
  StringJoin( '+ ', @vec)
FROM
  dual`],
})
export class StringJoinFunction extends IFunction {
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let row = options["row"];
        return evaluateRowOptionsFast(row, options, opts => {
            let strs = opts["stringVector"];
            let del = opts["delimiter"];
            return strs.join(del);
        });
    }

}

@declareFunction("FormatString", 1)
@functionArg("row")
@functionArg("format")
@functionArg("args")
@documentFunction({
    description: "Replaces each format item in a LiteralString format with the" +
        " string representation of the corresponding input's value.",
    remarks: `
\`{#}\`s are used as place-holders for inputs and are indexed from zero.
\`{#}\`s that do not reference a valid input will return an error.

If an input is expressed more than once within FormatString, the same indexed
place-holder can be referenced instead of having to create an additional indexed
place-holder.`,
    examples: [
        `SELECT
    /* 'foo' can be referenced by using {0} each time instead
       of having to create another indexed place-holder. */

    FormatString( '{0}, {1}, {2}, {0}', 'foo', 'bar', 'foo')
FROM
    dual`],
})
export class FormatStringFunction extends IFunction {
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let row = options["row"];
        return evaluateRowOptionsFast(row, options, opts => {
            let format = opts["format"];
            let args = opts["args"];
            let inst = new StringFormatFunction();
            return inst.eval({ "Format": format, "Input": args }, context);
        });
    }

}

@declareFunction("AddTime", void 0, Types.Date)
@functionArg("row", Types.Row)
@functionArg("date", Types.Date)
@functionArg("years", Types.Number)
@functionArg("months", Types.Number)
@functionArg("days", Types.Number)
@documentFunction({
    description: "Takes a Date value and increments it by the years, months, and days specified.",
    examples: ["SELECT AddTime( Date( 2013, 10, 25 ), 1, 2, 3 ) FROM dual"]
})
export class AddTimeFunction extends IFunction {
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let row = options["row"];
        return evaluateRowOptionsFast(row, options, opts => {
            let date = new Date((<Date>opts["date"]));
            let newDays = date.getDate() + opts["days"];
            let newMonths = date.getMonth() + opts["months"];
            let newYears = date.getFullYear() + opts["years"];
            date.setFullYear(newYears, newMonths, newDays);
            return date;
        });
    }

}

@declareFunction("ParseDateTime", void 0, Types.DateTime)
@functionArg("row")
@functionArg("dateStr", Types.String)
@documentFunction({
    description: "Parses a string into a DateTime",
    examples: [
        `SELECT
    ParseDateTime( '2010-04-06' ),
    ParseDateTime( '2008-05-01T07:34:42-5:00' ),
    ParseDateTime( '2008-05-01 7:34:42Z' ),
    ParseDateTime( 'Thu, 01 May 2008 07:34:42 GMT' )
FROM
    dual`],
})
export class ParseDateTimeFunction extends IFunction {
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let row = options["row"];
        return evaluateRowOptionsFast(row, options, opts => {
            return new Date(opts["dateStr"]);
        });
    }
}

@declareFunction("ParseDateExact")
@functionArg("row")
@functionArg("date")
@functionArg("format")
export class ParseDateExactFunction extends IFunction {
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let row = options["row"];
        return evaluateRowOptionsFast(row, options, opts => {
            let date = moment(opts["date"], opts["format"]);
            if (!date.isValid())
                throw new Error(`Invalid date '${opts["date"]}' or format '${opts["format"]}'`);
            return date.toDate();
        });
    }
}

@declareFunction("Date", void 0, Types.Date)
@functionArg("row")
@functionArg("year", Types.Number)
@functionArg("month", Types.Number)
@functionArg("day", Types.Number)
@documentFunction({
    description: "Constructs a Date for the year, month, and day specified",
    examples: [`SELECT  Date( 2010, 3, 24 )  FROM  dual`],
})
export class DateFunction extends IFunction {
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let row = options["row"];
        return evaluateRowOptionsFast(row, options, opts => {
            let date = new Date();
            let day = opts["day"];
            let month = opts["month"];
            let year = opts["year"];
            date.setFullYear(year, month, day);
            return date;
        });
    }

}

@declareFunction("GetYears")
@functionArg("row")
@functionArg("date", Types.Date)
@documentFunction({
    description: "Returns the year of the Date provided",
    examples: [`SELECT  GetYears( Date( 2010, 3, 24 ) )  FROM  dual`],
})
export class GetYearsFunction extends IFunction {

    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let row = options["row"];

        return evaluateRowOptionsFast(row, options, opts => {
            let date = <Date>opts["date"];
            return date.getFullYear();
        });
    }
}

@declareFunction("GetMonths")
@functionArg("row")
@functionArg("date", Types.Date)
@documentFunction({
    description: "Returns the month of the Date provided",
    examples: [`SELECT  GetMonths( Date( 2010, 3, 24 ) )  FROM  dual`],
})
export class GetMonthsFunction extends IFunction {
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let row = options["row"];

        return evaluateRowOptionsFast(row, options, opts => {
            let date = <Date>opts["date"];
            return date.getMonth();
        });
    }
}

@declareFunction("GetDays")
@functionArg("row")
@functionArg("date", Types.Date)
@documentFunction({
    description: "Returns the day of the Date provided",
    examples: [`SELECT  GetDays( Date( 2010, 3, 24 ) )  FROM  dual`],
})
export class GetDaysFunction extends IFunction {
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let row = options["row"];

        return evaluateRowOptionsFast(row, options, opts => {
            let date = <Date>opts["date"];
            return date.getDay();
        });
    }
}

@declareFunction("GetName", void 0, Types.String)
@functionArg("row")
@documentFunction({
    description: "Returns the name of the current row.",
    examples: [
        `set @table = Lattice( 'x = -5 to -3 step 1, y = 2 to 4 step 1' )
SELECT
	x,y,GetName()
FROM
	@table
GROUP BY
	x,
	y
  WITH ROLLUP`],
})
export class GetNameFunction extends IFunction {
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let row = <Row>options["row"];
        if (row == null)
            throw new Error("GetName() requires a row context");
        return row.name;
    }
}

@declareFunction("GetPath", void 0, Types.String)
@functionArg("row")
@documentFunction({
    description: "Returns the path name of each row in a table, beginning at the root level.",
    examples: [
        `SELECT
	x,
	y,
	GetPath(  )
FROM
	Lattice( 'x = 1 to 10 step 1, y = 1 to 10 step 1' )
GROUP BY
	x,
	y
WITH ROLLUP`],
})
export class GetPathFunction extends IFunction {
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let row = <Row>options["row"];
        if (row == null)
            throw new Error("GetPath() requires a row context");
        let names = [];
        while (row != null) {
            names.push(row.name);
            row = row.parent;
        }
        return "/" + names.reverse().join("/");
    }
}

@declareFunction("Rand", void 0, Types.Number)
@functionArg("row")
@documentFunction({
    description: "Returns a uniform pseudorandom number in (0, 1)",
    examples: [`SELECT rand() FROM dual`],
})
export class RandomFunction extends IFunction {
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        return Math.random();
    }
}

@declareFunction("ColumnTag")
@functionArg("row")
@functionArg("expr")
@functionArg("alias")
@functionArg("columnKey")
@functionArg("formatting")
@functionArg("note")
export class ColumnTagFunction extends IFunction {
    evalCall(
        row: Row,
        optionLookup: {
            [id: string]: (row: Row, cb: MqlCallback) => void;
        },
        context: IFunctionEvaluatorContext,
        cb: MqlCallback
    ): any {
        return void optionLookup["expr"](row, cb);
    }

    public eval() { throw new Error("not implemented"); }
}

//#region Vector functions

@declareFunction("Idx")
@functionArg("row")
@functionArg("vector", Types.Array)
@functionArg("index", Types.Number)
@documentFunction({
    description: "Returns the element in a vector with the supplied index. The index is 0 based.",
    remarks: ``,
    examples: [
        `set @v = StringVector( 'a', 'b', 'c' )

SELECT
    idx( @v, 1 )
FROM
    dual`],
})
export class VectorElementFunction extends IFunction {
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let row = options["row"];
        return evaluateRowOptionsFast(row, options, opts => {
            let vector = opts["vector"];
            let index = opts["index"];
            if (!Array.isArray(vector))
                throw new Error("Cannot index a non-vector type");
            if (index < 0 || index >= vector.length) {
                throw new Error("Vector Index out of bounds: " + index);
            }
            return vector[index];
        });
    }
}

// TODO: FloatVector -> Vector?
@declareFunction("FloatVectorFromTable", void 0, Types.Array)
@functionArg("row")
@functionArg("column", Types.String)
@functionArg("table", Types.Table)
@documentFunction({
    description: "Returns a vector from a specified column in a table",
    examples: [
        `set @table = Lattice( 'x = -5 to -3 step 1, y = 2 to 4 step 1' )
SELECT
	x,
	y,
	FloatVectorFromTable( 'x', @table )
FROM
	@table
GROUP BY
	1
WITH ROLLUP`],
})
export class FloatVectorFromTableFunction extends IFunction {
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let row = options["row"];
        return evaluateRowOptionsFast(row, options, opts => {
            let column = opts["column"];
            let table = <Table>opts["table"];
            let columnIdx = table.columnNames.indexOf(column);
            if (columnIdx === -1)
                throw new Error(`Column '${column}' not found on table`);

            let vec = Array(table.rows.length);
            for (let i = 0; i < table.rows.length; i++) {
                let val = table.rows[i].getValue(columnIdx);
                vec[i] = typeof val === "number" ? val : Number.NaN;
            }

            return vec;

        });
    }
}

@declareFunction("VectorSum", void 0, Types.Number)
@functionArg("row")
@functionArg("vector", Types.Array)
@documentFunction({
    description: "Returns the numeric sum of a vector",
    //     examples: [
    // `set @floatVector = FloatVector( 1, 2, 3, 4, 99, 16, 2 * 10 )
    // SELECT
    // 	VectorSum( @floatVector )
    // FROM
    // 	dual`],
})
export class SumVectorFunction extends IFunction {
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let row = options["row"];
        return evaluateRowOptionsFast(row, options, opts => {
            let vector: any[] = opts["vector"];
            return vector.reduce((r, n) => r + n, 0);
        });
    }
}

@declareFunction("SortVector", void 0, Types.Array)
@functionArg("row")
@functionArg("vector", Types.Array)
@functionArg("desc", Types.Boolean, false, "Whether to sort descending instead of ascending.")
@documentFunction({
    description: "Sorts a vector in ascending order, or descending if `desc` is true.",
    //     examples: [
    // `set @a = FloatVector( 1, 5, 2, 2, 77, 9, 16 )
    // SELECT
    // 	SortVector( @a )
    // FROM
    // 	dual`],
})
export class SortVectorFunction extends IFunction {
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let row = options["row"];
        return evaluateRowOptionsFast(row, options, opts => {
            let vector: any[] = opts["vector"];
            let desc: any = opts["desc"];
            return _.orderBy(vector, v => v, desc ? "desc" : "asc");
        });
    }
}

@declareFunction("Slice", void 0, Types.Array)
@functionArg("row")
@functionArg("vector", Types.Array)
@functionArg("start", Types.Number)
@functionArg("length", Types.Number, -1)
@documentFunction({
    description: "Returns a copy of the specified vector from the start index with the specified length.",
    //     examples: [
    // `set @a = FloatVector( 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 )
    // SELECT
    // 	slice( @a, 3, 4 )
    // FROM
    // 	dual`],
})
export class VectorSliceFunction extends IFunction {
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let row = options["row"];
        return evaluateRowOptionsFast(row, options, opts => {
            let vector: any[] = opts["vector"];
            let start: any = opts["start"];
            let length: any = opts["length"];
            return vector.slice(start, length !== -1 ? length : vector.length - start);
        });
    }
}

@declareFunction("Length", void 0, Types.Number)
@functionArg("row")
@functionArg("vector", Types.Array)
@documentFunction({
    description: "Returns the length of a specified vector.",
    examples: [
        `set @stringvector = StringVector( 'a', 'b', 'c', 'd', 'e', 'foo', 'bar' )
SELECT
	@stringvector,
	length( @stringvector )
FROM
	dual`],
})
export class LengthFunction extends IFunction {
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let row = options["row"];
        return evaluateRowOptionsFast(row, options, opts => {
            return opts["vector"].length;
        });
    }
}

@declareFunction("CallCount")
@functionArg("row")
export class CallCountFunction extends IFunction {
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let ctx = <any>context;
        if (!ctx.callCount)
            ctx.callCount = 0;
        return ++ctx.callCount;
    }
}

@declareFunction("FirstIndexWhere", void 0, Types.Number)
@functionArg("row")
@functionArg("vector", Types.Array)
@functionArg("pred", void 0, void 0, "MQL Function")
@functionArg("start", Types.Number, 0, "Optional start index")
@documentFunction({
    description: "Returns the first index of the given vector where the predicate is true.",
    examples: [
        `set @stringvector = StringVector( 'a', 'b', 'c', 'd', 'e', 'foo', 'bar' )
def @pred(@value) = @value = 'foo'
SELECT
    /* Returns the first index at or after the first index (startIndex = 0) where
    the value in the FloatVector was greater than 100. */
    FirstIndexWhere( @stringvector, @pred, 0)
FROM
    dual`],
})
export class FirstIndexWhereFunction extends IFunction {
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext, cb: MqlCallback): any {
        let row = options["row"];
        let start = options["start"] == null ? 0 : options["start"];
        let vector: any[] = options["vector"].slice(start);
        // TODO: better types?
        let pred = options["pred"] as (row: Row, args: MqlCallback[], cb: MqlCallback<boolean>) => void;
        const callbacks: ((cb: MqlCallback<boolean>) => void)[] = new Array(vector.length);
        for (let i = 0; i < vector.length; i++) {
            callbacks[i] = pred.bind(void 0, row, [(_row, cb) => cb(void 0, vector[i])]);
        }
        return void Callbacks.Reduce(callbacks, val => val.findIndex(i => !!i), cb);
    }
}

@declareFunction("SparklineBetweenDates")
@functionArg("row")
@functionArg("spark")
@functionArg("startDate")
@functionArg("endDate")
export class SparklineBetweenDatesFunction extends IFunction {
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let row = options["row"];
        return evaluateRowOptionsFast(row, options, opts => {
            let sl = opts["spark"];
            let start = opts["startDate"];
            let end = opts["endDate"];
            return sl.filter(([date]) => date >= start && date <= end);
        });
    }
}

@declareFunction("SparklineToDateVector")
@functionArg("row")
@functionArg("spark")
export class SparklineToDateVectorFunction extends IFunction {
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let row = options["row"];
        return evaluateRowOptionsFast(row, options, opts => {
            return opts["spark"].map((e: any) => e[0]);
        });
    }
}

@declareFunction("SparklineToFloatVector")
@functionArg("row")
@functionArg("spark")
export class SparklineToFloatVectorFunction extends IFunction {
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let row = options["row"];
        return evaluateRowOptionsFast(row, options, opts => {
            return opts["spark"].map((e: any) => e[1]);
        });
    }
}

@declareFunction("SparklineMultiply")
@functionArg("row")
@functionArg("multiplier", Types.Number)
@functionArg("spark")
@documentFunction({
    description: "Multiplies all of the values in a sparkline by a scalar."
})
export class SparklineMultiplyFunction extends IFunction {
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let row = options["row"];
        return evaluateRowOptionsFast(row, options, opts => {
            let mult = opts["multiplier"];
            return opts["spark"].map((e: any) => [e[0], mult * e[1]]);
        });
    }
}

@declareFunction("SparklineSum")
@functionArg("row")
@functionArg("spark")
export class SparklineSumFunction extends IFunction {
    public evalCall(
        row: Row,
        options: {
            [id: string]: (row: Row, cb: MqlCallback) => void;
        },
        context: IFunctionEvaluatorContext,
        done: MqlCallback
    ) {
        let sparkFunc = options["spark"];

        const callbacks: ((cb: MqlCallback) => void)[] = [];

        for (let irow of IterTools.filter(
                IterTools.dfs_iter([row], r => r.children),
                i => i.children.length === 0
            )
        ) {
            callbacks.push(sparkFunc.bind(void 0, irow));
        }

        return void Callbacks.All(callbacks, (err, sparklines) => {
            if (err) return void done(err);
            return void done(void 0, this.sumSparklines(sparklines));
        });
    }

    sumSparklines(sparklines: any[]) {
        let sums = new Map();
        for (let i = 0; i < sparklines.length; i++) {
            let spark = sparklines[i];
            for (let j = 0; j < spark.length; j++) {
                let date = spark[j][0].getTime();
                let val = spark[j][1];
                sums.set(date, val + (sums.get(date) || 0));
            }
        }
        return _.orderBy(Array.from(sums.keys()).map(key => [new Date(key), sums.get(key)]), e => e[0], "asc");
    }

    public eval() { throw Error("Not implemented"); }
}

@declareFunction("Ceiling", void 0, Types.Number)
@functionArg("row")
@functionArg("num", Types.Number)
@documentFunction({
    description: "Returns the smallest integer greater than or equal to the specified number.",
    examples: [
        `set @table = Lattice('x = 0 to 10 step 1')
set @PI = 3.14

/* If x is odd, return a negative multiple of pi. */
set @MultipleOfPi = ifelse(x%2=0, x*@PI, -x*@PI)

SELECT
	x,
	@MultipleOfPi as [Multiple of Pi],
	ceiling( @MultipleOfPi )
FROM
    @table`]
})
export class CeilingFunction extends IFunction {
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let row = options["row"];
        return evaluateRowOptionsFast(row, options, opts => {
            return Math.ceil(opts["num"]);
        });
    }
}

@declareFunction("Abs", void 0, Types.Number)
@functionArg("row", Types.Row)
@functionArg("num", Types.Number)
@documentFunction({
    description: "Returns the absolute value of a number",
    examples: [
        `SELECT
    x,
    abs(x)
FROM
    Lattice('x = -10 to 10 step 1')`]
})
export class AbsFunction extends IFunction {
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let row = options["row"];
        return evaluateRowOptionsFast(row, options, opts => {
            return Math.abs(opts["num"]);
        });
    }
}

@declareFunction("ChangeRowName")
@functionArg("row")
@functionArg("table", Types.Table)
@functionArg("func", void 0, void 0, "MQL Function expression")
@documentFunction({
    description: "Changes the row name of a table."
    // TODO: Examples
})
export class ChangeRowNameFunction extends IFunction {
    evalCall(
        row: Row,
        optionLookup: {
            [id: string]: (row: Row, cb: MqlCallback) => void;
        },
        context: IFunctionEvaluatorContext,
        cb: MqlCallback
    ): any {
        let func = optionLookup["func"];

        optionLookup["table"](row, (err, table) => {
            if (err) return cb(err);
            let rowsToChange = table.rows.length;
            if (rowsToChange === 0) return cb(void 0, table);
            for (let i = 0; i < table.rows.length; i++) {
                func(table.rows[i], (err, res) => {
                    if (err) return cb(err);
                    table.rows[i].setName(res);
                    rowsToChange--;
                    if (rowsToChange === 0) return cb(void 0, table);
                });
            }
        });

    }

    public eval() { throw Error( "not implemented" ); }
}

@declareFunction("GetOpenUnrealized")
@functionArg("row")
@functionArg("prices")
@functionArg("currentPrice")
@functionArg("quantity")
export class GetOpenUnrealizedFunction extends IFunction {

    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let row = options["row"];
        return evaluateRowOptionsFast(row, options, opts => {
            let prices = opts["prices"];
            let currentPrice = opts["currentPrice"];
            let quantity = opts["quantity"];
            if (!prices || !currentPrice || !quantity)
                return 0;
            if (prices.length === 0)
                throw new Error("No Prices");

            let avgPrice = prices[0];
            return (currentPrice - avgPrice) * quantity;

        });
    }
}

@declareFunction("DateTimeVectorFromTable", void 0, Types.Array)
@functionArg("row")
@functionArg("column", Types.String)
@functionArg("table", Types.Table)
@documentFunction({
    description: "Returns a DateTime vector from a specified column in a table.",
    //     examples: [
    // `set @Table = Explode( GenerateBondCashflows( CouponRate := 0.12, EffectiveDate := GetToday(  ), Face := 100, Frequency := 'Monthly', MaturityDate := '20130303', DayCountBasis := 'ACT_365' ) )
    // SELECT
    //   DateTimeVectorFromTable( 'Date', @Table )
    // FROM
    //   dual`],
})
export class DateTimeVectorFromTableFunction extends IFunction {
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let row = options["row"];
        return evaluateRowOptionsFast(row, options, opts => {
            let column = opts["column"];
            let table = <Table>opts["table"];
            let columnIdx = table.columnNames.indexOf(column);
            if (columnIdx === -1)
                throw new Error(`Column '${column}' not found on table`);

            let vec = Array(table.rows.length);
            for (let i = 0; i < table.rows.length; i++) {
                let val = table.rows[i].getValue(columnIdx);
                //Todo: Check what mql does when there are non-date literals
                vec[i] = Object.prototype.toString.call(val) === "[object Date]" ? val : null;
            }

            return vec;

        });
    }
}

@declareFunction("VectorsToSparkline")
@functionArg("row")
@functionArg("dates")
@functionArg("values")
export class VectorsToSparklineFunction extends IFunction {
    public eval(options: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let row = options["row"];
        return evaluateRowOptionsFast(row, options, opts => {
            let dates = opts["dates"];
            let values = opts["values"];

            if (!Array.isArray(dates) || !Array.isArray(values))
                throw new Error("VectorsToSparkline expects array inputs");
            if (dates.length !== values.length)
                throw new Error("Vector lengths don't match");

            //Todo: Validate types

            return dates.map((e, i) => [dates[i], values[i]]);
        });
    }
}

//#endregion

@declareFunction("AddComputedColumn", 2, Types.Table)
@functionArg("row")
@functionArg("table", Types.Table, void 0)
@functionArg("columns", Types.String, "", "Name of the column to add")
@functionArg("exprs", Types.String, "", "Stringified MQL column expression")
@documentFunction({
    description: "Adds one or more columns to a Table."
})
export class AddComputedColumnFunction extends IFunction {
    evalCall(
        row: Row,
        optionLookup: {
            [id: string]: (row: Row, cb: MqlCallback) => void;
        },
        context: IFunctionEvaluatorContext,
        cb: MqlCallback
    ): any {
        const exprs = optionLookup["exprs"] as any as ((row: Row, cb: MqlCallback) => void)[];
        // TODO: Varargs typing
        const columns = (optionLookup["columns"] as any as ((row: Row, cb: MqlCallback) => void)[])
            .map(i => i.bind(void 0, row) as ((cb: MqlCallback) => void));
        const table = optionLookup["table"].bind(void 0, row) as (cb: MqlCallback<Table>) => void;
        return void Callbacks.All([table, ...columns], (err, [table, ...columns]) => {
            if (err) return void cb(err);
            const newTable = table.copyTable() as Table;
            const oldColumns = table.columnNames;
            newTable.setColumns(oldColumns.concat(columns));

            let values = new Array(newTable.rows.length);

            const callbacks = new Array(newTable.rows.length);

            for (let i = 0; i < newTable.rows.length; i++) {
                values[i] = Array(columns.length);
                let rowCopy = newTable.rows[i];
                const rowCbs = new Array(columns.length);
                for (let j = 0; j < columns.length; j++) {
                    const expr = exprs[j];
                    rowCbs[j] = expr.bind(void 0, rowCopy);
                }
                callbacks[i] = Callbacks.Reduce.bind(void 0, rowCbs, (exprs: any[]) => {
                    for (let j = 0; j < columns.length; j++) {
                        rowCopy.setValue(j + oldColumns.length, exprs[j]);
                    }
                });
            }

            return void Callbacks.All(callbacks, (err) => {
                if (err) return void cb(err);
                return cb(void 0, newTable);
            });
        });
    }

    public eval() { throw Error("Not implemented"); }
}

@declareFunction("Cache")
@functionArg("row")
@functionArg("key", Types.String)
@functionArg("value")
@documentFunction({
    description: "Caches a variable based on an identifier acting as the key.",
    remarks: `
Only evaluates the second argument if the key cannot be found. Caches expression
only for lifetime of the query. Key is shared between columns in the same query,
but not between a query and its subqueries.`,
    examples: [`SELECT
cache ( 'testcache0001', 'test1' ) as test1,
cache ( 'testcache0001', 'test2' ) as test2,
ScalarSubselect ( 'select cache(''testcache0001'', ''test3'') as test3 from dual' ) as test3
FROM dual`]
})
export class MqlCacheFunction extends IFunction {
    evalCall(
        row: Row,
        optionLookup: {
            [id: string]: (row: Row, cb: MqlCallback) => void;
        },
        context: IFunctionEvaluatorContext,
        cb: MqlCallback
    ): any {
        return void optionLookup["key"](row, async (err, key) => {
            if (err) return cb(err);
            if (!key || key.length < 1)
                return cb(new Error("Cache key cannot be empty"));

            key = typeof key !== "string" ? key.toString() : key;
            key = key.replace(/[\\\/]/g, "");

            let ctx = <any>context;
            //Todo: This should be per query. Sub queries shouldn't share the same cache.
            let cache: Cache<string, unknown> = ctx.cache || (ctx.cache = new Cache<string, unknown>());

            let lock = await StartTimingAsync("Cache_lock", () => cache.lock(key, true));

            if (cache.has(key)) {
                // We don't need the write lock, throw it out.
                lock.release();
                // Further, since we know the cache won't change under us synchronously,
                // we won't need a read lock either. So we can do a non-blocking read.
                const val = cache.get(key, false);
                lock.release();
                return cb(void 0, val);
            }

            optionLookup["value"](row, (err, value) => {
                if (err) {
                    lock.release();
                    return cb(err);
                }
                cache.put(key, value, true, lock.lockId);
                lock.release();
                return cb(void 0, value);
            });
        });
    }

    public eval() { throw Error("not implemented"); }
}

let workerCache = new Map();

@declareFunction("WorkerCache")
@functionArg("row")
@functionArg("key")
@functionArg("value")
export class WorkerCacheFunction extends IFunction {
    evalCall(
        row: Row,
        optionLookup: {
            [id: string]: (row: Row, cb: MqlCallback) => void;
        },
        context: IFunctionEvaluatorContext,
        cb: MqlCallback
    ): any {
        optionLookup["key"](row, (err, key) => {
            if (err) return cb(err);
            if (!key || key.length < 1)
                return cb(new Error("Cache key cannot be empty"));

            key = typeof key !== "string" ? key.toString() : key;
            key = key.replace(/[\\\/]/g, "");

            let cache = workerCache;

            if (cache.has(key)) {
                return cb(void 0, cache.get(key));
            }

            optionLookup["value"](row, (err, value) => {
                if (err) return cb(err);
                cache.set(key, value);
                return cb(void 0, value);
            });
        });
    }

    public eval() { throw Error("not implemented"); }
}

@declareFunction("IfElse", 1)
@functionArg("row")
@functionArg("condition")
@functionArg("then")
@functionArg("elseOrCondition")
@documentFunction({
    description: "Evaluates one or more conditions and returns the value for the" +
        " first matching condition (or the elseValue if all conditions are false).",
    examples: [
        `set @table = <<csv
Country,Continent,IncomeClassification,GDPPerCapita,InfantMortalityRate
US, North America, High, 49965, 7
Rwanda, Africa, Low, 620, 55
India, Asia, Lower Middle, 1489, 56
Chile, South America, Upper Middle, 15356, 9
Turkey, Europe, Upper Middle, 10666, 14
Ukraine, Europe, Lower Middle, 3867, 11
Haiti, North America, Low, 771, 76
csv

SELECT
	Country,
	Continent,
	IncomeClassification as [World Bank Income Classification],
	GDPPerCapita as [GDP Per Capita],
	InfantMortalityRate as [Infant Mortality Rate per 1,000 Births],
	ifelse( IncomeClassification = 'Low', InfantMortalityRate, 'Does not have "Low" Income Classification' ) as [Low Income Class Infant Mortality],
	ifelse( Continent = 'North America', GDPPerCapita, Continent = 'Europe', GDPPerCapita, 'Country not in North America or Europe') as [GDP Per Capita of Countries in North America and Europe],
	ifelse( InfantMortalityRate > 20, GDPPerCapita, null) as [GDP Per Capita of Countries with an Infant Mortality Rate > 20]
FROM
	CsvToTable( @table )`],
})
export class MqlIfElseFunction extends IFunction {
    evalCall(
        row: Row,
        optionLookup: {
            [id: string]: (row: Row, cb: MqlCallback) => void;
        },
        context: IFunctionEvaluatorContext,
        cb: MqlCallback
    ): any {
        const condition = optionLookup["condition"];
        let thenFunc = optionLookup["then"];
        // TODO: Add typing for variable args
        // or possibly change the signature
        let elsesFuncs = optionLookup["elseOrCondition"] as any as ((row: Row, cb: MqlCallback) => void)[];

        if (elsesFuncs.length % 2 !== 1) cb(new Error("Missing else expression"));

        return condition(row, (err, res) => {
            if (err) return cb(err);

            if (res) return thenFunc(row, cb);

            let nextElseIf = (elses: typeof elsesFuncs): any => {
                let elseIf = elses.shift();
                if (elses.length === 0)
                    return elseIf(row, cb);

                return elseIf(row, (err, elseif) => {
                    if (err) return cb(err);

                    let then = elses.shift();
                    if (elseif) return then(row, cb);

                    return nextElseIf(elses);
                });
            };
            return nextElseIf(elsesFuncs);
        });
    }

    public eval() { throw Error("not implemented"); }
}

@declareFunction("Delay")
@functionArg("row")
@functionArg("ms", Types.Number, 100)
@documentFunction({
    description: "Delay execution until some number of ms have passed.",
    examples: [`SELECT delay(100) FROM dual`]
})
export class MqlDelayFunction extends IFunction {
    public eval(options: { [id: string]: any }, context: IFunctionEvaluatorContext) {
        const row = options["row"];
        return evaluateRowOptionsFast(row, { ms: options["ms"] }, async (args: { [id: string]: any }) => {
            await AsyncTools.wait(+args["ms"]);
            return null;
        });
    }
}

//#region Example Ticking functions

//#endregion
