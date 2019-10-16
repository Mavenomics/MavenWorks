import { Widget, BoxLayout, BoxPanel, Panel } from "@phosphor/widgets";
import { Signal } from "@phosphor/signaling";
import { RenderMimeRegistry, standardRendererFactories } from "@jupyterlab/rendermime";
import { IEditorMimeTypeService } from "@jupyterlab/codeeditor";
import { CodeMirrorMimeTypeService } from "@jupyterlab/codemirror";
import { Kernel, Session, SessionManager, ServerConnection, ContentsManager } from "@jupyterlab/services";
import { ClientSession } from "@jupyterlab/apputils";
import { Cell, CodeCell, CodeCellModel } from "@jupyterlab/cells";
import { INotebookModel, Notebook, NotebookModelFactory } from "@jupyterlab/notebook";
import { nbformat } from "@jupyterlab/coreutils";
import UrlResolver = RenderMimeRegistry.UrlResolver;
import { KernelStatus, StatusToolbar } from "./StatusToolbar";
import { RenderedLayout, MAVEN_LAYOUT_MIME_TYPE } from "jupyterlab-mavenworks/lib/rendermime/MimeLayoutRenderer";
import { SyncMetadata } from "jupyterlab-mavenworks/lib/framework/SyncMetadata";
import { DocumentRegistry } from "@jupyterlab/docregistry";
import { MathJaxTypesetter } from "@jupyterlab/mathjax2";
import IWidgetExtension = DocumentRegistry.IWidgetExtension;
import { UrlParametersManager } from "@mavenomics/dashboard";
import { UUID } from "@phosphor/coreutils";
import { registerUDPs } from "jupyterlab-mavenworks/lib/util/register-udps";
import { PartFactory } from "@mavenomics/parts";
import "@mavenomics/table";
import { DashboardSerializer } from "@mavenomics/dashboard";
import { default as partsPlugins } from "@mavenomics/default-parts";
import { default as chartPlugin } from "@mavenomics/chart-parts";
import { typeEditorFactoryPlugin, defaultTypeEditors } from "@mavenomics/ui";
import { DisplayHandleManager } from "jupyterlab-mavenworks/lib/framework/displayhandle/handlemanager";

/**
 * Main entry point for the DashboardViewer
 * Don't create it until after ServerContextManager.connected emits 'true'
 */
export class MainApp extends Widget {
    public readonly layout: BoxLayout;
    private readonly conn_opts: ServerConnection.ISettings;
    private notebookModel: INotebookModel | undefined;
    private readonly notebookFactory: NotebookModelFactory = new NotebookModelFactory({});
    private readonly rendermime: RenderMimeRegistry;
    private readonly mimeTypeService: IEditorMimeTypeService;
    private readonly contents: ContentsManager;
    private readonly factory: PartFactory;
    private readonly content: Notebook;
    private readonly sessionManager: Session.IManager;
    private readonly session: ClientSession;
    private readonly toolbar: StatusToolbar;
    private readonly params: UrlParametersManager;
    private readonly outputPanel: BoxPanel;
    private readonly ready: Promise<void>;

    /**
     * Whether the viewer should appear compressed.
     *
     * If embedded, the UI should be stripped of all extraneous elements and
     * made to show nicely in a small region (such as an iframe tooltip)
     *
     */
    private isEmbedded = false;

