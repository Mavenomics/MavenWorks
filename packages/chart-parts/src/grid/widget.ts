///<reference types="slickgrid" />
// We must ambiently reference SlickGrid types


import "../../SlickGrid/lib/jquery.event.drag-2.2.js";
import "../../SlickGrid/lib/jquery.mousewheel.js";

//#region SlickGrid core
import "../../SlickGrid/slick.core.js";
import "../../SlickGrid/slick.dataview.js";
import "../../SlickGrid/slick.editors.js";
import "../../SlickGrid/slick.grid.js";
//#endregion

//#region SlickGrid plugins
import "../../SlickGrid/plugins/slick.cellselectionmodel.js";
import "../../SlickGrid/plugins/slick.cellrangedecorator.js";
import "../../SlickGrid/plugins/slick.cellrangeselector.js";
import "../../SlickGrid/plugins/slick.pathbuttons.js";
import "../../SlickGrid/plugins/slick.autotooltips.js";
//#endregion

import { IGridContext } from "./interfaces";
import * as ResultTable from "./ResultTable";
import { Widget } from "@phosphor/widgets";
import { MqlResultTable, Table } from "@mavenomics/table";
import * as _ from "lodash";
import * as d3 from "d3";
import { tableToResultTable, getFormattingOption, stripDefaultsFromFormatting } from "./helpers";
import { UUID } from "@phosphor/coreutils";
import { Converters, Types } from "@mavenomics/coreutils";
import { TableHoverPlugin, ErrorDetailHoverPlugin } from "./plugins";

const asyncDelay = 25;

// TODO: Row types
type RowData = any;

export class SlickGridWidget extends Widget {
    private _hasInitialized = false;
    private resultTable: MqlResultTable | null = null;
    // TODO: Row types
    private dataView: Slick.Data.DataView<RowData> | null = null;
    private grid: Slick.Grid<RowData> | null = null;
    private gridContext: IGridContext;
    private maxDepth = 0;
    private depthColorFunction: d3.scale.Linear<string, string> | null = null;

    // TODO: narrow these types
    private rowHover: any;
    private plugins: Record<string, Slick.Plugin<RowData>> = {};
    private columns: any;
    private previousData: any[] = [];
    private previousColumns: any;
    private previousOptions: any;
    private newData: any[] = [];
    private changes: any = {};

    // TODO: Eliminate these. These are used by hackish callbacks
    private h_collapseStates: any;
    private h_broadcastCheckboxLinkage: any;
    private h_broadcastRadioLinkage: any;
    private h_checkLastSelection: any;

    constructor(gridContext: IGridContext) {
        super();
        this.id = "grid-" + gridContext.partId;
        this.gridContext = gridContext;
    }

    public dispose() {
        if (this.isDisposed) return;

        if (this.grid) {
            this.grid.destroy();
        }
    }
    /** Destroy the grid, if it exists, and setup a new one */
    public SetupGrid() {
        if (this.grid) {
            this.grid.destroy();
        }
        this._hasInitialized = true;
        // empty the node
        for (const child of this.node.children) {
            child.remove();
        }

        this.dataView = new Slick.Data.DataView<RowData>();
        this.dataView.beginUpdate();
        this.dataView.setItems(this.newData);
        this.dataView.setFilter(this.rowFilter.bind(this));
        this.dataView.endUpdate();
        // TODO: Subclass dataView instead of this
        (this.dataView as any).getItemMetadata = this.rowMetadata.bind(this);

        if (this.gridContext.pathColumn > -1) {
            for (var i = 0; i < this.maxDepth + 1; ++i) {
                // Yeah, I think we need to do it this way... slow
                this.columns[this.gridContext.pathColumn].header.buttons.push({
                    text: String(i + 1),
                    command: "path"
                });
            }
        }

        let coldiff = -1;
        coldiff += this.gridContext.get("Show Row Selectors") ? 1 : 0;
        coldiff += this.gridContext.get("Show Path Column") ? 1 : 0;

        const nFrozenCols = this.gridContext.get("Number of Frozen Columns");

        const slickGridOpts = {
            enableCellNavigation: true,
            enableColumnReorder: false,
            syncColumnCellResize: true,
            asyncEditorLoading: false,
            enableAsyncPostRender: true,
            rowHeight: 17,
            cellHighlightCssClass: "changed",
            frozenColumn: nFrozenCols + coldiff
        };

        this.grid = new Slick.Grid<RowData>(
            this.node,
            this.dataView,
            this.columns,
            slickGridOpts
        );
        this.gridContext.grid = this.grid;
        this.gridContext.version = UUID.uuid4();

        // TODO: Add/contribute typings for CellSelectionModel
        this.grid.setSelectionModel(new (Slick as any).CellSelectionModel());

        const rowHover = document.createElement("div");
        rowHover.classList.add("cell-hover");
        rowHover.style.height = this.grid.getOptions().rowHeight + "px";
        this.node.appendChild(rowHover);
        // TODO: Does this need to be a JQuery element?
        this.rowHover = $(rowHover);

        // TODO: Add/contribute typings for PathButtons plugin
        this.plugins.tableHoverPlugin = new TableHoverPlugin(this.gridContext);
        this.grid.registerPlugin(this.plugins.tableHoverPlugin);
        this.plugins.errorDetailPlugin = new ErrorDetailHoverPlugin(this.gridContext);
        this.grid.registerPlugin(this.plugins.errorDetailPlugin);
        this.plugins.pathButtonsPlugin = new (Slick as any).Plugins.PathButtons();
        this.grid.registerPlugin(this.plugins.pathButtonsPlugin);
        this.plugins.autoTooltips = new (Slick as any).AutoTooltips({ enableForHeaderCells: true });
        this.grid.registerPlugin(this.plugins.autoTooltips);

        this.setupCallbacks();

        // TODO: Scroll
    }

