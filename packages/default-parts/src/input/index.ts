import { IPlugin } from "@phosphor/application";
import { IPartFactory } from "@mavenomics/parts";
import { SliderPart } from "./slider";
import { RangeSliderPart } from "./rangeslider";
import { SelectPart } from "./select";
import { DatePickerPart } from "./datepicker";
import { TextInputPart } from "./text";
import { AnimationSliderPart } from "./animationslider";
import { TextAreaPart } from "./textarea";
import { RadioButtonPart } from "./radio";
import { CheckboxPart } from "./checkbox";
import { CodeEditorPart } from "./codepart";

export const inputPartsPlugin: IPlugin<unknown, void> = {
    id: "@mavenomics/default-parts:input",
    autoStart: true,
    requires: [IPartFactory],
    activate: (_app, factory: IPartFactory) => {
        factory.registerPart("SliderPart", SliderPart);
        factory.registerPart("RangeSliderPart", RangeSliderPart);
        factory.registerPart("SelectPart", SelectPart);
        factory.registerPart("RadioButtonPart", RadioButtonPart);
        factory.registerPart("CheckboxPart", CheckboxPart);
        factory.registerPart("DatePickerPart", DatePickerPart);
        factory.registerPart("TextInputPart", TextInputPart);
        factory.registerPart("TextAreaPart", TextAreaPart);
        factory.registerPart("AnimationSliderPart", AnimationSliderPart);
        factory.registerPart("CodeEditorPart", CodeEditorPart);
    }
};
