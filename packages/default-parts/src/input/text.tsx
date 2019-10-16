import * as React from "react";
import { Types } from "@mavenomics/coreutils";
import { ReactPart, Part, OptionsBag } from "@mavenomics/parts";

export class TextInputPart extends ReactPart {
    public static GetMetadata() {
        const metadata = super.GetMetadata();

        metadata.description = "Edit a string in an HTML `input` element.";

        metadata.addOption("Value", Types.String, "");
        return metadata;
    }

    /* A note about this hack:
     * We need to be able to differentiate between external changes and internal
     * changes, due to how React manages the virtual DOM. If we don't do this,
     * we can still keep them in sync but the cursor won't stay where it is.
     * However, if we fix *that*, then we open up another issue with external
     * changes, since now React is simply using the value as an initial default.
     *
     * Therefore, we use this lastValue to differentiate internal from external
     * changes. lastValue is set in valueChanged, so if it is the same as the
     * incoming "Value" in the options bag, then the change was internal. In
     * this case, we should keep the React component around since it has user
     * state we want to keep (the cursor position).
     *
     * However, if they are different, that means the change came from elsewhere
     * and we need to force-update that "default". To do that, we set a new key
     * to destroy the old part and force React to make a new one.
     */
    private lastValue = "";
    private key = 0; // see above- this is incremented on external changes

    constructor(opts: Part.IOptions) {
        super(opts);
        this.container.node.style.padding = "10px";
    }

    protected renderReact(bag: OptionsBag) {
        const value = "" + bag.get("Value");

        if (value !== this.lastValue) {
            this.lastValue = value;
            this.key++;
            if (this.key === Number.MAX_SAFE_INTEGER) {
                // I _doubt_ this will happen, but you never know
                // maybe a rogue cat takes a nap on your keyboard, and you have
                // key repeat set to max...
                // ...
                // ...
                // ...and your cat sits there for about 9 millenia...
                this.key = 0;
            }
        }

        return (<Input key={this.key}
            value={"" + bag.get("Value")}
            valueChanged={(val) => {
                this.lastValue = val;
                bag.set("Value", val);
            }}/>
        );
    }
}

interface InputProps {
    value: string;
    valueChanged: (this: void, val: string) => void;
}

// cf. TextArea for why this component exists
const Input: React.FunctionComponent<InputProps> = ({value, valueChanged}) => {
    // keep state internal
    const [val, setVal] = React.useState(value);

    // disable auto-* for performance reasons (inputs tend to blow up with
    // large strings when these are on)
    return (<input type="text"
        autoComplete={"false"}
        autoCapitalize={"false"}
        autoCorrect={"false"}
        style={{width: "100%"}}
        value={val}
        onChange={(ev) => {
            setVal(ev.target.value);
            valueChanged.call(void 0, ev.target.value);
        }} />
    );
};
