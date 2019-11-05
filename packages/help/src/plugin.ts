import { IPlugin, Application } from "@phosphor/application";
import { IHelpDocProvider } from "./docprovider";
import { HoverManager } from "@mavenomics/ui";
import { RegisterActions } from "@mavenomics/dashboard-devtools";
import { HelpBrowser, HelpDocRenderer } from "./browser";
import { IPartFactory } from "@mavenomics/parts";
import { openAbout } from "./about";

namespace CommandIds {
    export const SummonHelp = "@mavenomics/help:summon-help";
    export const GoToHelpDoc = "@mavenomics/help:go-to-doc";
    export const SummonAbout = "@mavenomics/help:summon-about";
}

// The help dialog is a singleton, which allows other commands to target it
let HELP_DIALOG_INSTANCE: HelpBrowser | null = null;

export const browserPlugin: IPlugin<Application<any>, void> = {
    id: "@mavenomics/help:browser-plugin",
    autoStart: true,
    requires: [IHelpDocProvider, IPartFactory],
    activate: (app, doc: IHelpDocProvider, factory: IPartFactory) => {
        RegisterActions(
            app as any,
            () => HelpDocRenderer.activeDashboard,
            "example-dialogs",
            ".m-Hover"
        );
        app.commands.addCommand(CommandIds.SummonHelp, {
            label: "Help...",
            execute: () => {
                if (HELP_DIALOG_INSTANCE != null && !HELP_DIALOG_INSTANCE.isDisposed) {
                    HELP_DIALOG_INSTANCE.activate();
                    return;
                }
                HELP_DIALOG_INSTANCE = new HelpBrowser(doc, factory.root);
                HoverManager.GetManager().launchDialog(
                    HELP_DIALOG_INSTANCE,
                    app.shell,
                    840,
                    680,
                    "MavenWorks Help",
                    [{ text: "Dismiss" }]
                ).then(() => {
                    if (HELP_DIALOG_INSTANCE) {
                        HELP_DIALOG_INSTANCE.dispose();
                    }
                    HELP_DIALOG_INSTANCE = null;
                });
            }
        });
        app.commands.addKeyBinding({
            command: CommandIds.SummonHelp,
            keys: ["F1"],
            selector: "*"
        });
        app.contextMenu.addItem({
            command: CommandIds.SummonHelp,
            selector: "body"
        });

        // An internal helper command to open a particular document
        app.commands.addCommand(CommandIds.GoToHelpDoc, {
            isVisible: () => false,
            execute: async ({docPath}) => {
                const path = ("" + docPath) || "abs";
                if (HELP_DIALOG_INSTANCE == null) {
                    await app.commands.execute(CommandIds.SummonHelp);
                }
                HELP_DIALOG_INSTANCE!.selectDocument(path);
            }
        });
        console.log("howdy", (window as any).temp1 = app.commands);

        app.commands.addCommand(CommandIds.SummonAbout, {
            label: "About...",
            execute: () => openAbout()
        });
        app.contextMenu.addItem({
            command: CommandIds.SummonAbout,
            selector: "body"
        });
    }
};
