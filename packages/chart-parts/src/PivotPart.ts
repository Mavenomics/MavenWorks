import { Part, OptionsBag } from "@mavenomics/parts";
import { Types, Converters } from "@mavenomics/coreutils";
import { Table, TableHelper } from "@mavenomics/table";
import { Widget } from "@phosphor/widgets";
import * as _ from "lodash";

//#region Perspective imports
import perspective from "@finos/perspective";
import { Schema } from "@finos/perspective";
import * as wasm from "@finos/perspective/dist/umd/psp.async.wasm";
import * as worker from "@finos/perspective/dist/umd/perspective.wasm.worker.js";

perspective.override({ wasm, worker });

import "@finos/perspective-viewer";
import "@finos/perspective-viewer-hypergrid/dist/umd/perspective-viewer-hypergrid.js";
import "@finos/perspective-viewer-d3fc";
// import the type separately. perspective-viewer ambiently registers the'
// webcomponent, so we want to make sure that import doesn't get elided by TSC.
import { PerspectiveViewer } from "@finos/perspective-viewer";
import { Message, MessageLoop } from "@phosphor/messaging";
//#endregion

export class PivotPart extends Part {
    public static GetMetadata() {
        const metadata = super.GetMetadata();

        metadata.description = "Display a part in a Perspective pivot control.";
        // TODO: If _any_ part is in want of examples, it's this one
        metadata.remarks = `
[Perspective](https://github.com/finos/perspective/) is a control developed by
J.P. Morgan Chase and the [Financial Open Source Foundation (FINOS)](www.finos.org).

Perspective is very powerful, and provides an Excel-like chart pivot experience
as well as a number of chart visualizations. Using only a simple, drag-n-drop UI,
developers can quickly express a wide variety of charts with almost no effort.

#### Pivoting

Click on the triple-dot in the upper-left-hand corner of the part to open the
pivot UI. Table columns will appear on the left, and pivot operations (row
grouping, column grouping, filtering, sorting) will appear at the top. In the
upper-left corner, you can pick what type of visualization to display (normally
a HyperGrid).

#### Example

Bind the Input Table option to the following MQL query:

\`\`\`mql
SELECT
    x,
    x * x as [y]
FROM
    Lattice('x = -10 to 10 step 1')
\`\`\`

Then, open the pivot UI and change the visualization to "Y Line Chart". Drag the
x column to the "Group By" box at the top. You should now see a parabola in the
chart.
`;

// TODO: Either elaborate more or link out to some narrative/external docs

        metadata.addOption("Input Table", Types.Table, Table.NullTable(), {
            description: "The table to pivot with. Defaults to a null table."
        });
        metadata.addOption("Config", Types.String, "", {
            description: "The serialized pivot config for Perspective. Bind this" +
                         " to a global to sync configs between charts."
        });

        return metadata;
    }

    private static MavenToPerspectiveSchema(table: Table): Schema {
        const schema: Schema = {};
        for (let c = 0; c < table.columnTypes.length; c++) {
            let type = table.columnTypes[c];
            const name = table.columnNames[c];
            if (type === Types.Any) {
                type = Converters.inferType(table.rows[0].getValue(c));
            }
            if (type === Types.Any) {
                // if we _still_ couldn't infer a type, skip it
                // Note that the Perspective typings include a non-existent
                // enum for some reason.
                schema[name] = "string" as any;
                continue;
            }
            switch (type) {
                case Types.String:
                    schema[name] = "string" as any;
                    break;
                case Types.Boolean:
                    schema[name] = "boolean" as any;
                    break;
                case Types.Date:
                    schema[name] = "date" as any;
                    break;
                case Types.DateTime:
                    schema[name] = "datetime" as any;
                    break;
                case Types.Number:
                    schema[name] = "float" as any;
                    break;
                default:
                    schema[name] = "string" as any; //fallback
                    break;
            }
        }

        return schema;
    }

    private readonly chart: Widget & { node: PerspectiveViewer };
    // cast to keep TSLint's member-ordering from picking up on this
    private setConfigCallback = (() => void 0) as Function;
    // The PerspectiveViewer config, stringified
    private config = "{}";
    private oldData: Array<unknown> = [];
    private notifyResize: () => void;

    constructor(opts: Part.IOptions) {
        super(opts);
        this.chart = new Widget({
            node: document.createElement("perspective-viewer")
        }) as Widget & { node: PerspectiveViewer };
        this.chart.node.addEventListener("perspective-config-update", this);
        this.notifyResize = _.throttle(() => {
            this.chart.node.style.width = "100%";
            this.chart.node.style.height = "100%";
            this.chart.node.notifyResize();
        }, 500);
    }

    public dispose() {
        this.chart.node.removeEventListener("perspective-config-update", this);
        this.chart.node.delete();
    }

    public handleEvent(ev: Event) {
        if (ev.type !== "perspective-config-update") {
            return;
        }
        this.setConfigCallback.call(ev);
    }

    public initialize() {
        this.layout.insertWidget(0, this.chart);
    }

    public render(opts: OptionsBag) {
        this.setConfigCallback = () => {
            this.config = JSON.stringify(this.chart.node.save());
            opts.set("Config", this.config);
        };
        // test if the configs diverge, and if so, test whether the column defs
        // also changed.
        const newConfig = opts.get("Config") as string;
        if (newConfig !== "" && newConfig.length > 1 && newConfig !== this.config) {
            const oldConfigObj = JSON.parse(this.config);
            const newConfigObj = JSON.parse(newConfig);
            if (oldConfigObj["columns"] === newConfigObj["columns"]) {
                // TODO: More robust config diffing
                return;
            }
            this.config = newConfig;
            this.chart.node.restore(newConfigObj);
        }

        const table = opts.get("Input Table") as Table;
        const data = TableHelper.toObjectArray(table);
        const schema = PivotPart.MavenToPerspectiveSchema(table);
        if (JSON.stringify(schema) === "{}") {
            // The schema is invalid and won't be handled correctly by Perspective
            throw Error("Cannot render empty table");
        }
        if (_.isEqual(data, this.oldData)) {
            return;
        }
        this.oldData = data;
        this.chart.node.load(schema);
        this.chart.node.update(data);
    }

    // TODO: WebPack mangles the name of this class. The serializer should be
    // doing more with the factory directly (perhaps the factory can attach a
    // name to each part instance describing the name that it was registered
    // with?)
    public getName() {
        return "PivotPart";
    }

    protected onResize() {
        if (!this.isAttached) return;
        this.notifyResize();
    }

    protected onActivateRequest(msg: Message) {
        if (this.isAttached) {
            this.chart.node.focus({preventScroll: true});
        }
        super.onActivateRequest(msg);
    }

    protected onAfterShow(msg: Message) {
        this.notifyResize();
        super.onAfterShow(msg);
    }
}
