import { Types, Type, Converters } from "@mavenomics/coreutils";
import { Table } from "./Table";
import {
    Table as ArrowTable,
    Type as TType,
    Utf8,
    Bool,
    Date_,
    DataType,
    Schema,
    Field,
    Float64,
    BoolVector,
    DateVector,
    FloatVector,
    Utf8Vector,
    RecordBatch
} from "apache-arrow/Arrow.es5.min.js";

/**
 * This is a set of helper functions to move between the Maven DataFrame and
 * Apache Arrow.
 *
 * Arrow is very useful as a data shuttling mechanism (compact,
 * efficient, relatively generic, and fast) but doesn't support hierarchal row
 * grouping and has no MavenWorks framework support.
 */
export class ArrowConverter {
    /**
     * Generate an Arrow table, given a flat Maven Table.
     *
     * Using Arrow has certain performance and space benefits that Tables cannot
     * normally take advantage of.
     *
     * This function does not guarantee complete correctness, and may not
     * successfully round-trip as the same table. Further, it only supports flat
     * tables (for now).
     *
     * @remarks
     *
     * This method makes a best effort to translate between Maven types and
     * Arrow types, however the process is inexact. Further, any columns that
     * are turned into Utf8 will pay a performance penalty on deserialization,
     * per column.
     *
     * For best results, make sure the table has type annotations. Arrow has
     * limited support for heterogenous types, to the extent that this function
     * doesn't make any attempt to account for them. The type of the first row
     * will be used to infer the column types, if the types are not already
     * there.
     *
     * Types that Arrow cannot handle will be serialized as Utf8 JSON.
     *
     * @static
     * @param table The Maven table to translate
     * @returns An Apache Arrow data table
     */
    public static toArrow(table: Table): ArrowTable {
        const schema = this.inferSchema(table);
        const data = this.createColumnArrays(table, schema);
        const records = this.createArrowVectors(data, schema);
        //@ts-ignore 2589
        return new ArrowTable<any>(schema, [records]);
    }

    public static fromArrow(arrowTable: ArrowTable): Table {
        const schema = arrowTable.schema;
        const nColumns = schema.fields.length;
        const colTypes = new Array(nColumns);
        const colNames = new Array(nColumns);
        const columns = new Array(nColumns);
        const serializedColumns = new Set<number>();
        for (let i = 0; i < nColumns; i++) {
            const field = schema.fields[i];
            const markedType = field.metadata.get("mavenType") || "Any";
            let mavenType = Types.findType(markedType) || Types.Any;
            if (mavenType === Types.Any) {
                mavenType = arrowToMavenType(schema.fields[i].type);
            }
            colTypes[i] = mavenType;
            colNames[i] = field.name;
            let columnData = arrowTable.getColumnAt(i);
            if (columnData === null) {
                throw Error("Unknown column in schema: " + field.name);
            }
            if (field.metadata.get("isSerialized") === "true") {
                serializedColumns.add(i);
            }
            columns[i] = columnData;
        }

        const mavenTable = new Table();
        mavenTable.setColumns(colNames, colTypes);

        for (let i = 0; i < arrowTable.length; i++) {
            const row = mavenTable.createRow(null);
            for (let c = 0; c < nColumns; c++) {
                let data = columns[c].get(i);
                // data might be nullable
                if (data !== null) data = data.valueOf();
                if (serializedColumns.has(c)) {
                    // rebox and deserialize
                    data = Converters.deserialize({
                        typeName: colTypes[c].serializableName,
                        value: JSON.parse(data)
                    });
                }
                row._data[c] = data;
            }
            mavenTable.appendRow(row);
        }

        return mavenTable;
    }

    /**
     * Infer an Arrow schema from a MavenTable, and attach metadata to it.
     *
     * Not all types have clean Arrow equivalents; for those types, they should
     * be serialized to strings.
     *
     * @private
     * @static
     * @param table The table to infer the schema from
     * @returns An Arrow table schema
     */
    private static inferSchema(table: Table): Schema {
        const columnFields = new Array(table.columnNames.length);
        for (let i = 0; i < table.columnNames.length; i++) {
            let type = table.columnTypes[i];
            const metadata = new Map<string, string>();
            if (type === Types.Any) {
                type = Converters.inferType(table.rows[0].getValue(i));
                console.warn("Inferring type for column", table.columnNames[i], "as", type.serializableName);
                console.warn("This may lead to unexpected serialization errors");
            }
            metadata.set("mavenType", type.serializableName);
            let typeCtor = ARROW_TYPE_MAP.get(type);
            if (typeCtor == null) {
                console.warn(
                    "Cannot translate type",
                    type.serializableName + ". This may lead to performance penalties!"
                );
                typeCtor = Utf8;
                metadata.set("isSerialized", "true");
            }
            let columnType = new typeCtor();
            columnFields[i] = new Field(table.columnNames[i], columnType, true, metadata);
        }
        return new Schema(columnFields);
    }

