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
import { DashboardDocModelFactory } from "./dashboard-model-factory";

type IViewerPanel = IViewerWidget<NotebookViewer, NotebookModel>;
export type INotebookViewerTracker = IWidgetTracker<IViewerPanel>;
export const INotebookViewerTracker = new Token<INotebookViewerTracker>(
    "@mavenomics/viewer:notebook-runner-tracker"
);

function trackNewViewer(
    app: Viewer,
    tracker: WidgetTracker<IViewerPanel>,
    _sender: unknown,
    widget: IViewerPanel
) {
    const shell = app.shell;
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
}

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

        factory.widgetCreated.connect(
            trackNewViewer.bind(void 0, app, tracker)
        );

        return tracker;
    }
};

const dashboardDocPlugin: IPlugin<Viewer, void> = {
    id: "@mavenomics/viewer:dashboard-doc-support",
    autoStart: true,
    requires: [
        INotebookViewerTracker,
        IRenderMimeRegistry,
        IEditorServices,
    ],
    activate: (
        app,
        tracker: INotebookViewerTracker,
        rendermime: IRenderMimeRegistry,
        editorServices: IEditorServices
    ) => {
        const { docRegistry } = app;

        if (!(tracker instanceof WidgetTracker)) return;

        docRegistry.addFileType({
            displayName: "MavenWorks Dashboard",
            extensions: [
                ".dashboard"
            ],
            fileFormat: "json",
            mimeTypes: [
                "text/plain",
                "application/json",
            ],
            name: "dashboard",
            iconClass: "m-FileIcon material-icons",
            iconLabel: "dashboard"
        });

        const factory = new NotebookViewerFactory({
            name: "Dashboard Document",
            fileTypes: ["dashboard"],
            modelName: "dashboard",
            defaultFor: ["dashboard"],
            preferKernel: true,
            canStartKernel: true,
            rendermime,
            mimeTypeService: editorServices.mimeTypeService
        });

        docRegistry.addModelFactory(new DashboardDocModelFactory());
        docRegistry.addWidgetFactory(factory);

        factory.widgetCreated.connect(
            trackNewViewer.bind(void 0, app, tracker)
        );
    }
};

const plugins = [
    plugin,
    dashboardDocPlugin,
];
export default plugins;