    // TODO: column formatting
    public async Render(table: Table, formatting: any) {
        this.show();
        this.resultTable = tableToResultTable(table, formatting);
        this.gridContext.pathColumn = this.gridContext.get("Show Row Selectors") ? 1 : 0;
        if (!this.gridContext.get("Show Path Column")) {
          this.gridContext.pathColumn = -1;
        }

        if (this.mustRerenderGrid()) {
            this.SetupGrid();
        } else {
            console.time("SlickGrid[id=" + this.id + "] Column Diff");
            this.setDiffs();
            // Run through and update the rows in the dataview
            // TODO: refactor the DataModel to not have to do this
            this.dataView!.beginUpdate();
            for (let i = 0; i < this.newData.length; i++) {
                const row = this.newData[i];
                this.dataView!.updateItem(row.id, row);
            }
            this.dataView!.endUpdate();
            console.timeEnd("SlickGrid[id=" + this.id + "] Column Diff");
        }
        this.selectPreviousSelection();
    }

    //#region Phosphor message handlers
    protected onResize() {
        this.grid && this.grid.resizeCanvas();
    }
    //#endregion

    /**
     * Handles stringifying cells that may contain tables
     * @param data table cell
     */
    private stringifyCell(data: any) {
        if (data instanceof Table) {
            data = Converters.serialize(data, Types.Table);
        }
        return JSON.stringify(data);
    }
    private stringifyRow(row: any) {
        let newRow = {...row};
        for(let k in newRow) {
            if (!newRow.hasOwnProperty(k)) continue;
            let val = newRow[k];
            if (val instanceof Table) {
                newRow[k] = Converters.serialize(val, Types.Table);
                continue;
            }
            switch (typeof val) {
                case "object":
                    newRow[k] = _.cloneDeep(val);
                    break;
                default:
                    break;
            }
        }
        return newRow;
    }

    private mustRerenderGrid() {
        // TODO: There must be a better way to check for diff
        this.columns = ResultTable.formatColumns(
            this.resultTable!.Columns,
            this.gridContext,
            this.resultTable!
        );
        this.newData = this.mavenFormatRows(this.columns, this.resultTable!.Result.Rows);
        // TODO: check column change
        // TODO: Check part properties
        if (this.haveColumnsChanged()
            || this.hasDataChanged()
            || this.haveOptionsChanged()
        ) {
            this.previousData = new Array(this.newData.length);
            for (let i = 0; i < this.newData.length; i++) {
                this.previousData[i] = this.stringifyRow(this.newData[i]);
            }
            this.previousColumns = this.resultTable!.Columns;
            this.previousOptions = this.optionsBagToObject();
            return true;
        }
        // Diff changes
        return false;
    }

    private haveColumnsChanged() {
        return !_.isEqual(this.resultTable!.Columns, this.previousColumns);
    }

