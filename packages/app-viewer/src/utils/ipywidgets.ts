/**
 * Parts of this file were taken from
 * jupyter-widgets/ipywidgets/blob/857bee9c/packages/jupyterlab-manager/src/plugin.ts#L120,
 * and are thus covered under the JupyterLab BSD 3-Clause license.
 */

import * as base from "@jupyter-widgets/base";
import { WidgetRenderer } from "@jupyter-widgets/jupyterlab-manager";
import { JupyterFrontEndPlugin } from "@jupyterlab/application";
import { IRenderMimeRegistry } from "@jupyterlab/rendermime";
import { toArray } from "@phosphor/algorithm";
import { DocumentRegistry } from "@jupyterlab/docregistry";
import { INotebookModel } from "@jupyterlab/notebook";
import { DisposableDelegate } from "@phosphor/disposable";
import { AttachedProperty } from "@phosphor/properties";
import { INotebookViewerTracker } from "../runner/plugin";
import { NotebookViewer } from "../runner/widget";

// import unexported symbols that are important for lab compat
import { OUTPUT_WIDGET_VERSION, OutputView, OutputModel } from "@jupyter-widgets/jupyterlab-manager/lib/output";
import { WIDGET_VIEW_MIMETYPE, WidgetManager } from "@jupyter-widgets/jupyterlab-manager/lib/manager";

// We import only the version from the specific module in controls so that the
// controls code can be split and dynamically loaded in webpack.
import { JUPYTER_CONTROLS_VERSION } from "@jupyter-widgets/controls/lib/version";

const WIDGET_REGISTRY: base.IWidgetRegistryData[] = [];

function* widgetRenderers(nb: NotebookViewer) {
    for (const outputs of nb.layout.widgets) {
        for (const output of toArray(outputs.children())) {
            if (output instanceof WidgetRenderer) {
                yield output;
            }
        }
    }
}

function registerWidgetManager(
    context: DocumentRegistry.IContext<INotebookModel>,
    rendermime: IRenderMimeRegistry,
    renderers: IterableIterator<WidgetRenderer>
) {
    let wManager = Private.widgetManagerProperty.get(context);
    if (!wManager) {
        wManager = new WidgetManager(context, rendermime, { saveState: false });
        WIDGET_REGISTRY.forEach(data => wManager!.register(data));
        Private.widgetManagerProperty.set(context, wManager);
    }

    for (let r of renderers) {
        r.manager = wManager;
    }

    // Replace the placeholder widget renderer with one bound to this widget
    // manager.
    rendermime.removeMimeType(WIDGET_VIEW_MIMETYPE);
    rendermime.addFactory({
        safe: false,
        mimeTypes: [WIDGET_VIEW_MIMETYPE],
            createRenderer: (options) => new WidgetRenderer(options, wManager)
    }, 0);

    return new DisposableDelegate(() => {
        if (rendermime) {
            rendermime.removeMimeType(WIDGET_VIEW_MIMETYPE);
        }
        if (!wManager) return;
        wManager.dispose();
    });
}

const plugin: JupyterFrontEndPlugin<base.IJupyterWidgetRegistry> = {
    id: "@mavenomics/viewer:jupyter-widget-registry",
    autoStart: true,
    requires: [IRenderMimeRegistry, INotebookViewerTracker],
    provides: base.IJupyterWidgetRegistry,
    activate: (
        _app,
        rendermime: IRenderMimeRegistry,
        tracker: INotebookViewerTracker
    ) => {
        // Add a placeholder widget renderer.
        rendermime.addFactory({
                safe: false,
                mimeTypes: [WIDGET_VIEW_MIMETYPE],
                createRenderer: options => new WidgetRenderer(options)
            },
            0
        );

        tracker.forEach(panel => {
            registerWidgetManager(
                panel.context,
                panel.content.rendermime,
                widgetRenderers(panel.content),
            );
        });

        tracker.widgetAdded.connect((_, panel) => {
            registerWidgetManager(
                panel.context,
                panel.content.rendermime,
                widgetRenderers(panel.content),
            );
        });

        WIDGET_REGISTRY.push({
            name: "@jupyter-widgets/base",
            version: base.JUPYTER_WIDGETS_VERSION,
            exports: {
                WidgetModel: base.WidgetModel,
                WidgetView: base.WidgetView,
                DOMWidgetView: base.DOMWidgetView,
                DOMWidgetModel: base.DOMWidgetModel,
                LayoutModel: base.LayoutModel,
                LayoutView: base.LayoutView,
                StyleModel: base.StyleModel,
                StyleView: base.StyleView
            }
        });

        WIDGET_REGISTRY.push({
            name: "@jupyter-widgets/controls",
            version: JUPYTER_CONTROLS_VERSION,
            exports: () => {
                return new Promise((resolve, reject) => {
                    // Remember that we can't use await import() due to TS's
                    // target setting- import() gets transformed to a bare require
                    // in that case (breaking the benefits of async loading).
                    (require as any).ensure(["@jupyter-widgets/controls"],
                        (require: NodeRequire) => {
                            resolve(require("@jupyter-widgets/controls"));
                        },
                        (err: any) => {
                            reject(err);
                        },
                        "@jupyter-widgets/controls"
                    );
                });
            }
        });

        WIDGET_REGISTRY.push({
            name: "@jupyter-widgets/output",
            version: OUTPUT_WIDGET_VERSION,
            exports: {OutputModel, OutputView}
        });

        return {
            registerWidget(data: base.IWidgetRegistryData): void {
                WIDGET_REGISTRY.push(data);
            }
        };

    }
};
export default plugin;

namespace Private {
    /**
     * A private attached property for a widget manager.
     */
    export const widgetManagerProperty = new AttachedProperty<
        DocumentRegistry.Context,
        WidgetManager | undefined
    >({
        name: "widgetManager",
        create: () => undefined
    });
}
