import { Type, Types } from "@mavenomics/coreutils";

export interface IMqlFunctionMetadata {
    functionName: string;
    functionArgs: FunctionArgument[];
    functionRepeatingArgs: number;
    returnType: Type;
    returnDescription: string;
    description: string;
    remarks: string;
    examples: string[];
}

export function declareFunction(
    name: string = void 0,
    repeatingArgs: number = 0,
    returnType: Type = Types.Any,
    returnDescription?: string
) {
    return function (target: any) {
        if (void 0 === name) {
            name = target.name;
        }
        target.functionName = name;
        target.functionRepeatingArgs = repeatingArgs;
        target.functionArgs = target.functionArgs || [];
        target.returnType = returnType;
        target.returnDescription = returnDescription;
        target.description = target.description || "";
        target.remarks = target.remarks || "";
        target.examples = target.examples || [];
    };
}

export function functionArg(name: string = null, type: Type = Types.Any, defValue: any = void 0, description?: string) {
    return function (target: any) {
        let parameters = target.functionArgs || (target.functionArgs = []);
        //decorators are executed bottom up.
        //using unshift instead of push allows for us to have decorators defined top down for arguments.
        parameters.unshift(new FunctionArgument(name, defValue, type, description));
    };
}

export function documentFunction({
    description= "",
    remarks= "",
    examples= []}: {description?: string, remarks?: string, examples?: string[]}
) {
    return function (target: any) {
        target.description = description;
        target.remarks = remarks;
        target.examples = examples;
    };
}

export class FunctionArgument {
    public static fromJson(obj: any): FunctionArgument {
        return new FunctionArgument(
            obj.name,
            obj.defaultValue,
            Types.findType(obj.typeName) || Types.Any
        );

    }

    name: string;
    defaultValue: any;
    type: Type;
    description?: string;

    constructor(name: string, defaultValue: any, type: Type, description?: string) {
        this.name = name;
        this.defaultValue = defaultValue;
        this.type = type;
        this.description = description;
    }

    toJson(): any {
        return {
            name: this.name,
            defaultValue: this.defaultValue,
            typeName: this.type.name
        };
    }
}

export class FunctionInfo {
    public static fromJson(obj: any): FunctionInfo {
        return new FunctionInfo(
            obj.name,
            obj.args.map(FunctionArgument.fromJson),
            obj.repeatingArgs,
            Types.findType(obj.returnTypeName) || Types.Any
        );
    }

    name: string;
    args: FunctionArgument[];
    repeatingArgs = 0;
    returnType: Type;

    constructor(name: string, args: FunctionArgument[], repeatingArgs: number, returnType: Type) {
        this.name = name;
        this.args = args;
        this.repeatingArgs = repeatingArgs;
        this.returnType = returnType;
    }

    toJson(): any {
        return {
            name: this.name,
            args: this.args.map(a => a.toJson()),
            repeatingArgs: this.repeatingArgs,
            returnTypeName: this.returnType.name,
        };
    }
}

export function VerifyPositionalArgumentTypes(args: Type[], func: FunctionInfo) {
    let required = func.args.length - func.repeatingArgs;

    //Todo: Currently we don't support evaluating functions with default args
    if (func.repeatingArgs === 0 && args.length !== func.args.length)
        throw new Error(`Function '${func.name}' argument count mismatch. ` +
            `Expected '${func.args.length}', got '${args.length}'.`);


    if (func.repeatingArgs > 0 && ((args.length - required) % func.repeatingArgs) !== 0)
        throw new Error(`Function '${func.name}' invalid number of repeating arguments.`);

    //First create an empty array for every repeating arg
    //This is to handle the case where no repeating arguments are passed
    //Functions expect repeating args to be an empty array instead of null.
    for (let i = 0; i < required && i < args.length; i++) {
        if (!args[i].isInstanceOf(func.args[i].type))
            throw new Error(`Function '${func.name}' argument '${i}' type ` +
                `mismatch. Expected '${func.args[i].type.name}', got '${args[i].name}'.`);
    }
    for (let i = required; i < args.length; i++) {
        let repeatIdx = (i - required) % func.repeatingArgs;
        let paramType = func.args[required + repeatIdx].type;
        if (!args[i].isInstanceOf(paramType))
            throw new Error(`Function '${func.name}' argument '${i}' type ` +
                `mismatch. Expected '${paramType.name}', got '${args[i].name}'.`);
    }

    return args;
}

export function PositionalToKeyValue(func: FunctionInfo, pos: any[]): any {
    let required = func.args.length - func.repeatingArgs;
    let args: any = {};

    if (func.repeatingArgs === 0 && pos.length > func.args.length)
        throw new Error(`Function '${func.name}' argument count mismatch. ` +
            `Expected '${func.args.length}', got '${pos.length}'.`);

    for (let i = 0; i < required && i < pos.length; i++) {
        let name = func.args[i].name;
        args[name] = pos[i];
    }
    for (let i = pos.length; i < required; i++) {
        let name = func.args[i].name;
        // HACK: wrap the default in a callback
        args[name] = (_row, cb) => cb(void 0, func.args[i].defaultValue);
    }

    if (func.repeatingArgs > 0 && ((pos.length - required) % func.repeatingArgs) !== 0)
        throw new Error(`Function '${func.name}' invalid number of repeating arguments.`);

    //First create an empty array for every repeating arg
    //This is to handle the case where no repeating arguments are passed
    //Functions expect repeating args to be an empty array instead of null.
    for (let i = required; i < func.args.length; i++) {
        let name = func.args[i].name;
        args[name] = [];
    }
    for (let i = required; i < pos.length; i++) {
        let repeatIdx = (i - required) % func.repeatingArgs;
        let name = func.args[required + repeatIdx].name;
        let arr = args[name];
        arr.push(pos[i]);
    }

    return args;
}
