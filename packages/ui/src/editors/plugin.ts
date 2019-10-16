import { IPlugin } from "@phosphor/application";
import { ITypeEditorFactory } from "../editorfactory/plugin";
import { Types } from "@mavenomics/coreutils";
import { DateEditor } from "./date";
import { Checkbox } from "./boolean";
import { InlineColor, DetailedColor } from "./color";
import { StringEditor } from "./string";

export const defaultTypeEditors: IPlugin<unknown, void> = {
    id: "@mavenomics/ui:defaultTypeEditors",
    autoStart: true,
    requires: [ITypeEditorFactory],
    activate: (app, factory: ITypeEditorFactory) => {
        factory.registerEditor(Types.Date, DateEditor);
        factory.suppressDetailEditor(Types.Date);
        factory.registerEditor(Types.DateTime, DateEditor);
        factory.suppressDetailEditor(Types.DateTime);
        factory.registerEditor(Types.Boolean, Checkbox);
        factory.suppressDetailEditor(Types.Boolean);
        factory.registerEditor(Types.Color, InlineColor);
        factory.registerDetailEditor(Types.Color, DetailedColor);
        factory.registerEditor(Types.String, StringEditor);

        factory.suppressDetailEditor(Types.Number);
    }
};