    private hasDataChanged() {
        if (this.newData.length !== this.previousData.length) return true;
        for (let i = 0; i < this.newData.length; i++) {
            const newPath = this.newData[i].rowPath;
            const oldPath = this.previousData[i].rowPath;
            if (newPath !== oldPath) return true;
        }
        return false;
    }

    private haveOptionsChanged() {
        return !_.isEqual(this.optionsBagToObject(), this.previousOptions);
    }

    // TODO: This is a hack for diffing. Diffing really should be a framework concern.
    private optionsBagToObject() {
        const optsToCheck = [
            "Checklist. Enabled",
            "Checklist.Column for Checkboxes",
            "Checklist.Column for Values",
            "RadioButtonList. Enabled",
            "RadioButtonList.Column for Radio Buttons",
            "RadioButtonList.Column for Values",
            "Number of Frozen Columns",
            "Show Row Selectors",
            "Show Path Column"
        ];
        const obj: Record<string, any> = {};
        for (let i = 0; i < optsToCheck.length; i++) {
            obj[optsToCheck[i]] = this.gridContext.get(optsToCheck[i]);
        }
        return obj;
    }

    /**
     * Diff the table against the last known table.
     *
     * If the grid is eligible for a ticking update, and has columns with
     * ChangeHighlighting.Enabled, these changes will appear in the grid.
     */
    private setDiffs() {
        if (this.grid == null || this.dataView == null || this.resultTable == null) return;
        const colsToCheck = [];
        // First, run through all the columns and look for the ones eligible for
        // change highlighting
        for (let c = 0; c < this.resultTable.Columns.length; c++) {
            const col = this.resultTable.Columns[c];
            // typing hack
            const formatting = (col as any).FormattingOptions;
            if (!getFormattingOption(formatting, "ChangeHighlighting.Enabled")) {
                continue;
            }
            colsToCheck.push(col.Name);
        }

        // If there aren't any columns with change highlighting, bail out
        if (colsToCheck.length === 0) return;

        // At this point we know an update is likely. First, generate an index
        // table of row paths and ids, to speed up the diff check
        const idx: Record<string, number> = {};
        for (let r = 0; r < this.previousData.length; r++) {
            const row = this.previousData[r];
            idx[row.rowPath + row.id] = r;
        }

        // Then, make another index table for translating between SlickGrid
        // columns and ResultTable columns (since column grouping means the
        // names are not directly equivalent, and path/row-selectors means there
        // isn't a 1:1 mapping either)
        const colIdx: Record<string, number> = {};
        const colIdMap: Record<string, number> = {};
        for (let c = 0; c < this.columns.length; c++) {
            const col = this.columns[c];
            let mavenColName: string = col.name;
            if (col.columnGroups != null && col.columnGroups.length > 0) {
                // this is a grouped column, find the actual name
                mavenColName = col.columnGroups.join(".") + "." + col.name;
            }

            if (!colsToCheck.includes(mavenColName)) {
                // skip it since it's not being checked
                continue;
            }
            // Find the index of that column in the result table
            colIdx[col.field] = this.resultTable.Columns
                .findIndex(i => i.Name === mavenColName);
            colIdMap[col.field] = col.id;
        }

        // Now run through the new table, comparing each row to the last row,
        // and marking changes as appropriate
        this.changes = {};
        const newPrevData = new Array(this.newData.length);
        for (let r = 0; r < this.newData.length; r++) {
            const row = this.newData[r];
            const previousRow = this.previousData[
                idx[row.rowPath + row.id]
            ];
            // TODO: Clone rows
            newPrevData[r] = this.stringifyRow(row);

            // skip if there's no row to match against
            if (previousRow == null) continue;

            // SlickGrid columns, not table columns
            const gridColumns = Object.keys(row);

            for (let c = 0; c < gridColumns.length; c++) {
                const cellKey = gridColumns[c];
                const cell = row[cellKey];
                const prevCell = previousRow[cellKey];
                const mappedIdx = colIdx[cellKey];

                if (mappedIdx == null) {
                    // this column isn't being checked
                    continue;
                }

                // Check for changes in the current cell
                if (this.stringifyCell(cell) === this.stringifyCell(prevCell)) {
                    continue;
                }

                const resultCol = this.resultTable.Columns[mappedIdx];
                // Typing hack
                const colId = colIdMap[cellKey];
                const formatting = (resultCol as any).FormattingOptions;

                const highlightingStyle = getFormattingOption(formatting, "ChangeHighlighting.Style");
                const highlightingMinChange = getFormattingOption(formatting, "ChangeHighlighting.Minimum Change");

                if (Math.abs(cell - prevCell) < +highlightingMinChange) {
                    // don't highlight this cell
                    continue;
                }

                if (this.changes[previousRow.id] == null) {
                    this.changes[previousRow.id] = {};
                }

                const ordering = cell < prevCell;
                let highlightMarker;
                switch (highlightingStyle) {
                    case "GlobalDefault":
                    case "Background":
                        highlightMarker = "change" + (ordering ? "down" : "up");
                        break;
                    case "Arrow":
                    default:
                        highlightMarker = "change" + (ordering ? "down" : "up") + "arrow";
                        break;
                }

                this.changes[previousRow.id][colId] = highlightMarker;
            }
        }

        this.previousData = newPrevData;
    }

