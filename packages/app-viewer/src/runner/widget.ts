import { IEditorMimeTypeService } from "@jupyterlab/codeeditor";
import { Notebook, NotebookModel } from "@jupyterlab/notebook";
import { IRenderMimeRegistry } from "@jupyterlab/rendermime";
import { Widget, BoxLayout, Panel } from "@phosphor/widgets";
import { DocumentRegistry } from "@jupyterlab/docregistry";
import { Cell, CodeCell } from "@jupyterlab/cells";
import { KernelError } from "@mavenomics/jupyterutils";
import { UUID } from "@phosphor/coreutils";

export class NotebookViewer extends Widget {
    public readonly layout: BoxLayout;
    public readonly rendermime: IRenderMimeRegistry;
    private readonly context: DocumentRegistry.IContext<NotebookModel>;

    private readonly notebook: Notebook;

    constructor({
        rendermime,
        mimeTypeService,
        context,
    }: NotebookViewer.IOptions) {
        super();
        this.rendermime = rendermime;
        this.context = context;
        this.notebook = new Notebook({
            rendermime,
            mimeTypeService
        });
        this.notebook.model = context.model;

        this.layout = new BoxLayout();
    }

    public async executeNotebook() {
        const cells = this.notebook.model.cells;
        console.log("Executing", cells.length, "cells");

        performance.mark("beginExecute");
        for (const cell of this.notebook.widgets) {
            if (!(cell instanceof Cell)) continue;
            performance.mark("beginExecuteCell");
            await this.executeCell(cell);
            performance.mark("endExecuteCell");
            performance.measure("Executing Cell", "beginExecuteCell", "endExecuteCell");
            const showinviewer = cell.model.metadata.get("showinviewer");
            if (!(cell instanceof CodeCell) || showinviewer !== "true") {
                continue;
            }

            // Normally we'd clone the output area, and a previous cut
            // of this did in fact do that. But here we instead reparent
            // the node to avoid any performance and memory penalties
            // that stem from having a useless extra dashboard hanging
            // around and doing nobody any good.
            // Furthermore, we're not going to fiddle with the notebook
            // again, so this is safe (even though it normally wouldn't
            // be).
            const outputItem: Panel = cell.outputArea.widgets[0] as Panel;
            if (outputItem == null) {
                // this cell was marked as an output cell, but didn't have
                // anything to display.
                continue;
            }
            this.layout.addWidget(outputItem);
        }
        performance.mark("runAllCellsComplete");
        performance.measure("Executing Notebook", "beginExecute", "runAllCellsComplete");
    }

    private async executeCell(cell: Cell) {
        if (!(cell instanceof CodeCell)) return;
        const res = await CodeCell.execute(cell, this.context.session);
        if (res && res.content.status === "error") {
            // execution failed, bail out and alert
            throw await KernelError.Create(
                res.content.traceback,
                this.context.session.kernelDisplayName
            );
        }
        return res;
    }
}

export namespace NotebookViewer {
    export interface IOptions {
        rendermime: IRenderMimeRegistry;
        mimeTypeService: IEditorMimeTypeService;
        context: DocumentRegistry.IContext<NotebookModel>;
    }
}
