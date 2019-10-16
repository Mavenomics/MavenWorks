import * as React from "react";
import { Types } from "@mavenomics/coreutils";
import { ReactPart, OptionsBag } from "@mavenomics/parts";

export class RadioButtonPart extends ReactPart {
    public static GetMetadata() {
        const metadata = super.GetMetadata();

        metadata.description = "Display a list of strings as a radiobutton control";

        metadata.addOption("Value", Types.String, "");
        metadata.addOption("Options", Types.Array, []);

        return metadata;
    }

    protected renderReact(bag: OptionsBag) {
        const value = "" + bag.get("Value");
        const options = (bag.get("Options") as unknown[]).map(i => "" + i);
        const id = this.uuid;

        const opts = options.map(i => {
            return (<label key={i}>
                <input type="radio"
                    name={id}
                    checked={value === i}
                    onChange={e => {
                        if (!e.target.checked) {
                            return;
                        }
                        bag.set("Value", i);
                    }} />
                {i}
            </label>);
        });

        return (<span>
            {opts}
        </span>);
    }
}