    // TODO: organization
    //#region Render helpers
    // TODO: Narrow types
    private updateCollapseStates(data: any[]) {
        // Update collapse states asynchronously because it may be slow on larger data
        clearTimeout(this.h_collapseStates);
        this.h_collapseStates = setTimeout(() => {
            this.gridContext.collapseStates = [];
            data.forEach((d) => {
                this.gridContext.collapseStates.push(d._collapsed);
            });
        }, asyncDelay);
    }


    private getColumn(c: number) {
        // Gets the requested column; this accounts for the path column being offset by the row selection
        // column
        if (this.grid) {
            var cols = this.grid.getColumns();
            if (this.gridContext.pathColumn === -1)
                return cols[c];
            return cols[this.gridContext.pathColumn + c];
        }
    }

    private hasChildren(row: number, data: { [x: string]: any; }) {
        var thisIndent = data[row].indent;
        var nextRow = data[row + 1];

        if (nextRow)
            return nextRow.indent > thisIndent;
    }

    private checkChildren(
        row: number,
        column: string | number,
        data: Array<RowData>,
        check: any
    ) {
        var thisIndent = data[row].indent;
        var colChecked = "col" + column + "_checked";

        // loop until we go up the tree
        for (var i = row + 1; i < data.length; ++i) {
            if (data[i].indent > thisIndent) {
                data[i][colChecked] = check;
            }
            else if (data[i].indent <= thisIndent)
                break;
        }
    }

    private checkCheckboxes(
        row: number,
        column: string | number,
        data: Array<RowData>,
        state: string | boolean
    ) {
        if (row <= -1 || row == null)
            return;
        var siblings = [];
        var thisIndent = data[row].indent;
        var colChecked = "col" + column + "_checked";

        data[row][colChecked] = state;

        var i;
        for (i = row - 1; i >= 0; --i) {
            // don't go up the tree, but go backwards
            if (data[i].indent === thisIndent) {
                siblings.push(data[i][colChecked] || false);
            }
            else if (data[i].indent < thisIndent) {
                break;
            }
        }

        for (i = row; i < data.length; ++i) {
            // sure, go down, but don't go up
            if (data[i].indent === thisIndent) {
                siblings.push(data[i][colChecked] || false);
            }
            else if (data[i].indent < thisIndent) {
                break;
            }
        }

        // TODO: typings
        function siblingsCheck(c: any) {
            if (c === "indeterminate")
                return false;
            return c;
        }

        if (state === "indeterminate") {
            this.checkCheckboxes(data[row].parent, column, data, "indeterminate");
            return;
        }
        if (siblings.every(siblingsCheck))
            this.checkCheckboxes(data[row].parent, column, data, true);
        else if (siblings.some(siblingsCheck))
            this.checkCheckboxes(data[row].parent, column, data, "indeterminate");
        else
            this.checkCheckboxes(data[row].parent, column, data, false);

        return siblings;
    }

    private checkSimilar(
        value: any,
        valueColumn: string,
        checkColumn: number,
        data: Array<RowData>,
        state: string | boolean
    ) {
        data.forEach((d, i) => {
            if (value === d["col" + valueColumn]) {
                this.checkCheckboxes(i, checkColumn, data, state);
                this.checkChildren(i, checkColumn, data, state);
                //d["col" + checkColumn + "_checked"] = state;
            }
        });
    }

    private radioSimilar(
        value: any,
        valueColumn: string,
        data: Array<RowData>
    ) {
        data.forEach((d) => {
            if (d._radio !== undefined)
                d._radio = value === d["col" + valueColumn];
        });
    }

