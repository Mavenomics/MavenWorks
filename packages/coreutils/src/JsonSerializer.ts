// This is a legacy file from WebMaven
// tslint:disable
// Pass the obj through the serialize functions so that we can JSON stringify the result.
import * as _ from "lodash";
import { Types } from "./builtin";
import { Converters } from "./conversions";

let registeredSerializers: {[index: string]: any} = {};

export function registerType(name: string,
                             serialize: (obj: any, serialize: (obj: any) => any) => any,
                             deserialize: (obj: any, deserialize: (obj: any) => any) => any) {
    registeredSerializers[name] = {serialize: serialize, deserialize: deserialize};
}

//region Table
let serializeTable = function (o: any, serialize: (obj: any) => any) {
    return Converters.serialize(o, Types.Table);
};
let deserializeTable = function (o: any, deserialize: (obj: any) => any) {
    // TODO: before-merge: This block should be removed prior to final merge onto master
    if (!o.hasOwnProperty("value")) {
        console.warn("DEPRECATION WARNING: This dashboard has data in an old format");
        const transformToRow = function(row: {data: any[], children: any[], name: string}): any {
            return {
                value: {
                    data: row.data.map(val => ({value: val, typeName: "Any"})),
                    name: row.name,
                    children: (row.children || []).map(transformToRow)
                },
                typeName: "Row"
            };
        };
        return Converters.deserialize({
            typeName: "Table",
            value: {
                cols: o.cols,
                rows: o.rows.map(transformToRow)
            }
        });
    }
    return Converters.deserialize(o);
};
registerType("Table", serializeTable, deserializeTable);

//region CachedTable
let serializeCachedTable = function (o: any, serialize: (obj: any) => any) {
    return Converters.serialize(o, Types.findType("CachedTable")!);
};

let deserializeCachedTable = function(o: any, deserialize: (obj: any) => any) {
    return Converters.deserialize(o);
};
registerType("CachedTable", serializeCachedTable, deserializeCachedTable);
//endregion
//endregion

//region Date
// noinspection JSUnusedLocalSymbols
let serializeDate = function (o: any, serialize: (obj: any) => any) {
    return Converters.serialize(o, Types.Date);
};
// noinspection JSUnusedLocalSymbols
let deserializeDate = function (o: any, deserialize: (obj: any) => any) {
    return new Date(o.date);
};
registerType(Date.name, serializeDate, deserializeDate);
//endregion

//region Buffer
//Buffer is a NodeJS type.
declare let Buffer: any;
if (typeof Buffer !== 'undefined') {
    // noinspection JSUnusedLocalSymbols
    let serializeBuffer = function (o: any, serialize: (obj: any) => any) {
        return {b64: o.toString('base64'), typeName: Uint8Array.name};
    };
    // noinspection JSUnusedLocalSymbols
    let deserializeBuffer = function (o: any, deserialize: (obj: any) => any) {
        throw new Error('Buffer is not a valid serialized type and has no deserializer')
    };
    registerType(Buffer.name, serializeBuffer, deserializeBuffer);
}
//endregion

//region Uint8Array

let btoa: ((x:any) => string) | null = typeof window !== 'undefined' ? window.btoa : null;
let atob: ((x:any) => string) | null = typeof window !== 'undefined' ? window.atob : null;
if (!btoa) {
    btoa = function (str:any) {
        return new Buffer(str).toString('base64');
    };
    atob = function (b64Encoded: any) {
        return new Buffer(b64Encoded, 'base64').toString();
    };
}
// noinspection JSUnusedLocalSymbols
let serializeUint8Array = function (o: any, serialize: (obj: any) => any) {
    let u8 = <Uint8Array>o;
    if (btoa == null) {
        throw new Error("Not supported");
    }
    return {b64: btoa(String.fromCharCode.apply(null, [...u8]))};
};
// noinspection JSUnusedLocalSymbols
let deserializeUint8Array = function (o: any, deserialize: (obj: any) => any) {
    if (atob == null) {
        throw new Error("Not supported");
    }
    return  new Uint8Array(atob(o.b64).split("").map(c => c.charCodeAt(0)));
};
registerType(Uint8Array.name, serializeUint8Array, deserializeUint8Array);
//endregion

// noinspection JSUnusedLocalSymbols
let serializeError = function (o: any, serialize?: (obj: any) => any) {
    let err: Error = <Error>o;
    let stack = err.stack;
    let message = err.message;
    return {typeName: "Error", message: message, stack: stack};
};
// noinspection JSUnusedLocalSymbols
let deserializeError = function (o: any, deserialize?: (obj: any) => any) {
    let newError = new Error(o.message);
    newError.stack = o.stack;
    return newError;
};

export function serialize(obj: any): any {
    if (obj == null) // undefined becomes null
        return null;

    if (typeof obj === "boolean" ||
        typeof obj === "number" ||
        typeof obj === "string") {
        return obj;
    }
    // No support for arrays with properties attached (e.g. [].a = 5)
    if (Array.isArray(obj)) {
        return obj.map((v: any) => serialize(v));
    }

    let typeName = obj.constructor.name;

    // We likely shouldn't support this. Dictionary objects should derive from another type or we should use ES6 Map
    if (typeName === "Object") {
        return _.mapValues(obj, (v: any) => serialize(v));
    }
    if (obj instanceof Error) {
        return serializeError(obj);
    }

    let guessedType = Converters.inferType(obj);
    if (guessedType !== Types.Any) {
        return Converters.serialize(obj, guessedType);
    }

    if (registeredSerializers.hasOwnProperty(typeName)) {
        let o = registeredSerializers[typeName].serialize(obj, serialize);
        //A bit of a hack to let serializers set what type they are.
        //This would only ever really be used for serializing a derived type as the base type.
        if (!o.typeName)
            o.typeName = typeName;
        if (!o.deprecatedSerialization)
            o.deprecatedSerialization = true;
        return o;
    }

    throw Error("Attempted to serialize unsupported type: " + obj.constructor.name);
}

export function deserialize(obj: any): any {
    if (obj == null) {
        return null;
    }

    if (typeof obj === "boolean" ||
        typeof obj === "number" ||
        typeof obj === "string") {
        return obj;
    }
    // No support for arrays with properties attached (e.g. [].a = 5)
    if (Array.isArray(obj)) {
        return obj.map((v: any) => deserialize(v));
    }

    let typeName = obj.typeName;

    // We likely shouldn't support this. Dictionary objects should derive from another type or we should use ES6 Map
    if (typeof typeName === "undefined") {
        return _.mapValues(obj, (v: any) => deserialize(v));
    }

    if (typeName === "Error") {
        return deserializeError(obj);
    }

    if (!obj.hasOwnProperty("deprecatedSerialization")
        && obj.hasOwnProperty("value")) {
        return Converters.deserialize(obj);
    }

    if (registeredSerializers.hasOwnProperty(typeName)) {
        return registeredSerializers[typeName].deserialize(obj, deserialize);
    }

    throw Error("Attempted to deserialize unsupported type");
}
