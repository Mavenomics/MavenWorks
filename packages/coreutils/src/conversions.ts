import { Type, Types } from "./builtin";

// Everything except value is metadata.
export interface JSONObject {
    typeName: string;
    value: any;
    cacheGuid?: string;
}

export abstract class Converter<T = any> {
    public static type: Type;

    abstract canConvertFrom(srcType: Type): boolean;

    abstract convertFrom(obj: any, srcType: Type): any;

    abstract serialize(obj: T): any;

    abstract deserialize(obj: any): T;

    //Todo: This should probably be handled by a separate generic transform class.
    canStringify(): boolean {
        return false;
    }

    toString(obj: T): string {
        return "" + obj;
    }

    //returns undefined on a bad input
    //Todo: Maybe change to return either an object or an error for more fine-grained errors
    tryFromString(str: string): T | null {
        throw new Error("Not Implemented");
    }

    //throws an error on a bad input
    // noinspection JSUnusedGlobalSymbols
    fromString(str: string): T | never {
        let result = this.tryFromString(str);
        if (result === void 0)
            throw new Error("Invalid input string: " + str);
        return result!;
    }

    abstract isValid(obj: object): boolean;

    abstract inferInstanceOf(obj: any): number;
}

/** This class includes sensible no-op stubs for all the functions of Converter.
 * Suitable for instances where you just want to define serialize/deserialize,
 * subtype conversion, and that's it. */
export abstract class PartialConverter<T> extends Converter {
    public static type: Type;

    public abstract serialize(obj: any): any;
    public abstract deserialize(obj: any): T;

    // This class includes a simplistic conversion. Override it if you have more you can do.
    public convertFromSuperType(obj: any) {
        if (obj.constructor.name === (<Function & {type: Type}>this.constructor).type.serializableName) {
            return obj;
        }
        return void 0;
    }

    // naive isValid
    public isValid(obj: any) {
        return this.inferInstanceOf(obj) > 0;
    }

    // Implementors should not override these functions. If you find yourself doing so,
    // use the regular Converter
    public canConvertFrom(srcType: Type) {
        return (<Function & {type: Type}>this.constructor).type.isInstanceOf(srcType);
    }

    public convertFrom(obj: any, srcType: Type) {
        if (this.canConvertFrom(srcType)) {
            return this.convertFromSuperType(obj);
        }
    }
}

// This is meant to be a no-op default and will warn anytime it's used
export class DefaultConverter extends PartialConverter<any> {
    public static type = Types.Any;

    public serialize(obj: any): any {
        console.warn("DATATYPE WARNING: Default no-op converter used. This may " +
        "result in data loss. Check type annotations");
        return obj;
    }

    public deserialize(obj: any): any {
        console.warn("DATATYPE WARNING: Default no-op converter used. This may result in data loss");
        return obj;
    }

    public inferInstanceOf(obj: any): number {
        return 0.1;
    }
}
export class StringConverter extends Converter<string|String> {
    public static type = Types.String;

    private static isPrimitive(obj: string|String): obj is string {
        return (typeof obj === "string");
    }

    isValid(obj: Object): boolean {
        return obj == null || typeof obj === "string";
    }
    canStringify(): boolean {
        return true;
    }

    tryFromString(str: string) {
        return str;
    }

    canConvertFrom(srcType: Type): boolean {
        return true;
    }

    convertFrom(obj: any, srcType: Type) {
        //Todo: We should use the type's string transformer(not implemented as of writing this)
        return obj != null ? obj.toString() : "null";
    }

    toString(obj: string) {
        return obj;
    }

    serialize(obj: string|String) {
        return "" + obj;
    }

    deserialize(obj: string | {val: string, boxed: boolean}) {
        return typeof obj === "string" ? obj : obj.val;
    }

    inferInstanceOf(obj: any): number {
        return (StringConverter.isPrimitive(obj) || obj instanceof String) ? 1.0 : -1.0;

    }
}
export class ObjectConverter extends Converter<object> {
    public static type = Types.Object;
    isValid(obj: object): boolean {
        return true;
    }