    private getSiblings(data: Array<RowData>, row: RowData) {
        var siblings = [];
        var thisIndent = data[row].indent;
        var i;

        for (i = row - 1; i >= 0; --i) {
            // don't go up the tree, but go backwards
            if (data[i].indent === thisIndent) {
                siblings.push(data[i]);
            }
            else if (data[i].indent < thisIndent) {
                break;
            }
        }

        for (i = row; i < data.length; ++i) {
            // sure, go down, but don't go up
            if (data[i].indent === thisIndent) {
                siblings.push(data[i]);
            }
            else if (data[i].indent < thisIndent) {
                break;
            }
        }

        return siblings;
    }

    private getImmediateChildren(data: Array<RowData>, row: RowData) {
        var children = [];

        if (row + 1 >= data.length)
            return [];

        var thisIndent = data[row].indent + 1;

        for (var i = row + 1; i < data.length; ++i) {
            if (data[i].indent === thisIndent) {
                children.push(data[i]);
            }
            else if (data[i].indent < thisIndent)
                break;
        }

        return children;
    }

    private getParent(data: Array<RowData>, row: RowData) {
        var thisIndent = data[row].indent;
        for (var i = row; i > -1; --i) {
            if (data[i].indent < thisIndent)
                return data[i];
        }
    }

    private selectPreviousSelection() {
        clearTimeout(this.h_checkLastSelection);
        this.h_checkLastSelection = setTimeout(() => {

            // TODO: hack
            const context = this.gridContext;
            const self = this;

            function checklist() {
                let optionValue: any;
                let valueColumn: any;
                if (!!context.get("Checklist. Enabled") === true) {
                    // ex: first (% of Net Exposure) in (-0.6784545634831443,-0.6784545634831443)
                    optionValue = context.get("Checklist.Selected Values");

                    // get column name
                    //valueColumn = grid.getColumns()[webMavenHost.pathColumn +
                    // webMavenHost.GetDoubleOptionValue("Checklist.Column for Values")];
                    // TODO: Fix Column Options
                    valueColumn = self.getColumn(context.get("Checklist.Column for Values")) as any;
                    var checklistColumn = self.getColumn(context.get("Checklist.Column for Checkboxes")) as any;

                    // get the values
                    let values = new Set(optionValue || []);
                    self.dataView!.getItems().forEach((v) => {
                        //We only need to update the state of leaves since checkCheckboxes walks parents.
                        if (v.isLeaf) {
                            //Todo: Optimize this. E.g. Only walk the parents after updating all of the leaves.
                            self.checkCheckboxes(
                                v.rowNumber,
                                checklistColumn.columnNumber,
                                self.dataView!.getItems(),
                                values.has(v["col" + valueColumn.columnNumber])
                            );
                        }
                    });
                }
            }

            function radioList() {
                let optionValue: any;
                let valueColumn: any;
                if (context.get("RadioButtonList. Enabled") === true) {
                    optionValue = context.get("RadioButtonList.Last Selection");
                    valueColumn = self.getColumn(context.get("RadioButtonList.Column for Values"));
                    // todo: column types
                    let radioColumn = self.getColumn(context.get("RadioButtonList.Column for Radio Buttons")) as any;

                    if (optionValue === undefined || optionValue === "0 = 1") {
                        return false;
                    }

                    self.dataView!.getItems().forEach((v) => {
                        if (v._radio !== undefined) {
                            v._radio = v["col" + valueColumn.columnNumber] == optionValue;
                        }
                    });


                }
            }

            checklist();
            radioList();
            this.grid!.invalidate();
        }, asyncDelay);
    }

