import { IPlugin } from "@phosphor/application";
import { Token } from "@phosphor/coreutils";
import { AttachedProperty } from "@phosphor/properties";
import { PartFactory } from "./PartFactory";
import { Part } from "./Part";

// Part factories are provided as a separate plugin. This allows consumers to
// define their own parts via an independent JupyterLab plugin.

export class PartFactoryExtension implements IPartFactory {
    // A global, shared factory for all PartFactory consumers
    private globalFactory = new PartFactory();

    private readonly partFactoryProperty = new AttachedProperty<any, PartFactory>({
        name: "partFactory",
        create: () => new PartFactory(this.globalFactory)
    });

    public get(owner: any) {
        return this.partFactoryProperty.get(owner);
    }

    /** Globally register a part */
    public registerPart(partName: string, ctor: typeof Part) {
        this.globalFactory.registerPart(partName, ctor);
    }

    public get root() {
        return this.globalFactory;
    }
}

export interface IPartFactory {
    /** Get the global part factory. */
    readonly root: PartFactory;

    /** Retrieve a scoped PartFactory.
     *
     * This is useful for things that might need to register against a
     * particular document widget, instead of registering globally. For
     * instance, parts leveraging IPyWidgets need to scope on Notebooks.
     */
    get(owner: any): PartFactory;

    /** Register a part globally.*/
    registerPart(partName: string, ctor: typeof Part): void;
}

export const IPartFactory = new Token<IPartFactory>("@mavenomics/parts:IPartFactory");

export const factoryExtPlugin: IPlugin<any, IPartFactory> = {
    id: "@mavenomics/parts:part-factory-plugin",
    autoStart: true,
    provides: IPartFactory,
    activate: () => {
        return new PartFactoryExtension();
    }
};
