import * as React from "react";

/**
 * Themed Progress Bar
 *
 * This progress bar works on a scale of 0-1 (corresponding to 0%-100%). For
 * indeterminate values, set `value` to null.
 *
 * NOTE: Due to a webkit bug, indeterminate progress bars cannot be animated.
 * Instead, we must create a <span> element and animate it. This means the
 * original progress element is gone.
 */
export const ProgressBar: React.FC<ProgressBar.IProps> = ({
    value, flavorText, success
}) => {
    const progressVal = value && Math.min(1, Math.max(0, +value));
    const formatted = value ? ("" + Math.floor(value * 100)) + "%" : "Indeterminate";
    let baseClass = "m-Progress";
    if (success != null) {
        baseClass += success ? "m-Progress-ok" : "m-Progress-failure";
    }
    // Return an animatable span if and only if indeterminate
    if (value == null) {
        return (<div className={baseClass}>
            <span role="progressbar"
                className={"m-Progress-bar-fake-indeterminate"}
                title={formatted}></span>
            <span className="m-Progress-flavorText">{flavorText}</span>
        </div>);
    }
    // Note that formatted is inserted twice. I'm not sure which is 'better' for
    // accessibility, but I like having the tooltip. MDN indicates that the
    // progress element can accept phrasing content, and the examples listed use
    // it to mirror the value. The W3C spec recommends it for backwards compat,
    // but I don't think we need to worry about it.
    return (<div className={baseClass}>
        <progress className="m-Progress-bar"
            title={formatted}
            value={progressVal}>{formatted}</progress>
        <span className="m-Progress-flavorText">{flavorText}</span>
    </div>);
};

export namespace ProgressBar {
    export interface IProps {
        /** The value of the progress bar. Omit for an indeterminate bar. */
        value?: number;
        /** Optional extra text to describe the bar's state. */
        flavorText?: string;
        /** Optional flag to indicate whether the action succeeded.
         * If true, the bar will render green.
         * If false, the bar will render red.
         * If undefined, the bar will render blue (default).
         */
        success?: boolean;
    }
}
