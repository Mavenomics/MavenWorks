import { MavenWorksPlugin } from "../application";
import { PartsEditor } from "./PartsEditor";
import { DashboardSerializer } from "@mavenomics/dashboard";
import { URLExt } from "@jupyterlab/coreutils";
import { HoverManager } from "@mavenomics/ui";

namespace CommandIds {
    export const EditLocalParts = "parts-editor:edit-local-parts";
    export const DeletePart = "parts-editor:delete-selected-part";
    export const RenamePart = "parts-editor:rename-selected-part";
}

const baseUrl = URLExt.join(window.location.origin, window.location.pathname).replace(/\/([^\/]*)$/, "");

export const partsEditorPlugin: MavenWorksPlugin<void> = {
    id: "@mavenomics/standalone:parts-editor",
    autoStart: true,
    activate: (app) => {
        const { commands, shell, contextMenu } = app;
        let activeEditor: PartsEditor | null = null;

        commands.addCommand(CommandIds.EditLocalParts, {
            label: "Edit Local Parts",
            iconClass: "fa fa-edit",
            execute: async () => {
                if (activeEditor != null) return;

                activeEditor = new PartsEditor(shell.dashboard, baseUrl, baseUrl);

                await HoverManager.GetManager().launchEditorDialog(
                    activeEditor,
                    shell,
                    1100,
                    600,
                    "Local Parts Editor",
                    (res) => {
                        if (res == null) return;
                        let s = DashboardSerializer.toJson(shell.dashboard);
                        s.localParts = activeEditor!.parts;
                        shell.dashboard.loadFromModel(s);
                    }
                );

                activeEditor = null;
            }
        });
        contextMenu.addItem({
            command: CommandIds.EditLocalParts,
            selector: ".main-app"
        });

        commands.addCommand(CommandIds.DeletePart, {
            label: "Delete Selected Part",
            isEnabled: () => activeEditor != null,
            execute: () => {
                if (activeEditor == null) return;
                activeEditor.deletePart();
            }
        });
        contextMenu.addItem({
            command: CommandIds.DeletePart,
            selector: ".m-PartsEditor-leftpane"
        });

        commands.addCommand(CommandIds.RenamePart, {
            label: "Rename Selected Part",
            isEnabled: () => activeEditor != null,
            execute: () => {
                if (activeEditor == null) return;
                activeEditor.editPartName();
            }
        });
        contextMenu.addItem({
            command: CommandIds.RenamePart,
            selector: ".m-PartsEditor-leftpane"
        });
    }
};
