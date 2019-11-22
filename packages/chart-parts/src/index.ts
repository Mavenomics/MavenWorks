import { IPlugin } from "@phosphor/application";
import { IPartFactory } from "@mavenomics/parts";
import { SlickGridPart } from "./SlickGrid";
import { TableEditorPart } from "./tableeditor/part";
import { IUrlManager, IConfigManager } from "@mavenomics/apputils";

const pivotPartPlugin: IPlugin<unknown, void> = {
    id: "@mavenomics/chart-parts:pivot",
    autoStart: true,
    requires: [ IPartFactory ],
    optional: [
        IUrlManager,
        IConfigManager
    ],
    activate: async (
        _app,
        factory: IPartFactory,
        urlManager?: IUrlManager,
        configManager?: IConfigManager,
    ) => {
        console.info(`Mavenomics Chart Parts plugin.
Branch   ${process.env.GIT_BRANCH}
Built on ${new Date(+process.env.BUILD_DATE!).toLocaleDateString()}
Build    #${process.env.BUILD_NUMBER}
Commit   ${process.env.GIT_COMMIT!.substr(0, 8)}
`);
        SlickGridPart.deps = {
            factory,
            urlManager,
            configManager,
        };
        factory.registerPart("SlickGrid", SlickGridPart);
        factory.registerPart("TableEditor", TableEditorPart);
        const { PivotPart } = await import("./PivotPart");
        factory.registerPart("PivotPart", PivotPart);
    }
};

export default pivotPartPlugin;

export { RegisterGridCommands } from "./commands";
