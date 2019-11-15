import { Widget, Panel, BoxLayout } from "@phosphor/widgets";
import { nbformat } from "@jupyterlab/coreutils";
import { Contents, Session, Kernel } from "@jupyterlab/services";
import { DashboardSerializer } from "@mavenomics/dashboard";
import { IUrlManager } from "@mavenomics/apputils";
import { RenderedDashboard } from "@mavenomics/jupyterutils";
import { INotebookModel, Notebook, NotebookModelFactory } from "@jupyterlab/notebook";
import { DocumentRegistry } from "@jupyterlab/docregistry";
import { UUID } from "@phosphor/coreutils";
import { Cell, CodeCell, CodeCellModel } from "@jupyterlab/cells";
import { IRenderMimeRegistry } from "@jupyterlab/rendermime";
import { JupyterFrontEndPlugin } from "@jupyterlab/application";
import { CodeMirrorMimeTypeService } from "@jupyterlab/codemirror";

export class NotebookRunner extends Widget {
    public readonly layout: BoxLayout = new BoxLayout();
    private session: Session.IManager;
    private contents: Contents.IManager;
    private urlManager: IUrlManager;
    private docRegistry: DocumentRegistry;
    private rendermime: IRenderMimeRegistry;
    private notebookModel?: INotebookModel;

    constructor({
        session,
        contents,
        urlManager,
        docRegistry,
        rendermime
    }: NotebookRunner.IOptions) {
        super();
        this.session = session;
        this.contents = contents;
        this.urlManager = urlManager;
        this.docRegistry = docRegistry;
        this.rendermime = rendermime;
    }

    public async loadFromUrl() {
        // HACK;
        const path = decodeURIComponent(this.urlManager.path.replace("/view", ""));
        const content = await this.loadNotebookModel(path);
        if (this.notebookModel != null) {
            this.notebookModel.dispose();
        }
        const notebookLanguage = content.metadata.language_info == null ? undefined
            : content.metadata.language_info.name;
        // const nbFactory = this.docRegistry.getModelFactory("notebook");
        // HACK;
        const nbFactory = new NotebookModelFactory({});
        if (!(nbFactory instanceof NotebookModelFactory)) {
            throw Error("Notebook not setup!");
        }
        this.notebookModel = nbFactory.createNew(notebookLanguage);
        this.notebookModel.fromJSON(content);
        // it's not dirty, even though we changed the model.
        this.notebookModel.dirty = false;
        this.notebookModel.initialize();
        try {
            await this.executeNotebook();
        } catch (err) {
            console.error("Failed to run cells");
            console.error(err);
        }
    }

    // TODO: Move this elsewhere
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
        if (this.session.specs != null) {
            const specName = this.session.specs.default;
            const specModel = this.session.specs.kernelspecs[specName];
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
            source: RenderedDashboard.getPythonCode(data),
            metadata: {
                showinviewer: "true"
            },
            outputs: [
                {
                    output_type: "execute_result",
                    execution_count: null,
                    data: {
                        [DashboardSerializer.MAVEN_LAYOUT_MIME_TYPE]: DashboardSerializer.DEFAULT_DASHBOARD as any
                    },
                    metadata: {}
                }
            ]
        };

        newModel.cells.push(initCell, dashboardCell);
        return newModel;
    }

    private async executeNotebook() {
        performance.mark("beginExecute");
        if (this.notebookModel == null) {
            return; // nothing to execute
        }

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

        // HACK;
        let path = decodeURIComponent(this.urlManager.path.replace("/view", ""));
        const nbKernel = this.notebookModel.metadata.get("kernelspec") as Partial<Kernel.IModel> | undefined;
        const kernelName = nbKernel ? (nbKernel.name) : this.notebookModel.defaultKernelName;
        const session = await this.session.startNew({
            path: path + "/viewer-" + UUID.uuid4(),
            kernelName
        });

        performance.mark("sessionInitialized");
        performance.measure("Initializing Session", "beginExecute", "sessionInitialized");
        const res = session.kernel;
        res.ready.then(() => {
            performance.mark("kernelReady");
            performance.measure("Kernel Initializing", "sessionInitialized", "kernelReady");
        });
        // res.getSpec()
        //     .then(spec => this.toolbar.setKernelLanguage(spec.display_name));
        const content = new Notebook({
            rendermime: this.rendermime,
            // HACK
            mimeTypeService:  new CodeMirrorMimeTypeService(),
        });
        content.model = this.notebookModel;
        const cells = this.notebookModel.cells;
        console.log("Executing", cells.length, "cells");
        // this.toolbar.setKernelStatus(KernelStatus.Busy);
        for (let i = 0; i < cells.length; i++) {
            performance.mark("beginExecuteCell");
            const currentCell = content.widgets[i] as Cell;
            // CodeCells have this css class. Querying via instanceof is unreliable due to module dep graph
            if (currentCell.hasClass("jp-CodeCell")) {
                const res = await CodeCell.execute(currentCell as CodeCell, session as any);
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
                // if (outputItem == null || outputItem.widgets.length < 2) {
                //     continue; // this cell was marked as an output cell,
                //     // but didn't have anything to display.
                // }
                // // first child is a spacer, second is the output we want
                // this.layout.addWidget(outputItem.widgets[1]);
                this.layout.addWidget(outputItem);
            }
        }
        performance.mark("runAllCellsComplete");
        performance.measure("Executing Notebook", "beginExecute", "runAllCellsComplete");
    }
}

export namespace NotebookRunner {
    export interface IOptions {
        session: Session.IManager;
        contents: Contents.IManager;
        urlManager: IUrlManager;
        docRegistry: DocumentRegistry;
        rendermime: IRenderMimeRegistry;
    }
}

const plugin: JupyterFrontEndPlugin<void> = {
    id: "@mavenomics/viewer:notebook-runner",
    requires: [
        IRenderMimeRegistry,
        IUrlManager,
    ],
    autoStart: true,
    activate: (
        app,
        rendermime: IRenderMimeRegistry,
        urlManager: IUrlManager
    ) => {
        const runner = new NotebookRunner({
            session: app.serviceManager.sessions,
            contents: app.serviceManager.contents,
            docRegistry: app.docRegistry,
            rendermime,
            urlManager,
        });
        app.shell.add(runner);
        console.log("runner", runner);
    }
};
export default plugin;
