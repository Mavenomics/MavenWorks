import { Dashboard, DashboardSerializer } from "@mavenomics/dashboard";
import { Widget, BoxLayout, Panel } from "@phosphor/widgets";
import { IRenderMime } from "@jupyterlab/rendermime-interfaces";
import { IRenderMimeRegistry } from "@jupyterlab/rendermime";
import { JupyterFrontEndPlugin } from "@jupyterlab/application";
import { CommandToolbarButton, showDialog, Dialog } from "@jupyterlab/apputils";
import { INotebookTracker, NotebookActions } from "@jupyterlab/notebook";
import { CodeCell } from "@jupyterlab/cells";
import { IClientSession, ICommandPalette } from "@jupyterlab/apputils";
import { IPartFactory, PartFactory } from "@mavenomics/parts";
import { registerUDPs } from "../util/register-udps";
import { KernelExpressionEvaluator } from "../framework/KernelExpressionEvaluator";
import { SyncMetadata } from "../framework/SyncMetadata";
import { PageConfig, URLExt, nbformat } from "@jupyterlab/coreutils";
import { DisplayHandleManager } from "../framework/displayhandle/handlemanager";
import { JSONObject, JSONValue } from "@phosphor/coreutils";
import { DisplayHandle } from "../framework/displayhandle/handle";
import { RegisterActions, IDashboardTracker } from "@mavenomics/dashboard-devtools";
import { AsyncTools } from "@mavenomics/coreutils";

export const MAVEN_LAYOUT_MIME_TYPE = "application/vnd.maven.layout+json";

