import Select, { Option } from "rc-select";
import * as React from "react";
import { Types } from "@mavenomics/coreutils";
import { ReactPart, Part, OptionsBag } from "@mavenomics/parts";

export class SelectPart extends ReactPart {
    public static GetMetadata() {
        const metadata = super.GetMetadata();

        metadata.description = "Display a list of options inside a dropdown control";

        metadata.addOption("Value", Types.String, "");
        metadata.addOption("Options", Types.Array, []);

        return metadata;
    }

    constructor(opts: Part.IOptions) {
        super(opts);
        this.container.node.style.padding = "10px";
    }

    protected initializeReact() {
        return (<Select defaultValue="" style={{width: "100%"}} />);
    }

    protected renderReact(bag: OptionsBag) {
        const value = "" + bag.get("Value");
        const opts = (bag.get("Options") as unknown[]).map(i => {
            const key = "" + i; //coerce to string
            if (key === "") return; // don't allow empty strings
            return (<Option
                key={key}
                value={key}>{key}</Option>);
        });
        return (<Select value={value}
            onChange={(value) => bag.set("Value", "" + value)}
            style={{width: "100%"}}>
                {opts}
            </Select>
        );
    }
}
