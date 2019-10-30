import { IConfigManager, IUrlManager, IUserManager, AuthenticationError } from "@mavenomics/apputils";
import { MavenWorksPlugin } from "./application";
import { DashboardSerializer } from "@mavenomics/dashboard";
import { HoverManager } from "@mavenomics/ui";
import { Widget } from "@phosphor/widgets";
import { IConfigBrowserFactory, IConfigBrowser } from "./browser";
import { login } from "./login";

const CommandIds = {
    Save:       "config:save-dashboard",
    CreateNew:  "config:create-new-dashboard",
    Load:       "config:load-dashboard",
    Rename:     "config:rename",
    Delete:     "config:delete",
};

function catchConfigError(err: any) {
    const hover = HoverManager.GetManager();
    if (!(err instanceof Error)) {
        let dialog = new Widget();
        dialog.node.innerHTML = "Unknown error, see developer console";
        console.warn("Unknown config error: ", err);
        hover.launchDialog(dialog, dialog, 400, 300, "Unknown error");
    } else if (err instanceof AuthenticationError) {
        let dialog = new Widget();
        dialog.node.innerHTML = "Authentication Error: " + err.detail;
        console.warn("Config operation returned AuthError: ");
        console.warn(err);
        hover.launchDialog(dialog, dialog, 400, 300, "Authentication Error");
    } else {
        let dialog = new Widget({node: document.createElement("pre")});
        dialog.node.innerHTML = err.stack || (err.message + "\n  <no stack trace>");
        hover.launchDialog(dialog, dialog, 400, 300, err.name);
    }
}

function throwIfInvalidName(name: string): string {
    const badChars = "/?#%[]";
    if ([...badChars].some(i => name.includes(i))) {
        throw new Error(
            "Names cannot contain any of the following characters: '" + badChars + "'"
        );
    }
    return name;
}