    constructor() {
        super();
        this.addClass("m-Viewer");
        this.params = new UrlParametersManager({
            filterParameter: (name: string, val: string) => {
                if (name === "embed" && val !== "")
                    return this.isEmbedded = true;
                return false;
            }
        });
        this.params.fetchParameters();

        // This will pull from the page config, which we've already set in the backend
        this.conn_opts = ServerConnection.makeSettings();

        this.sessionManager = new SessionManager({serverSettings: this.conn_opts});
        const session = this.session = new ClientSession({manager: this.sessionManager}) as any;
        this.factory = new PartFactory();

        // hack
        partsPlugins.map(i => i.activate(this, this.factory));
        chartPlugin.activate(this, this.factory);

        this.layout = new BoxLayout({spacing: 0});
        const mimeTypeService = this.mimeTypeService = new CodeMirrorMimeTypeService();
        const contents = this.contents = new ContentsManager({serverSettings: this.conn_opts});
        const rendermime = this.rendermime = new RenderMimeRegistry({
            resolver: new UrlResolver({ contents, session }),
            latexTypesetter: new MathJaxTypesetter({
                url: "https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.5/MathJax.js",
                config: "TeX-AMS-MML_HTMLorMML-full,Safe"
            }),
            initialFactories: standardRendererFactories,
        });

        const displayPolicy = this.dataset["display"] = this.isEmbedded ? "compressed" : "expanded";

        this.content = new Notebook({ mimeTypeService, rendermime });
        this.outputPanel = new BoxPanel();
        // wrap the panel so we can add the shadow
        // (phosphor doesn't like margins)
        const wrapperWidget = new Widget();
        (wrapperWidget.layout = new BoxLayout()).addWidget(this.outputPanel);
        this.outputPanel.addClass("m-OutputPanel");
        wrapperWidget.addClass("m-OutputPanel-Wrapper");
        this.toolbar = new StatusToolbar({clientSession: this.session, showOverlay: displayPolicy === "compressed"});
        BoxLayout.setSizeBasis(this.toolbar, 32);
        BoxLayout.setStretch(this.toolbar, 0);
        BoxLayout.setStretch(wrapperWidget, 1);
        this.layout.addWidget(this.toolbar);
        this.layout.addWidget(wrapperWidget);

        // HACK

        if (displayPolicy === "compressed") {
            this.toolbar.hide();
        }

        const typeEditorFactory = typeEditorFactoryPlugin.activate(this);
        defaultTypeEditors.activate(this, typeEditorFactory);
        const handleManager = DisplayHandleManager.GetManager(session);

        const syncMetadata = new SyncMetadata(session, this.factory, handleManager);
        const registerUDPsPromise = registerUDPs(this.factory, session.path);
        this.ready = Promise.all([
            syncMetadata.ready,
            registerUDPsPromise
        ]).then(() => void 0 as void);
        rendermime.addFactory({
            safe: false,
            mimeTypes: [MAVEN_LAYOUT_MIME_TYPE],
            defaultRank: 75,
            createRenderer: () => {
                return new RenderedLayout({
                    factory: this.factory,
                    rendermime,
                    session,
                    ready: Promise.all([
                        syncMetadata.ready,
                        registerUDPsPromise
                    ]).then(() => void 0 as void)
                });
            },
        });
        this.disposed.connect(() => {
            rendermime.removeMimeType(MAVEN_LAYOUT_MIME_TYPE);
            syncMetadata.dispose();
        });

        this.loadFromUrl();
    }

    public async loadFromUrl() {
        let path = this.getPathFromUrl();
        const content = await this.loadNotebookModel(path);
        if (this.notebookModel != null) {
            this.notebookModel.dispose();
        }
        const notebookLanguage = content.metadata.language_info == null ? undefined
            : content.metadata.language_info.name;
        this.notebookModel = this.notebookFactory.createNew(notebookLanguage);
        this.notebookModel.fromJSON(content);
        // it's not dirty, even though we changed the model.
        this.notebookModel.dirty = false;
        this.notebookModel.initialize();
        // from ipy widget plugin index
        await import(/* webpackChunkName: "ipywidgets" */"./widget-loader")
            .then(module => module.registerWidgets(this, {
                session: this.session,
                saveState: new Signal(this),
                model: this.notebookModel
            }, this.rendermime)
        );
        return this.executeNotebook();
    }

    // noinspection JSMethodCanBeStatic
    public getPathFromUrl() {
        let path = window.location.pathname;
        if (path.indexOf("/view") === -1) {
            console.log("defaulting to fallback");
            path = "/demos/MavenGlobals";
        } else {
            path = path.slice(path.indexOf("/view") + 5);
        }
        return decodeURI(path);
    }

    public dispose() {
        if (this.isDisposed) {
            return;
        }
        if (this.notebookModel != null) {
            this.notebookModel.dispose();
        }
        this.notebookFactory.dispose();
        this.content.dispose();
        super.dispose();
    }

    /** Retrieves a notebook or dashboard doc, and returns a notebook model.
     *
     * #### Notes
     *
     * This "convert dashboard docs to a notebook" approach is used to mimize
     * impact of adding dashboard docs until we have the bandwidth to spend on a
     * refactoring of the viewer.
     *
     * It works by taking the script, adding it as a code cell, and then using
     * Visual Editor tooling to turn the dashboard into a visual dashboard cell.
     * This yields a wonky, but correct, notebook that executes in largely the
     * same manner as real dashboard docs.
     */
    private async loadNotebookModel(path: string): Promise<nbformat.INotebookContent> {
        const model = await this.contents.get(path);
        if (model.type === "notebook") {
            return model.content as nbformat.INotebookContent;
        }
        // assume model is a dashbook
        const data: DashboardSerializer.IDashboardDocument =
            model.format === "json" ? model.content : JSON.parse(model.content);
        const newModel: nbformat.INotebookContent = {
            cells: [],
            metadata: {
                kernelspec: {
                    name: "python3",
                    language: "python",
                    display_name: "Python 3"
                },
                orig_nbformat: nbformat.MAJOR_VERSION,
                globals: (data.globals || {}) as any,
            },
            nbformat: nbformat.MAJOR_VERSION,
            nbformat_minor: nbformat.MINOR_VERSION
        };
        // if the session manager has specs, use them
        if (this.sessionManager.specs != null) {
            const specName = this.sessionManager.specs.default;
            const specModel = this.sessionManager.specs.kernelspecs[specName];
            newModel.metadata.kernelspec = specModel;
        }
        // Code cell from script
        const initCell: nbformat.ICodeCell = {
            cell_type: "code",
            execution_count: null,
            source: (data.init || []).join("\n"),
            metadata: {},
            outputs: []
        };
        const dashboardCell: nbformat.ICodeCell = {
            cell_type: "code",
            execution_count: null,
            source: RenderedLayout.getPythonCode(data),
            metadata: {
                showinviewer: "true"
            },
            outputs: [
                {
                    output_type: "execute_result",
                    execution_count: null,
                    data: {
                        [MAVEN_LAYOUT_MIME_TYPE]: DashboardSerializer.DEFAULT_DASHBOARD as any
                    },
                    metadata: {}
                }
            ]
        };

        newModel.cells.push(initCell, dashboardCell);
        return newModel;
    }

