import * as _ from "lodash";
import { Type, Types, Converters, IterTools } from "@mavenomics/coreutils";

/**
 * Maven Table class
 * Table supports grouping by rows, and column type annotations.
 */
export class Table {
    // noinspection JSUnusedGlobalSymbols
    /** Deeply copy the table and all rows, producing a new instance
     * @deprecated Use table#copyTable() instead
     * @param {Table} table Table to copy
     * @returns {Table}
     */
    static copyTable(table: Table) {
        return table.copyTable();
    }

    /** Deeply copy the table and all rows, producing a new instance
     * @deprecated Use table#copyTable() instead
     * @param {Table} table Table to copy
     * @returns {Table}
     */
    static CopyTable(table: Table) {
        return table.copyTable();
    }

    /**
     * Returns a single-row, single-column 'empty' table.
     *
     * This is what the query `SELECT null FROM dual` would return, and is
     * useful for parts that want a 'default' table since it allows them to
     * display a column and row (and thus surface to the user what they look
     * like, and how to interact with them).
     */
    public static NullTable() {
        const tbl = new Table();
        tbl.setColumns(["null"], [Types.Any]);
        const row = tbl.createRow(null);
        row.setValue("null", null);
        tbl.appendRow(row);
        return tbl;
    }

    protected static _copyRowAndChildren(table: Table, parent: Row | null, row: Row) {
        let copyRow = table.createRow(row.name);
        for (let i = 0; i < table.columnNames.length; i++)
            copyRow.setValue(i, row.getValue(i));

        if (parent != null) {
            parent.appendChild(row);
        } else {
            table.appendRow(copyRow);
        }

        for (let i = 0; i < row.children.length; i++) {
            Table._copyRowAndChildren(table, copyRow, row.children[i]);
        }
    }

    /** Column name to data index map. c.f. Row.getValue()
     * @private
     */
    public _columnLookup: {[key: string]: number};
    /** Number of all rows in this table (including children of rows)
     * @type {number}
     * @private
     */
    public _length = 0;
    private _columnNames: string[];
    private _columnTypes: Type[];
    private _rows: Row[];

    constructor() {
        this._rows = [];
        this._columnNames = [];
        this._columnTypes = [];
        this._columnLookup = {};
    }

    /** A list of the column names of this table
     * @type {string[]}
     */
    get columnNames(): string[] {
        return this._columnNames;
    }

    /** The per-column type annotations for this table
     * @type {Type[]}
     */
    get columnTypes(): Type[] {
        return this._columnTypes;
    }

    /** All top-level rows of this table
     * Note that this does NOT include child rows!
     * @type {Row[]}
     */
    get rows(): Row[] {
        return this._rows;
    }

    /** The number of all the rows in this table, including child rows
     * @type {number}
     */
    get length(): number {
        return this._length;
    }

    /** A list of all column names in this table
     * @deprecated Use Table#columnNames instead
     * @type {string[]}
     */
    get Cols() {
        return this._columnNames;
    }

    /** Returns all the top-level rows as an array of objects, keyed on columns.
     * Eg, [{col1: "val1", col2: "val2"}, {col1:"val3", col2: "val4"}, ...]
     * @deprecated Use TableHelper.toObjectArray instead, for explicit conversions
     * @type {any[]}
     */
    get Rows() {
        return TableHelper.toObjectArray(this);
    }

    /** Append a new row to the table, as a root-level row.
     * Note that a Row can only be owned by a single Table
     * @param {Row} row The row to append
     */
    appendRow(row: Row) {
        this._rows.push(row);
        this._length += 1;
        row._setParent(null);
    }

    /**
     * Inserts a root row at the given index
     *
     * @param row
     * @param index
     */
    insertRow(row: Row, index: number) {
        this._rows.splice(index, 0, row);
        this._length += 1;
        row._setParent(null);
    }

    /** Creates a new Row, with the given name, and the owner set to the current table.
     * This does NOT add it to the Table!
     * @param {string} [name] The RowName to use for this row
     * @returns {Row}
     */
    createRow(name: string | null): Row {
        return new Row(this, name);
    }