    canConvertFrom(srcType: Type): boolean {
        return true;
    }

    convertFrom(obj: any, srcType: Type) {
        return obj;
    }

    serialize(obj: object): object {
        // no handling for prototype chains.
        return obj;
    }

    deserialize(obj: object) {
        return obj;
    }

    inferInstanceOf(obj: any): number {
        // things that are objects might still fail this check, like funky arrays
        return (typeof obj === "object") ? 1.0 : 0.0;
    }
}
export class ArrayConverter extends PartialConverter<any[]> {
    public static type = Types.Array;

    public serialize(obj: any[]) {
        return obj.map(value => Converters.serialize(value, Converters.inferType(value)));
    }

    public deserialize(obj: JSONObject[]) {
        // ensure that this is of the current context's Array
        return Array.from(obj).map(iobj => Converters.deserialize(iobj));
    }

    public inferInstanceOf(obj: any): number {
        if (typeof window !== "undefined" && (<any>window).useDevMode) {
            console.assert(Array.isArray(obj) === (obj instanceof Array),
                "Cross-frame prototype leak detected! Data is being passed " +
                "between JS contexts without proper serialization. " +
                "This can lead to undefined behavior in the framework. " +
                "Details: \n\tisArray:", Array.isArray(obj), "\n\tinstanceOf:",
                obj instanceof Array);
        }
        // we explicitly don't use Array.isArray because cross-context leaking is a bug.
        return obj instanceof Array ? 1.0 : -1.0;
    }
}
export class DateConverter extends Converter<Date> {
    public static type = Types.Date;
    isValid(obj: Object): boolean {
        return obj == null || obj.constructor.name === "Date";
    }

    canConvertFrom(srcType: Type): boolean {
        return false; //Todo: Support converting from DateTime
    }

    convertFrom(obj: any, srcType: Type): any {
        return void 0;
    }

    canStringify(): boolean {
        return true;
    }

    //Todo: use moment.js
    //Also should the tostring/fromstring be configurable by the user/server? E.g. mm-dd-yyyy vs dd-mm-yyyy
    toString(obj: Date): string {
        if (obj == null)
            return "";
        let month = (<any>(obj.getMonth() + 1).toString()).padStart(2, "0");
        let day = (<any>obj.getDate().toString()).padStart(2, "0");
        let year = (obj.getFullYear()).toString();
        return `${month}-${day}-${year}`;
    }

    tryFromString(str: string): any {
        if (str.trim() === "")
            return null;

        str = str.trim();
        let reg = str.match(/^(\d{1,2})-(\d{1,2})-(\d{1,4})$/);
        if (reg == null || reg.length !== 4)
            return void 0;
        let month = Number.parseInt(reg[1], 10);
        let day = Number.parseInt(reg[2], 10);
        let year = Number.parseInt(reg[3], 10);
        if (Number.isNaN(month) || Number.isNaN(day) || Number.isNaN(year))
            return void 0;

        return new Date(str);
    }

    serialize(value: Date): number {
        return Number(value);
    }

    deserialize(value: number) {
        return new Date(value);
    }

    inferInstanceOf(obj: any): number {
        return obj instanceof Date ? 1.0 : -1.0;
    }
}
export class DateTimeConverter extends Converter<Date> {
    public static type = Types.DateTime;
    isValid(obj: Object): boolean {
        return obj == null || obj.constructor.name === "Date";
    }

    canConvertFrom(srcType: Type): boolean {
        return false; //Todo: Support converting from DateTime
    }

    convertFrom(obj: any, srcType: Type): any {
        return void 0;
    }

    canStringify(): boolean {
        return true;
    }

    toString(obj: Date): string {
        if (obj == null)
            return "";
        return obj.toISOString();
    }

    tryFromString(str: string): any {
        if (str.trim() === "")
            return null;

        let date = new Date(str);
        if (Number.isNaN(date.getTime()))
            return void 0;

        return date;
    }

    serialize(value: Date): number {
        return Number(value);
    }

