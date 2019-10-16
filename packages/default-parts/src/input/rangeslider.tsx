import { Types } from "@mavenomics/coreutils";
import { ReactPart, Part, OptionsBag } from "@mavenomics/parts";
import { Range, createSliderWithTooltip } from "rc-slider";
import * as React from "react";

const TooltipRange = createSliderWithTooltip(Range);

export class RangeSliderPart extends ReactPart {
    public static GetMetadata() {
        const metadata = super.GetMetadata();

        metadata.description = "Display a double-headed slider";

        metadata.addOption("Start", Types.Number, 4);
        metadata.addOption("End", Types.Number, 6);

        metadata.addOption("Min", Types.Number, 0);
        metadata.addOption("Max", Types.Number, 10);
        metadata.addOption("Step", Types.Number, 1);

        return metadata;
    }

    constructor(opts: Part.IOptions) {
        super(opts);
        this.container.node.style.padding = "10px 20px";
    }

    protected initializeReact() {
        return (<Range
            defaultValue={[4, 6]}
            min={0}
            max={10}
            step={1} />
        );
    }

    protected renderReact(bag: OptionsBag) {
        const value = [bag.get("Start"), bag.get("End")] as [number, number];
        const min = bag.get("Min") as number;
        const max = bag.get("Max") as number;
        const step = bag.get("Step") as number;
        let markSpacing = step;
        if (((max - min) / step) > 10) {
            // compute a spacing such that there are at most 10 graduations
            markSpacing *= Math.floor((max - min) / (10 * step));
        }

        const marks: {[key: number]: string} = {};

        for (let i = min; i < max; i += markSpacing) {
            marks[i] = i.toLocaleString();
        }
        marks[max] = max.toLocaleString(); // ensure max is always marked

        return (<TooltipRange
            {...{
                value,
                min,
                max,
                step,
                marks
            }}
            onChange={(value) => {
                bag.set("Start", value[0]);
                bag.set("End", value[1]);
            }}/>
        );
    }
}
