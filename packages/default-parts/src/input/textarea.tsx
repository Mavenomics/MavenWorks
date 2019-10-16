import { Types } from "@mavenomics/coreutils";
import * as React from "react";
import { ReactPart, Part, OptionsBag } from "@mavenomics/parts";

export class TextAreaPart extends ReactPart {
    public static GetMetadata() {
        const metadata = super.GetMetadata();

        metadata.description = "Edit multiline text in an HTML5 `textarea` control";

        metadata.addOption("Value", Types.String, "");

        return metadata;
    }

    // See the TextPart for details on this hack
    private lastValue = "";
    private key = 0;


    constructor(opts: Part.IOptions) {
        super(opts);
        this.container.node.style.padding = "10px";
    }


    public renderReact(bag: OptionsBag) {
        let value = "" + bag.get("Value");

        if (value !== this.lastValue) {
            this.lastValue = value;
            this.key++;
            if (this.key === Number.MAX_SAFE_INTEGER) {
                this.key = 0;
            }
        }

        return (<TextArea key={this.key}
            value={value}
            valueChanged={(val) => {
                this.lastValue = val;
                bag.set("Value", val);
            }} />
        );
    }
}

interface TextAreaProps {
    value: string;
    valueChanged: (this: void, val: string) => void;
}

// This is moved into a separate component because React controlled inputs
// aren't very good about maintaining cursor position across state changes
// in the specific case of the ReactPart's element.
// cf. https://github.com/facebook/react/issues/955
// and https://stackoverflow.com/questions/28922275/28922465
const TextArea: React.FunctionComponent<TextAreaProps> = ({value, valueChanged}) => {
    // keep state internal
    const [val, setVal] = React.useState(value);

    // disable auto-* for performance reasons (inputs tend to blow up with
    // large strings when these are on)
    return (<textarea autoComplete={"false"}
        autoCapitalize={"false"}
        autoCorrect={"false"}
        value={val}
        onChange={(ev) => {
            // This may look weird, but by doing this we can keep the React
            // state 1:1 with the virtual DOM
            setVal(ev.target.value);
            valueChanged.call(void 0, ev.target.value);
        }}
        style={{
            width: "100%",
            height: "100%"
        }}/>
    );
};
