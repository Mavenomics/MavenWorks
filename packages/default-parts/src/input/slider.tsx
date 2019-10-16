import { Types } from "@mavenomics/coreutils";
import Slider, { createSliderWithTooltip } from "rc-slider";
import * as React from "react";
import { ReactPart, Part, OptionsBag } from "@mavenomics/parts";

const TooltipSlider = createSliderWithTooltip(Slider);

export class SliderPart extends ReactPart {
    public static GetMetadata() {
        const metadata = super.GetMetadata();

        metadata.description = "Display a numeric slider";

        metadata.addOption("Value", Types.Number, 5);

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
        return (<TooltipSlider
            defaultValue={5}
            min={0}
            max={10}
            step={1} />
        );
    }

    protected renderReact(bag: OptionsBag) {
        const value = bag.get("Value") as number;
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

        return (<TooltipSlider
            {...{
                value,
                min,
                max,
                step,
                marks
            }}
            onChange={(value) => {
                bag.set("Value", value);
            }}/>
        );
    }
}
