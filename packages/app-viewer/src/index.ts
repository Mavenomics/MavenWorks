// Ambiently set the public path. This _must_ be the first import!
import "./public-path";

import { PageConfig, URLExt } from "@jupyterlab/coreutils";
import { HoverManager, typeEditorFactoryPlugin, defaultTypeEditors } from "@mavenomics/ui";
import { default as appUtils, IUrlManager } from "@mavenomics/apputils";
import { default as defaultParts } from "@mavenomics/default-parts";
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


// IIFE to correct URLs to sharable forms
(function() {
    const isHub = PageConfig.getOption("hub_user") !== "";
    if (!isHub) return; // no correction to make
    const oldUrl = window.location.href;
    const redirect = URLExt.join(
        PageConfig.getOption("hub_host"),
        PageConfig.getOption("hub_prefix"),
        "user-redirect"
    );
    const newUrl = oldUrl.replace(
        PageConfig.getBaseUrl(),
        ""
    );
    window.history.replaceState(null, "", URLExt.join("/", redirect, newUrl));
})();

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
        async function openViewer() {
            await app.started;
            console.log("test", docManager);
            // HACK
            const path = decodeURIComponent(urlManager.path.replace("/view", ""));
            const res = docManager.open(path) as IViewerWidget<NotebookViewer, NotebookModel>;
            if (!res) {
                throw Error("Failed to start notebook!");
            }

            console.log("result", res);

            await res.context.session.ready;

            await registerDashboard(res, partFactory);

            await res.content.executeNotebook();

            console.log("Executed notebook");
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
    const loadChartparts = () => new Promise<JupyterFrontEndPlugin<unknown>>((resolve, reject) => {
        (require as any).ensure(["@mavenomics/chart-parts"],
            (require: NodeRequire) => {
                const pivotPart = require("@mavenomics/chart-parts");
                resolve(pivotPart.default);
            },
            (err: any) => {
                reject(err);
            },
            "@mavenomics/chart-parts"
        );
    });
    const spinny = document.getElementById("loadingSpinny")!;

    const [plotly, chartparts] = await Promise.all([
        loadPlotly(),
        loadChartparts(),
    ]);

    app.registerPlugin(plotly);
    app.registerPlugin(chartparts);
    await app.start();
    spinny.remove();
    app.shell.show();
    console.log("Booted", app);
}

startApp();