export const configCmdPlugin: MavenWorksPlugin<void> = {
    id: "@mavenomics/standalone:config-commands",
    autoStart: true,
    requires: [
        IConfigManager,
        IUrlManager,
        IUserManager,
        IConfigBrowserFactory,
    ],
    activate: (
        app,
        cfgManager: IConfigManager,
        urlManager: IUrlManager,
        userManager: IUserManager,
        browserFactory: IConfigBrowserFactory,
    ) => {
        const { shell, commands, contextMenu } = app;

        //#region Basic commands
        commands.addCommand(CommandIds.CreateNew, {
            label: "Create New Dashboard",
            execute: async ({path, obj}) => {
                try {
                    const model = obj as any as DashboardSerializer.ISerializedDashboard | null;
                    await cfgManager.newDashboard(
                        throwIfInvalidName("" + path),
                        model || DashboardSerializer.DEFAULT_DASHBOARD
                    );
                } catch (err) {
                    catchConfigError(err);
                }
            }
        });

        commands.addCommand(CommandIds.Load, {
            label: "Load Dashboard",
            execute: async ({path}) => {
                const objPath = "" + path;
                if (shell.shouldPromptDirty) {
                    const text = new Widget();
                    text.node.innerText = "You made unsaved changes to this dashboard." +
                                    " If you nagivate away, these changes will be lost.";
                    const res = await HoverManager.Instance!.launchDialog(
                        text,
                        shell,
                        400,
                        150,
                        "Unsaved changes",
                        [{
                            text: "Discard",
                            accept: true,
                            warn: true
                        }, {
                            text: "Cancel"
                        }, {
                            text: "Save",
                            accept: true
                        }]
                    );
                    if (!res.accept) {
                        return; // user cancelled
                    }
                    if (res.clicked === "Save") {
                        await commands.execute("shell:save-to-config", {path: shell.activeDashboard});
                    }
                }
                try {
                    const def = await cfgManager.getDashboard(objPath);
                    shell.activeDashboard = objPath;
                    if (objPath !== urlManager.path) {
                        urlManager.path = objPath;
                    }
                    return shell.dashboard.loadFromModel(def);
                } catch (err) {
                    return catchConfigError(err);
                }
            }
        });

        commands.addCommand(CommandIds.Save, {
            label: "Save Dashboard",
            execute: ({path, obj}) => {
                const objPath = "" + path;
                return cfgManager.saveDashboard(
                    objPath,
                    obj as any as DashboardSerializer.ISerializedDashboard
                ).catch(catchConfigError);
            }
        });

        commands.addCommand(CommandIds.Rename, {
            label: "Rename Dashboard",
            execute: async ({path, newName}) => {
                try {
                    await cfgManager.renameDashboard(
                        "" + path,
                        throwIfInvalidName("" + newName));
                } catch (err) {
                    catchConfigError(err);
                }
            }
        });

        commands.addCommand(CommandIds.Delete, {
            label: "Delete Dashboard",
            execute: ({path}) => {
                const objPath = "" + path;
                return cfgManager.deleteDashboard(objPath)
                    .catch(catchConfigError);
            }
        });
        //#endregion

        //#region Context menu cmds
        commands.addCommand("shell:save-to-config", {
            label: "Save...",
            execute: async () => {
                if (shell.activeDashboard === "") {
                    return commands.execute("shell:save-as");
                }
                const model = DashboardSerializer.toJson(shell.dashboard);
                try {
                    await cfgManager.saveDashboard(
                        shell.activeDashboard,
                        model
                    );
                    shell.setClean();
                } catch (err) {
                    return catchConfigError(err);
                }
            }
        });
        commands.addKeyBinding({
            command: "shell:save-to-config",
            keys: ["Accel S"],
            selector: ".main-app"
        });
        contextMenu.addItem({
            command: "shell:save-to-config",
            selector: ".main-app"
        });

        commands.addCommand("shell:save-as", {
            label: "Save as...",
            execute: async () => {
                const body = new Widget({node: document.createElement("input")});
                (body.node as any).value = shell.activeDashboard || "untitled";
                (body as any).getValue = () => (body.node as any).value;
                const dialogResult = await HoverManager.Instance!.launchDialog(
                    body,
                    app.shell,
                    300,
                    125,
                    "Save Dashboard As...",
                    [{ text: "Dismiss" }, { text: "Ok", accept: true }]
                );
                if (!dialogResult.accept) return;
                try {
                    const name = "/" + throwIfInvalidName("" + dialogResult.result);
                    await cfgManager.newDashboard(
                        name,
                        DashboardSerializer.toJson(shell.dashboard)
                    );
                    shell.activeDashboard = name;
                    urlManager.path = name;
                    shell.setClean();
                } catch (err) {
                    return catchConfigError(err);
                }
            }
        });
        commands.addKeyBinding({
            command: "shell:save-as",
            keys: ["Accel Shift S"],
            selector: ".main-app"
        });
        contextMenu.addItem({
            command: "shell:save-as",
            selector: ".main-app"
        });
        //#endregion

        //#region Config browser
        let activeBrowser: IConfigBrowser | null = null;

        urlManager.onPathChange.subscribe(() => {
            commands.execute("@mavenomics/standalone:load-from-url");
        });

        commands.addCommand("@mavenomics/standalone:browse-config", {
            label: "Open Dashboard",
            execute: async () => {
                const body = browserFactory.create();
                activeBrowser = body;
                const res = await HoverManager.Instance!.launchDialog(
                    body,
                    app.shell,
                    300,
                    500,
                    "Open Dashboard",
                    [{ text: "Dismiss"}, { text: "Ok", accept: true }]
                );
                activeBrowser = null;
                if (!res.accept || res.result == null) {
                    return;
                }
                const key = res.result!;
                commands.execute(CommandIds.Load, {path: key});
            }
        });
        commands.addKeyBinding({
            command: "@mavenomics/standalone:browse-config",
            keys: ["Accel O"],
            selector: ".main-app"
        });
        contextMenu.addItem({
            command: "@mavenomics/standalone:browse-config",
            selector: ".main-app"
        });

        commands.addCommand("@mavenomics/standalone:config-browser:rename", {
            label: "Rename Dashboard",
            isEnabled: () => activeBrowser != null,
            execute: () => {
                if (activeBrowser == null) return;
                activeBrowser.renameDashboard();
            }
        });
        contextMenu.addItem({
            command: "@mavenomics/standalone:config-browser:rename",
            selector: ".m-ConfigBrowser .m-ListBox-item.m-selected"
        });

        commands.addCommand("@mavenomics/standalone:config-browser:delete", {
            label: "Delete Dashboard",
            isEnabled: () => activeBrowser != null,
            execute: () => {
                if (activeBrowser == null) return;
                activeBrowser.deleteDashboard();
            }
        });
        contextMenu.addItem({
            command: "@mavenomics/standalone:config-browser:delete",
            selector: ".m-ConfigBrowser .m-ListBox-item.m-selected"
        });
        //#endregion

        //#region Login state management
        commands.addCommand("@mavenomics/standalone:config:login", {
            label: "Log in...",
            execute: async () => {
                return await login(userManager, shell);
            }
        });
        contextMenu.addItem({
            command: "@mavenomics/standalone:config:login",
            selector: "body"
        });

        commands.addCommand("@mavenomics/standalone:config:logout", {
            label: "Log out",
            execute: () => userManager.logout()
                .catch(catchConfigError)
        });
        contextMenu.addItem({
            command: "@mavenomics/standalone:config:logout",
            selector: "body"
        });
        //#endregion
    }
};
