import * as React from "react";
import { Types } from "@mavenomics/coreutils";
import { ReactPart, OptionsBag } from "@mavenomics/parts";

export class CheckboxPart extends ReactPart {
    public static GetMetadata() {
        const metadata = super.GetMetadata();

        metadata.description = "A part with a simple checkbox and label.";

        metadata.addOption("Checked", Types.Boolean, false);
        metadata.addOption("Label", Types.String, "", {
            description: "The label appears next to the checkbox, and clicking on it will also toggle the checkbox."
        });

        return metadata;
    }

    protected renderReact(bag: OptionsBag) {
        const checked = !!bag.get("Checked");
        const label = "" + bag.get("Label");

        return (<label>
            <input type="checkbox"
                checked={checked}
                onChange={(ev) => bag.set("Checked", ev.target.checked)}/>
            {label}
        </label>);
    }
}
