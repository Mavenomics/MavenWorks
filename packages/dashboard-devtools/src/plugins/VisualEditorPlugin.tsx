import * as React from "react";
import { IPlugin, Application } from "@phosphor/application";
import { Widget } from "@phosphor/widgets";
import { IDashboardTracker } from "../interfaces";
import { VisualEditor } from "../editors";
import { TypeEditorHost, ReactWrapperWidget, HoverManager } from "@mavenomics/ui";
import { Dashboard } from "@mavenomics/dashboard";

async function launchEditor(dashboard: Dashboard) {
    const widget = new class extends ReactWrapperWidget {
        protected render() {
            return (<TypeEditorHost.Context.Provider
                value={{owner: this}}>
                    <VisualEditor dashboard={dashboard} />
            </TypeEditorHost.Context.Provider>);
        }
    };
    widget.title.label = "Visual Editor";
    const dialog = HoverManager.GetManager().openDialog({
        hover: widget,
        owner: dashboard,
        width: 1100,
        height: 600
    });
    await dialog.onClosed;
}

// TODO: Will we need an EditorTracker?
export const visualEditorPlugin: IPlugin<Application<Widget>, void> = {
    id: "@mavenomics/dashboard-devtools:visual-editor",
    autoStart: true,
    requires: [
        IDashboardTracker
    ],
    activate: (
        app,
        tracker: IDashboardTracker
    ) => {
        // NB: This command shouldn't be used for toolbar buttons because it
        // relies on the active widget, which sometimes isn't what users expect
        // when using toolbars. Additionally, it only works for the Dashboard
        // document.
        app.commands.addCommand("visual-editor:open", {
            label: "Open Visual Editor...",
            iconClass: "fa fa-desktop",
            isEnabled: () => tracker.getCurrentDashboard() != null,
            execute: () => {
                const dashboard = tracker.getCurrentDashboard();
                if (dashboard == null) return;
                return launchEditor(dashboard);
            }
        });
        app.commands.addKeyBinding({
            command: "visual-editor:open",
            keys: ["Accel D"],
            selector: ".m-DashboardEditor:not(.p-mod-hidden)"
        });
        app.contextMenu.addItem({
            command: "visual-editor:open",
            selector: ".m-DashboardEditor"
        });
        app.commands.addKeyBinding({
            command: "visual-editor:open",
            keys: ["Accel D"],
            selector: ".jp-Notebook.jp-mod-commandMode:not(.p-mod-hidden) .m-RenderedLayout :not(input)"
        });
        app.contextMenu.addItem({
            command: "visual-editor:open",
            selector: ".jp-Notebook.jp-mod-commandMode .m-RenderedLayout"
        });
    }
};
