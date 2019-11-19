// Ambiently set the public path. This _must_ be the first import!
import "./public-path";

import { PageConfig, URLExt } from "@jupyterlab/coreutils";
import { HoverManager, typeEditorFactoryPlugin, defaultTypeEditors } from "@mavenomics/ui";
import { default as appUtils, IUrlManager } from "@mavenomics/apputils";
import { default as defaultParts } from "@mavenomics/default-parts";
import { default as pivotPart } from "@mavenomics/chart-parts";
import { factoryExtPlugin } from "@mavenomics/parts";
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
import dashboardRendererPlugin from "./dashboard-renderer";
import { NotebookViewer } from "./runner/widget";


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
app.registerPlugin(pivotPart);

// Viewer specific plugins
app.registerPlugin(runner);
app.registerPlugin(dashboardRendererPlugin);

app.registerPlugin({
    id: "@mavenomics/viewer:open",
    requires: [IDocumentManager, IUrlManager, INotebookViewerTracker],
    autoStart: true,
    activate: (
        app,
        docManager: IDocumentManager,
        urlManager: IUrlManager,
        notebookTracker: INotebookViewerTracker,
    ) => {
        console.log("test", docManager);
        // HACK
        const path = decodeURIComponent(urlManager.path.replace("/view", ""));
        const res = docManager.open(path);
        if (!res) {
            throw Error("Failed to start notebook!");
        }
        res.context.ready.then(() => {
            (res.content as NotebookViewer).executeNotebook();
        });
        console.log("result", res);
    }
});

Widget.attach(HoverManager.GetManager(), document.body);

const spinny = document.getElementById("loadingSpinny")!;

app.start().then(() => {
    app.shell.show();
    console.log("Booted", app);
    spinny.remove();
});