    /** Replace the columns of this table, and pad/truncate the rows as appropriate
     * The row data are only cleared if truncated. Otherwise, they retain their old value at that
     * index.
     * @param {string[]} names The new columnNames to use
     * @param {Type[]} [types] Type annotations for the new columns. Types.Any by default
     */
    setColumns(names: string[], types?: Type[]) {
        this._columnTypes = types == null ? new Array<Type>(names.length).fill(Types.Any) : types.slice(0);
        this._columnNames = names.slice(0);
        this.createColumnLookup();
        this.ensureRowDataLength(names.length);
        this.ensureRowDataType();
    }

    // noinspection JSUnusedGlobalSymbols
    /** Non-destructively appends a new column to the Table
     * @param {string} name The name of the new column
     * @param {Type} [type=Types.Any] The type annotation for this table
     * @returns {number} The index of the new column, as reflected in Table#columnNames
     */
    appendColumn(name: string, type = Types.Any): number {
        this._columnNames.push(name);
        this._columnTypes.push(type);
        this.createColumnLookup();
        this.ensureRowDataLength(this._columnNames.length);
        this.ensureRowDataType();
        return this._columnNames.length - 1;
    }

    /**
     * Iterate through the table, removing any cells with invalid types.
     *
     */
    public dropInvalidTypes() {
        for (const row of IterTools.dfs_iter(this.rows, (row) => row.children)) {
            for (let c = 0; c < this.columnTypes.length; c++) {
                const type = this.columnTypes[c];
                if (!Converters.isValid(row.getValue(c), type)) {
                    row.setValue(c, null);
                }
            }
        }
    }

    /** Copies the table and all child rows deeply, returning an entirely new instance
     * This is useful to break object references where required, so that multiple
     * functions in the same context can edit the same source table without stomping on
     * each other's changes
     * @returns {Table} A completely new instance of a Table
     */
    copyTable() {
        let copy = new Table();
        copy.setColumns(this.columnNames, this.columnTypes);
        for (let i = 0; i < this.rows.length; i++)
            Table._copyRowAndChildren(copy, null, this.rows[i]);
        return copy;
    }

    /** Copies the table
     * @deprecated use Table#copyTable()
     * @returns {Table}
     * @constructor
     */
    CopyTable() {
        return this.copyTable();
    }

    public toString() {
        return "[object Table]";
    }

    private ensureRowDataLength(len: number) {
        _.forEach(this._rows, r => r._ensureRowDataLength(len));
    }

    private ensureRowDataType() {
        _.forEach(this._rows, r => r._ensureRowDataType(this.columnTypes));
    }

    private createColumnLookup() {
        this._columnLookup = _.reduceRight(this._columnNames, (r: any, c: string, i: number) => {
            r[c] = i;
            return r;
        }, {});
    }
}

// This construct exists to aid JSDoc
/**
 * @typedef MqlResultTable
 * @type {object}
 * @property {{Name: string}[]} Columns The list of columns in the table
 * @property {{
 *  Depth: number,
 *  Name: string,
 *  RowData: any[],
 *  Path: string
 * }[]} Rows The rows of the table, including their depth, name, path, and data.
 */
export interface MqlResultTable {
    Columns: {Name: string}[];
    Result: {
        Rows: {
            Depth: number,
            Name: string,
            RowData: any[],
            Path: string
        }[];
    };
}

/** A set of helper functions for manipulating and working with Tables */
export class TableHelper {
    /** Converts an array of objects keyed on column names to a Table
     * @param {any[]} input The array of objects to convert
     * @returns {Table} A new, flat Table
     */
    static fromObjectArray(input: any[], inferTypes: boolean = true): Table {
        let table = new Table();
        if (input.length < 1)
            return table;

        let types: Type[] = new Array(Object.keys(input[0]).length).fill(Types.Any);
        let first: any = input[0];
        let columns = _.keys(first);

        if (inferTypes) {
            // Interpret columns and types from the first row
            // TBD: Optional/better handling of column types?
            types = columns.map(i => Converters.inferType(first[i]));
        }
        table.setColumns(columns, types);

        let nameToIdx: any = {};
        _.forEach(columns, (c, i) => {
            nameToIdx[c] = i;
        });

        _.forEach(input, i => {
            let row = table.createRow(null);
            _.forEach(i, (v, k) => {
                let idx = nameToIdx[k];
                if (idx === void 0)
                    throw new Error("Invalid input table");
                row.setValue(idx, v);
            });
            table.appendRow(row);
        });
        return table;
    }

