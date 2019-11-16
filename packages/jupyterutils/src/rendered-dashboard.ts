import { IClientSession } from "@jupyterlab/apputils";
import { CodeCell } from "@jupyterlab/cells";
import { PageConfig, URLExt, nbformat } from "@jupyterlab/coreutils";
import { IRenderMime, IRenderMimeRegistry } from "@jupyterlab/rendermime";
import { DashboardSerializer, Dashboard } from "@mavenomics/dashboard";
import { PartFactory } from "@mavenomics/parts";
import { JSONValue, JSONObject } from "@phosphor/coreutils";
import { Widget, BoxLayout, Panel } from "@phosphor/widgets";
import { DisplayHandleManager, DisplayHandle } from "./handles";
import { KernelExpressionEvaluator } from "./services/expressioneval";

export class RenderedDashboard extends Widget implements IRenderMime.IRenderer {
    static isEditableCell(cell: CodeCell) {
        const model = cell.outputArea.model;
        for (let i = 0; i < model.length; i++) {
            const output = model.get(i);
            if (DashboardSerializer.MAVEN_LAYOUT_MIME_TYPE in output.data) {
                // TODO: Make SerializedDashboards extend JSONObject
                const layout = output.data[
                    DashboardSerializer.MAVEN_LAYOUT_MIME_TYPE
                ] as any as DashboardSerializer.ISerializedDashboard;
                if (!!layout.visual) {
                    return true;
                } else {
                    return false; // don't write back, cell isn't a visual dashboard
                }
            }
        }
        return false;
    }

    static getCellDashboard(cell: CodeCell): DashboardSerializer.ISerializedDashboard | null {
        const model = cell.outputArea.model;
        for (let i = 0; i < model.length; i++) {
            const output = model.get(i);
            if (DashboardSerializer.MAVEN_LAYOUT_MIME_TYPE in output.data) {
                return output.data[
                    DashboardSerializer.MAVEN_LAYOUT_MIME_TYPE
                ] as any as DashboardSerializer.ISerializedDashboard;
            }
        }
        return null;
    }

    public static getDashboardFromCell(cell: CodeCell) {
        // cell.outputArea.widgets is an atomic list of a phosphorJS Panel
        // the second child of that panel is the output.
        const renderer = (cell.outputArea.widgets[0] as Panel).widgets[1];
        let maybeDashboard = (renderer as any).dashboard;
        if (maybeDashboard != null && maybeDashboard instanceof Dashboard) {
            return maybeDashboard;
        }
        return null;
    }

    static getCellLayoutGuid(cell: CodeCell): string | null {
        if (cell.outputArea.model.length <= 0) {
            return null;
        }
        const dashboard = this.getDashboardFromCell(cell);
        if (dashboard == null) {
            return null;
        }
        return dashboard.uuid;
    }

    // TODO: We should move away from this approach, towards something more cross-platform
    public static getPythonCode(dashboard: DashboardSerializer.ISerializedDashboard) {
        // the double serialization happens because we need escape chars escaped. eg, `\"` == `"` in Python strings,
        // whereas `\\"` != `"`
        return `# Auto-generated code, do not edit!
_json = __import__("json")
display(_json.loads(${
    JSON.stringify(`{"${DashboardSerializer.MAVEN_LAYOUT_MIME_TYPE}": ${JSON.stringify(dashboard)}}`)
}), raw=True)
del _json`;
    }

    public readonly layout: BoxLayout;
    public readonly dashboard: Dashboard;
    private mimeTypeRegistry: IRenderMimeRegistry;
    private ready: Promise<void>;
    private expandToFill: boolean;

