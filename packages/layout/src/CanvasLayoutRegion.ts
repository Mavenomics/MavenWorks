import { MessageLoop } from "@phosphor/messaging";
import { Widget, Panel } from "@phosphor/widgets";
import { LayoutTypes, LayoutManager } from "./LayoutManager";
import { RegionWithChildren } from "./RegionWithChildren";
import { IDragEvent } from "@phosphor/dragdrop";
import { DashboardLayoutRegion } from "./DashboardLayoutRegion";
import { MathTools, Types } from "@mavenomics/coreutils";
import Vec2 = MathTools.Vec2;
import { AttachedProperty } from "@phosphor/properties";
import { Interactions } from "@mavenomics/ui";

export interface ICanvasProperties extends RegionWithChildren.IProps {
    None: number;
}

export class CanvasLayoutRegion
    extends RegionWithChildren<ICanvasProperties>
// tslint:disable-next-line:one-line
{
    public static readonly Rectangle = new AttachedProperty<DashboardLayoutRegion, string>({
        create: () => "0,0,100,100",
        name: "Canvas Panel.Rectangle",
        changed: (owner) => {
            owner.setStale();

            if (owner.parentRegion == null) return;

            MessageLoop.sendMessage(owner.parentRegion, Widget.Msg.FitRequest);
            MessageLoop.sendMessage(owner.parentRegion, Widget.Msg.UpdateRequest);
        }
    });

    public static GetMetadata() {
        const meta = super.GetMetadata();
        meta.name = "Canvas Panel";
        meta.iconText = "picture_in_picture";
        meta.description = "Arrange children freely within the container.";
        meta.remarks = `
The Canvas is completely free-form, and can place children anywhere inside
itself. The canvas uses pixel coordinates and sizes, and thus may not look the
same on different screens.

Canvas panels are a bit special in that they attach some extra chroming to each
child. You can resize a child by dragging a 'resize grippy' on the lower right
hand corner, and you can move a child by dragging the titlebar.

When dragging, the canvas will 'clamp' the boundaries of a part to itself. If
you don't want this behavior, you can manually edit the "Canvas Panel.Rectangle"
property.

If you want to use the normal docking behavior, hold down <kbd>Shift</kbd> when
dragging. This will allow you to, eg, drop a child into a tab panel where the
canvas is.`;
        meta.addAttachedMetadata(this.Rectangle, {
            type: Types.String,
            default: "0,0,100,100",
            documentation: "A comma-separated list of the Left-position, " +
                "Top-position, Width, and Height (respectively) for this child."
        });

        return meta;
    }

    public readonly typeName = LayoutTypes.CanvasLayoutRegion;
    public readonly content: Panel;

    constructor(owner: LayoutManager, uuid?: string) {
        super(owner, uuid);
        this.addClass("m-CanvasPanel");
        this.content = new Panel();
        this.content.addClass("m-CanvasPanel-canvas");
        this.layout.addWidget(this.content);
        this.installContentTap();
    }

    layoutChildren(): void {
        if (this.widgets.length === 0) return;

        for (const child of this.widgets) {
            const size = CanvasLayoutRegion.Rectangle.get(child);
            const [left, top, width, height] = size.split(",").map(i => +i);
            child.calculatedSize = {
                width,
                height,
                left,
                top,
            };
            MessageLoop.sendMessage(child, Widget.Msg.FitRequest);
        }
    }

    dispose() {
        if (this.isDisposed) return;
        this.content.dispose();
        super.dispose();
    }

    public createDragShadow(
        child: DashboardLayoutRegion,
        clientX: number,
        clientY: number
    ) {
        const node = document.createElement("div");
        node.textContent = child.getLayoutProperty("caption");
        const [x, y, width, height] = CanvasLayoutRegion.Rectangle.get(child).split(",");
        // measure the delta between the click position and the current position
        const {top, left} = this.node.getBoundingClientRect();

        const pos = Vec2.Sub(
            [clientX, clientY],
            Vec2.Add([left, top], [+x, +y])
        );

        Object.assign(node.style, {
            "margin-left": `-${pos[0]}px`,
            "margin-top": `-${pos[1]}px`,
            "width": `${width}px`,
            "height": `${height}px`,
            "backgroundColor": "rgba(100, 100, 100, 0.7)",
            "color": "white",
        });

        return node;
    }

    protected onChildRegionAdded(child: DashboardLayoutRegion) {
        const grippy = new Interactions.ResizerGrippy(child, this.node);
        grippy.onSizeChange.subscribe(([x, y, width, height]) => {
            CanvasLayoutRegion.Rectangle.set(child, `${x},${y},${width},${height}`);
        });
        child.attachChrome(grippy);
    }

    protected onDragOver(ev: IDragEvent) {
        if (ev.shiftKey) {
            this.showOverlay();
            super.onDragOver(ev);
            return;
        }
        ev.dropAction = "move";
        ev.preventDefault();
        ev.stopPropagation();
        this.hideOverlay();
    }

    protected onDrop(ev: IDragEvent) {
        if (ev.shiftKey) {
            super.onDrop(ev);
            return;
        }
        const target = ev.mimeData.getData("text/vnd.maven.target") as string;
        const region = this.owner.getRegion(target)!;
        const rect = CanvasLayoutRegion.Rectangle.get(region);
        const elBounds = this.node.getBoundingClientRect();
        const bounds = [elBounds.width, elBounds.height] as Vec2;
        let [x, y, width, height] = rect.split(",").map(i => +i);

        let mouse: Vec2 = [ev.clientX, ev.clientY];
        const start: Vec2 = ev.mimeData.getData("text/vnd.maven.startPosition") as Vec2;

        if (this.widgets.includes(region)) {
            // if the region is being moved within the panel, use the start pos
            // and calculate a delta
            const delta = Vec2.Sub(mouse, start);
            [x, y] = Vec2.Add([x, y], delta);
        } else {
            if (region.parentRegion instanceof CanvasLayoutRegion) {

            }
            [x, y] = Vec2.Sub(mouse, [elBounds.left, elBounds.top]);
        }

        [x, y, width, height] = MathTools.ClampRectToBounds([x, y], [width, height], bounds);

        CanvasLayoutRegion.Rectangle.set(region, `${x},${y},${width},${height}`);

        this.addChild(region);

        // accept the drop
        ev.preventDefault();
        ev.stopPropagation();
        ev.dropAction = "move";
    }
}