    /** Converts a Table into an array of objects keyed on their columns
     * Note that this only works on root rows! Grouped rows are dropped prior to conversion.
     * @param {Table} table The flat table to convert
     * @returns {any[]} An object array representing the table
     */
    static toObjectArray(table: Table): {[column: string]: any}[] {
        return _.map(table.rows, (row: Row) => _.transform(table.columnNames, (r, c, i) => {
            r[c] = row.getValue(i);
        }, {} as {[idx: string]: any}));
    }

    /** Converts a matrix of values into a Table
     * @param {any[][]} rows The matrix of values. Note that all rows must be the same length.
     * @param {string[]} columns The column names to use when converting into a Table.
     * @returns {Table} A new Table
     */
    static fromMatrixObject(rows: any[][], columns: string[]): Table {
        let table = new Table();
        let types = rows[0].map(i => Converters.inferType(i));
        table.setColumns(columns, types);
        if (rows.length < 1)
            return table;

        _.forEach(rows, r => {
            let row = table.createRow(null);
            _.forEach(r, (v, i) => {
                //Todo: Make sure the matrix is square and the columns length matches
                row.setValue(i, v);
            });
            table.appendRow(row);
        });
        return table;
    }

    /** Converts a Table to a matrix object, wrapped in an object containing a list of column names
     * for enhanced interoperability
     * @param {Table} table The table to convert
     * @returns {{Cols: string[], Rows: any[][]}
     */
    static toMatrixObject(table: Table): {Cols: string[], Rows: any[][]} {
        return {
            Cols: table.columnNames,
            Rows: _.map(table.rows, (row: Row) => _.map(table.columnNames, (c, i) => row.getValue(i)))
        };
    }

    // noinspection JSUnusedGlobalSymbols
    /** Returns a table where all grouped rows are flattened into root rows
     * This is useful for interoperability with code that doesn't support grouping, but needs
     * the contents of the grouped rows.
     * @param {Table} input The table to convert
     * @returns {Table} A copy of the table that has been flattened
     */
    static flattenTable(input: Table): Table {
        let table = new Table();
        table.setColumns(input.columnNames);
        let flatRows = TableHelper.depthFirstWalk(input.rows, (row: Row) => row.children);
        _.forEach(flatRows, (r: Row) => {
            let newRow = table.createRow(r.name);
            table.columnNames.forEach((col, i) => newRow.setValue(i, r.getValue(i)));
            table.appendRow(newRow);
        });
        return table;
    }

    /** Constructs the row path for this row by traversing parent rows, constructing a slash-separated
     * string of rowNames
     * @param {Row} row The row to find the path of
     * @returns {string} Row path
     */
    static getRowPath(row: Row) {
        let str = "";
        let tmpRow: Row | null = row;
        while (tmpRow != null) {
            str = "/" + tmpRow.name + str;
            tmpRow = tmpRow.parent;
        }
        return "/root" + str;
    }

    /** Convert a Table to a JSON format matching that of a ResultTable from MavenWebReflector.
     * This is relevant for interoperability with MQL and MavenScape-style JSEPs.
     * Flatten and calculate the special rowname/rowpath,rowdepth properties
     * @param {Table} input The table to convert
     * @returns {MqlResultTable}
     */
    static toMQLResultTable(input: Table): MqlResultTable {
        let flatRows = TableHelper.depthFirstWalk(input.rows, (row: Row) => row.children);

        let columns = input.columnNames.map(c => ({Name: c}));
        let rows = _.map(flatRows, r => ({
            Depth: r.level,
            Name: r.name,
            RowData: r._data,
            Path: TableHelper.getRowPath(r)
        }));
        return {
            Columns: columns,
            Result: {Rows: rows}
        };
    }

