import { PartialConverter, Type, Types, Converters, JSONObject } from "@mavenomics/coreutils";
import { Table, Row } from "./Table";
import { toByteArray } from "base64-js";
// Use the bundle, since the JupyterLab webpack config gets tripped up by the
// normal import (the other top-level projects can handle it fine, just not Lab)
import { Table as ArrowTable } from "apache-arrow/Arrow.es5.min.js";
import { ArrowConverter } from "./ArrowConverter";

interface IOldSerializedRow {
    data: any[];
    children: JSONObject[];
    name: string;
}

interface INewSerializedRow {
    data: unknown[];
    children?: INewSerializedRow[];
    name?: string;
}

interface IArrowTable {
    arrow: true;
    data: string;
}

interface SerializedTable {
    arrow?: false;
    cols: string[];
    rows: (SerializedRow | JSONObject)[];
    types: string[];
}

type SerializedRow = IOldSerializedRow | INewSerializedRow;

class TableConverter extends PartialConverter<Table> {
    public static type: Type = Types.Table;

    public serialize(obj: Table) {
        let rowConverter = new RowConverter(obj);
        const returnValue = {
            rows: new Array(obj.rows.length) as INewSerializedRow[],
            cols: obj.columnNames,
            types: obj.columnTypes.map(i => i.serializableName)
        };
        for (let i = 0; i < obj.rows.length; i++) {
            const irow = obj.rows[i];
            returnValue.rows[i] = rowConverter.serialize(irow);

        }
        return returnValue;
    }

    public deserialize(obj: SerializedTable | IArrowTable) {
        if (!!obj.arrow) {
            // trim it, in case it came with a trailing newline
            const table = ArrowTable.from([toByteArray(obj.data.trim())]);
            return ArrowConverter.fromArrow(table);
        }
        let table = new Table();
        table.setColumns(obj.cols, (obj.types ? obj.types.map(i => Types.findType(i)!) : null)!);
        let rowConverter = new RowConverter(table);
        for (let i = 0; i < obj.rows.length; i++) {
            const irow = obj.rows[i];
            const value = rowConverter.deserialize(
                irow.hasOwnProperty("value")
                ? (irow as JSONObject).value
                : irow
            );
            table.appendRow(value);
        }
        return table;
    }

    public inferInstanceOf(obj: any) {
        return obj instanceof Table ? 1.0 : -1.0;
    }
}

class RowConverter extends PartialConverter<Row> {
    public static type: Type = Types.Row;

    constructor(private _parentTable: Table, private _parentRow: Row | null = null) {
        // TODO: Spec: We should rethink rows to be more independent of their parents.
        super();
    }

    public serialize(obj: Row): INewSerializedRow {
        const returnValue = {
            data: new Array(obj._data.length) as unknown[],
        } as INewSerializedRow;
        if (obj.name != null) {
            returnValue.name = obj.name;
        }
        for (let i = 0; i < obj._data.length; i++) {
            const value = obj._data[i];
            let type = obj.owner.columnTypes[i];
            let useColumnType = true;
            if (type === Types.Any) {
                type = Converters.inferType(value);
                useColumnType = false;
            }
            const serializedValue = Converters.serialize(value, type);
            if (useColumnType && serializedValue != null) {
                returnValue.data[i] = serializedValue.value;
            } else {
                // use the regular object and attach the type annotation
                returnValue.data[i] = serializedValue;
            }
        }
        if (obj.children.length === 0) {
            return returnValue;
        }
        returnValue.children = new Array(obj.children.length);
        for (let i = 0; i < obj.children.length; i++) {
            const child = obj.children[i];
            returnValue.children[i] = this.serialize(child);
        }
        return returnValue;
    }

    public deserialize(obj: SerializedRow): Row {
        // TODO: Rows are highly dependent on their owner.
        let row = new Row(this._parentTable, obj.name || null);
        row._setParent(this._parentRow);
        if (this._parentRow != null) {
            this._parentRow.appendChild(row);
        }
        let rowConverter = new RowConverter(this._parentTable, row);
        if (obj.children != null) {
            for (let i = 0; i < obj.children.length; i++) {
                let child = obj.children[i];
                let serializedObj: SerializedRow;
                if (child != null && child.hasOwnProperty("typeName")) {
                    // old style row
                    serializedObj = (child as JSONObject).value;
                } else {
                    serializedObj = child as INewSerializedRow;
                }
                rowConverter.deserialize(serializedObj);
            }
        }
        for (let i = 0; i < obj.data.length; i++) {
            let item = obj.data[i];
            let serializedObj = item;
            if (item != null && !item.hasOwnProperty("typeName")) {
                // new style row value with elided type
                serializedObj = {
                    typeName: this._parentTable.columnTypes[i].serializableName,
                    value: item
                };
            }
            // mutate the data directly
            row._data[i] = Converters.deserialize(serializedObj);
        }

        return row;
    }

    public inferInstanceOf(obj: any) {
        return obj instanceof Row ? 1.0 : -1.0;
    }
}

Converters.registerConverter(TableConverter);
