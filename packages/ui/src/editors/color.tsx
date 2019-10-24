import * as React from "react";
import { ITypeEditorProps } from "../editorfactory/interfaces";
import { Color } from "@mavenomics/coreutils";
import { Widget, BoxLayout } from "@phosphor/widgets";
import { ColorPicker } from "../widgets/colorpicker";
import * as names from "color-name";
import * as Combobox from "react-widgets/lib/Combobox";

const colors = Object.freeze([
    ...Object.keys(names),
    "transparent"
].sort());

export const InlineColor: React.FunctionComponent<ITypeEditorProps<Color | string>> = ({
    value, onValueChanged
}) => {
    if (!(value instanceof Color)) {
        try {
            value = new Color(value);
        } catch {
            // use a fallback color
            value = new Color("white");
        }
    }
    // TODO: Write a helper for derived intermediate state?
    const [intermediate, setIntermediate] = React.useState(value.color);
    const [lastColor, setLastColor] = React.useState(value.color);

    if (value.color !== lastColor) {
        setIntermediate(value.color);
        setLastColor(value.color);
    }
    const [isError, setIsError] = React.useState(false);
    return (<span className="m-InlineColorEditor">
        <span style={{backgroundColor: value.color}}
            className="m-InlineColorEditor__colorSwatch" />
        <span className={"m-rw-inline-hack m-InlineColorEditor__input " +
            (isError ? "m-InlineColorEditor__invalid" : "")
        }>
            <Combobox
                defaultValue={value.color}
                value={intermediate}
                data={[...colors]}
                itemComponent={ColorSwatch}
                onChange={(color) => {
                    const newStr = color;
                    setIntermediate(newStr);
                    let newColor: Color;
                    try {
                        newColor = new Color(newStr);
                        setLastColor(newColor.color);
                        setIsError(false);
                        onValueChanged.call(void 0, newColor);
                    } catch {
                        setIsError(true);
                    }
                }} />
        </span>
    </span>);
};

function ColorSwatch({item}: {item: string}) {
    return (<span className="m-InlineColorEditor">
        <span style={{backgroundColor: item}}
        className="m-InlineColorEditor__colorSwatch" />
        {item}
    </span>);
}


export class DetailedColor extends Widget {
    private picker: ColorPicker;
    private cb: (this: void, color: Color) => void;

    constructor({value, onValueChanged}: ITypeEditorProps<Color>) {
        super();
        const layout = this.layout = new BoxLayout();
        if (!(value instanceof Color)) {
            try {
                value = new Color(value);
            } catch {
                // use a fallback color
                value = new Color("white");
            }
        }
        layout.addWidget(this.picker = new ColorPicker({color: value}));
        this.cb = onValueChanged;
        this.picker.onChange.connect(this.handleChange, this);
    }

    private handleChange(_sender: ColorPicker, color: Color) {
        this.cb.call(void 0, color);
    }
}
