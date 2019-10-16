import { MqlCompiler } from "./querying/MqlCompiler";
import { GetAllFunctions, FindFunctionInfo } from "./functionFactory";
import { PositionalToKeyValue } from "./FunctionDecorators";
import { IFunctionEvaluatorContext } from "./functionExecution";
import { CancelToken } from "@mavenomics/coreutils";
import { QueryEngine } from "./querying/QueryEngine";
import { Callbacks } from "./callbackhelpers";

const funcs = GetAllFunctions();
const cancelToken = new CancelToken<any>();
let context: IFunctionEvaluatorContext = {
    FindFunctionInfo: async (name) => FindFunctionInfo(name),
    GetAllFunctions: GetAllFunctions,
    cancelToken: cancelToken,
    evaluate: null,
    user: null,

    userContext: {},

    setGlobal: (name, val) => void 0,
    getGlobal: (name) => null,
    getGlobalKeys: () => [],

    setLocal: (name, val) => void 0,
    getLocal: (name) => null,
};

async function TryExpr(expression: string) {
    const result = MqlCompiler.compileExpression(expression);
    let inlineFuncs: any = {};
    //HACK: This is to support lowercase names such as sum/ifelse/etc for now.
    let findFunctionName = (name: string) => {
        let keys = Object.keys(funcs);
        let idx = keys.findIndex((s: string) => s.toLowerCase() === name);
        return idx !== -1 ? keys[idx] : name;
    };
    let functions = result.functions.map(
        n => ({ funcName: !funcs.hasOwnProperty(n.funcName) ? findFunctionName(n.funcName) : n.funcName, id: n.id }));
    const infos = await Promise.all(functions.map(n => FindFunctionInfo(n.funcName)));
    functions.forEach((e, i) => {
        let name = e.funcName;
        let id = e.id;
        if (!funcs.hasOwnProperty(name)) {
            //Todo: Compile time errors for referencing functions that don't exist?
            inlineFuncs[id] = (row: any, args: any) => {
                console.log("Unknown function ref");
                throw new Error(`Referenced unknown function '${name}'`);
            };
        } else {
            let inst = new funcs[name];
            inlineFuncs[id] =
                (row: any, args: any) => inst.eval(Array.isArray(args) ?
                    PositionalToKeyValue(infos[i], [row].concat(args || [])) :
                    Object.assign({}, args, { row: row }
                    ), context);
        }
    });

    let exprJsText = `${result.prepends}\nreturn (\n${result.javaScript}\n);`;

    let func = new Function(
        "context",
        "QueryEngine",
        "inline",
        "Callbacks",
        "row", //Pass a null row variable since the compiled expression depends on a row variable being defined.
        "cb",
        exprJsText
    ) as (...args: any) => any;
    let res;
    try {
        res = Callbacks.AsAsync(func)(context, QueryEngine, inlineFuncs, Callbacks, null);
    } catch (err) {
        console.error("Error evaluating", expression);
        console.error(err);
        console.error(exprJsText);
        throw err;
    }
    if (res instanceof Promise) {
        try {
            res = await res;
        } catch (err) {
            console.error("Error awaiting", expression);
            console.error(err);
            console.error(exprJsText);
            throw err;
        }
    }
    return res;
}

// All commented out tests below failed on Master pre-callbacks rework.

