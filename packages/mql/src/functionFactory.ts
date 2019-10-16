import { IFunction } from "./Function";
import * as functions from "./BuiltinFunctionList";
import { FunctionInfo } from "./FunctionDecorators";
import { Types } from "@mavenomics/coreutils";

let functionLookup: { [id: string]: any } = {};

export function RegisterFunction(name: string, func: any): void {
    functionLookup[name] = func;
}

export async function FunctionFactory(name: string): Promise<IFunction> {
    let funcs = await GetAllFunctions();
    let func = funcs[name];
    if (func == null)
        throw new Error("Unknown function: " + name);
    return new func;
}

export async function GetAllFunctions() {
    return Object.assign({}, functionLookup);
}

//Todo: Cache the functions
//This returns IFunction constructor wrappers for UDFs which allows us to use
//UDFs in a similar manner to built-in functions.


export async function FindFunctionInfo(name: string): Promise<FunctionInfo> {
    let func = functionLookup[name];
    if (func != null && func.functionName != null && func.functionArgs != null && func.returnType != null)
        return new FunctionInfo(func.functionName, func.functionArgs, func.functionRepeatingArgs, func.returnType);

    if (func != null) {
        //Todo: This is temporary while we still allow functions that aren't annotated.
        console.warn("DEPRECATION WARNING: Functions without annotations are " +
            "deprecated and may be removed at a later time",
            "\n\tFunction name:", name);
        return new FunctionInfo(name, [], 0, Types.Any);
    }
    return null;
}

export function GetFunctionList(): Promise<string[]> {
    return GetAllFunctions().then(funcs => Object.keys(funcs));
}

export function GetBuiltinFunctionInfo(): Promise<FunctionInfo[]> {
    return Promise.all(Object.keys(functionLookup).map(i => FindFunctionInfo(i)));
}

let funcs: {[name: string]: IFunction & {functionName: string, prototype: any}} = functions as any;

for (let key in functions) {
    // if (funcs[key] instanceof IFunction) {
        RegisterFunction(funcs[key].functionName || key, funcs[key]);
    // }
}
