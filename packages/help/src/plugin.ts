import { IPlugin, Application } from "@phosphor/application";
import { IHelpDocProvider } from "./docprovider";
import { HoverManager } from "@mavenomics/ui";
import { HelpBrowser } from "./browser";
import { IPartFactory } from "@mavenomics/parts";
import { openAbout } from "./about";

namespace CommandIds {
    export const SummonHelp = "mavenworks:summon-help";
    export const SummonAbout = "mavenworks:summon-about";
}

export const browserPlugin: IPlugin<Application<any>, void> = {
    id: "mavenworks-help-browser-plugin",
    autoStart: true,
    requires: [IHelpDocProvider, IPartFactory],
    activate: (app, doc: IHelpDocProvider, factory: IPartFactory) => {
        app.commands.addCommand(CommandIds.SummonHelp, {
            label: "Help...",
            execute: () => {
                HoverManager.GetManager().launchDialog(
                    new HelpBrowser(doc, factory.root),
                    app.shell,
                    840,
                    680,
                    "MavenWorks Help",
                    [{ text: "Dismiss" }]
                );
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
