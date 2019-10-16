import { template } from "lodash";
import { IPlugin, Application } from "@phosphor/application";
import { IPartFactory } from "@mavenomics/parts";
import { IHelpDocProvider } from "./docprovider";
import {
    CanvasLayoutRegion,
    StackPanelLayoutRegion,
    TabPanelDashboardLayoutRegion,
    GridLayoutRegion
} from "@mavenomics/layout";
import partTemplateDoc from "raw-loader!../templates/part-ref-template.md";
import layoutTemplateDoc from "raw-loader!../templates/layout-ref-template.md";

export const helpPartsPlugin: IPlugin<Application<any>, void> = {
    id: "mavenworks-help-parts-browser-plugin",
    autoStart: true,
    requires: [IHelpDocProvider, IPartFactory],
    activate: async (_app, doc: IHelpDocProvider, factory: IPartFactory) => {
        const partTemplateGenerator = template(partTemplateDoc);
        let names = [...factory.root.keys()].sort();
        let metadatas = names.map((n) => {
            const metadata = factory.root.getMetadataForPart(n);
            return {
                name: n,
                description: metadata.description,
                opts: [...metadata].sort((a, b) => a.name.localeCompare(b.name)),
                remarks: metadata.remarks,
            };
        });
        for (let i = 0; i < metadatas.length; i++) {
            doc.addDocument(partTemplateGenerator(metadatas[i]));
        }
    }
};

export const layoutPlugin: IPlugin<Application<any>, void> = {
    id: "mavenworks-help-generator-layout",
    autoStart: true,
    requires: [IHelpDocProvider],
    activate: async(_app, doc: IHelpDocProvider) => {
        const generator = template(layoutTemplateDoc);
        // TODO: Layout region factory/pluggability
        const regions = [
            StackPanelLayoutRegion,
            TabPanelDashboardLayoutRegion,
            CanvasLayoutRegion,
            GridLayoutRegion
        ];
        regions.map(i => {
            const metadata = i.GetMetadata();
            const opts = {
                name: metadata.name,
                iconClass: metadata.iconClass,
                iconText: metadata.iconText,
                props: [...metadata.getAllProperties()],
                attachedProps: [...metadata.getAllAttachedProperties()],
                description: metadata.description,
                remarks: metadata.remarks
            };
            doc.addDocument(generator(opts));
        });
    }
};