    deserialize(value: number) {
        return new Date(value);
    }

    inferInstanceOf(obj: any): number {
        return obj instanceof Date ? 2.0 : -1.0;
    }
}
export class NumberConverter extends Converter<Number|number> {
    public static type = Types.Number;

    private static isPrimitive(obj: number | Number): obj is number {
        return (typeof obj === "number");
    }

    isValid(obj: Object): boolean {
        return obj == null || typeof obj === "number";
    }

    canConvertFrom(srcType: Type): boolean {
        return false;
    }

    convertFrom(obj: any, srcType: Type): any {
        return void 0;
    }

    canStringify(): boolean {
        return true;
    }

    toString(obj: Number | number): string {
        if (NumberConverter.isPrimitive(obj)) {
            return "" + obj;
        }
        return obj.toString();
    }

    tryFromString(str: string): any {
        let res = +str;
        return typeof res === "number" ? res : void 0;
    }

    serialize(obj: number) {
        if (Number.isNaN(obj)) {
            return { boxed: true, val: obj.toString() };
        } else if (typeof obj === "number" && !Number.isFinite(obj)) {
            return { boxed: true, val: obj.toString() };
        } else {
            return +obj;
        }
    }

    deserialize(obj: number | {val: number, boxed: boolean}) {
        return typeof obj === "number" ? obj : obj.boxed ? Number(obj.val) : obj.val;
    }

    inferInstanceOf(obj: any): number {
        return (NumberConverter.isPrimitive(obj) || obj instanceof Number) ? 1.0 : -1.0;
    }
}
export class BooleanConverter extends Converter<boolean | Boolean> {
    public static type = Types.Boolean;

    private static isPrimitive(obj: boolean | Boolean): obj is boolean {
        return (typeof obj === "boolean");
    }

    public isValid(obj: any) {
        return obj == null
            || BooleanConverter.isPrimitive(obj)
            || obj.constructor.name === "Boolean";
    }

    canConvertFrom(srcType: Type): boolean {
        return false;
    }

    convertFrom(obj: any, srcType: Type): any {
        return void 0;
    }

    canStringify(): boolean {
        return true;
    }

    toString(obj: boolean | Boolean): string {
        if (BooleanConverter.isPrimitive(obj)) {
            return "" + obj;
        }
        if (obj == null) {
            return "";
        }
        return obj.toString();
    }

    tryFromString(str: string): any {
        let lstr = str.toLowerCase();
        return lstr === "false" ? false : Boolean(lstr);
    }

    serialize(obj: boolean | Boolean) {
        return !!obj;
    }

    deserialize(obj: boolean | {val: boolean, boxed: boolean}) {
        return typeof obj === "boolean" ? obj : obj.boxed ? Boolean(obj.val) : obj.val;
    }

    inferInstanceOf(obj: any): number {
        return BooleanConverter.isPrimitive(obj) || obj instanceof Boolean ? 1.0 : -1.0;
    }
}
export class ErrorConverter extends PartialConverter<Error> {
    public static type = Types.Error;

    public convertFromSuperType(obj: any) {
        if (obj.constructor.name === "Error") {
            return obj;
        }
        return void 0;
    }

    public serialize(obj: Error) {
        return {stack: obj.stack, message: obj.message, name: obj.name};
    }

    public deserialize(obj: {stack: string, message: string, name: string}) {
        // Use a Function so that we can guarantee that prototypes resolve properly.
        // While we *can* set the error name directly, it's kinda hacky
        let err = (new Function(`return new ${obj.name}("${obj.message}")`)());
        err.stack = obj.stack;
        return err;
    }

    public inferInstanceOf(obj: any): number {
        return obj instanceof Error ? 1.0 : -1.0;
    }
}

export class Converters {
    public static convert(obj: any, srcType: Type, dstType: Type) {
        if (!Converters.registered.has(dstType))
            throw new Error("Converter for type not found: " + dstType.name);
        let conv = Converters.registered.get(dstType)!;
        if (!conv.canConvertFrom(srcType))
            throw new Error("Cannot convert from type: " + srcType.name + " to type " + dstType.name);

        return conv.convertFrom(obj, srcType);
    }

