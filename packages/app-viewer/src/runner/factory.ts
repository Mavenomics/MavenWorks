import { ABCWidgetFactory, DocumentRegistry } from "@jupyterlab/docregistry";
import { NotebookModel } from "@jupyterlab/notebook";
import { IRenderMimeRegistry } from "@jupyterlab/rendermime";
import { IViewerWidget, ViewerWidget } from "../utils/viewerwidget";
import { NotebookViewer } from "./widget";
import { IEditorMimeTypeService } from "@jupyterlab/codeeditor";

export class NotebookViewerFactory extends ABCWidgetFactory<
    IViewerWidget<NotebookViewer, NotebookModel>
> {
    private readonly rendermime: IRenderMimeRegistry;
    private readonly mimeTypeService: IEditorMimeTypeService;

    constructor({
        rendermime,
        mimeTypeService,
        ...opts
    }: NotebookViewerFactory.IOptions) {
        super(opts);
        this.rendermime = rendermime;
        this.mimeTypeService = mimeTypeService;
    }

    // todo: implement source cloning?
    protected createNewWidget(
        context: DocumentRegistry.IContext<NotebookModel>
    ): IViewerWidget<NotebookViewer, NotebookModel> {
        const content = new NotebookViewer({
            rendermime: this.rendermime.clone({ resolver: context.urlResolver }),
            mimeTypeService: this.mimeTypeService,
            context,
        });
        return new ViewerWidget({
            content,
            context
        });
    }
}

export namespace NotebookViewerFactory {
    export interface IOptions extends DocumentRegistry.IWidgetFactoryOptions<
        IViewerWidget<NotebookViewer, NotebookModel>
    > {
        rendermime: IRenderMimeRegistry;
        mimeTypeService: IEditorMimeTypeService;
    }
}