    /** Converts an {MqlResultTable} back into a Table
     * @param {MqlResultTable} input The result table to convert
     * @param {Table} [parentTable=new Table()] The table that will be converted to in-place
     * @returns {Table} The converted table. Note that this is the same objectreference as parentTable
     */
    static fromMQLResultTable(
        input: MqlResultTable,
        parentTable: Table = new Table()
    ) {
        let table = parentTable;
        table.setColumns(input.Columns.map(c => c.Name));
        if (input.Result.Rows.length < 1)
            return table;
        let parentStack: Row[] = [];
        let rootDepth = input.Result.Rows[0].Depth;
        for (let i = 0; i < input.Result.Rows.length; i++) {
            let mavenRow = input.Result.Rows[i];
            let mavenDepth = mavenRow.Depth - rootDepth;

            if (mavenDepth < 0)
                throw new Error("Unsupported table depth structure.");

            let row = table.createRow(mavenRow.Name);
            for (let j = 0; j < mavenRow.RowData.length; j++)
                row.setValue(j, mavenRow.RowData[j]);

            let parent = parentStack.length > 0 ? parentStack[parentStack.length - 1] : null;
            if (parent != null) {
                parent.appendChild(row);

            } else {
                table.appendRow(row);
            }

            let nextRow = i + 1 < input.Result.Rows.length ? input.Result.Rows[i + 1] : null;
            if (nextRow != null && (nextRow.Depth - rootDepth) > mavenDepth) {
                parentStack.push(row);
            } else if (nextRow != null && (nextRow.Depth - rootDepth) < mavenDepth) {
                while (parentStack.length > 0
                    && (nextRow.Depth - rootDepth) <= parentStack[parentStack.length - 1].level)
                    parentStack.pop();
            }
        }
        return table;
    }

    /** Creates a dict keyed on unique values in a column of the root level rows with that value
     * @param {Table} tbl The table to index on
     * @param {string} column The column in tbl to index on.
     * Note that it's values MUST be valid PropertyKeys!
     * @returns {Object.<any, Row>} A dictionary of rows having the value 'key' at the given column
     */
    static IndexTable(tbl: Table, column: string): {
        [index: number]: {[column: string]: any},
        [index: string]: {[column: string]: any}
    } {
        let col = tbl.columnNames.indexOf(column);
        return tbl.rows.reduce((prev, d) => {
            let keyVal = d.getValue(col);
            if (prev.hasOwnProperty(keyVal)) {
                (<any>prev)[keyVal].push(d.columns);
            } else {
                (<any>prev)[keyVal] = [];
                (<any>prev)[keyVal].push(d.columns);
            }
            return prev;
        }, {});
    }

    /** Performs a join on the root-level rows of the given tables
     * IMPORTANT! This does *not* support group rows, nor does it support outer joins.
     * @param {Table} LeftTable The left table of the join
     * @param {Table} RightTable The right table of the join
     * @param {JoinType} type What type of join to perform. Valid options are Union, LeftOuter, and RightOuter
     * @param {string} leftcol The column of the left table to join on
     * @param {string} rightcol The column of the right table to join on
     * @returns {Table} A new, joined table
     */
    static Join(LeftTable: Table, RightTable: Table, type: JoinType, leftcol: string, rightcol: string): Table {
        // TODO: implement Outer joins
        // TODO: support grouped tables instead of only joining root rows
        let self = {Rows: TableHelper.toObjectArray(LeftTable), Cols: LeftTable.columnNames};
        let Right = {Rows: TableHelper.toObjectArray(RightTable), Cols: RightTable.columnNames};
        if (type === JoinType.Union) {
            TableHelper.Union(LeftTable, RightTable, false);
        }
        let isLeftOuter = (type === JoinType.LeftOuterJoin);
        let isRightOuter = (type === JoinType.RightOuterJoin);

        if (type === JoinType.FullOuterJoin) {
            isLeftOuter = true;
            isRightOuter = true;
        }

        const rightIndex = TableHelper.IndexTable(RightTable, rightcol);
        let usedNames = self.Cols.reduce((o, c) => {
            o[c] = true;
            return o;
        }, <{ [key: string]: boolean }>{});
        let outputCols = self.Cols.concat(Right.Cols.map(d => {
            let name = d;
            while (usedNames.hasOwnProperty(name))
                name += "Copy";
            usedNames[name] = true;
            return name;
        }));
        let datum: any[][] = [];
        for (let lRow of self.Rows) {
            let key = <any>lRow[leftcol];
            if (rightIndex.hasOwnProperty(key)) {
                let rightRows = rightIndex[key];
                for (let rRow in rightRows) {
                    if (rRow !== "used") {
                        let oRow: any[] = [];
                        for (let item in lRow) {
                            oRow.push(lRow[item]);
                        }
                        for (let item in rightRows[rRow]) {
                            oRow.push(rightRows[rRow][item]);
                        }
                        datum.push(oRow);
                    }
                }
                (<any>rightRows)["used"] = true;
            } else if (isLeftOuter) {
                let oRowLeft: any[] = [];
                for (let item in lRow) {
                    oRowLeft.push(lRow[item]);
                }
                outputCols.forEach(d => {
                    if (self.Cols.indexOf(d) === -1) {
                        oRowLeft.push(null);
                    }
                });
                datum.push(oRowLeft);
            }
        }
        if (isRightOuter) {
            for (let rightRow in rightIndex) {
                if (!(<any>rightIndex[rightRow])["used"]) {
                    for (let row in rightIndex[rightRow]) {
                        let oRowRight: any[] = [];
                        self.Cols.forEach(() => {
                            oRowRight.push(null);
                        });
                        for (let obj in rightIndex[rightRow][row]) {
                            oRowRight.push(rightIndex[rightRow][row][obj]);
                        }
                        datum.push(oRowRight);
                    }
                }
            }
        }
        return TableHelper.fromMatrixObject(datum, outputCols);
    }