    // TODO: Narrow types
    private mavenFormatRows(
        slickGridColumns: Array<RowData>,
        mavenResultTable: MqlResultTable["Result"]["Rows"]
    ) {
        // TODO: Narrow types
        var formattedRows: any[] = [];
        var parents: any[] = [];
        var indent = 0;

        var lastDepth = 0;

        // preprocess row
        this.maxDepth = 0;
        for (let i = 0; i < mavenResultTable.length; i++) {
            const row = mavenResultTable[i];
            if (row.Depth > this.maxDepth) {
                this.maxDepth = row.Depth;
            }
        }

        for (let i = 0; i < mavenResultTable.length; i++) {
            const e = mavenResultTable[i];
            var diff = Math.abs(lastDepth - e.Depth);
            var j = 0;
            if (e.Depth > lastDepth) {
                // increments indent and adds a parent
                for (j = 0; j < diff; ++j) {
                    ++indent;
                }

                parents.push(i - 1);
            }
            else if (e.Depth < lastDepth) {
                // decrements indent and removes the last parent
                for (j = 0; j < diff; ++j) {
                    --indent;
                    parents.pop();
                }
            }

            lastDepth = e.Depth;

            // todo: row interface
            let row: any = {
                // todo: Add JSDomId to interface
                id: (e as any).JavascriptDomIdentifier,
                parent: parents.length > 0 ? parents[parents.length - 1] : null,
                indent: indent,
                rowNumber: i
            };

            row.path = (e.Name != "null") ? e.Name : "";
            row.rowPath = e.Path;
            row.rowName = e.Name;

            if (e.Depth === this.maxDepth) {
                row.radio = false;
                row.isLeaf = true;
            }

            // Merge the collapse state, if it exists
            if (this.gridContext.collapseStates[i] === true) {
                row._collapsed = true;
            }

            // RowData doesn't cover the path column, so we need to handle it on its own
            if (this.gridContext.pathColumn > -1) {
                if (slickGridColumns[this.gridContext.pathColumn].hasRadio
                    && e.Depth === this.maxDepth)
                    row._radio = false;
                row["col0"] = row.path;
            }

            for (let j = 0; j < e.RowData.length; j++) {
                let v = e.RowData[j];
                if (slickGridColumns[this.gridContext.pathColumn + j + 1].hasRadio
                    && e.Depth === this.maxDepth)
                    row._radio = false;

                row[slickGridColumns[this.gridContext.pathColumn + j + 1].field] = v;
            };
            formattedRows.push(row);
        };

        let rowDepthColors = {
            from: "#c3c3c3",
            to: "white"
        };

        // Create the depth function for coloring rows
        this.depthColorFunction = d3.scale.linear<string, string>()
            .domain([-1, this.maxDepth])
            .range([rowDepthColors.from, rowDepthColors.to]);

        var style = $("<style>").attr("type", "text/css")
            .attr("id", this.id + "row-depth-styles");
        for (var i = 0; i <= this.maxDepth; ++i) {
            style.append(`#${this.id} .slick-row-depth${i} { background: ${this.depthColorFunction(i)} !important; }`);
        }
        $("#" + this.id + "row-depth-styles").remove();
        style.appendTo("head");

        return formattedRows;
    }
    //#endregion

