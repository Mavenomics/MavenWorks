import { Part, OptionsBag } from "@mavenomics/parts";
import { Types } from "@mavenomics/coreutils";
import { Table, TableHelper } from "@mavenomics/table";
import { TableEditorWidget } from "./widget";
import Papa = require("papaparse");

export class TableEditorPart extends Part {
    public static GetMetadata() {
        const metadata = super.GetMetadata();

        metadata.description = "Display a table in an editable view.";

        metadata.remarks = `
This part displays an editable table. When bound to a global, you can use this
for two-way editing (where your changes are synced to that global).

You can also enter tables as CSVs- right-click anywhere on the part and select
"Edit Table as CSV". This will open a dialog that you can paste CSVs or Excel
cells into.`;

        metadata.addOption("Input Data", Types.Table, Table.NullTable());

        return metadata;
    }

    private editor: TableEditorWidget;
    private bag: OptionsBag | null = null;

    constructor(args: Part.IOptions) {
        super(args);

        this.editor = new TableEditorWidget();
        this.editor.onChange.connect(this.handleTableChanged, this);

        this.layout.insertWidget(0, this.editor);
    }

    public get activeColumn() { return this.editor.activeColumn; }
    public get activeCell() { return this.editor.activeCell; }

    public dispose() {
        if (this.isDisposed) return;
        this.editor.onChange.disconnect(this.handleTableChanged, this);

        super.dispose();
    }

    public async initialize() { }

    public async render(bag: OptionsBag) {
        const table = bag.get("Input Data") as Table;
        this.bag = bag;
        if (table === this.editor.table) {
            // The change originated from this part, we don't need to do
            // anything.
            return;
        }
        // copy the table, so that if it changes we get a new instance
        this.editor.table = table;
    }

    public getName() {
        return "TableEditor";
    }

    public getTypeForCol(colName: string) {
        if (!this.editor.table) return Types.Any;
        const col = this.editor.table.columnNames.indexOf(colName);
        return this.editor.table.columnTypes[col] || Types.Any;
    }

    public addNewColumn(colName: string, colType: string) {
        if (!this.editor.table) return;
        const tbl = this.editor.table.copyTable();
        tbl.appendColumn(
            this.findUniqueColumnName(colName),
            Types.findType(colType)
        );
        if (this.bag) this.bag.set("Input Data", tbl);
    }

    public changeColumnName(oldName: string, newName: string, newType: string) {
        const tbl = this.editor.table && this.editor.table.copyTable();
        if (!tbl) return;
        const type = Types.findType(newType) || Types.Any;
        const oldIdx = tbl.columnNames.indexOf(oldName);
        let newNames = tbl.columnNames;
        let newTypes = tbl.columnTypes;
        if (newName !== oldName) {
            newNames = [
                ...tbl.columnNames.slice(0, oldIdx),
                this.findUniqueColumnName(newName),
                ...tbl.columnNames.slice(oldIdx + 1)
            ];
        }
        if (newType !== tbl.columnTypes[oldIdx].serializableName) {
            newTypes = [
                ...tbl.columnTypes.slice(0, oldIdx),
                type,
                ...tbl.columnTypes.slice(oldIdx + 1)
            ];
        }
        tbl.setColumns(newNames, newTypes);
        tbl.dropInvalidTypes();
        if (this.bag) this.bag.set("Input Data", tbl);
    }

    public deleteColumn(name: string) {
        const oldTable = this.editor.table;
        if (oldTable == null) return;

        const table = new Table();
        const oldIdx = oldTable.columnNames.indexOf(name);
        if (oldIdx === -1) {
            throw Error("Column '" + name + "' not in table!");
        }
        table.setColumns([
            ...oldTable.columnNames.slice(0, oldIdx),
            ...oldTable.columnNames.slice(oldIdx + 1)
        ], [
            ...oldTable.columnTypes.slice(0, oldIdx),
            ...oldTable.columnTypes.slice(oldIdx + 1)
        ]);
        // todo: Table#deleteColumn
        for (let r = 0; r < oldTable.rows.length; r++) {
            const oldRow = oldTable.rows[r];
            const row = table.createRow(oldRow.name);
            for (const c of table.columnNames) {
                row.setValue(c, oldRow.getValue(c));
            }
            table.appendRow(row);
        }
        if (this.bag) this.bag.set("Input Data", table);
    }

    public deleteRow(row: number) {
        const oldTable = this.editor.table;
        if (!oldTable) return;
        const tbl = TableHelper.toMatrixObject(oldTable);
        tbl.Rows.splice(row, 1);
        // TBD: This also belongs inside table core
        const newTable = new Table();
        newTable.setColumns(oldTable.columnNames, oldTable.columnTypes);
        for (let i = 0; i < tbl.Rows.length; i++) {
            const row = newTable.createRow(null);
            for (let c = 0; c < tbl.Cols.length; c++) {
                row.setValue(c, tbl.Rows[i][c]);
            }
            newTable.appendRow(row);
        }
        if (this.bag) this.bag.set("Input Data", newTable);
    }

    public toCsv() {
        const tbl = this.editor.table;
        if (!tbl) return "";
        return Papa.unparse(TableHelper.toObjectArray(tbl), {
            header: true,
            // workaround for a bug in JupyterLab's code editor component
            // cf. https://github.com/jupyterlab/jupyterlab/issues/2951
            newline: "\n"
        });
    }

    public fromCsv(val: string) {
        const tbl = Papa.parse(val, {
            header: true,
            dynamicTyping: true
        });
        if (this.bag) this.bag.set("Input Data", TableHelper.fromObjectArray(tbl.data));
    }

    private handleTableChanged() {
        if (!this.bag) return;
        this.bag.set("Input Data", this.editor.table);
    }

    private findUniqueColumnName(columnName: string) {
        const tbl = this.editor.table;
        if (tbl == null) return columnName;
        if (tbl.columnNames.indexOf(columnName) === -1) return columnName;
        let i = 0;
        while (tbl.columnNames.indexOf(columnName + i) !== -1) {
            i++;
        }
        return columnName + i;
    }
}
