import { MainApp } from "./application";
import { default as defaultParts } from "@mavenomics/default-parts";
import { default as pivotPart } from "@mavenomics/chart-parts";
import { default as appUtils, IUserManager } from "@mavenomics/apputils";
import { default as uiTools, IDashboardTracker } from "@mavenomics/dashboard-devtools";
import { default as mqlTooling } from "@mavenomics/mql-tooling";
import helpPlugins, { IHelpDocProvider } from "@mavenomics/help";
import helpMqlPlugins from "@mavenomics/help-mql";
import { MavenWorksShell } from "./shell";
import { commandsPlugin } from "./commands";
import { partsEditorPlugin } from "./editors/plugin";
import { IPartFactory } from "@mavenomics/parts";
import { Widget } from "@phosphor/widgets";
import { HoverManager, typeEditorFactoryPlugin, defaultTypeEditors } from "@mavenomics/ui";
import "@mavenomics/table"; // import to plugin table serializer
// TODO: We need to keep these imports in JS since Webpack doesn't seem to
// handle import order in CSS properly. cf. https://github.com/webpack-contrib/extract-text-webpack-plugin/issues/200
import "@jupyterlab/application/style/index.css";
import "font-awesome/css/font-awesome.css";
import "jupyterlab-mavenworks/style/index.css"; // TODO: Move out editor CSS?
import "../style/main.css";
import { configBrowserPlugin } from "./browser";
import { login } from "./login";
import { configCmdPlugin } from "./config-commands";
import { PageConfig } from "@jupyterlab/coreutils";

const app = new MainApp({
    shell: new MavenWorksShell()
});

Widget.attach(HoverManager.GetManager(), document.body);

app.registerPlugins(appUtils);
const useConfig = PageConfig.getOption("enableConfig");
if (useConfig === "true") {
    app.registerPlugin(configCmdPlugin);
    app.registerPlugin(configBrowserPlugin);
    app.started.then(async () => {
        const user = await app.resolveRequiredService(IUserManager);
        if (!await user.checkIsSignedIn()) {
            await login(user, app.shell);
        }
        await app.commands.execute("@mavenomics/standalone:load-from-url");
    });
} else {
    app.started.then(() => app.commands.execute("@mavenomics/standalone:load-from-url"));
}

// dashboard tracker
app.registerPlugin({
    id: "builtin:dashboard-tracker",
    provides: IDashboardTracker,
    activate: (app) => {
        return new class implements IDashboardTracker {
            getCurrentDashboard() {
                return app.shell.dashboard;
            }
        };
    }
});

app.registerPlugin(mqlTooling);
app.registerPlugin(typeEditorFactoryPlugin);
app.registerPlugin(defaultTypeEditors);
app.registerPlugin(commandsPlugin);
app.registerPlugin(partsEditorPlugin);
app.registerPlugins(helpPlugins);
app.registerPlugins(helpMqlPlugins);
app.registerPlugins(uiTools);

// register a plugin that provides the part factory
app.registerPlugin({
    id: "@mavenomics/standalone:part-factory",
    autoStart: true,
    provides: IPartFactory,
    activate(app) {
        return new class implements IPartFactory {
            public root = app.shell.factory;
            get() { return app.shell.factory; }
            registerPart(name: string, ctor: any) {
                return app.shell.factory.registerPart(name, ctor);
            }
        };
    }
});

// register a helper to import the markdown docs
app.registerPlugin({
    id: "@mavenomics/standalone:narrative-docs",
    autoStart: true,
    requires: [IHelpDocProvider],
    activate: (_app, doc: IHelpDocProvider) => {
        const urls = [
            import("../../../docs/user/dashboarding-101.md"),
            import("../../../docs/user/queries.md"),
            import("../../../docs/user/graphing-calculator.md"),
        ];
        Promise.all(urls).then(docs => {
            docs.map(i => doc.addDocument(i));
        });
    }
});

// register builtin parts
app.registerPlugins(defaultParts);
app.registerPlugin(pivotPart);
app.shell.hide();

const loadIcon = document.getElementById("loadingSpinny");

app.start().then(async () => {
    // kill the loading icon once the widget mounts
    // TODO: Wait for the app to load/be ready?
    loadIcon!.remove();
    app.shell.show();
}).catch(err => {
    loadIcon!.remove();
    HoverManager.Instance!.openErrorDialog(err);
});
