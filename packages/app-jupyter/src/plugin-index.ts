// import the table to ensure that it registers types
// TODO: Move to a more appropriate spot
import "@mavenomics/table";
import "../style/index.css";
import { JupyterFrontEnd, JupyterFrontEndPlugin } from "@jupyterlab/application";
import { mavenLayoutRendererPlugin } from "./rendermime/MimeLayoutRenderer";
import { NotebookTools, INotebookTools, INotebookTracker } from "@jupyterlab/notebook";
import { partEditorPlugin } from "./editors/PartEditor/PartEditorPlugin";
import { HoverManager, typeEditorFactoryPlugin, defaultTypeEditors } from "@mavenomics/ui";
import { Widget } from "@phosphor/widgets";
import { factoryExtPlugin } from "@mavenomics/parts";
import { dashboardEditorPlugin } from "./editors/DashboardEditor/plugin";
import { showInViewerExtension } from "./framework/ShowInViewerExtension";
import { default as partsPlugins } from "@mavenomics/default-parts";
import { default as chartPlugin } from "@mavenomics/chart-parts";
import { default as uiPlugins } from "@mavenomics/dashboard-devtools";
import { dashboardTrackerPlugin } from "./framework/DashboardTrackerPlugin";

function createShowInViewerSelector(): NotebookTools.KeySelector {
    let options: NotebookTools.KeySelector.IOptions = {
        key: "showinviewer",
        title: "Show In Viewer",
        optionsMap: {
            "True": "true",
            "False": "false",
        }
    };
    return new NotebookTools.KeySelector(options);
}
function activateShowInViewer(app: JupyterFrontEnd, cellTools: INotebookTools) {
    let showInViewerTool = createShowInViewerSelector();
    cellTools.addItem({tool: showInViewerTool, rank: 6});
    // TODO: Not the place for this
    Widget.attach(HoverManager.GetManager(), document.body);
}

const activateShowInViewerExtension: JupyterFrontEndPlugin<void> = {
    id: "jupyterlab-mavenworks:show-in-viewer",
    autoStart: true,
    requires: [INotebookTools, INotebookTracker],
    activate: activateShowInViewer
};

const extensions: JupyterFrontEndPlugin<any>[] = [
    typeEditorFactoryPlugin,
    defaultTypeEditors,
    factoryExtPlugin,
    ...partsPlugins,
    chartPlugin,
    mavenLayoutRendererPlugin,
    activateShowInViewerExtension,
    partEditorPlugin,
    dashboardEditorPlugin,
    showInViewerExtension,
    dashboardTrackerPlugin,
    ...uiPlugins,
];
export default extensions;
