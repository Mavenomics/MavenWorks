import { JupyterFrontEndPlugin } from "@jupyterlab/application";
import { WidgetTracker, IWidgetTracker } from "@jupyterlab/apputils";
import { IRenderMimeRegistry } from "@jupyterlab/rendermime";
import { NotebookModelFactory, NotebookModel } from "@jupyterlab/notebook";
import { NotebookViewerFactory } from "./factory";
import { IEditorServices } from "@jupyterlab/codeeditor";
import { NotebookViewer } from "./widget";
import { Token } from "@phosphor/coreutils";
import { IViewerWidget } from "../utils/viewerwidget";
import { IPlugin } from "@phosphor/application";
import { Viewer } from "../viewer";

type IViewerPanel = IViewerWidget<NotebookViewer, NotebookModel>;
export type INotebookViewerTracker = IWidgetTracker<IViewerPanel>;
export const INotebookViewerTracker = new Token<INotebookViewerTracker>(
    "@mavenomics/viewer:notebook-runner-tracker"
);

const plugin: IPlugin<Viewer, INotebookViewerTracker> = {
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
        const { docRegistry, shell } = app;

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
            const content = widget.content,
                session = widget.context.session;
            shell.toolbar.setKernelLanguage(session.kernelDisplayName);
            session.kernelChanged.connect((_) => {
                shell.toolbar.setKernelLanguage(session.kernelDisplayName);
            });
            content.stateChanged.connect(
                (_, state) => shell.toolbar.setKernelStatus(state)
            );
        });

        return tracker;
    }
};
export default plugin;