    //#region Grid utilities
    private setupCallbacks() {
        // TODO: Simply and move out into separate callback handlers?
        if (this.grid == null || this.dataView == null) return;

        this.grid.onHeaderClick.subscribe((e, args) => {
            // Select all rows in this column
            var target = $((e as any as DOMEvent).target!);
            if (target.hasClass("toggle")) {
                var groupNum = target.data('groupNum');
                this.toggleHeader(e, args, groupNum);
                this.grid!.setColumns(this.grid!.getColumns());
                this.grid!.invalidate();
                // prevent builtin handleHeaderClick event from triggering this event again.
                e.stopImmediatePropagation();
                return;
            }

            var colNum = (args.column as any).columnNumber;
            if (Number.isNaN(colNum)) {
                (this.grid!.getSelectionModel() as any)
                    .setSelectedRanges([
                        new Slick.Range(0,
                            1,
                            this.grid!.getDataLength() - 1,
                            this.grid!.getColumns().length - 1
                        )
                    ]);
            } else {
                (this.grid!.getSelectionModel() as any)
                    .setSelectedRanges([
                        new Slick.Range(0,
                            colNum,
                            this.grid!.getDataLength() - 1,
                            colNum
                        )
                    ]);
            }
        });

        this.grid.onClick.subscribe((e, args) => {
            // Set the active cell before we actually check the box just so linkage doesn't overwrite
            // the "ChecklistChanged" message
            let target = $((e as any as DOMEvent).target!);
            let node = $(this.grid!.getCellNode(args.row, args.cell));

            if (target.hasClass("toggle")) {
                this.toggle(e, args);
                this.grid!.invalidate();
                this.grid!.render();
                return;
            }

            var data: any[];
            var item: RowData;
            var checkState: string | boolean;
            var hasRowSelectors = this.gridContext.get("Show Row Selectors") ? 1 : 0;

            var columnNumber = args.cell - hasRowSelectors;
            if (columnNumber < 0) {
                // row selector
                // TODO: Selection model typing
                (this.grid!.getSelectionModel() as any)
                    .setSelectedRanges([
                        new Slick.Range(args.row, 1, args.row, this.grid!.getColumns().length - 1)
                    ]);
                return;
            }

            if (node.find(".slick-cell-checkbox").length > 0) {
                data = this.dataView!.getItems();
                item = this.dataView!.getItem(args.row);
                checkState = item["col" + columnNumber + "_checked"] || false;
                if (checkState !== "indeterminate")
                    checkState = !checkState;
                else
                    checkState = true;

                clearTimeout(this.h_broadcastCheckboxLinkage);
                this.h_broadcastCheckboxLinkage = setTimeout(() => {
                    // Assemble all checked
                    let valueColumn = this.getColumn(this.gridContext.get("Checklist.Column for Values"))! as any;
                    if (valueColumn == null)
                        return;

                    this.checkChildren(item.rowNumber, columnNumber, data, checkState);
                    this.checkCheckboxes(item.rowNumber, columnNumber, data, checkState);

                    if (item.isLeaf)
                        this.checkSimilar(item["col" + valueColumn.columnNumber], valueColumn.columnNumber, columnNumber, data, checkState);

                    var checked: any[] = [];
                    data.forEach((d, i) => {
                        if (d["col" + columnNumber + "_checked"] === true) {
                            var val = d["col" + valueColumn.columnNumber];
                            if (checked.indexOf(val) === -1 && !this.hasChildren(i, data))
                                checked.push(val);
                        }
                    });
                    this.grid!.invalidate();

                    this.gridContext.set("Checklist.Selected Values", checked);
                }, asyncDelay);

                (this.grid!.setActiveCell as any)(args.row, args.cell, false);
            }

            if (node.find(".slick-cell-radio").length > 0) {
                data = this.dataView!.getItems();
                item = this.dataView!.getItem(args.row);

                clearTimeout(this.h_broadcastRadioLinkage);
                this.h_broadcastRadioLinkage = setTimeout(() => {
                    var valueColumn = this.getColumn(this.gridContext.get("RadioButtonList.Column for Values"))! as any;
                    var valueColumnValue = item["col" + valueColumn.columnNumber];
                    this.radioSimilar(valueColumnValue, valueColumn.columnNumber, data);
                    this.gridContext.set("RadioButtonList.Last Selection", valueColumnValue);
                    this.grid!.invalidate();
                }, asyncDelay);

                // TODO: investigate if typing issue
                (this.grid! as any).setActiveCell(args.row, args.cell, false);
            }

            this.grid!.setActiveCell(args.row, args.cell);
        });

        this.grid.onMouseEnter.subscribe((e, args) => {
            // TODO: Contribute fix to getCellFromEvent typing
            var cell = this.grid!.getCellFromEvent(e as any as DOMEvent);
            // TODO: Fix for getCellNode type
            var node = this.grid!.getCellNode(cell.row, cell.cell) as any as JQuery;
            const {width, left, right} = this.node.getBoundingClientRect();

            this.rowHover.css({
                height: this.grid!.getOptions().rowHeight + "px",
                top: node.offset()!.top,
                width: width + "px",
                left: left + "px",
                right: right + "px"
            }).show();
        });

        this.grid.onMouseLeave.subscribe((e, args) => {
            this.rowHover.hide();
        });

        this.grid.onDblClick.subscribe((e, args) => {
            var target = $((e as any as MouseEvent).target!);
            if (target.find(".toggle").length > 0) {
                this.toggle(e, args);
                this.grid!.invalidate();
                this.grid!.render();
            }
        });

        this.grid.onHeaderContextMenu.subscribe((_e, {column}) => {
            if (column.id === "path") return; // don't edit the path column
            let colNames = this.resultTable!.Columns.map(col => col.Name);
            let coldiff = 0;
            coldiff += this.gridContext.get("Show Row Selectors") ? 1 : 0;
            coldiff += this.gridContext.get("Show Path Column") ? 1 : 0;
            let colidx = this.columns.findIndex((i: any) => i.id === column.id) - coldiff;
            this.gridContext.lastColumn = colNames[colidx];
        });

        // todo: onRenderRows typing
        (this.grid as any).onRenderRows.subscribe(() => {
            $(this.grid!.getContainerNode())
                .find(".slick-cell-checkbox.indeterminate")
                .prop("indeterminate", "yes");
        });

        const onColumnsResizedHandler = (e: Slick.EventData) => {
            if (!this.resultTable || !this.grid) return;
            const sizes = this.grid.getColumns().map(i => i.width);
            this.resultTable.Columns.map((col: any, i) => {
                let size = sizes[i + 1 + this.gridContext.pathColumn];
                col.FormattingOptions["General.ColumnWidthPixels"] = size;
                this.gridContext.setColumnFormatting(
                    col.Name,
                    stripDefaultsFromFormatting(col.FormattingOptions)
                );
            })
        };
        this.grid.onColumnsResized.subscribe(_.debounce(onColumnsResizedHandler, 300));

        this.dataView.onRowCountChanged.subscribe((e, args) => {
            this.grid && this.grid.render();
        });

        this.dataView.onRowsChanged.subscribe((e, args) => {
            this.grid!.removeCellCssStyles("highlight");
            this.grid!.setCellCssStyles("highlight", this.changes);
        });

        //TODO: PathButton typings
        (this.plugins.pathButtonsPlugin as any).onCommand.subscribe((_e: any, args: any) => {
            var number = +(args.button.text) - 1;

            var newData: RowData[] = [];
            this.grid!.getData().getItems().forEach((e: RowData) => {
                if (e.indent >= number)
                    e._collapsed = true;
                else
                    e._collapsed = undefined;

                newData.push(e);
            });

            /* Completely reset all the data with the new stuff.
              Why?
              Well, it sure beats sifting through x-thousand rows and update each individual
              ONE AT A TIME. Let's just do it in bulk. This way is SIGNIFICANTLY faster.
              I noticed a TOTAL difference with only 1,500 rows */
            this.updateCollapseStates(this.grid!.getData().getItems());
            this.grid!.getData().setItems(newData);
            this.grid!.invalidate();
        });
    }

