import { LayoutTypes, LayoutManager } from "./LayoutManager";
import { RegionWithChildren } from "./RegionWithChildren";
import { Panel, Widget } from "@phosphor/widgets";
import { DashboardLayoutRegion } from "./DashboardLayoutRegion";
import { MessageLoop } from "@phosphor/messaging";
import { IDragEvent } from "@phosphor/dragdrop";
import { FrameTools, MathTools, Types } from "@mavenomics/coreutils";
import { AttachedProperty } from "@phosphor/properties";

/** Generic layout properties for stack panel.
 * @property {boolean} horizontal The switch that determines which direction child panels fill in the space.
 *
 * @see StackPanelLayoutRegion
 * @see IDashboardLayoutProperties
 * @extends IDashboardLayoutProperties
 */
export interface IStackPanelProperties extends RegionWithChildren.IProps {
    "horizontal": boolean;
    "showSplitters": boolean;
    "splitterWidth.px": number;
    "accordionMode": "None" | "Single" | "Multi";
}

/** Represents a linear stack of widgets, arranged either top-to-bottom or left-to-right.
 * The root element of any dashboard is a StackPanel. StackPanels may be arbitrarily nested, and may host any other
 * layout regions as children.
 */
export class StackPanelLayoutRegion
    extends RegionWithChildren<IStackPanelProperties>
