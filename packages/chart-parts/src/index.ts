import { IPlugin } from "@phosphor/application";
import { IPartFactory } from "@mavenomics/parts";
import { SlickGridPart } from "./SlickGrid";
import { TableEditorPart } from "./tableeditor/part";

const pivotPartPlugin: IPlugin<unknown, void> = {
    id: "@mavenomics/chart-parts:pivot",
    autoStart: true,
    requires: [ IPartFactory ],
    activate: async (_app, factory: IPartFactory) => {
        console.info(`Mavenomics Chart Parts plugin.
Branch   ${process.env.GIT_BRANCH}
Built on ${new Date(+process.env.BUILD_DATE!).toLocaleDateString()}
Build    #${process.env.BUILD_NUMBER}
Commit   ${process.env.GIT_COMMIT!.substr(0, 8)}
`);
        factory.registerPart("SlickGrid", SlickGridPart);
        factory.registerPart("TableEditor", TableEditorPart);
        const { PivotPart } = await import("./PivotPart");
        factory.registerPart("PivotPart", PivotPart);
    }
};

export default pivotPartPlugin;

export { RegisterGridCommands } from "./commands";