    // noinspection JSUnusedGlobalSymbols
    public static canStringify(type: Type) {
        let conv = Converters.registered.get(type);
        return conv != null && conv.canStringify();
    }

    public static toString(obj: any, type: Type) {
        let conv = Converters.registered.get(type);
        if (conv == null)
            throw new Error("Converter for type not found: " + type.name);

        return conv.toString(obj);
    }

    // noinspection JSUnusedGlobalSymbols
    public static tryFromString(obj: any, type: Type) {
        let conv = Converters.registered.get(type);
        if (conv == null)
            throw new Error("Converter for type not found: " + type.name);

        return conv.tryFromString(obj);
    }

    public static registerConverter(conv: {type: Type} & (new () => Converter)): void {
        const type = conv.type;
        if (Converters.registered.has(type)) {
            console.info("Converter for type: ", type.serializableName, "already registered");
            return;
        }
        Converters.registered.set(type, new conv());
    }

    // noinspection JSUnusedGlobalSymbols
    public static isValid(obj: any, type: Type): boolean {
        if (type.name === "Any")
            return true;
        if (!Converters.registered.has(type))
            return false;

        let conv = Converters.registered.get(type)!;
        return conv.isValid(obj);
    }

    public static inferType(obj: any): Type {
        // algorithm description:
        // naive: iterate over all Converters and call guessInstanceOf. Return
        //        type corresponding to max of (score * nParents) over all
        //        scores returned by registered.map(conv => conv.guessInstanceOf(val))
        // TODO: implement a smarter algorithm that invalidates subtypes if the supertype rejects.
        //       We can't do this right now because primitives inheriting from Types.Object fails Liskov substitution.

        if (obj == null)
            return Types.Any;

        let scores: {type: Type, score: number}[] = [];
        Converters.registered.forEach((conv, type) => {
            let parentChain: (p: Type) => number =
                (parent: Type) => !!parent.baseType ? (1 + parentChain(parent.baseType)) : 1;
            let iscore = parentChain(type);
            try {
                iscore *= conv.inferInstanceOf(obj);
                scores.push({type: type, score: iscore});
            } catch (e) {
                // log and continue
                console.info("Inferrer for type", type.serializableName, "threw, skipping");
                console.info(e);
            }
        });
        return scores.reduce((accumulator, currentVal) => {
            return (accumulator.score > currentVal.score ? accumulator : currentVal);
        }).type;
    }

    public static serialize(obj: any, type: Type): JSONObject | null {
        if (obj == null) {
            return null;
        }
        if (!Converters.registered.has(type)) {
            throw Error("Converter for type " + type.serializableName + " not found");
        }
        let converter = Converters.registered.get(type)!;
        let serializedObject = converter.serialize(obj);
        return {typeName: type.serializableName, value: serializedObject};
    }

    public static deserialize(obj: JSONObject | null): any {
        if (obj == null) {
            return;
        }
        if (obj.value == null) {
            return null;
        }
        let type = Types.findType(obj.typeName);
        if (type == null) {
            throw Error("Type " + obj.typeName + " not available on this instance");
        }
        if (!Converters.registered.has(type)) {
            throw Error("Converter for type " + type.serializableName + " not found on this instance!");
        }
        let converter = Converters.registered.get(type)!;
        return converter.deserialize(obj.value);
    }

    // noinspection JSUnusedGlobalSymbols
    public static hasConverter(type: Type) {
        return Converters.registered.has(type);
    }

    private static registered = new Map<Type, Converter<any>>();
}

(() => {
    const builtins = [
        DefaultConverter,
        StringConverter,
        NumberConverter,
        DateConverter,
        DateTimeConverter,
        ObjectConverter,
        ArrayConverter,
        BooleanConverter,
        ErrorConverter
    ];
    builtins.map((value) => Converters.registerConverter(value));
})();