    // TODO: Narrow typing
    private areColumnsInSameBucket(
        left: any[],
        right: any[],
        levels: number
    ) {
        if (left.length < levels || right.length < levels)
            return false;
        for (var i = 0; i < left.length && i < levels; i++) {
            if (left[i] != right[i])
                return false;
        }
        return true;
    }

    private toggleHeader(
        _e: Slick.EventData,
        args: Slick.OnHeaderClickEventArgs<RowData>,
        groupNum: number
    ) {
        // todo: column types
        var column = args.column as any;
        var grid = args.grid;
        var columns = grid.getColumns() as any[];
        var columnIdx = column.columnNumber;
        var columnGroups = column.columnGroups;
        for (var i = columnIdx + 1; i < columns.length; i++) {
            var groups = columns[i].columnGroups;
            if (this.areColumnsInSameBucket(columnGroups, groups, groupNum + 1)) {
                if (columns[i].collapsed) {
                    columns[i].collapsed = false;
                    columns[i].resizable = true;
                    columns[i].width = columns[i].oldWidth;
                    columns[i].minWidth = columns[i].oldMinWidth;
                }
                else {
                    columns[i].collapsed = true;
                    columns[i].resizable = false;
                    columns[i].oldWidth = columns[i].width;
                    columns[i].oldMinWidth = columns[i].minWidth;
                    columns[i].width = 0;
                    columns[i].minWidth = 0;
                }
            }
            else {
                break;
            }
        }
    }

    private toggle(
        e: Slick.EventData,
        args: Slick.OnClickEventArgs<RowData> | Slick.OnDblClickEventArgs<RowData>
    ) {
        var item = this.dataView!.getItem(args.row);
        if (item) {
            item._collapsed = !item._collapsed;
            this.dataView!.updateItem(item.id, item);
        }
        this.updateCollapseStates(this.grid!.getData().getItems());
        e.stopImmediatePropagation();
    }
    //#endregion

    //#region Grid callbacks
    private rowFilter(item: RowData, args: any) {
        if (item.parent != null) {
            var parent = this.newData[item.parent];
            while (parent) {
                if (parent._collapsed)
                    return false;
                parent = this.newData[parent.parent];
            }
        }

        return true;
    }

    private rowMetadata(row?: RowData) {
        if (row !== undefined) {
            let item = this.dataView!.getItem(row);
            return {
                cssClasses: "slick-row-depth" + item.indent
            };
        }
    }
    //#endregion
}
