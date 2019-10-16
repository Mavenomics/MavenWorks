import { JupyterFrontEndPlugin } from "@jupyterlab/application";
import { INotebookTracker } from "@jupyterlab/notebook";
import { IDashboardEditorTracker } from "../editors/DashboardEditor/plugin";
import { DocumentWidget } from "@jupyterlab/docregistry";
import { ToolbarButton, IWidgetTracker } from "@jupyterlab/apputils";
import { PageConfig, URLExt } from "@jupyterlab/coreutils";

export const showInViewerExtension: JupyterFrontEndPlugin<void> = {
    id: "jupyterlab-mavenworks:showinviewer-extension",
    requires: [
        INotebookTracker,
        IDashboardEditorTracker
    ],
    autoStart: true,
    activate: (
        _app,
        notebookTracker: INotebookTracker,
        dashboardTracker: IDashboardEditorTracker
    ) => {
        const addButton = (_sender: IWidgetTracker<any>, panel: DocumentWidget) => {
            const button2 = new ToolbarButton({
                className: "fa fa-eye",
                onClick: () => {
                    const baseUrl = PageConfig.getBaseUrl();
                    const url = baseUrl === "/" ? "/view" : URLExt.join(baseUrl, "view");
                    window.open(URLExt.join(url, encodeURI(panel.context.path)), "_blank");
                },
                tooltip: "Open in viewer"
            });

            panel.toolbar.insertItem(0, "viewer", button2);

            panel.disposed.connect(() => {
                button2.dispose();
            });
        };
        notebookTracker.widgetAdded.connect(addButton);
        dashboardTracker.widgetAdded.connect(addButton);
    }
};