export class RenderedLayout extends Widget implements IRenderMime.IRenderer {
    static isEditableCell(cell: CodeCell) {
        const model = cell.outputArea.model;
        for (let i = 0; i < model.length; i++) {
            const output = model.get(i);
            if (MAVEN_LAYOUT_MIME_TYPE in output.data) {
                // TODO: Make SerializedDashboards extend JSONObject
                const layout = output.data[MAVEN_LAYOUT_MIME_TYPE] as any as DashboardSerializer.ISerializedDashboard;
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
            if (MAVEN_LAYOUT_MIME_TYPE in output.data) {
                return output.data[MAVEN_LAYOUT_MIME_TYPE] as any as DashboardSerializer.ISerializedDashboard;
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
display(_json.loads(${JSON.stringify(`{"${MAVEN_LAYOUT_MIME_TYPE}": ${JSON.stringify(dashboard)}}`)}), raw=True)
del _json`;
    }

    public readonly layout: BoxLayout;
    public readonly dashboard: Dashboard;
    private mimeTypeRegistry: IRenderMimeRegistry;
    private ready: Promise<void>;

    constructor({rendermime, session, factory, ready}: RenderedLayout.IOptions) {
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
            externalPartRenderer: new RenderedLayout.ExternalPartRenderer(
                rendermime,
                handleManager
            ),
            baseUrl: URLExt.join(PageConfig.getBaseUrl(), "/files"),
            baseViewUrl: URLExt.join(PageConfig.getBaseUrl(), "/view")
        });
        this.node.style.height = `500px`;
        evaluator.globals = this.dashboard.globals;
        this.dashboard.OnDirty.subscribe(() => {
            this.saveLayout();
            this.dashboard.setClean();
        });
        this.layout.addWidget(this.dashboard);
    }

    async renderModel(model: IRenderMime.IMimeModel): Promise<void> {
        await this.ready;
        const temp = model.data[MAVEN_LAYOUT_MIME_TYPE] as unknown;
        const dashboardModel = temp as DashboardSerializer.ISerializedDashboard;
        this.node.style.height = `${(dashboardModel.dims || {height: 500}).height}px`;
        this.dashboard.fit();

        await this.dashboard.loadFromModel(dashboardModel);
    }


    public saveLayout() {
        let cur = this.parent;
        while (cur != null) {
            if (cur instanceof CodeCell && RenderedLayout.isEditableCell(cur)) {
                let dash = DashboardSerializer.toJson(this.dashboard);
                dash.visual = true;
                let id = RenderedLayout.getCellLayoutGuid(cur);
                if (!!dash && id === this.dashboard.uuid) {
                    cur.model.value.text = RenderedLayout.getPythonCode(dash);
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

export namespace RenderedLayout {
    export interface IOptions {
        session: IClientSession;
        rendermime: IRenderMimeRegistry;
        factory: PartFactory;
        /** A promise that resolves when other optional services are setup.
         *
         * Eg, the SyncMetadata comm and UDP registration
         */
        ready: Promise<void>;
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


export const mavenLayoutRendererPlugin: JupyterFrontEndPlugin<void> = {
    id: "jupyterlab-mavenworks:layout-renderer",
    autoStart: true,
    requires: [
        IPartFactory,
        INotebookTracker,
        IDashboardTracker
    ],
    optional: [
        ICommandPalette
    ],
    activate: (
        app,
        factory: IPartFactory,
        nbTracker: INotebookTracker,
        dashboardTracker: IDashboardTracker,
        palette?: ICommandPalette
    ) => {
        const { commands } = app;

        // Label-less proxy commands for the toolbar buttons.
        // The Viewer "proxy" also implements the maybeInsert functionality of
        // the old VisualEditorTracker
        commands.addCommand("mavenworks:open-cell-dashboard-visual-editor", {
            iconClass: "fa fa-desktop",
            execute: async () => {
                const nbPanel = nbTracker.currentWidget;
                if (nbPanel == null) return;
                if (dashboardTracker.getCurrentDashboard() == null) {
                    const res = await showDialog({
                        title: "Add new dashboard?",
                        body: "It looks like you haven't selected a dashboard cell. Would you like to add one?",
                        buttons: [Dialog.okButton(), Dialog.cancelButton()]
                    });
                    if (!res.button.accept) return; // cancelled
                    NotebookActions.insertBelow(nbPanel.content);
                    NotebookActions.hideCode(nbPanel.content);
                    const cellModel = nbTracker.activeCell!.model;
                    cellModel.value.text = RenderedLayout.getPythonCode(DashboardSerializer.DEFAULT_DASHBOARD);
                    cellModel.metadata.set("showinviewer", "true");
                    await NotebookActions.run(nbPanel.content, nbPanel.session);
                    await AsyncTools.waitUntil(() => dashboardTracker.getCurrentDashboard() != null, 1000, 100);
                }
                return commands.execute("visual-editor:open");
            }
        });
        commands.addCommand("mavenworks:open-cell-dashboard-globals-editor", {
            iconClass: "fa fa-globe",
            execute: () => commands.execute("@mavenomics/dashboard-devtools:GlobalsEditor:openEditor")
        });

        nbTracker.widgetAdded.connect((_tracker, panel) => {
            const { context, session } = panel;
            const rendermime = panel.content.rendermime;
            const partFactory = factory.get(context);
            const handleManager = DisplayHandleManager.GetManager(session);
            const syncMetadata = new SyncMetadata(session, partFactory, handleManager);
            const registerUDPsPromise = registerUDPs(partFactory, session.path);
            const ready = Promise.all([
                syncMetadata.ready,
                registerUDPsPromise
            ]).then(() => void 0 as void);
            rendermime.addFactory({
                safe: false,
                mimeTypes: [MAVEN_LAYOUT_MIME_TYPE],
                defaultRank: 75,
                createRenderer: () => {
                    return new RenderedLayout({
                        factory: partFactory,
                        rendermime,
                        session,
                        ready
                    });
                },
            });

            const openDesigner = new CommandToolbarButton({
                commands,
                id: "mavenworks:open-cell-dashboard-visual-editor"
            });

            const openGlobals = new CommandToolbarButton({
                commands,
                id: "mavenworks:open-cell-dashboard-globals-editor"
            });

            panel.toolbar.insertItem(0, "Open Editor", openGlobals);
            panel.toolbar.insertItem(0, "add-visual-cell", openDesigner);
            panel.disposed.connect(() => {
                rendermime.removeMimeType(MAVEN_LAYOUT_MIME_TYPE);
                syncMetadata.dispose();
                handleManager.dispose();
                partFactory.dispose();
            });
        });

        RegisterActions(
            app,
            () => dashboardTracker.getCurrentDashboard(),
            "cell-dashboard",
            ".jp-Notebook.jp-mod-commandMode:not(.p-mod-hidden) .m-RenderedLayout",
            "Cell",
            palette
        );
    }
};
