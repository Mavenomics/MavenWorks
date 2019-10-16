import { Widget, Panel } from "@phosphor/widgets";
import { AttachedProperty } from "@phosphor/properties";
import { RegionWithChildren } from "./RegionWithChildren";
import { Types, MathTools } from "@mavenomics/coreutils";
import { DashboardLayoutRegion } from "./DashboardLayoutRegion";
import { LayoutManager, LayoutTypes } from "./LayoutManager";
import { MessageLoop } from "@phosphor/messaging";

export class GridLayoutRegion
extends RegionWithChildren<GridLayoutRegion.ILayoutProps>
//tslint:disable-next-line
{
    public static GetMetadata() {
        const metadata = super.GetMetadata();
        metadata.name = "Grid Panel";
        metadata.iconText = "grid_on";
        metadata.description = "Arrange children in a grid";
        metadata.remarks = `
Grids are useful for things like forms, where you might have a set of labels and
controls that should all be the same width. You can technically accomplish this
with nested stackpanels, but it would be very painful to make changes.`;

        metadata.addMetadata("nRows", {
            prettyName: "Grid Panel.Number of Rows",
            default: 3,
            documentation: "The number of rowss to add to the grid",
            type: Types.Number
        });
        metadata.addMetadata("nCols", {
            prettyName: "Grid Panel.Number of Columns",
            default: 3,
            documentation: "The number of columns to add to the grid",
            type: Types.Number
        });
        metadata.addMetadata("spacing.px", {
            prettyName: "Grid Panel.Spacing between children",
            default: 4,
            documentation: "How much padding to put between grid items, in pixels",
            type: Types.Number
        });

        metadata.addAttachedMetadata(GridLayoutRegion.Column, {
            default: 1,
            documentation: "The column of the grid to put this region into",
            type: Types.Number
        });
        metadata.addAttachedMetadata(GridLayoutRegion.ColSpan, {
            default: 1,
            documentation: "How many columns this region should stretch across",
            type: Types.Number
        });
        metadata.addAttachedMetadata(GridLayoutRegion.Row, {
            default: 1,
            documentation: "The row of the grid to put this region into",
            type: Types.Number
        });
        metadata.addAttachedMetadata(GridLayoutRegion.RowSpan, {
            default: 1,
            documentation: "How many rows this region should stretch across",
            type: Types.Number
        });

        return metadata;
    }

    public readonly content: Panel;
    public readonly typeName = LayoutTypes.GridPanelLayoutRegion;

    constructor(owner: LayoutManager, uuid?: string) {
        super(owner, uuid);
        this.addClass("m-GridPanel");
        this.content = new Panel();
        this.content.addClass("m-GridPanel-panel");
        this.installContentTap();
    }

    /**
     * Function to layout the grid panel's children
     *
     * # Layout Algorithm
     *
     * 1. Let `colWidth` = (CalculatedWidth - 2 * [[padding]]) / [[nCols]] - [[spacing]].
     * 2. Let `rowHeight` = (CalculatedHeight - 2 * [[padding]]) / [[nRows]] - [[spacing]].
     * 3. For each element:
     *     1. If element does not have [[showRegion]]:
     *         1. Skip this element.
     *     2. Read the attached properties to generate a CellConfig.
     *         1. Let `col` = Clamp([[Grid.Column]], 0, [[nCols]]).
     *         2. Let `colSpan` = Clamp([[Grid.ColumnSpan]], 1, [[nCols]] - `col`).
     *         3. Let `row` = Clamp([[Grid.Row]], 0, [[nRows]]).
     *         4. Let `rowSpan` = Clamp([[Grid.RowSpan]], 1, [[nRows]] - `row`).
     *     3. Set the size and position of the element
     *         1. Set `width` = (`colSpan` * `colWidth` + (`colSpan` - 1) * [[spacing]]).
     *         2. Set `height` = (`rowSpan` * `rowHeight` + (`rowSpan` - 1) * [[spacing]]).
     *         3. Set `top` = `row` * `rowHeight` + `row` * [[spacing]].
     *         4. Set `left` = `col` * `colWidth` + `col` * [[spacing]].
     *     4. Send a `fit-request` to the element.
     * 4. Return.
     *
     */
    public layoutChildren() {
        const nCols = Math.max(1, this.getLayoutProperty("nCols"));
        const nRows = Math.max(1, this.getLayoutProperty("nRows"));

        const padding = this.getLayoutProperty("padding.px");
        const spacing = this.getLayoutProperty("spacing.px");
        const { width, height } = this.calculatedSize || this.content.node.getBoundingClientRect();

        // 1.
        const colWidth = (width - 2 * padding) / nCols - spacing + spacing / nCols;
        // 2.
        const rowHeight = (height - 2 * padding) / nRows - spacing + spacing / nRows;

        // 3.
        for (let i = 0; i < this.widgets.length; i++) {
            const child = this.widgets[i];
            // 3.1
            if (!child.getLayoutProperty("showRegion")) {
                // 3.1.1
                continue;
            }

            // 3.2
            // 3.2.1
            const column = MathTools.Clamp(GridLayoutRegion.Column.get(child), 0, nCols);
            // 3.2.2
            const colSpan = MathTools.Clamp(GridLayoutRegion.ColSpan.get(child), 1, nCols - column);
            // 3.2.3
            const row = MathTools.Clamp(GridLayoutRegion.Row.get(child), 0, nRows);
            // 3.2.4
            const rowSpan = MathTools.Clamp(GridLayoutRegion.RowSpan.get(child), 1, nRows - row);

            // 3.3
            child.calculatedSize = {
                // 3.3.1
                width: (colSpan * colWidth + (colSpan - 1) * spacing),
                // 3.3.2
                height: (rowSpan * rowHeight + (rowSpan - 1) * spacing),
                // 3.3.3
                top: row * rowHeight + row * spacing,
                // 3.3.4
                left: column * colWidth + column * spacing
            };

            // 3.4
            MessageLoop.sendMessage(child, Widget.Msg.FitRequest);
        }

        // 4.
        return;
    }
}

export namespace GridLayoutRegion {
    export interface ILayoutProps extends RegionWithChildren.IProps {
        nRows: number;
        nCols: number;
        "spacing.px": number;
    }

    function updateOwner(owner: DashboardLayoutRegion) {
        if (owner.parentRegion != null) {
            MessageLoop.sendMessage(owner.parentRegion, Widget.Msg.FitRequest);
            MessageLoop.sendMessage(owner.parentRegion, Widget.Msg.UpdateRequest);
        }
        owner.setStale();
    }

    export const Column = new AttachedProperty<DashboardLayoutRegion, number>({
        create: () => 1,
        name: "Grid Panel.Column",
        changed: updateOwner
    });
    export const ColSpan = new AttachedProperty<DashboardLayoutRegion, number>({
        create: () => 1,
        name: "Grid Panel.Column Span",
        changed: updateOwner
    });

    export const Row = new AttachedProperty<DashboardLayoutRegion, number>({
        create: () => 1,
        name: "Grid Panel.Row",
        changed: updateOwner
    });
    export const RowSpan = new AttachedProperty<DashboardLayoutRegion, number>({
        create: () => 1,
        name: "Grid Panel.Row Span",
        changed: updateOwner
    });
}