    /** Performs a InnerJoin on the given Tables, with the optional ability to only allow
     * same-column InnerJoins
     * @param {Table} LeftTable The left table of the join
     * @param {Table} RightTable The right table of the join
     * @param {boolean} strict Whether to enforce both tables having the same column
     * @returns {Table}
     */
    static Union(LeftTable: Table, RightTable: Table, strict: boolean) {
        // TODO: support grouped tables instead of only joining root rows
        let self = {Rows: TableHelper.toObjectArray(LeftTable), Cols: LeftTable.columnNames};
        let Right = {Rows: TableHelper.toObjectArray(RightTable), Cols: RightTable.columnNames};
        if (strict) {
            if (Right.Cols.length === self.Cols.length && Right.Cols.reduce((prev, d) => {
                    return prev && (self.Cols.indexOf(d) !== -1);
                }, true)) {
                let datum: { [index: string]: any }[] = [];
                for (let row of self.Rows) {
                    datum.push(row);
                }
                for (let row of Right.Rows) {
                    datum.push(row);
                }
                return TableHelper.fromObjectArray(datum);
            } else {
                throw TypeError("Cannot join tables without same columns when strict is true");
            }
        } else {
            let datum: any[][] = [];
            let outputCols = self.Cols.concat(Right.Cols.filter(i => self.Cols.indexOf(i) === -1));
            for (let row of self.Rows) {
                let oRow: any[] = [];
                for (let col of outputCols) {
                    if (row.hasOwnProperty(col)) {
                        oRow.push(row[col]);
                    } else {
                        oRow.push(null);
                    }
                }
                datum.push(oRow);
            }
            for (let row of Right.Rows) {
                let oRow: any[] = [];
                for (let col of outputCols) {
                    if (row.hasOwnProperty(col)) {
                        oRow.push(row[col]);
                    } else {
                        oRow.push(null);
                    }
                }
                datum.push(oRow);
            }
            return TableHelper.fromMatrixObject(datum, outputCols);
        }
    }

    /** A helper function to perform a DFS on the obj and any children
     * @param {any | any[]} obj The object, or list of objects, to traverse
     * @param {(obj: any) => any[]} getChildren A lambda that will be called on every visted node. This
     * must return a list of all it's children, or nothing/an empty array if the node is a leaf node
     * @example
     * let flatRows = TableHelper.depthFirstWalk(myTable.rows, (obj: Row) => row.children);
     * @returns {any[]} The flattened list of nodes to walk
     */
    static depthFirstWalk(obj: (any | any[]), getChildren: (obj: any) => any[]) {
        let result: any[] = [];
        TableHelper._depthFirstWalk(result, obj, getChildren);
        return result;
    }

    private static _depthFirstWalk(result: any[], obj: (any | any[]), getChildren: (obj: any) => any[]) {
        if (Array.isArray(obj)) {
            _.forEach(obj, o => TableHelper._depthFirstWalk(result, o, getChildren));
        } else {
            result.push(obj);
            _.forEach(getChildren(obj), c => {
                TableHelper._depthFirstWalk(result, c, getChildren);
            });
        }
    }
}

/**
 * A class representing a Row in a Table.
 * Rows may be grouped, and are owned by a single Table. The grouping is traversable via parent,
 * children, and owner.
 */
export class Row {
    private _parent: Row | null = null;
    private readonly _owner: Table;
    private _rowData: any[];
    private _name: string;
    private readonly _children: Row[];

    /** The parent Row of this Row, or null if it is a root Row.
     * @type {Row} */
    get parent() {
        return this._parent;
    }