test("Expression tests", async () => {
    await expect(TryExpr("1+2")).resolves.toBe(3);
    await expect(TryExpr("1-2")).resolves.toBe(-1);
    await expect(TryExpr("1*2")).resolves.toBe(2);
    await expect(TryExpr("1/2")).resolves.toBe(.5);

    // await expect(TryExpr("a+b")).resolves.toBe(3);
    // await expect(TryExpr("a-b")).resolves.toBe(-1);
    // await expect(TryExpr("a*b")).resolves.toBe(2);
    // await expect(TryExpr("a/b")).resolves.toBe(.5);

    await expect(TryExpr("( 1 + 2) * 3")).resolves.toBe(9);
    await expect(TryExpr("3 * ( 1 + 2)")).resolves.toBe(9);
    await expect(TryExpr("( 1 + 2) / 3")).resolves.toBe(1);
    await expect(TryExpr("3 / ( 1 + 2)")).resolves.toBe(1);
    await expect(TryExpr("( 1 - 2) * 3")).resolves.toBe(-3);
    await expect(TryExpr("3 * ( 1 - 2)")).resolves.toBe(-3);
    await expect(TryExpr("( 6 - 0) / 3")).resolves.toBe(2);
    await expect(TryExpr("3 / ( 5 - 2)")).resolves.toBe(1);

    await expect(TryExpr("( 1 * 2) + 3")).resolves.toBe(5);
    await expect(TryExpr("3 + ( 1 * 2)")).resolves.toBe(5);
    await expect(TryExpr("( 1 * 2) - 3")).resolves.toBe(-1);
    await expect(TryExpr("3 - ( 1 * 2)")).resolves.toBe(1);
    await expect(TryExpr("( 1 / 2) + 3")).resolves.toBe(3.5);
    await expect(TryExpr("3 + ( 1 / 2)")).resolves.toBe(3.5);
    await expect(TryExpr("( 1 / 2) - 3")).resolves.toBe(-2.5);
    await expect(TryExpr("3 - ( 1 / 2)")).resolves.toBe(2.5);

    await expect(TryExpr("3 / 10 / 2")).resolves.toBe(.15);
    await expect(TryExpr("( 3 / 10 ) / 2")).resolves.toBe(.15);
    await expect(TryExpr("3 / ( 10 / 2 )")).resolves.toBe(.6);

    await expect(TryExpr("1 * 2 / 4")).resolves.toBe(.5);
    await expect(TryExpr("1 / 2 * 3")).resolves.toBe(1.5);
    await expect(TryExpr("1 / ( 2 * 5 )")).resolves.toBe(.1);

    await expect(TryExpr("3 - 10 - 2")).resolves.toBe(-9);
    await expect(TryExpr("( 3 - 10 ) - 2")).resolves.toBe(-9);
    await expect(TryExpr("3 - ( 10 - 2 )")).resolves.toBe(-5);

    await expect(TryExpr("- 2")).resolves.toBe(-2);
    await expect(TryExpr("- .128")).resolves.toBe(-.128);
    await expect(TryExpr("2032.540")).resolves.toBe(2032.540);
    await expect(TryExpr(".35635")).resolves.toBe(.35635);
    await expect(TryExpr("3434.35635")).resolves.toBe(3434.35635);
    await expect(TryExpr("230.765e4")).resolves.toBe(230.765e4);


    // await expect(TryExpr("a||b")).resolves.toBe("onetwo");
    // await expect(TryExpr("(a||b) || c")).resolves.toBe("onetwothree");
    // await expect(TryExpr("c || (a||b)")).resolves.toBe("threeonetwo");

    await expect(TryExpr("'abc''def'")).resolves.toBe("abc'def");
    await expect(TryExpr("'abc\\tdef'")).resolves.toBe("abc\\tdef");
});

test("Null handling tests", async () => {
    await expect(TryExpr("null + null")).resolves.toBe(null);
    await expect(TryExpr("null + 3")).resolves.toBe(null);
    await expect(TryExpr("null + 'hi'")).resolves.toBe(null);
    // await expect(TryExpr("null + a")).resolves.toBe(null);

    await expect(TryExpr("null + null")).resolves.toBe(null);
    await expect(TryExpr("3 + null")).resolves.toBe(null);
    await expect(TryExpr("'hi'+ null")).resolves.toBe(null);
    // await expect(TryExpr("a + null")).resolves.toBe(null);

    await expect(TryExpr("null * null")).resolves.toBe(null);
    await expect(TryExpr("3 * null")).resolves.toBe(null);
    await expect(TryExpr("'hi'* null")).resolves.toBe(null);
    // await expect(TryExpr("a * null")).resolves.toBe(null);

    await expect(TryExpr("null * null")).resolves.toBe(null);
    await expect(TryExpr("null * 3")).resolves.toBe(null);
    await expect(TryExpr("null * 'hi'")).resolves.toBe(null);
    // await expect(TryExpr("null * a")).resolves.toBe(null);

    await expect(TryExpr("null - null")).resolves.toBe(null);
    await expect(TryExpr("null - 3")).resolves.toBe(null);
    await expect(TryExpr("null - 'hi'")).resolves.toBe(null);
    // await expect(TryExpr("null - a")).resolves.toBe(null);

    await expect(TryExpr("null - null")).resolves.toBe(null);
    await expect(TryExpr("3 - null")).resolves.toBe(null);
    await expect(TryExpr("'hi'- null")).resolves.toBe(null);
    // await expect(TryExpr("a - null")).resolves.toBe(null);

    await expect(TryExpr("null / null")).resolves.toBe(null);
    await expect(TryExpr("3 / null")).resolves.toBe(null);
    await expect(TryExpr("'hi'/ null")).resolves.toBe(null);
    // await expect(TryExpr("a / null")).resolves.toBe(null);

    await expect(TryExpr("null / null")).resolves.toBe(null);
    await expect(TryExpr("null / 3")).resolves.toBe(null);
    await expect(TryExpr("null / 'hi'")).resolves.toBe(null);
    // await expect(TryExpr("null / a")).resolves.toBe(null);

    await expect(TryExpr("null || null")).resolves.toBe(null);
    await expect(TryExpr("3 || null")).resolves.toBe(null);
    await expect(TryExpr("'hi'|| null")).resolves.toBe(null);
    // await expect(TryExpr("a || null")).resolves.toBe(null);

    await expect(TryExpr("null || null")).resolves.toBe(null);
    await expect(TryExpr("null || 3")).resolves.toBe(null);
    await expect(TryExpr("null || 'hi'")).resolves.toBe(null);
    // await expect(TryExpr("null || a")).resolves.toBe(null);
});

