import { MainApp } from "./application";
import { default as defaultParts } from "@mavenomics/default-parts";
import { default as pivotPart } from "@mavenomics/chart-parts";
import { default as appUtils, IUserManager, IConfigManager, IUrlManager } from "@mavenomics/apputils";
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

// Check if the user-agent is a mobile device, and if so, alert them that
// this app isn't designed for mobile devices
(function () {
    if (!/Mobi/.test(navigator.userAgent)) {
        return;
    }
    // IMPORTANT!
    // Do _not_ rely on this as a reliable check for actually _being_ a mobile
    // device. On top of this falsely matching tablets like iPads (which, while
    // we don't support, _do work_ if you use a mouse), it also is prone to
    // false negatives; doesn't match more exotic platforms (Smart TVs, fridges,
    // robot dogs...); and does no feature detection (again, you can plug mice
    // and trackpads into phones. That works.).
    // For that reason, it is important that we do _nothing_ more than an alert.
    // That allows platforms that _will_ work to simply get on with it.
    alert(
        "Hey! Listen! \n\n" +
        "MavenWorks is not designed for mobile devices, and you may " +
        "experience strange bugs when using this on a touch screen. " +
        "MavenWorks is also very resource-hungry, which can hurt your " +
        "battery life on a phone. For best results, we recommend opening " +
        "this page on a laptop or desktop."
    );
})();

const app = new MainApp({
    shell: new MavenWorksShell()
});

/**
 * When focus moves to the document root, re-focus the main dashboard
 * cf. #39 for more details on why this is necessary.
 *
 * How this works is that we first mount a CAPTURING-phase `focusout` handler on
 * the document root. This will catch the focusout event as it _begins_ to
 * propogate, so that we can know that it occurred.
 *
 * In this callback, we set a timeout to run. Remember the following:
 *  - The event queue is emptied before a task completes
 *  - setTimeout creates a _new_ task and adds it to the task queue
 *
 * What this means is that a setTimeout, in the below handler, will execute
 * _after_ any additional events that are queued for this turn (such as a
 * focusin to go with the focusout.)
 *
 * We also need to handle cases where the focusout is cancelled- we capture the
 * event at the earliest possible opporitunity, so it's highly likely (but not
 * guaranteed! De-focusing an iframe child will _not_ generate a focusout
 * event!!!) that we catch the event when it _begins_. But capturing it when it
 * _ends_ requires us to trust all CAPTURING and BUBBLING handlers to _not_
 * cancel the event.
 *
 * That's why we use the next turn to actually check- it does not capture
 * exactly when the event stops propogating, but it _does_ allow us to reliably
 * execute _after_ the event has been handled.
 */
document.addEventListener("focusout", () => {
    setTimeout(() => {
        const { activeElement, body } = document;
        if (activeElement && activeElement !== body) {
            // something else took focus
            return;
        }
        app.shell.dashboard.layoutManager.node.focus({ preventScroll: true });
    });
}, { passive: true });

Widget.attach(HoverManager.GetManager(), document.body);

app.registerPlugins(appUtils);
const useConfig = PageConfig.getOption("enableConfig");
if (useConfig === "true") {
    app.registerPlugin(configCmdPlugin);
    app.registerPlugin(configBrowserPlugin);
    app.started.then(async () => {
        const user = await app.resolveOptionalService(IUserManager);
        if (user && !await user.checkIsSignedIn()) {
            await login(user, app.shell);
        }
        await app.commands.execute("@mavenomics/standalone:load-from-url");
    });
} else {
    app.started.then(() => app.commands.execute("@mavenomics/standalone:load-from-url"));
}

app.registerPlugin({
    id: "@mavenomics/standalone:dashboard-linker",
    autoStart: true,
    optional: [IConfigManager, IUrlManager],
    activate: (
        app,
        configManager: IConfigManager,
        urlManager: IUrlManager,
    ) => {
        app.shell.dashboardLinker.urlManager = urlManager;
        app.shell.dashboardLinker.configManager = configManager;
    }
});

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
