import { Part, OptionsBag, PartServices } from "@mavenomics/parts";
import { Table } from "@mavenomics/table";
import { Types, AsyncTools } from "@mavenomics/coreutils";
import { Widget } from "@phosphor/widgets";
import { SlickGridWidget } from "./grid/widget";
import { HoverManager } from "@mavenomics/ui";
import { IColumnFormatting, parseFormatting, serializeFormatting } from "./grid/helpers";
import { UUID } from "@phosphor/coreutils";
import { IGridContext } from "./grid/interfaces";

export class SlickGridPart extends Part {
    public static GetMetadata() {
        const metadata = super.GetMetadata();

        metadata.description = "Advanced data grid for query outputs";
        metadata.remarks = `
The SlickGridPart is a datagrid control, and the most comprehensive part in the
Mavenomics part palette. It features native support for MQL hierarchal rows,
sparklines, number formatters, conditional formatting, and so much more.

#### Column Properties

Column formatting can be edited by right-clicking on a column header and
selecting "Edit Column Properties". Here you can set generic styles, such as the
column header's background color and number formatting, as well as other
formatters such as the Heatmap and ProgressBar formatters. Formatting is keyed
on column names, so if you rename a column you will lose the formatting.

#### Row Paths

Grouped tables returned by MQL \`WITH ROLLUP\` queries are natively understood
by the SlickGrid control. If you want further context on the hierarchies, the
SlickGrid can also show a "path column" that will let you navigate the rows as
a collapsible tree.

#### Column Grouping

SlickGrid supports primitive column grouping. Columns will be treed on 'dots',
which means a column named "Foo.Bar.Baz" will have 2 collapsible levels "Foo"
and "Bar", with a third level having just "Baz". If you have adjacent columns
with the same parent, they will be grouped together.`;

        metadata.addOption("Input Table", Types.Table, Table.NullTable(), {
            description: "The input table for this part. Defaults to a null table."
        });
        metadata.addOption("Formatting", Types.String, "{}", {
            description: "A JSON string describing the formatting for each column in the grid."
        });
        metadata.addOption("Checklist. Enabled", Types.Boolean, false, {
            description: "Whether to enable the Checklist feature."
        });
        metadata.addOption("Checklist.Column for Checkboxes", Types.Number, 1, {
            description: "If [Checklist. Enabled] is true, the index of the column to display the checklists in"
        });
        metadata.addOption("Checklist.Column for Values", Types.Number, 1, {
            description: "If [Checklist. Enabled] is true, the index of the column to pull checklist values from"
        });
        metadata.addOption("Checklist.Selected Values", Types.Array, [], {
            description: "If [Checklist. Enabled] is true, the values of all the checked rows."
        });
        metadata.addOption("RadioButtonList. Enabled", Types.Boolean, false, {
            description: "Whether to enable the Radio Button feature."
        });
        metadata.addOption("RadioButtonList.Column for Radio Buttons", Types.Number, 1, {
            description: "If [RadioButtonList. Enabled] is true, the index of the column to display" +
            " the radio buttons in."
        });
        metadata.addOption("RadioButtonList.Column for Values", Types.Number, 1, {
            description: "If [RadioButtonList. Enabled] is true, the index of the column to pull" +
            " radio values from."
        });
        metadata.addOption("RadioButtonList.Last Selection", Types.Any, "", {
            description: "If [RadioButtonList. Enabled] is true, the most recently selected radio value."
        });
        // TODO: Frozen columns are not currently enabled.
        metadata.addOption("Number of Frozen Columns", Types.Number, 0);
        metadata.addOption("Show Row Selectors", Types.Boolean, false, {
            description: "Whether to show Excel-style row numbers on the far left of the grid."
        });
        metadata.addOption("Show Path Column", Types.Boolean, false, {
            description: "Whether to show the path of each row on the far left."
        });

        return metadata;
    }

    public lastColumn: string | null = null;
    private gridContext = new GridContext(this.context, this);
    private gridContainer: SlickGridWidget = new SlickGridWidget(this.gridContext);

    public async initialize() {
        this.gridContainer.addClass("m-SlickGridPart");
        this.layout.insertWidget(0, this.gridContainer);
        // TODO: Better init
    }

    public async render(bag: OptionsBag) {
        const tbl: any = bag.get("Input Table");
        if (tbl == null) {
            throw new Error("Input Table must not be null");
        }
        if (!(tbl instanceof Table)) {
            if (tbl.rows && tbl.columnNames) {
                console.warn("SlickGrid Input Table looks like a table but isn't an instance of Table");
                console.warn("This may lead to errors and undefined behavior.");
            } else {
                throw new Error("Input Table must be a Table.");
            }
        }
        if (tbl.columnNames.length === 0) {
            throw new Error("Cannot render an empty table.");
        }
        this.gridContainer.show();
        const formatting = parseFormatting("" + bag.get("Formatting"));
        this.gridContext._setBag(bag);
        // yield a tick to the UI to ensure it can update, since we're about to
        // lock it
        await AsyncTools.waitForFrame();
        // Wait an additional tick so that other handlers have had a chance to run
        await AsyncTools.wait();
        await this.gridContainer.Render(tbl, formatting);
    }