    private executeNotebook() {
        performance.mark("beginExecute");
        if (this.notebookModel == null) {
            return; // nothing to execute
        }
        let path = this.getPathFromUrl();
        this.session.setPath(path + "/viewer-" + UUID.uuid4());

        this.session.kernelPreference = {
            ...this.notebookModel!.metadata.get("kernelspec")! as Partial<Kernel.IModel>,
        };
        this.session.initialize().then(async () => {
            performance.mark("sessionInitialized");
            performance.measure("Initializing Session", "beginExecute", "sessionInitialized");
            const res = this.session.kernel!;
            res.ready.then(() => {
                performance.mark("kernelReady");
                performance.measure("Kernel Initializing", "sessionInitialized", "kernelReady");
            });
            await this.ready;
            res.getSpec()
                .then(spec => this.toolbar.setKernelLanguage(spec.display_name));
            this.content.model = this.notebookModel!;
            const cells = this.notebookModel!.cells;
            console.log("Executing", cells.length, "cells");
            this.toolbar.setKernelStatus(KernelStatus.Busy);
            for (let i = 0; i < cells.length; i++) {
                performance.mark("beginExecuteCell");
                const currentCell = this.content.widgets[i] as Cell;
                // CodeCells have this css class. Querying via instanceof is unreliable due to module dep graph
                if (currentCell.hasClass("jp-CodeCell")) {
                    const res = await CodeCell.execute(currentCell as CodeCell, this.session);
                    if (res && res.content.status === "error") {
                        // execution failed, bail out and alert
                        throw Error((res.content.traceback! as Array<string>).join("\n"));
                    }
                }
                performance.mark("endExecuteCell");
                performance.measure("Executing Cell", "beginExecuteCell", "endExecuteCell");
                if (currentCell.model.metadata.get("showinviewer") === "true"
                    && currentCell instanceof CodeCell) {
                    // Normally we'd clone the output area, and a previous cut
                    // of this did in fact do that. But here we instead reparent
                    // the node to avoid any performance and memory penalties
                    // that stem from having a useless extra dashboard hanging
                    // around and doing nobody any good.
                    // Furthermore, we're not going to fiddle with the notebook
                    // again, so this is safe (even though it normally wouldn't
                    // be).
                    const outputItem: Panel = currentCell.outputArea.widgets[0] as Panel;
                    if (outputItem == null || outputItem.widgets.length < 2) {
                        continue; // this cell was marked as an output cell,
                        // but didn't have anything to display.
                    }
                    // first child is a spacer, second is the output we want
                    this.outputPanel.addWidget(outputItem.widgets[1]);
                }
            }
            performance.mark("runAllCellsComplete");
            performance.measure("Executing Notebook", "beginExecute", "runAllCellsComplete");
        }).then(() => {
            this.toolbar.setKernelStatus(KernelStatus.Idle);
            for (const child of this.outputPanel.widgets) {
                if (child instanceof RenderedLayout) {
                    this.params.applyParameters(child.dashboard.globals);
                }
            }
            this.params.paramsDidChange.subscribe(() => {
                for (const child of this.outputPanel.widgets) {
                    if (child instanceof RenderedLayout) {
                        this.params.applyParameters(child.dashboard.globals);
                    }
                }
            });
        }).catch((err) => {
            console.error("Failed to run cells");
            console.error(err);
            this.toolbar.setKernelStatus(KernelStatus.Error);
        });
        // explicity trust this notebook
        // Without trust, the Maven MimeTypeRenderers won't be picked from the RenderMimeRegistry
        for (let i = 0; i < this.notebookModel.cells.length; i++) {
            const cell = this.notebookModel.cells.get(i);
            if (cell == null || !(cell instanceof CodeCellModel)) {
                continue;
            }
            cell.outputs.clear();
            cell.trusted = true;
        }
    }
}
