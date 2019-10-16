import { IPlugin } from "@phosphor/application";
import { IPartFactory } from "@mavenomics/parts";
import { RowViewPart } from "./rowview";
import { LabelPart } from "./label";

export const outputPartsPlugin: IPlugin<unknown, void> = {
    id: "@mavenomics/default-parts:output",
    autoStart: true,
    requires: [IPartFactory],
    activate: (_app, factory: IPartFactory) => {
        factory.registerPart("RowViewPart", RowViewPart);
        factory.registerPart("LabelPart", LabelPart);
    }
};
