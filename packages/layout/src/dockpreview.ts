import { Widget } from "@phosphor/widgets";
import { LayoutActions } from "./layoutactions";
import { LayoutManager } from "./LayoutManager";


/**
 * Renders a preview of the drop action over the Layout
 *
 * @export
 * @class DockPreview
 */
export class DockPreview extends Widget {
    private readonly previewNode: HTMLElement;
    private readonly owner: LayoutManager;

    constructor({owner}: DockPreview.IOptions) {
        super();
        this.owner = owner;
        this.addClass("m-DockPreview");
        this.previewNode = document.createElement("div");
        this.previewNode.classList.add("m-DockPreview__overlay");
        this.node.appendChild(this.previewNode);
    }

    /**
     * Show the preview overlay for a given root layout dropzone.
     *
     * @param drop The dropzone to preview over the layout root
     */
    public startPreviewFor(drop: LayoutActions.RootDropZone): void;
    /**
     * Show the preview overlay for a given relative dropzone.
     *
     * @param drop The dropzone to preview
     * @param ref The string ID of the region to use as a reference
     */
    public startPreviewFor(drop: LayoutActions.RelativeDropZone, ref: string): void;
    public startPreviewFor(
        drop: LayoutActions.RelativeDropZone | LayoutActions.RootDropZone,
        ref?: string
    ) {
        const dir = drop.slice(drop.lastIndexOf("-") + 1) as Private.Direction;
        let region = drop.startsWith("far") ? this.owner.root
                                            : this.owner.getRegion(ref!);
        if (region == null) {
            throw Error("Cannot display preview for non-existent region " + region);
        }
        if (drop.startsWith("outer")) {
            // fall back to region if parent is null
            region = region.parentRegion || region;
        }
        this.show();
        const rect = region.node.getBoundingClientRect();
        this.renderPreview(rect, dir);
    }


    /**
     * Stop previewing the last proposed drop action
     *
     */
    public stopPreview() {
        this.hide();
    }

    private renderPreview(regionRect: ClientRect, direction: Private.Direction) {
        const style = this.previewNode.style;
        let {width, height, top, left} = regionRect;
        const reference = this.node.getBoundingClientRect();
        top -= reference.top;
        left -= reference.left;

        switch (direction) {
            case Private.Direction.Left:
                width /= 2;
                break;
            case Private.Direction.Right:
                width /= 2;
                left += width;
                break;
            case Private.Direction.Top:
                height /= 2;
                break;
            case Private.Direction.Bottom:
                height /= 2;
                top += height;
                break;
        }

        Object.assign(style, {
            width: width + "px",
            height: height + "px",
            top: top + "px",
            left: left + "px"
        });

    }
}

export namespace DockPreview {
    export interface IOptions {
        owner: LayoutManager;
    }
}

namespace Private {
    export enum Direction {
        Left = "left",
        Right = "right",
        Top = "top",
        Bottom = "bottom"
    }
}