    /**
     * Turn a table to into a set of columnar TypedArrays, or regular Arrays
     *
     * @private
     * @static
     * @param table The outgoing MavenTable
     * @param schema The schema to use.
     * @returns
     */
    private static createColumnArrays(
        table: Table,
        schema: Schema
    ): Array<Array<unknown>> {
        const tableLen = table.rows.length;
        const nColumns = table.columnNames.length;
        const vectors = new Array(nColumns);
        const types = new Array(nColumns);
        for (let c = 0; c < nColumns; c++) {
            const arrayConstructor = TYPED_BUFFER_MAP.get(schema.fields[c].typeId) || schema.fields[c].type.ArrayType;
            vectors[c] = new arrayConstructor(tableLen);
            const type = schema.fields[c].metadata.get("mavenType") || "Any";
            types[c] = Types.findType(type) || Types.Any;
        }
        for (let r = 0; r < tableLen; r++) {
            const row = table.rows[r];
            for (let c = 0; c < nColumns; c++) {
                let data = row._data[c];
                if (schema.fields[c].metadata.get("isSerialized")) {
                    const jsonData = Converters.serialize(data, types[c]);
                    data = JSON.stringify(jsonData ? jsonData.value : null);
                }
                vectors[c][r] = data;
            }
        }
        return vectors;
    }

    /**
     * Create a RecordBatch given a list of columnar data and schema
     *
     * @private
     * @static
     * @param dataColumns The outgoing data in columnar form
     * @param schema The schema to use when transforming to Arrow
     * @returns
     */
    private static createArrowVectors(
        dataColumns: Array<Array<unknown>>,
        schema: Schema
    ): RecordBatch {
        const arrowCols = new Array(dataColumns.length);
        const lengths = new Array(dataColumns.length) as number[];
        for (let i = 0; i < arrowCols.length; i++) {
            //@ts-ignore 2589
            arrowCols[i] = vectorFromType(schema.fields[i].type, dataColumns[i]);
            lengths[i] = dataColumns[i].length;
        }
        return new RecordBatch(schema, Math.max(...lengths), arrowCols);
    }
}

const ARROW_TYPE_MAP = Object.freeze(new Map<Type, {new(...args: any[]): DataType<TType>}>([
    [Types.Boolean, Bool],
    [Types.Date, Date_],
    [Types.DateTime, Date_],
    [Types.Number, Float64],
    [Types.String, Utf8],
]));

function vectorFromType(type: DataType, data: Array<any>) {
    switch (type.typeId) {
        case TType.Bool:
            return BoolVector.from(data);
        case TType.Date:
            return DateVector.from(data);
        case TType.Float:
        case TType.Float16:
        case TType.Float32:
        case TType.Float64:
            //@ts-ignore 2589
            return FloatVector.from(data);
        case TType.Utf8:
        default:
            for (let i = 0; i < data.length; i++) {
                if (data[i] == null) {
                    // It looks like Utf8Vector.from doesn't support nulls
                    // Should we submit a PR?
                    data[i] = "";
                }
            }
            return Utf8Vector.from(data);
    }
}

function arrowToMavenType(type: DataType<any>) {
    switch (type.typeId) {
        case TType.Bool:
            return Types.Boolean;
        case TType.Date:
        case TType.DateDay:
        case TType.DateMillisecond:
            return Types.Date;
        case TType.Decimal:
        case TType.Float:
        case TType.Float16:
        case TType.Float32:
        case TType.Float64:
        case TType.Int:
        case TType.Int8:
        case TType.Int16:
        case TType.Int32:
        case TType.Int64:
        case TType.Uint8:
        case TType.Uint16:
        case TType.Uint32:
        case TType.Uint64:
            return Types.Number;
        case TType.Bool:
            return Types.Boolean;
        case TType.Utf8:
            return Types.String;
        default:
            return Types.Any;
    }
}

// These override DataType#ArrayType, for working with data directly
const TYPED_BUFFER_MAP = Object.freeze(new Map<TType, { new(length: number): ArrayLike<unknown> }>([
    [TType.Utf8, Array],
]));
