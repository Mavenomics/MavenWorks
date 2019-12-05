import { PartManager } from "@mavenomics/dashboard";
import { KernelProxyPart } from "@mavenomics/jupyterutils";
import { WidgetRenderer, registerWidgetManager } from "@jupyter-widgets/jupyterlab-manager";
import { JupyterFrontEndPlugin } from "@jupyterlab/application";
import { IDashboardEditorTracker } from "./plugin";
import { IJupyterWidgetRegistry } from "@jupyter-widgets/base";

/** Helper plugin that adds IPyWidget support to Dashboard Docs. */

function* collectWidgetRenderers(partManager: PartManager) {
    for (const [_, part] of partManager) {
        if (!(part instanceof KernelProxyPart)) continue;
        if (part.renderer instanceof WidgetRenderer) {
            yield part.renderer;
        }
    }
}

const plugin: JupyterFrontEndPlugin<void> = {
    id: "jupyterlab-mavenworks:dashboard-doc-widget-manager",
    autoStart: true,
    requires: [
        IDashboardEditorTracker
    ],
    optional: [
        // if the widgets aren't there do nothing
        IJupyterWidgetRegistry
    ],
    activate: (
        _app,
        tracker: IDashboardEditorTracker,
        registry?: IJupyterWidgetRegistry
    ) => {
        if (registry == null) return; // ipywidgets isn't installed

        tracker.forEach(i => {
            registerWidgetManager(
                i.context as any,
                i.rendermime,
                collectWidgetRenderers(i.content.partManager)
            );
        });

        tracker.widgetAdded.connect((_, i) => {
            registerWidgetManager(
                i.context as any,
                i.rendermime,
                collectWidgetRenderers(i.content.partManager)
            );
        });
    }
};
export default plugin;
