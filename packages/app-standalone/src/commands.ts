import { MavenWorksPlugin } from "./application";
import { IUrlManager } from "@mavenomics/apputils";
import { deserialize } from "@mavenomics/coreutils";
import { RegisterActions } from "@mavenomics/dashboard-devtools";

export const commandsPlugin: MavenWorksPlugin<void> = {
    id: "commands",
    autoStart: true,
    requires: [IUrlManager],
    activate: (app, urlManager: IUrlManager) => {
        const { shell, commands } = app;
        const globals = shell.dashboard.globals;

        function getOverrides() {
            const overrides: Record<string, any> = {};
            for (const [name, value] of urlManager.query.entries()) {
                try {
                    overrides[name] = deserialize(JSON.parse(value));
                } catch (err) {
                    console.error("Failed to load override", name, "=", value);
                    console.error(err);
                }
            }
            return overrides;
        }

        // internal command for loading from a URL
        commands.addCommand("@mavenomics/standalone:load-from-url", {
            execute: async () => {
                let toLoad = urlManager.path;
                let dashboard = urlManager.importedDashboard;
                if (dashboard == null) {
                    if (toLoad === "" || toLoad === "/") return;

                    // config isn't installed, ignore paths
                    if (!commands.hasCommand("config:load-dashboard")) return;

                    return commands.execute("config:load-dashboard", {path: toLoad});
                }

                return shell.dashboard
                    .loadFromModelWithOverrides(dashboard, getOverrides());
            }
        });

        urlManager.onQueryChange.subscribe(() => {
            for (const [name, val] of Object.entries(getOverrides())) {
                try {
                    globals.set(name, val);
                } catch (err) {
                    console.error("Failed to set global", name, "=", val);
                    console.error(err);
                }
            }
        });

        if (urlManager.onDashboardImport != null) {
            urlManager.onDashboardImport.subscribe(model => {
                shell.dashboard.loadFromModelWithOverrides(model, getOverrides());
            });
        }

        RegisterActions(app as any, () => shell.dashboard, "@mavenomics/standalone", ".main-app");
    }
};

