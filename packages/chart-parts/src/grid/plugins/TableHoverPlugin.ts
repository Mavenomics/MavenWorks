///<reference types="slickgrid" />

import { Table } from "@mavenomics/table";
import { IGridContext } from "../interfaces";

export class TableHoverPlugin {
    _handleMouseEnter = this.handleMouseEnter.bind(this);
    _handleMouseLeave = this.handleMouseLeave.bind(this);
    _handleDblClick = this.handleDblClick.bind(this);
    grid: Slick.Grid<any> | undefined;
    gridContext: IGridContext;
    currentCell: Slick.Cell | null | undefined;
    constructor(gridContext: IGridContext) {
        this.gridContext = gridContext;
    }
    init(grid: Slick.Grid<any>) {
        this.grid = grid;
        grid.onMouseEnter.subscribe(this._handleMouseEnter);
        grid.onMouseLeave.subscribe(this._handleMouseLeave);
        grid.onDblClick.subscribe(this._handleDblClick);

    }
    destroy() {
        if (this.grid) {
            this.grid.onMouseEnter.unsubscribe(this._handleMouseEnter);
            this.grid.onMouseLeave.unsubscribe(this._handleMouseLeave);
            this.grid.onDblClick.unsubscribe(this._handleDblClick);
        }
    }

    handleMouseEnter(e: any, data: any) {
        const _grid = this.grid;
        if (!_grid)
            return;

        if (this.currentCell)
            return;

        var cell = _grid.getCellFromEvent(e);
        if (cell) {
            let row = _grid.getDataItem(cell.row);
            let columns = _grid.getColumns();
            let field = columns[cell.cell].field!;
            let data = row[field];
            if (data instanceof Table) {
                this.currentCell = cell;
                let node = _grid.getCellNode(cell.row, cell.cell);
                var bounds = $(node)[0].getBoundingClientRect() as DOMRect;

                const maxWidth = 800;
                const maxHeight = 800;
                const unClampedHeight = 25 + data.rows.length * 17;
                //Add 18 pixels to the width if there is going to be a scrollbar.
                const width = Math.min(data.columnNames.length * 58 + 1 + (unClampedHeight > maxHeight ? 18 : 0), maxWidth);
                const height = Math.min(unClampedHeight, maxHeight);

                this.gridContext.OpenTableHover(data, "{}", false, bounds.right + 1, bounds.y, width, height);

                e.preventDefault();
                e.stopPropagation();
            }
        }
    }

    handleMouseLeave(e: any, data: any) {
        var cell = this.currentCell;
        if (cell) {
            this.gridContext.CloseHover();
            this.currentCell = null;
            e.preventDefault();
            e.stopPropagation();
        }
    }

    handleDblClick(e: any, data: any) {
        const _grid = this.grid;
        if (!_grid)
            return;

        var cell = _grid.getCellFromEvent(e);
        if (cell) {
            let row = _grid.getDataItem(cell.row);
            let columns = _grid.getColumns();
            let field = columns[cell.cell].field!;
            let data = row[field];
            if (data instanceof Table) {
                let node = _grid.getCellNode(cell.row, cell.cell);
                var bounds = $(node)[0].getBoundingClientRect() as DOMRect;

                const maxWidth = 800;
                const maxHeight = 800;
                const unClampedHeight = 25 + data.rows.length * 17;
                //Add 18 pixels to the width if there is going to be a scrollbar.
                const width = Math.min(data.columnNames.length * 58 + 1 + (unClampedHeight > maxHeight ? 18 : 0), maxWidth);
                const height = Math.min(unClampedHeight, maxHeight);

                this.gridContext.OpenTableHover(data, "{}", true, bounds.right + 1, bounds.y, width, height + 30);

                e.preventDefault();
                e.stopPropagation();
            }
        }
    }
}