import { JupyterFrontEndPlugin } from "@jupyterlab/application";
import { WidgetTracker, IWidgetTracker } from "@jupyterlab/apputils";
import { IRenderMimeRegistry } from "@jupyterlab/rendermime";
import { NotebookModelFactory, NotebookModel } from "@jupyterlab/notebook";
import { NotebookViewerFactory } from "./factory";
import { IEditorServices } from "@jupyterlab/codeeditor";
import { NotebookViewer } from "./widget";
import { Token } from "@phosphor/coreutils";
import { IViewerWidget } from "../utils/viewerwidget";

type IViewerPanel = IViewerWidget<NotebookViewer, NotebookModel>;
export type INotebookViewerTracker = IWidgetTracker<IViewerPanel>;
export const INotebookViewerTracker = new Token<INotebookViewerTracker>(
    "@mavenomics/viewer:notebook-runner-tracker"
);

const plugin: JupyterFrontEndPlugin<INotebookViewerTracker> = {
    id: "@mavenomics/viewer:notebook-runner",
    autoStart: true,
    requires: [
        IRenderMimeRegistry,
        IEditorServices,
    ],
    provides: INotebookViewerTracker,
    activate: (
        app,
        rendermime: IRenderMimeRegistry,
        editorServices: IEditorServices
    ) => {
        const { docRegistry } = app;

        const tracker = new WidgetTracker<IViewerPanel>({namespace: "notebook"});

        const factory = new NotebookViewerFactory({
            name: "Notebook",
            fileTypes: ["notebook"],
            modelName: "notebook",
            defaultFor: ["notebook"],
            preferKernel: true,
            canStartKernel: true,
            rendermime,
            mimeTypeService: editorServices.mimeTypeService
        });

        docRegistry.addModelFactory(new NotebookModelFactory({}));
        docRegistry.addWidgetFactory(factory);

        factory.widgetCreated.connect((_sender, widget) => {
            tracker.add(widget);
        });

        return tracker;
    }
};
export default plugin;