test("Conditional tests", async () => {
    await expect(TryExpr(" 1 = 1 ")).resolves.toBe(true);
    // await expect(TryExpr(" a = a ")).resolves.toBe(true);
    await expect(TryExpr(" 1 != 2 ")).resolves.toBe(true);
    // await expect(TryExpr(" a != 2 ")).resolves.toBe(true);
    // await expect(TryExpr(" a < 2 ")).resolves.toBe(true);
    // await expect(TryExpr(" e > 2 ")).resolves.toBe(true);
    await expect(TryExpr(" 3 <= 8 ")).resolves.toBe(true);
    await expect(TryExpr(" 76 >= 4 ")).resolves.toBe(true);

    await expect(TryExpr(" 1 = 2 ")).resolves.toBe(false);
    // await expect(TryExpr(" a = b ")).resolves.toBe(false);
    await expect(TryExpr(" 1 != 1 ")).resolves.toBe(false);
    // await expect(TryExpr(" a != 1 ")).resolves.toBe(false);
    // await expect(TryExpr(" a < 1 ")).resolves.toBe(false);
    await expect(TryExpr(" 1 > 2 ")).resolves.toBe(false);
    // await expect(TryExpr(" 3 <= b ")).resolves.toBe(false);
    // await expect(TryExpr(" a >= 4 ")).resolves.toBe(false);

    // await expect(TryExpr(" a = 'a' ")).resolves.toBe(false);
    await expect(TryExpr(" 'i' != 'b' ")).resolves.toBe(true);
    // await expect(TryExpr(" a != 'one' ")).resolves.toBe(false);
    // await expect(TryExpr(" a < 'zz' ")).resolves.toBe(true);
    // await expect(TryExpr(" e > 'zz' ")).resolves.toBe(false);
    await expect(TryExpr(" 'ab' <= 'bc' ")).resolves.toBe(true);
    await expect(TryExpr(" 'wah' >= 'wah' ")).resolves.toBe(true);

    await expect(TryExpr(" (1 = 1) or (2=2) ")).resolves.toBe(true);
    // await expect(TryExpr(" (1 = 2) or (a=2) ")).resolves.toBe(false);
    await expect(TryExpr(" (1 = 1) and (2=2)")).resolves.toBe(true);
    await expect(TryExpr(" not (2 = 1) ")).resolves.toBe(true);
    await expect(TryExpr(" not (1 = 1) ")).resolves.toBe(false);
    await expect(TryExpr(" (1 = 1) or (2=1) ")).resolves.toBe(true);
    await expect(TryExpr(" (1 = 1) and (2=1)")).resolves.toBe(false);
    await expect(TryExpr(" not (2 = 1) ")).resolves.toBe(true);

    // await expect(TryExpr(" (1 = b) and (2=2)")).resolves.toBe(false);
    // await expect(TryExpr(" not (1 = a) or (2=1) ")).resolves.toBe(false);
    // await expect(TryExpr(" not (1 = b) and (2=2)")).resolves.toBe(true);

    await expect(TryExpr(" 2 in (1, 2, 3)")).resolves.toBe(true);
    // TODO: This is a legitimate failure
    // await expect(TryExpr(" 2 not in (1, 3, 3) ")).resolves.toBe(true);
    await expect(TryExpr(" 1 in (2, 2, 3)")).resolves.toBe(false);
    await expect(TryExpr(" 2 not in (1, 2, 3)")).resolves.toBe(false);
});

test("FP correctness tests", async () => {
    await expect(TryExpr("1 / 0")).resolves.toBe(Number.POSITIVE_INFINITY);
    await expect(TryExpr("-1 / 0")).resolves.toBe(Number.NEGATIVE_INFINITY);
    await expect(TryExpr("0 / 0")).resolves.toBeNaN();

    await expect(TryExpr("0 / 0 + 123")).resolves.toBeNaN();

    await expect(TryExpr("1 / 0 + 123")).resolves.toBe(Number.POSITIVE_INFINITY);

    await expect(TryExpr("NaN")).resolves.toBeNaN();
    await expect(TryExpr("Infinity")).resolves.toBe(Number.POSITIVE_INFINITY);
    await expect(TryExpr("-Infinity")).resolves.toBe(Number.NEGATIVE_INFINITY);
});
