import { Token } from "@phosphor/coreutils";
import { IPlugin } from "@phosphor/application";
import { ITypeEditorFactory as IFactory } from "./interfaces";
import { TypeEditorFactory } from "./factory";

// re-declare it so that it gets declaration-merged nicely
type ITypeEditorFactory = IFactory;
const ITypeEditorFactory = new Token<ITypeEditorFactory>("@mavenomics/ui:ITypeEditorFactory");

/**
 * Plugin that provides the TypeEditor factory
 *
 * NOTE: The TypeEditor factory cannot be disabled using Phosphor, as it holds
 * global state. This is merely a convenience for setting it up, accessing it,
 * and registering your own type editors.
 */
export const typeEditorFactoryPlugin: IPlugin<unknown, ITypeEditorFactory> = {
    id: "@mavenomics/ui:type-editor-factory",
    autoStart: true,
    provides: ITypeEditorFactory,
    activate: (_app) => {
        return TypeEditorFactory.Create();
    }
};

export { ITypeEditorFactory };
