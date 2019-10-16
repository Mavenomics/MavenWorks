import { Widget } from "@phosphor/widgets";
import { Table } from "@mavenomics/table";
import { Type } from "@mavenomics/coreutils";
import { ISignal, Signal } from "@phosphor/signaling";
import { SlickGridEditor } from "./editor";

export class TableEditorWidget extends Widget {
    private grid: Slick.Grid<TableEditorWidget.IRowData> | null = null;
    private rows: Array<TableEditorWidget.IRowData> = [];
    private _table: Table | null = null;
    private _onChange = new Signal<this, void>(this);
    private _activeColumn: string | null = null;
    private _activeCell: Slick.Cell | null = null;

    constructor() {
        super();
        this.addClass("m-SlickGridPart");
        this.addClass("m-TableEditorPart");
    }

    public get table() { return this._table; }
    public set table(newTable: Table | null) {
        this._table = newTable;
        this.setupGrid();
    }

    public get onChange(): ISignal<this, void> { return this._onChange; }
    public get activeColumn() { return this._activeColumn; }
    public get activeCell() { return this._activeCell; }

    public dispose() {
        if (this.isDisposed) return;
        if (this.grid) this.grid.destroy();
        super.dispose();
    }

    protected onResize() {
        if (this.grid) this.grid.resizeCanvas();
    }

    private setupGrid() {
        if (this.grid != null) this.grid.destroy();
        if (this._table == null) return; //nothing to do

        this.rows = [];

        for (let i = 0; i < this._table.rows.length; i++) {
            // TODO: Descend tree structure
            const row = this._table.rows[i];
            const rowView: TableEditorWidget.IRowData = {
                rowname: row.name,
                id: "row" + i
            };

            for (let c = 0; c < this._table.columnNames.length; c++) {
                const colName = this._table.columnNames[c];
                rowView[colName] = row.getValue(c);
            }

            this.rows.push(rowView);
        }

        const cols = this.getColumnConfig();

        this.grid = new Slick.Grid(this.node, this.rows, cols, {
            editable: true,
            enableCellNavigation: true,
            enableColumnReorder: false,
            rowHeight: 22,
            enableAddRow: true,
        });

        this.grid.onCellChange.subscribe((_e, { cell, row, item }) => {
            const col = this.grid!.getColumns()[cell];
            // clone the table to make the edit
            this._table = this._table!.copyTable();
            this._table!.rows[row].setValue(cell, item[col.field!]);
            this._onChange.emit();
        });

        this.grid.onAddNewRow.subscribe((_e, { item, column }) => {
            this.grid!.invalidateRow(this.rows.length);
            this.rows.push({
                rowname: null,
                ...item,
                id: "row" + this.rows.length
            });
            this._table = this._table!.copyTable();
            const row = this._table.createRow(null);
            row.setValue(column.field!, item[column.field!]);
            this._table.appendRow(row);
            this._onChange.emit();
            this.grid!.render();
        });

        this.grid.onHeaderContextMenu.subscribe((_e, {column}) => {
            if (column == null) {
                this._activeColumn = null;
                return;
            }
            this._activeColumn = column.field || null;
        });

        this.grid.onContextMenu.subscribe((e, {grid}) => {
            // TODO: Contribute fix to getCellFromEvent typing
            let cell = this.grid!.getCellFromEvent(e as any as DOMEvent);
            this._activeCell = cell;
        });
    }

    private getColumnConfig() {
        if (this._table == null) return [];

        const cols: Array<TableEditorWidget.IColumn> = [];

        for (let c = 0; c < this._table.columnNames.length; c++) {
            const colName = this._table.columnNames[c];
            const colType = this._table.columnTypes[c];
            const col: TableEditorWidget.IColumn = {
                field: colName,
                id: "col" + c,
                editor: SlickGridEditor,
                type: colType,
                name: colName,
            };
            cols.push(col);
        }

        return cols;
    }
}

export namespace TableEditorWidget {
    export interface IRowData extends Slick.SlickData {
        rowname: string;
        [column: string]: any;
    }

    export interface IColumn extends Slick.Column<IRowData> {
        type: Type;
        field: string;
        id: string;
    }
}