    public getName() { return "SlickGrid"; }

    public getColumnFormatting(column: string) {
        return this.gridContext.getColumnFormatting(column);
    }

    public setColumnFormatting(column: string, colFormatting: Partial<IColumnFormatting>) {
        return this.gridContext.setColumnFormatting(column, colFormatting);
    }
}

class GridContext implements IGridContext {
    public collapseStates: boolean[] = [];
    public pathColumn: -1 | 0 | 1 = -1;
    public grid: Slick.Grid<any> | undefined;
    public version: string;
    public readonly partId: string;
    private bag: OptionsBag | null = null;
    private hoverHandle: HoverManager.HoverViewModel | null = null;

    constructor(
        private services: PartServices,
        private owner: SlickGridPart
    ) {
        this.partId = owner.uuid;
        this.version = UUID.uuid4();
    }

    public get lastColumn() {
        return this.owner.lastColumn;
    }

    public set lastColumn(newCol: string | null) {
        this.owner.lastColumn = newCol;
    }

    public _setBag(bag: OptionsBag) {
        this.bag = bag;
    }

    public get(name: string) {
        if (this.bag == null) return;
        // console.trace("FIXME");
        return this.bag.get(name);
    }

    public set(name: string, value: unknown) {
        if (this.bag == null) return;
        // console.trace("FIXME");
        return this.bag.set(name, value);
    }

    // TODO: Remove
    public OpenHover(
        html: string,
        clientX: number,
        clientY: number,
        width: number,
        height: number
    ) {
        this.CloseHover();
        const hover = new Widget();
        hover.node.innerHTML = html;
        this.hoverHandle = this.services.hover.openHover({
            height,
            width,
            hover,
            owner: this.owner,
            mode: "hover",
            offsetMode: "absolute",
            x: clientX,
            y: clientY
        });
    }

    public OpenTableHover(
        table: Table,
        formatting: string,
        popup: boolean,
        clientX: number,
        clientY: number,
        width: number,
        height: number
    ) {
        this.CloseHover();
        const context = new GridContext(this.services, this.owner);

        const bag = new OptionsBag(SlickGridPart.GetMetadata());
        bag.set("Input Table", table);
        bag.set("Formatting", formatting);
        context._setBag(bag);

        const hover = new SlickGridWidget(context);
        hover.addClass("m-SlickGridPart");
        hover.addClass(popup ? "m-TablePopup" : "m-TableHover");

        const parsedFormatting = parseFormatting("" + formatting);
        hover.Render(table, parsedFormatting);

        const handle = this.services.hover.openHover({
            height,
            width,
            hover,
            owner: this.owner,
            mode: popup ? "dialog" : "hover",
            offsetMode: "absolute",
            x: clientX,
            y: clientY
        });
        if (!popup)
            this.hoverHandle = handle;
    }

    // TODO: Remove
    public OpenDashboardHover(
        url: string,
        x: number,
        y: number,
        width: number = 500,
        height: number = 400
    ) {
        const hover = this.CreateHoverWidget(url);
        this.CloseHover();
        this.hoverHandle = this.services.hover.openHover({
            hover,
            owner: this.owner,
            mode: "hover",
            width,
            height,
            x,
            y,
            offsetMode: "absolute"
        });
    }

    public OpenDashboardPopup(
        url: string,
        x: number,
        y: number,
        width: number = 500,
        height: number = 400
    ) {
        const features = [
            "left=" + x,
            "top=" + y,
            "width=" + width,
            "height=" + height
        ].join(",");
        window.open(url, UUID.uuid4(), features);
    }

    public CloseHover() {
        if (this.hoverHandle == null) return;
        this.services.hover.closeHover(this.hoverHandle);
    }

    public getColumnFormatting(column: string) {
        const formatting = parseFormatting("" + this.get("Formatting"));
        const colFormatting = formatting[column];
        return colFormatting;
    }

    public setColumnFormatting(column: string, colFormatting: Partial<IColumnFormatting>) {
        const formatting = parseFormatting("" + this.get("Formatting"));
        formatting[column] = colFormatting;
        this.set("Formatting", serializeFormatting(formatting));
    }

    private CreateHoverWidget(url: string) {
        const hover = new Widget({ node: document.createElement("iframe") }) as Widget & { node: HTMLIFrameElement };
        hover.node.src = url;
        Object.assign(hover.node.style, {
            width: "100%",
            height: "100%"
        });
        return hover;
    }
}