    constructor({
        rendermime,
        session,
        factory,
        ready,
        expandToFill
    }: RenderedDashboard.IOptions) {
        super();
        this.mimeTypeRegistry = rendermime;
        this.ready = ready;
        this.addClass("m-RenderedLayout");
        this.layout = new BoxLayout();
        this.layout.fitPolicy = "set-no-constraint";
        let evaluator = new KernelExpressionEvaluator({session});
        let handleManager = DisplayHandleManager.GetManager(session);
        this.dashboard = new Dashboard({
            factory,
            rendermime,
            session,
            evaluator,
            externalPartRenderer: new RenderedDashboard.ExternalPartRenderer(
                rendermime,
                handleManager
            ),
            baseUrl: URLExt.join(PageConfig.getBaseUrl(), "/files"),
            baseViewUrl: URLExt.join(PageConfig.getBaseUrl(), "/view")
        });
        this.expandToFill = (expandToFill == null) ? false : expandToFill;
        if (!this.expandToFill) {
            this.node.style.height = `500px`;
        }
        evaluator.globals = this.dashboard.globals;
        this.dashboard.OnDirty.subscribe(() => {
            this.saveLayout();
            this.dashboard.setClean();
        });
        this.layout.addWidget(this.dashboard);
    }

    async renderModel(model: IRenderMime.IMimeModel): Promise<void> {
        await this.ready;
        const temp = model.data[DashboardSerializer.MAVEN_LAYOUT_MIME_TYPE] as unknown;
        const dashboardModel = temp as DashboardSerializer.ISerializedDashboard;
        if (!this.expandToFill) {
            this.node.style.height = `${(dashboardModel.dims || {height: 500}).height}px`;
        }
        this.dashboard.fit();

        await this.dashboard.loadFromModel(dashboardModel);
    }


    public saveLayout() {
        let cur = this.parent;
        while (cur != null) {
            if (cur instanceof CodeCell && RenderedDashboard.isEditableCell(cur)) {
                let dash = DashboardSerializer.toJson(this.dashboard);
                dash.visual = true;
                let id = RenderedDashboard.getCellLayoutGuid(cur);
                if (!!dash && id === this.dashboard.uuid) {
                    cur.model.value.text = RenderedDashboard.getPythonCode(dash);
                    cur.inputHidden = true;
                    return;
                }
            }
            cur = cur.parent;
        }
    }


    public dispose() {
        if (this.isDisposed) {
            return;
        }
        this.dashboard.dispose();
        delete this.mimeTypeRegistry;
        super.dispose();
    }
}

export namespace RenderedDashboard {
    export interface IOptions {
        session: IClientSession;
        rendermime: IRenderMimeRegistry;
        factory: PartFactory;
        /** A promise that resolves when other optional services are setup.
         *
         * Eg, the SyncMetadata comm and UDP registration
         */
        ready: Promise<void>;
        /** An optional flag to specify whether the renderer should expand to
         * fill it's space or take on an explicit size (500px by default).
         */
        expandToFill?: boolean;
    }

    export class ExternalPartRenderer extends Dashboard.DefaultExternalPartRenderer {
        private readonly manager: DisplayHandleManager;
        private handles = new Map<string, DisplayHandle>();

        constructor(rendermime: IRenderMimeRegistry, manager: DisplayHandleManager) {
            super(rendermime);
            this.manager = manager;
        }

        public renderModel(
            model: nbformat.IMimeBundle,
            metadata: JSONValue | undefined,
            id: string
        ) {
            if (model[DisplayHandle.MIME_TYPE] != null) {
                const data = model[DisplayHandle.MIME_TYPE] as JSONObject;
                const handle = this.manager.createHandle(
                    "" + data["name"],
                    this.rendermime,
                    this.rendermime.sanitizer);
                this.handles.set(id, handle);
                return Promise.resolve();
            }
            return super.renderModel(model, metadata as any, id);
        }

        public getPartById(id: string) {
            return this.handles.get(id) || super.getPartById(id);
        }

        public getMetadata() {
            const palette = [] as {name: string, model: JSONObject}[];
            for (let name of this.manager.getAllNamedHandles()) {
                palette.push({
                    name,
                    model: {
                        [DisplayHandle.MIME_TYPE]: {
                            name
                        }
                    }
                });
            }
            return palette;
        }

        public *getAllPartIds() {
            yield* super.getAllPartIds();
            yield* this.handles.keys();
        }

        public serializePart(id: string) {
            const handle = this.handles.get(id);
            if (handle != null) {
                return [{
                    [DisplayHandle.MIME_TYPE]: {
                        name: handle.name
                    }
                }, null] as [nbformat.IMimeBundle, null];
            }
            return super.serializePart(id);
        }
    }
}
