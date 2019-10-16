///<reference types="slickgrid" />

import { IGridContext } from "../interfaces";
import { Widget } from "@phosphor/widgets";
import { HoverManager } from "@mavenomics/ui";

export class ErrorDetailHoverPlugin implements Slick.Plugin<any> {
    private _handleMouseEnter = this.handleMouseEnter.bind(this);
    private _handleMouseLeave = this.handleMouseLeave.bind(this);
    private _handleDblClick = this.handleDblClick.bind(this);
    private grid: Slick.Grid<any> | undefined;
    private gridContext: IGridContext;
    private currentCell: Slick.Cell | null | undefined;
    private hover: HoverManager.HoverViewModel | null = null;

    constructor(gridContext: IGridContext) {
        this.gridContext = gridContext;
    }

    public init(grid: Slick.Grid<any>) {
        this.grid = grid;
        grid.onMouseEnter.subscribe(this._handleMouseEnter);
        grid.onMouseLeave.subscribe(this._handleMouseLeave);
        grid.onDblClick.subscribe(this._handleDblClick);
    }

    public destroy() {
        if (this.grid) {
            this.grid.onMouseEnter.unsubscribe(this._handleMouseEnter);
            this.grid.onMouseLeave.unsubscribe(this._handleMouseLeave);
            this.grid.onDblClick.unsubscribe(this._handleDblClick);
        }
        if (this.hover) {
            HoverManager.GetManager().closeHover(this.hover);
        }
    }

    private handleMouseEnter(e: DOMEvent) {
        const _grid = this.grid;
        if (!_grid)
            return;

        if (this.currentCell)
            return;

        var cell = _grid.getCellFromEvent(e);
        if (this.createHover(cell)) {
            e.preventDefault();
            e.stopPropagation();
        }
    }

    /**
     * Generate an error stack hover.
     *
     * @private
     * @param cell
     * @returns Whether a hover was opened.
     */
    private createHover(cell: Slick.Cell | null, mode: "dialog" | "hover" = "hover"): boolean {
        if (this.hover) {
            HoverManager.GetManager().closeHover(this.hover);
        }
        let grid = this.grid;
        if (cell == null || grid == null) return false;

        let row = grid.getDataItem(cell.row);
        let columns = grid.getColumns();
        let field = columns[cell.cell].field!;
        let data = row[field];
        if (data instanceof Error) {
            this.currentCell = cell;
            let node = grid.getCellNode(cell.row, cell.cell);
            var bounds = $(node)[0].getBoundingClientRect() as DOMRect;
            const maxWidth = 800;
            const maxHeight = 800;
            // char width: 6px. Height: 20px.
            const unClampedHeight = 10 + 20 * (data.stack ? data.stack.split("\n").length : 2);
            const unClampedWidth = 6 * Math.max(
                data.name.length,
                data.stack ? Math.max(...data.stack.split("\n").map(i => i.length))
                           : 30
            );
            const width = Math.min(unClampedWidth, maxWidth);
            const height = Math.min(unClampedHeight, maxHeight);
            const hover = new Widget({node: document.createElement("pre")});
            hover.addClass("m-error-detail-hover");
            hover.title.label = "Cell Error";
            hover.node.innerText = data.stack || (data.name + ":" + data.message);
            const model = HoverManager.GetManager()
                .openHover({
                    hover,
                    height,
                    width,
                    x: bounds.right + 1,
                    y: bounds.y,
                    mode,
                    offsetMode: "absolute",
                    owner: (this.gridContext as any)["owner"] || hover
                });
            if (mode === "hover") {
                this.hover = model;
            }
            return true;
        }
        return false;
    }

    private handleMouseLeave(e: DOMEvent) {
        var cell = this.currentCell;
        if (cell) {
            if (this.hover) {
                HoverManager.GetManager().closeHover(this.hover);
            }
            this.currentCell = null;
            e.preventDefault();
            e.stopPropagation();
        }
    }

    private handleDblClick(e: DOMEvent) {
        const _grid = this.grid;
        if (!_grid)
            return;

        var cell = _grid.getCellFromEvent(e);
        if (this.createHover(cell, "dialog")) {
            e.stopPropagation();
            e.preventDefault();
        }
    }
}