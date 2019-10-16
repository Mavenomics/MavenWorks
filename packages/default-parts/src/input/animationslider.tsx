import Slider, { createSliderWithTooltip } from "rc-slider";
import * as React from "react";
import { Types } from "@mavenomics/coreutils";
import { ReactPart, OptionsBag } from "@mavenomics/parts";

const TooltipSlider = createSliderWithTooltip(Slider);

export class AnimationSliderPart extends ReactPart {
    public static GetMetadata() {
        const metadata = super.GetMetadata();

        metadata.description = `Part for animating dashboards with a given timestep.`;

        metadata.remarks = `
Often it is useful to 'animate' a dashboard, either to visualize change over
time or just to offer another level of interactivity. The Value option is most
commonly bound to a global representing time.

If you need to use this as a date slider, one way you can accomplish that is
using JS bindings. Bind the value of this part to a regular global, and wherever
you need time just use that number to 'add' days, hours, seconds, etc. to some
start date. For example, if you bound "Value" to a global named "DaysSinceStart",
you can use that in another binding like so:

\`\`\`js
/* @DaysSinceStart,@MyStartDate */

const date = new Date(globals.MyStartDate);
date.setDays(date.getDays() + globals.DaysSinceStart);

// now you can use date in your binding
\`\`\`
`;

        metadata.addOption("Value", Types.Number, 0, {
            description: "The value this slider takes on"
        });
        metadata.addOption("Min", Types.Number, 0);
        metadata.addOption("Max", Types.Number, 10);
        metadata.addOption("Step", Types.Number, 1, {
            description: "How much to increment Value by on each timestep."
        });
        metadata.addOption("Timestep (ms)", Types.Number, 100, {
            description: "How frequently to update the value. Note that timesteps under 16ms may not " +
            "work as expected, and will not be accurate."
        });
        metadata.addOption("Loop", Types.Boolean, false, {
            description: "Whether this part should continue by resetting the Value after hitting the Max value."
        });
        metadata.addOption("Enabled", Types.Boolean, false, {
            description: "Whether this part is currently animating."
        });

        return metadata;
    }

    private allowReplay = false;
    private isPlaying = false;
    private lastInterval = 100;
    private timer: number | null = null;

    protected renderReact(bag: OptionsBag) {
        const value = bag.get("Value") as number;
        const min = bag.get("Min") as number;
        const max = bag.get("Max") as number;
        const step = bag.get("Step") as number;
        const interval = bag.get("Timestep (ms)") as number;
        const loop = bag.get("Loop") as boolean;
        const isPlaying = bag.get("Enabled") as boolean;

        if (isPlaying && !this.isPlaying) {
            this.startInterval(bag);
        } else if (this.isPlaying && !isPlaying) {
            this.pauseInterval();
        }

        if (interval !== this.lastInterval && this.isPlaying) {
            this.pauseInterval();
            this.startInterval(bag);
        }

        this.allowReplay = loop;
        this.lastInterval = interval;

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
        return (<div style={{padding: "10px 20px"}}>
            <TooltipSlider
                style={{marginBottom: "25px"}}
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
            <span>
                <button className={"fa " + (this.isPlaying ? "fa-pause" : "fa-play")}
                    onClick={() => {
                        bag.set("Enabled", !this.isPlaying);
                    }}
                    style={{
                        backgroundColor: this.isPlaying ? "black" : "",
                        color: this.isPlaying ? "white" : ""
                    }}></button>
                <button className="fa fa-stop"
                    onClick={() => this.invalidateInterval(bag)}></button>
                <button className="fa fa-refresh"
                    onClick={() => {
                        this.allowReplay = !this.allowReplay;
                        bag.set("Loop", this.allowReplay);
                    }}
                    style={{
                        backgroundColor: this.allowReplay ? "black" : "",
                        color: this.allowReplay ? "white" : ""
                    }}></button>
            </span>
        </div>);
    }

    private startInterval(bag: OptionsBag) {
        if (this.timer != null) {
            this.invalidateInterval(bag);
        }
        this.isPlaying = true;
        if (!bag.get("Enabled")) bag.set("Enabled", true);
        const interval = bag.get("Timestep (ms)") as number;
        // run the interval once, to get it to play on the leading edge
        this.stepInterval(bag);
        // Node typings are getting included due to a recent jest-util update:
        // https://github.com/facebook/jest/issues/8092
        this.timer = window.setInterval(() => this.stepInterval(bag), interval);
    }

    private stepInterval(bag: OptionsBag) {
        // min/max and step aren't guaranteed to be invariant over the
        // animation lifetime
        const min = bag.get("Min") as number;
        const max = bag.get("Max") as number;
        const step = bag.get("Step") as number;
        let value = bag.get("Value") as number;
        value += step;
        if (value > max) {
            if (!this.allowReplay) {
                this.invalidateInterval(bag);
                return;
            }
            value = min;
        }
        bag.set("Value", value);
    }

    private pauseInterval() {
        this.isPlaying = false;
        if (this.timer != null) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    private invalidateInterval(bag: OptionsBag) {
        this.isPlaying = false;
        // reset the value
        bag.set("Value", bag.get("Min"));
        if (bag.get("Enabled")) bag.set("Enabled", false);

        if (this.timer != null) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
}