// tslint:disable-next-line:one-line
{
    public static GetMetadata() {
        const metadata = super.GetMetadata() as RegionWithChildren.ParentMetadata<
            IStackPanelProperties
        >;
        metadata.name = "Stack Panel";
        metadata.iconText = "view_stream";
        metadata.description = "Arranges children either horizontally or vertically in a stack.";
        metadata.remarks = `
The Stack Panel is the most essential layout region, and the root of a dashboard
is always a Stack Panel. Stack children can be sized either using an absolute
number of pixels ("Fixed Size") or a relative ratio ("Flex Size"). If you set
one property on a child, the other will be cleared.

Fixed sizes are useful for UI controls like sliders, that don't usefully expand
to fill their container.

This container will insert draggable splitters between each child, that can be
used to resize them.

> #### Accordioning
>
> This container supports arranging children in a collapsable accordion layout.
> When Accordioning is enabled, the splitters are replaced with collapsers that,
> when clicked, will expand or collapse their associated region. These will
> render _in place of_ the titlebars of a region.
>
> The accordion mode can be set to either \`Single\` or \`Multi\`. In \`Single\`
> mode, expanding an accordion will collapse all others in the stack. By
> contrast, \`Multi\` mode will allow multiple accordions to be open at once.
> Both modes allow all regions to be collapsed. Accordioning can be disabled by
> setting the Accordion mode to \`None\`.
`;
        metadata.addMetadata("horizontal", {
            prettyName: "Stack Panel.Align Horizontal?",
            type: Types.Boolean,
            documentation: "If true, children will be arranged left-to-right instead of top-to-bottom.",
            default: false
        });
        metadata.addMetadata("showSplitters", {
            prettyName: "Stack Panel.Show Splitters?",
            type: Types.Boolean,
            documentation: "If true, draggable splitters will be shown between the children of this " +
                "region, allowing them to be resized.",
            default: true
        });
        metadata.addMetadata("splitterWidth.px", {
            prettyName: "Stack Panel.Splitter Width (px)",
            type: Types.Number,
            documentation: "How wide the draggable splitters between children should be.",
            default: 4
        });
        metadata.addMetadata("accordionMode", {
            prettyName: "Stack Panel.Accordion Mode",
            type: Types.String,
            schema: {
                type: "string",
                enum: ["None", "Single", "Multi"]
            },
            documentation: "If enabled, how to display the children in an accordion layout. One of " +
                "`None`, `Single`, or `Multi`.",
            default: "None"
        });
        // Attached properties
        metadata.addAttachedMetadata(StackPanelLayoutRegion.FixedSize, {
            type: Types.Number,
            documentation: "If specified, an exact size in pixels for this region. If Stretch is " +
                "specified, this property will have no effect.",
            default: null
        });
        metadata.addAttachedMetadata(StackPanelLayoutRegion.FlexSize, {
            type: Types.Number,
            documentation: "If specified, how much this region should stretch to fill compared " +
                " to other regions. If fixed size is specified, this property will have no effect.",
            default: 1
        });
        metadata.addAttachedMetadata(StackPanelLayoutRegion.IsExpanded, {
            type: Types.Boolean,
            documentation: "For Accordions, whether this child is expanded (true) or collapsed (false).",
            default: true
        });
        return metadata;
    }
    private static readonly evTypes = ["keyup", "pointerup", "contextmenu", "pointermove"];

    public readonly typeName = LayoutTypes.StackPanelLayoutRegion;
    public readonly content: Panel;
    /** The drag-resize splitters for this panel */
    private readonly splitters: Set<HTMLDivElement> = new Set();
    private originalSizings: ["flexSize" | "fixedSize.px" | null, number][] = [];
    //** The drag index points to the child immediately before the splitter */
    private dragIndex?: number;
    private dragStart?: number;

    constructor(owner: LayoutManager, uuid?: string) {
        super(owner, uuid);
        this.addClass("maven_stackpanel");
        this.content = new Panel();
        this.installContentTap();
    }

    public insertChild(i: number, widget: DashboardLayoutRegion) {
        this.removeSplitters();
        super.insertChild(i, widget);
    }

    dispose() {
        if (this.isDisposed) {
            return;
        }
        this.removeSplitters();
        // layout disposal will dispose all the child widgets
        super.dispose();
    }

    /** Function to layout the children within this stack panel.
     *
     * # Layout algorithm description
     *
     * ## Terms
     * - `[[ ]]`: A name enclosed in double brackets is a region layout property
     * - Flex item: An element that defines a `[[flexSize]]` in it's properties
     * - Absolutely-sized item: An element that defines a `[[fixedSize]]` in
     *   it's properties
     * - basis-direction: The axis along which this Stack panel is arranged. May
     *   be vertical (top-to-bottom) or horizontal (left-to-right).
     * - basis-size: An element's desired size along this StackPanel's
     *   basis-direction.
     * - minor-axis-size: An element's desired size along the opposite to this
     *   StackPanel's basis-direction
     *
     * ## Algorithm
     * 1. Definitions
     *     1. Let `useAccordions` = `false` if `[[accordionMode]]` = `'None'` else `true`
     *     2. Let `splitterSize` = `25` if `useAccordions` else `[[splitterSize]]`
     *     3. Let `minSize` = 0.
     *     4. Let `maxSize` = (the size of the parent container in the basis-direction)
     *        - (twice the padding of the parent).
     *     5. Let `totalFlex` = 0.
     * 2. For each element:
     *     1. If the element does not have `[[showRegion]]`:
     *         1. Continue.
     *     2. Add `splitterSize` to `minSize`
     *     3. If `useAccordions`and the element does not have `[[IsExpanded]]`:
     *         1. Continue
     *     4. ElseIf the element is absolutely positioned:
     *         1. Add the element's `[[fixedSize]]` to `minSize`.
     *     5. Else:
     *         1. Add the element's `[[flexSize]]` to `totalFlex`
     * 3. If not `useAccordions`:
     *     1. Subtract `splitterSize` from `minSize`
     *     COMMENT. don't render last splitter
     * 4. If `minSize` exceeds `maxSize`:
     *     1. Set `totalFlex` to Infinity
     *     COMMENT. do not allow flex items to layout, but leave their splitters in place
     * 5. Let `flowSize` = (`maxSize` - `minSize`) / `totalFlex`.
     * 6. For each element:
     *     1. If `useAccordions` and the element does not have `[[IsExpanded]]`:
     *         1. Calculate the basis-size as 0
     *     2. ElseIf the element does not have `[[showRegion]]`:
     *         1. Calculate the basis-size as 0
     *     3. ElseIf the element is a flex item:
     *         1. Calculate the basis-size as `[[flexSize]]` * `flowSize`
     *     4. Else:
     *         1. Calculate the basis-size as `[[fixedSize]]`
     *     5. Set the element size to the minor-axis-size by basis-size
     *     6. If the element does not have `[[showRegion]]`:
     *         1. Continue
     *     7. If `useAccordions`:
     *         1. Insert an Accordion folder before the element
     *     8. ElseIf element  is not the last element with `[[showRegion]]`:
     *         1. Insert a splitter after the element
     * 7. Return
     */
    layoutChildren() {
        this.removeSplitters();
        if (this.widgets.length === 0) {
            return;
        }
        if (typeof this.calculatedSize === "undefined") {
            console.warn("not yet setup");
            return;
        }
        const isHoriz = !!this.getLayoutProperty("horizontal");
        const padding = +this.getLayoutProperty("padding.px");
        const basisAxis = isHoriz ? "width" : "height";
        const minorAxis = isHoriz ? "height" : "width";
        const titlebarSize = this.titlebar.isVisible ? this.titlebar.node.getBoundingClientRect().height : 0;
        const minorAxisSize = this.calculatedSize[minorAxis]
                            - padding * 2
                            - (isHoriz ? titlebarSize : 0);
        // 1.
        // 1.1
        const useAccordions = this.getLayoutProperty("accordionMode") !== "None";
        this.toggleClass("m-hide-child-titlebars", useAccordions);
        this.toggleClass("m-uses-accordions", useAccordions);
        // 1.2
        const splitterSize = useAccordions ? 25 :
                                !!this.getLayoutProperty("showSplitters")
                                ? +this.getLayoutProperty("splitterWidth.px")
                                : 0;
        // 1.3
        let minSize = 0;
        // 1.4
        let maxSize = this.getMaxSizeConstraint();
        // 1.5
        let totalFlexSize = 0;
        // 2.
        for (const child of this.widgets) {
            // 2.1
            if (!child.getLayoutProperty("showRegion")) {
                // 2.1.1
                continue;
            }
            // 2.2
            minSize += splitterSize;
            // 2.3
            if (useAccordions && !StackPanelLayoutRegion.IsExpanded.get(child)) {
                // 2.3.1
                continue;
            }
            // 2.5
            if (StackPanelLayoutRegion.FlexSize.get(child) != null) {
                // 2.5.1
                totalFlexSize += +StackPanelLayoutRegion.FlexSize.get(child)!;
                continue;
            }
            // 2.4, 2.4.1
            minSize += +StackPanelLayoutRegion.FixedSize.get(child)!;
        }
        // 3.
        if (!useAccordions) {
            // 3.1
            minSize -= splitterSize; // don't render last splitter
        }
        // 4.
        if (minSize > maxSize) {
            // 4.1
            totalFlexSize = Infinity; // fp trick to force a 0 in the final calc
        }
        // 5.
        const flowSize = (maxSize - minSize) / totalFlexSize;
        // 6.
        for (let i = 0; i < this.widgets.length; i++) {
            const child = this.widgets[i];
            let basisSize: number;
            // 6.1
            if (useAccordions && !StackPanelLayoutRegion.IsExpanded.get(child)) {
                // 6.1.1
                basisSize = 0;
            } else if (!child.getLayoutProperty("showRegion")) {
                // 6.2.1
                basisSize = 0;
            } else if (StackPanelLayoutRegion.FixedSize.get(child) != null) {
                // 6.4.1
                basisSize = +StackPanelLayoutRegion.FixedSize.get(child)!;
            } else {
                // 6.3.1
                basisSize = flowSize * +StackPanelLayoutRegion.FlexSize.get(child)!;
            }
            // 6.5
            child.calculatedSize = {
                [basisAxis]: basisSize,
                [minorAxis]: minorAxisSize
            } as { width: number, height: number };
            MessageLoop.sendMessage(child, Widget.Msg.FitRequest);
            // 6.6
            if (!child.getLayoutProperty("showRegion")) {
                // 6.6.1
                continue;
            }
            // 6.7
            if (useAccordions) {
                // 6.7.1
                const accordion = this.makeAccordion(child, isHoriz, this.calculatedSize);
                child.node.insertAdjacentElement("beforebegin", accordion);
                continue;
            }
            // to fulfill 6.8, iterate through the remaining children to verify
            // that this is not the last visible child
            let foundVisibleChild = false;
            for (let j = i + 1; j < this.widgets.length; j++) {
                const nextChild = this.widgets[j];
                if (nextChild.getLayoutProperty("showRegion")) {
                    foundVisibleChild = true;
                    break;
                }
            }
            if (!foundVisibleChild) {
                continue;
            }
            // 7.4.1
            const splitter = this.makeSplitter(isHoriz, splitterSize, this.calculatedSize);
            child.node.insertAdjacentElement("afterend", splitter);
        }
    }

    public updateFromProperties() {
        const isHoriz = !!this.getLayoutProperty("horizontal");
        this.node.classList.remove(isHoriz ? "maven_layout_vertical" : "maven_layout_horizontal");
        this.node.classList.add(isHoriz ? "maven_layout_horizontal" : "maven_layout_vertical");
        super.updateFromProperties();
    }

    public handleEvent(ev: DOMEvent) {
        if (ev.defaultPrevented) {
            return;
        }
        switch (ev.type) {
            case "pointerdown":
                if ((ev.currentTarget! as HTMLElement)
                        .classList
                        .contains("m-StackPanel-accordion")
                ) {
                    // this is an accordion
                    const child = this.widgets.find(i => i.node.previousSibling === ev.currentTarget);
                    const isExpanded = StackPanelLayoutRegion.IsExpanded.get(child!);
                    StackPanelLayoutRegion.IsExpanded.set(child!, !isExpanded);
                    return;
                }
                this.startResize(ev as PointerEvent);
                return;
            case "pointerup":
                this.endResize();
                return;
            case "pointermove":
                this.moveResize(ev as PointerEvent);
                return;
            case "contextmenu":
            case "keyup":
                this.cancelResize(ev as PointerEvent);
                return;
            default:
                super.handleEvent(ev as IDragEvent);
        }
    }

    protected onAfterAttach() {
        const splitters = this.node.querySelectorAll("div.m-StackPanel-splitter");
        splitters.forEach(i => {
            i.addEventListener("pointerdown", this);
        });
        super.onAfterAttach();
    }

    protected onBeforeDetach() {
        const splitters = this.node.querySelectorAll("div.m-StackPanel-splitter");
        splitters.forEach(i => {
            i.removeEventListener("pointerdown", this);
        });
        super.onBeforeDetach();
    }

    private makeAccordion(
        child: DashboardLayoutRegion,
        isHoriz: boolean,
        calculatedSize: {height: number, width: number}
    ) {
        const color = child.getLayoutProperty("captionColor");
        const backgroundColor = child.getLayoutProperty("captionBackground");
        const caption = child.getLayoutProperty("caption") || "";


        const expanded = StackPanelLayoutRegion.IsExpanded.get(child);
        const triangle = document.createElement("span");
        triangle.classList.add("m-FlippyTriangle");
        triangle.dataset["collapsed"] = !expanded ? "true" : "false";

        const accordion = document.createElement("div");
        accordion.classList.add("m-StackPanel-accordion");
        accordion.appendChild(triangle);
        accordion.addEventListener("pointerdown", this);
        this.splitters.add(accordion);

        if (color.color !== "transparent") {
            accordion.style.color = color.color;
            triangle.style.borderLeftColor = color.color;
        }
        if (backgroundColor.color !== "transparent") {
            accordion.style.backgroundColor = backgroundColor.color;
        }

        // thanks to the absurd world of margin collapsing, we can't just stick
        // this in a text node. noooo, that'd be too unsuprising.
        const label = document.createElement("span");
        // instead we have to wrap it in a <span> and defeat margin collapsing
        // with a CSS hack detailed in a comment on this answer:
        // https://stackoverflow.com/a/19718884
        label.style.overflow = "auto";
        // finally if we are arranging things vertically, we should _not_ do this
        // because otherwise things would break even more
        if (!isHoriz) {
            label.style.display = "inline-block";
        }
        // that way we can get the behavior that should've been the default
        // a quarter century ago
        label.textContent = caption;
        accordion.appendChild(label);

        if (isHoriz) {
            accordion.style.width = 23 + "px";
            accordion.style.height = calculatedSize.height + "px";
        } else {
            accordion.style.width = calculatedSize.width + "px";
            accordion.style.height = 23 + "px";
        }
        return accordion;
    }

    private makeSplitter(
        isHoriz: boolean,
        splitterSize: number,
        calculatedSize: {height: number, width: number}
    ) {
        const splitter = document.createElement("div");
        splitter.classList.add("m-StackPanel-splitter");
        splitter.addEventListener("pointerdown", this);
        this.splitters.add(splitter);
        if (isHoriz) {
            splitter.style.width = splitterSize + "px";
            splitter.style.height = calculatedSize.height + "px";
        } else {
            splitter.style.width = calculatedSize.width + "px";
            splitter.style.height = splitterSize + "px";
        }
        return splitter;
    }

    private getMaxSizeConstraint() {
        if (this.calculatedSize == null) return 0;
        const isHoriz = !!this.getLayoutProperty("horizontal");
        const padding = +this.getLayoutProperty("padding.px");
        const basisAxis = isHoriz ? "width" : "height";
        const titlebarSize = this.titlebar.isVisible
                           ? this.titlebar.node.getBoundingClientRect().height
                           : 0;
        return this.calculatedSize[basisAxis] - padding * 2 - (isHoriz ? 0 : titlebarSize);
    }

    private removeSplitters() {
        for (const splitter of this.splitters) {
            splitter.remove();
        }
        this.splitters.clear();
    }

    private startResize(ev: PointerEvent) {
        ev.preventDefault();
        ev.stopPropagation();

        FrameTools.DisableFramePointerEvents();
        this.dragIndex = -1;
        for (let i = 0; i < (this.widgets.length); i++) {
            const child = this.widgets[i];
            if (child.node.nextSibling === ev.target) {
                this.dragIndex = i;
            }
            if (!child.getLayoutProperty("showRegion")) {
                this.originalSizings.push([null, 0]);
                continue;
            }
            const fixedSize = StackPanelLayoutRegion.FixedSize.get(child);
            if (fixedSize === null) {
                this.originalSizings.push([
                    "flexSize",
                    +(StackPanelLayoutRegion.FlexSize.get(child) || 1)
                ]);
            } else {
                this.originalSizings.push(["fixedSize.px", +fixedSize]);
            }
        }
        if (this.dragIndex === -1) {
            // the handle wasn't found, don't do anything
            this.dragIndex = undefined;
            this.originalSizings = [];
            return;
        }

        if (!!this.getLayoutProperty("horizontal")) {
            this.dragStart = ev.screenX;
        } else {
            this.dragStart = ev.screenY;
        }

        for (const evType of StackPanelLayoutRegion.evTypes) {
            document.addEventListener(evType, this);
        }
    }

    private endResize() {
        this.originalSizings = [];
        this.dragIndex = undefined;
        this.dragStart = undefined;

        for (const evType of StackPanelLayoutRegion.evTypes) {
            document.removeEventListener(evType, this);
        }

        FrameTools.EnableFramePointerEvents();
    }

    private moveResize(ev: PointerEvent) {
        ev.preventDefault();
        ev.stopPropagation();
        // The change in sizings, in pixels.
        const isHoriz = !!this.getLayoutProperty("horizontal");
        const delta = (isHoriz ? ev.screenX : ev.screenY) - this.dragStart!;
        const leftChild = this.widgets[this.dragIndex!];
        const leftChildSize = this.originalSizings[this.dragIndex!];
        // find the next valid child
        // if we can't find it, then it's a layout bug as per Layout Algorithm step 7.4
        const rightIndex = this.widgets.findIndex((child, i) =>
            (i > this.dragIndex!) &&
            child.getLayoutProperty("showRegion")
        );
        if (rightIndex < 0) {
            this.cancelResize();
            // TODO: Find a better place to throw this error. This is a layout bug, not a drag bug.
            throw Error("Splitter appeared in the wrong place!");
        }
        const rightChild = this.widgets[rightIndex];
        const rightChildSize = this.originalSizings[rightIndex];
        /*
         * There's 3 cases we need to handle:
         *
         *  1. Both Left and Right are fixedSize
         *  2. Both Left and Right are flexSize
         *  3. Left and Right are not sized using the same mechanism
         */
        if (leftChildSize[0] === "fixedSize.px" && leftChildSize[0] === rightChildSize[0]) {
            // Case 1
            // subtract 50 since that's the minimum size of the other child
            // and clamp it to keep it from going negative
            const max = MathTools.Clamp(leftChildSize[1] + rightChildSize[1] - 50, 0, Infinity);
            const lSize = MathTools.Clamp(leftChildSize[1] + delta, 50, max); // min 50 px
            const rSize = MathTools.Clamp(rightChildSize[1] - delta, 50, max);
            StackPanelLayoutRegion.FixedSize.set(leftChild, lSize);
            StackPanelLayoutRegion.FixedSize.set(rightChild, rSize);
            return;
        }
        const minSize = this.originalSizings.reduce(
                (acc, i) => i[0] === "fixedSize.px" ? acc + i[1] : acc,
                0
            ) + 4 * (this.originalSizings.length - 1);
        const maxSize = this.getMaxSizeConstraint();
        const totalFlexSize = this.originalSizings.reduce((acc, i) => i[0] === "flexSize" ? acc + i[1] : acc, 0);
        const flowSize = (maxSize - minSize) / totalFlexSize;
        // max in px
        function scaleFlexSize(size: number, delta: number, max: number) {
            return MathTools.Clamp((size * flowSize) + delta, 50, max) / flowSize;
        }
        if (leftChildSize[0] === "flexSize" && leftChildSize[0] === rightChildSize[0]) {
            // Case 2
            // subtract 50 since that's the minimum size of the other child
            // and clamp it to keep it from going negative
            const max = MathTools.Clamp(
                leftChildSize[1] * flowSize + rightChildSize[1] * flowSize - 50,
                0,
                Infinity
            );
            const lSize = scaleFlexSize(leftChildSize[1], delta, max);
            const rSize = scaleFlexSize(rightChildSize[1], -delta, max);

            StackPanelLayoutRegion.FlexSize.set(leftChild, lSize);
            StackPanelLayoutRegion.FlexSize.set(rightChild, rSize);
            return;
        }
        // Case 3
        if (leftChildSize[0] === "flexSize") {
            // subtract 50 since that's the minimum size of the other child
            // and clamp it to keep it from going negative
            const max = MathTools.Clamp(
                leftChildSize[1] * flowSize + rightChildSize[1] - 50,
                0,
                Infinity
            );
            const lSize = scaleFlexSize(leftChildSize[1], delta, max);
            const rSize = MathTools.Clamp(rightChildSize[1] - delta, 50, max);

            StackPanelLayoutRegion.FlexSize.set(leftChild, lSize);
            StackPanelLayoutRegion.FixedSize.set(rightChild, rSize);
        } else {
            const max = MathTools.Clamp(
                leftChildSize[1] + rightChildSize[1] * flowSize - 50,
                0,
                Infinity
            );
            const lSize = MathTools.Clamp(leftChildSize[1] + delta, 50, max);
            const rSize = scaleFlexSize(rightChildSize[1], -delta, max);
            StackPanelLayoutRegion.FixedSize.set(leftChild, lSize);
            StackPanelLayoutRegion.FlexSize.set(rightChild, rSize);
        }

    }

    private cancelResize(ev?: PointerEvent | KeyboardEvent) {
        if (ev) {
            ev.preventDefault();
            ev.stopPropagation();
        }
        if (this.dragIndex == null) return;
        if (ev && ev.type === "keyup") {
            if ((ev as KeyboardEvent).key !== "Escape") {
                return;
            }
        }
        const leftChild = this.widgets[this.dragIndex!];
        const leftChildSize = this.originalSizings[this.dragIndex!];
        // find the next valid child
        // if we can't find it, then it's a layout bug as per Layout Algorithm step 7.4
        const rightIndex = this.widgets.findIndex((child, i) =>
            (i > this.dragIndex!) &&
            child.getLayoutProperty("showRegion")
        );
        const rightChild = this.widgets[rightIndex];
        const rightChildSize = this.originalSizings[rightIndex];
        if (leftChildSize[0] === "fixedSize.px") {
            StackPanelLayoutRegion.FixedSize.set(leftChild, leftChildSize[1]);
        } else {
            StackPanelLayoutRegion.FlexSize.set(leftChild, leftChildSize[1]);
        }
        if (rightChildSize[0] === "fixedSize.px") {
            StackPanelLayoutRegion.FixedSize.set(rightChild, rightChildSize[1]);
        } else {
            StackPanelLayoutRegion.FlexSize.set(rightChild, rightChildSize[1]);
        }
        this.endResize();
    }
}