    /** The Table that owns this Row. Only one table may own a Row.
     * @type {Table}
     */
    get owner() {
        return this._owner;
    }

    /** The children of this row. If the row is a leaf row, the array is empty.
     * @type {Row[]}
     */
    get children() {
        return this._children;
    }

    /** The string name of this row, as used in the Row Path.
     * @type {string}
     */
    get name() {
        return this._name;
    }

    /** Returns a representation of this row as an object keyed on the column names.
     * @type {Object.<string, any>}
     */
    get columns(): { [key: string]: any } {
        return Object.assign({}, ...this._owner.columnNames.map((col, i) => {
            return {[col]: this.getValue(i)};
        }));
    }

    /** Traverses the parents of this row, returning the total number of parents.
     * @type {number}
     */
    get level(): number {
        if (this._parent == null)
            return 0;
        return this._parent.level + 1;
    }

    /** Constructs a new Row, with a given owning table and row name
     * @param {Table} owner The table that uniquely owns this row
     * @param name The name to assign to this row.
     */
    constructor(owner: Table, name: string | null) {
        this._rowData = new Array(owner.columnNames.length);
        this._children = [];
        this._name = "" + name;
        this._owner = owner;
    }

    /** Sets the value of a particular column of this row. Columns may be referenced either by
     * index or their string name.
     * @param indexOrName {string | number} The column to set, or it's index in the owning table's columnNames
     * @param value The value to set
     */
    setValue(indexOrName: string | number, value: any) {
        let idx = this._indexOrNameToIndex(indexOrName);
        let type = this.owner.columnTypes[idx];
        if (type !== Types.Any && !Converters.isValid(value, type)) {
            throw Error("Data type mismatch: " + type.serializableName + " is not compatible with " + value);
        }
        this._rowData[idx] = value;
    }

    /** Set the row name explicitly */
    setName(value: any) {
        this._name = value;
    }

    /** Gets the value of a particular column of this row. Columns may be referenced by either
     * the index in the column names, or the string name of the column
     * @param {string | number} indexOrName The column to set, or it's index.
     * @returns {any} The value of this row at the given column.
     */
    getValue(indexOrName: string | number): any {
        return this._rowData[this._indexOrNameToIndex(indexOrName)];
    }

    /** Appends a child row to this row, setting the child row's parent and updating the length of
     * the owner table. A row must not be parented to both the owner and another row!
     * @param {Row} row The row to parent to this row
     */
    appendChild(row: Row) {
        this._children.push(row);
        this._owner._length += 1;
        row._setParent(this);
    }

    /**
     * Inserts a child row into the given index
     *
     * @param row
     * @param index
     */
    insertChild(row: Row, index: number) {
        this._children.splice(index, 0, row);
        this._owner._length += 1;
        row._setParent(this);
    }

    //Todo remove child

    _ensureRowDataLength(len: number) {
        while (len > this._rowData.length)
            this._rowData.push(null);
        this._rowData.length = len;
    }

    _ensureRowDataType(columnTypes: Type[]) {
        console.assert(this._rowData.every((val, idx) => {
            return val == null
                   || val === Types.Any
                   || Converters.isValid(val, columnTypes[idx]);
        }), "Data type mismatch in table!");
        if (this.children) {
            this.children.map(r => r._ensureRowDataType(columnTypes));
        }
    }

    _setParent(parent: Row | null) {
        this._parent = parent;
    }

    public cloneToTable(table: Table): Row {
        let clone = table.createRow(this.name);
        table.appendRow(clone);
        clone._rowData = this._rowData.map(e => e);
        return clone;
    }

    //This is used internally for copying
    //This should be avoided when dealing with user code.
    //Since the data reference may end up being mutated.
    get _data() {
        return this._rowData;
    }

    private _indexOrNameToIndex(indexOrName: any) {
        let index = -1;
        if (typeof indexOrName === "number") {
            index = indexOrName;
        } else {
            index = this._owner._columnLookup[indexOrName.toString()];
            if (index === void 0)
                throw new Error("Column name not found: " + indexOrName);
        }
        if (index < 0 || index >= this._owner.columnNames.length) {
            throw new Error("Table.Row Index out of bounds: " + index);
        }

        return index;
    }

}

export enum JoinType {
    InnerJoin,
    LeftOuterJoin,
    RightOuterJoin,
    Union,
    FullOuterJoin,
}
