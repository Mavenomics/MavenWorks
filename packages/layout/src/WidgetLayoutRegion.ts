import { Widget } from "@phosphor/widgets";
import { LayoutTypes, LayoutManager } from "./LayoutManager";
import { DashboardLayoutRegion, IDashboardLayoutProperties } from "./DashboardLayoutRegion";
import { Types } from "@mavenomics/coreutils";

/** A layout region that contains a single PhosphorJS Widget. This is used for final layout, and wraps
 * the widgets they contain. Note that the Panel that owns the DashboardLayout should still have full control over the
 * widget's lifecycle.
 */
export class WidgetLayoutRegion extends DashboardLayoutRegion<WidgetLayoutRegion.ILayoutProps> {
    public static GetMetadata() {
        const meta = super.GetMetadata() as DashboardLayoutRegion.Metadata<WidgetLayoutRegion.ILayoutProps>;
        meta.addMetadata("showOverlays", {
            prettyName: "General.Show Overlays?",
            type: Types.Boolean,
            documentation: "If false, the Calculating overlays on Parts will be hidden. Overlays " +
                "will still be shown if the Part encounters an error.",
            default: true,
        });
        meta.getMetadata("caption")!.default = "New Part";
        meta.iconClass += " m-widget-icon";
        return meta;
    }

    typeName = LayoutTypes.WidgetLayoutRegion;
    public readonly guid!: string;
    public readonly content!: Widget;

    constructor(owner: LayoutManager, child: Widget, guid: string, regionUuid?: string) {
        super(owner, regionUuid);
        this.addClass("maven_widget");
        this.content = child;
        const label = child.title.label;
        if (label !== "" && label !== "New Part") {
            this.properties = {
                ...this.properties,
                caption: label
            };
        }
        this.title.label = child.title.label;
        this.guid = guid;
    }

    public updateFromProperties() {
        super.updateFromProperties();
        this.content.toggleClass("m-hide-part-overlays", !this.getLayoutProperty("showOverlays"));
    }

    /**
     * Get the child of this region
     * @deprecated
     */
    public getChild(): Widget {
        return this.content;
    }

    public dispose() {
        if (this.isDisposed) {
            return;
        }
        this.content.dispose();
        super.dispose();
    }
}

export namespace WidgetLayoutRegion {
    export interface ILayoutProps extends IDashboardLayoutProperties {
        showOverlays: boolean;
    }
}