export namespace StackPanelLayoutRegion {
    export const FlexSize = new AttachedProperty<DashboardLayoutRegion, number | null>({
        name: "Stretch",
        changed: (owner, _old, newValue) => {
            if (newValue != null) {
                // clear fixed size if not null
                FixedSize.set(owner, null);
            }
            if (owner.parentRegion) {
                owner.parentRegion.fit();
                owner.parentRegion.update();
            }
            owner.setStale();
        },
        create: () => 1,
    });

    export const FixedSize = new AttachedProperty<DashboardLayoutRegion, number | null>({
        name: "Fixed Size (px)",
        changed: (owner, _old,  newValue) => {
            if (newValue != null) {
                FlexSize.set(owner, null);
            }
            if (owner.parentRegion) {
                owner.parentRegion.fit();
                owner.parentRegion.update();
            }
            owner.setStale();
        },
        create: () => null
    });

    export const IsExpanded = new AttachedProperty<DashboardLayoutRegion, boolean | null>({
        name: "Expanded",
        changed: (owner, wasExpanded, willExpand) => {
            if (wasExpanded === willExpand) return;
            if (owner.parentRegion) {
                const mode = owner.parentRegion.getLayoutProperty("accordionMode");
                if (willExpand && mode === "Single") {
                    for (const widget of owner.parentRegion.widgets) {
                        if (widget === owner) continue;
                        if (!IsExpanded.get(widget)) {
                            continue;
                        }
                        IsExpanded.set(widget, false);
                    }
                }
                owner.parentRegion.fit();
                owner.parentRegion.update();
            }
            owner.setStale();
        },
        create: () => null
    });
}
