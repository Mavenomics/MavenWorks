import { WidgetManager, WidgetRenderer } from "@jupyter-widgets/jupyterlab-manager";
import * as base from "@jupyter-widgets/base";
import * as controls from "@jupyter-widgets/controls";
import * as output from "@jupyter-widgets/output";
import * as plotly from "plotlywidget";

// https://github.com/jupyter-widgets/ipywidgets/blob/master/packages/jupyterlab-manager/src/plugin.ts

// TODO: un-any these args
export function registerWidgets(panel: any, context: any, rendermime: any) {
    const extension = new WidgetManager(context, rendermime, {saveState: false});
    extension.register({
        name: "@jupyter-widgets/base",
        version: base.JUPYTER_WIDGETS_VERSION,
        // cast to any since the typings don't like the function exports
        exports: base as any
    });
    extension.register({
        name: "@jupyter-widgets/controls",
        version: controls.JUPYTER_CONTROLS_VERSION,
        exports: controls as any
    });
    extension.register({
        name: "@jupyter-widgets/output",
        version: output.OUTPUT_WIDGET_VERSION,
        exports: output as any
    });
    extension.register({
        name: "plotlywidget",
        version: plotly.version,
        exports: plotly
    });
    // HACK: This is to implement the ipy widgets manager extension without bothering with the full plugin arch.
    panel.content.rendermime.addFactory({
        safe: false,
        mimeTypes: ["application/vnd.jupyter.widget-view+json"],
        createRenderer: (opts: any) => new WidgetRenderer(opts, extension),
    });
}
