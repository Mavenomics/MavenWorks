// Ambiently set the public path. This _must_ be the first import!
import "./public-path";

import { PageConfig, URLExt } from "@jupyterlab/coreutils";
import { HoverManager, typeEditorFactoryPlugin, defaultTypeEditors } from "@mavenomics/ui";
import { default as appUtils, IUrlManager } from "@mavenomics/apputils";
import { default as defaultParts } from "@mavenomics/default-parts";
import { default as chartParts } from "@mavenomics/chart-parts";
import { factoryExtPlugin, IPartFactory } from "@mavenomics/parts";
import { Widget } from "@phosphor/widgets";
import { Viewer } from "./viewer";
import { ViewerShell } from "./shell";
import { default as runner, INotebookViewerTracker } from "./runner/plugin";
import { default as labPlugins } from "./utils";
import "../styles/index.css";

// import the table to ensure that it registers types
// TODO: Move to a more appropriate spot
import "@mavenomics/table";
import { IDocumentManager } from "@jupyterlab/docmanager";
import { registerDashboard } from "./dashboard-renderer";
import { NotebookViewer } from "./runner/widget";
import { JupyterFrontEndPlugin } from "@jupyterlab/application";
import { IViewerWidget } from "./utils/viewerwidget";
import { NotebookModel } from "@jupyterlab/notebook";
import { deserialize } from "@mavenomics/coreutils";

const app = new Viewer({
    shell: new ViewerShell()
});

app.shell.hide();

//#region JupyterLab plugins
app.registerPlugins(labPlugins);
//#endregion
// todo: fix typing
app.registerPlugins(appUtils as any[]);
app.registerPlugin(typeEditorFactoryPlugin);
app.registerPlugin(defaultTypeEditors);
app.registerPlugin(factoryExtPlugin);
app.registerPlugins(defaultParts);
app.registerPlugin(chartParts);

// Viewer specific plugins
app.registerPlugins(runner);

app.registerPlugin({
    id: "@mavenomics/viewer:open",
    requires: [
        IDocumentManager,
        IUrlManager,
        IPartFactory,
        INotebookViewerTracker
    ],
    autoStart: true,
    activate: (
        app,
        docManager: IDocumentManager,
        urlManager: IUrlManager,
        partFactory: IPartFactory,
    ) => {
        if (urlManager.query.get("embed") === "true") {
            // enable embed mode
            app.shell.embed = true;
        }

        async function openViewer() {
            await app.started;
            // HACK
            const path = decodeURIComponent(urlManager.path.replace("/view", ""));
            const res = docManager.open(path) as IViewerWidget<NotebookViewer, NotebookModel>;
            if (!res) {
                throw Error("Failed to start notebook!");
            }

            await res.context.session.ready;

            await registerDashboard(res, partFactory);

            function getOverrides() {
                const overrides: Record<string, any> = {};
                for (const [name, value] of urlManager.query.entries()) {
                    if (name === "embed") continue; //todo: add embed to blacklist
                    try {
                        overrides[name] = deserialize(JSON.parse(value));
                    } catch (err) {
                        console.error("Failed to load override", name, "=", value);
                        console.error(err);
                    }
                }
                return overrides;
            }

            urlManager.onQueryChange.subscribe(() => {
                res.content.setOverrides(getOverrides());
            })

            await res.content.executeNotebook();

            res.content.setOverrides(getOverrides());
        }
        openViewer();
    }
});

Widget.attach(HoverManager.GetManager(), document.body);

async function startApp() {
    // Remember that we can't use await import() due to TS's
    // target setting- import() gets transformed to a bare require
    // in that case (breaking the benefits of async loading).
    const loadPlotly = () => new Promise<JupyterFrontEndPlugin<unknown>>((resolve, reject) => {
        (require as any).ensure(["plotlywidget/src/jupyterlab-plugin.js"],
            (require: NodeRequire) => {
                const plotlywidget = require("plotlywidget/src/jupyterlab-plugin.js");
                resolve(plotlywidget);
            },
            (err: any) => {
                reject(err);
            },
            "plotlywidget"
        );
    });
    const spinny = document.getElementById("loadingSpinny")!;

    const [plotly] = await Promise.all([
        loadPlotly()
    ]);

    app.registerPlugin(plotly);
    await app.start();
    spinny.remove();
    app.shell.show();
}

startApp();
