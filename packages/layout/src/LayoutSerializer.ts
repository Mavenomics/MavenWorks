import { DashboardLayoutRegion, IDashboardLayoutProperties } from "./DashboardLayoutRegion";
import { IStackPanelProperties, StackPanelLayoutRegion } from "./StackPanelLayoutRegion";
import { LayoutManager, LayoutTypes } from "./LayoutManager";
import { WidgetLayoutRegion } from "./WidgetLayoutRegion";
import { UUID } from "@phosphor/coreutils";
import { ITabPanelProperties, TabPanelDashboardLayoutRegion } from "./TabPanelLayoutRegion";
import { CanvasLayoutRegion, ICanvasProperties } from "./CanvasLayoutRegion";
import { RegionWithChildren } from "./RegionWithChildren";
import { GridLayoutRegion } from "./GridLayoutRegion";
import { Color } from "@mavenomics/coreutils";

/* Notes:
 *  - For now, the Serializer is hard-coded. Some thought should be put into better integrating with the JupyterLab
 *    arch to provide DI tokens to register new layout regions and serializers with.
 *  - This serializer is two-way, but deserializing relies on there being an active parent and root.
 *  - This serializer works differently than converters. Do we want layout regions to be valid Maven datatypes? Or are
 *    they better handled using separate serialization tooling?
 */

export namespace LayoutSerializer {
    export function toJson(region: DashboardLayoutRegion<any>): ISerializedLayoutRegion {
        const baseModel: ISerializedLayoutRegion = {
            properties: {...region.properties},
            typeName: region.typeName,
            uuid: region.uuid
        };

        // TODO: Add better value serialization
        const colorProps: (keyof IDashboardLayoutProperties)[] = [
            "backgroundColor",
            "borderColor",
            "captionBackground",
            "captionColor"
        ];
        colorProps.forEach((color) => {
            if (color in region.properties) {
                baseModel.properties[color] = region.properties[color].color;
            }
        });

        if (region instanceof RegionWithChildren) {
            const metadata = region.constructor.GetMetadata() as RegionWithChildren.ParentMetadata<any>;
            const attachedProps: Array<{[prop: string]: any}> = [];
            for (let i = 0; i < region.widgets.length; i++) {
                const widget = region.widgets[i];
                attachedProps[i] = {};
                for (let prop of metadata.getAllAttachedPropertyNames()) {
                    const propVal = metadata.getAttachedProperty(prop)!.get(widget);
                    attachedProps[i][prop] = propVal;
                }
            }
            baseModel.attachedProperties = attachedProps;
        }

        switch (region.typeName) {
            case LayoutTypes.StackPanelLayoutRegion:
                return Object.assign(baseModel, {
                    children: (region as StackPanelLayoutRegion).widgets.map(child => LayoutSerializer.toJson(child))
                }) as ISerializedStackPanel;
            case LayoutTypes.WidgetLayoutRegion:
                return Object.assign(baseModel, {
                    guid: (region as WidgetLayoutRegion).guid
                }) as ISerializedWidgetRegion;
            case LayoutTypes.TabPanelDashboardLayoutRegion:
                return Object.assign(baseModel, {
                    children:
                        (region as TabPanelDashboardLayoutRegion).widgets.map(child => LayoutSerializer.toJson(child))
                }) as ISerializedTabPanel;
            case LayoutTypes.CanvasLayoutRegion:
                return Object.assign(baseModel, {
                    children:
                        (region as CanvasLayoutRegion).widgets
                            .map(child => LayoutSerializer.toJson(child))
                }) as ISerializedCanvas;
            case LayoutTypes.GridPanelLayoutRegion:
                return Object.assign(baseModel, {
                    children: (region as RegionWithChildren).widgets.map(child => LayoutSerializer.toJson(child))
                });
            default:
                throw Error("Unknown layout region type " + region.typeName);
        }
    }

    /** Returns an instantiated layout region corresponding to the serialized region. Callers must handle final setup
     * (such as attaching the region to it's parent).
     *
     * Prereqs: layoutParts must already be setup on the root
     *
     * @param region: The serialized region to deserialize
     * @param root: The layout that will own this region
     * @return A layout region that has been initialized but not yet attached to it's parent
     */
    export function fromJson(region: ISerializedLayoutRegion,
                           root: LayoutManager): DashboardLayoutRegion<any> {
        // TODO: Hack to interface with the old format
        // TODO: Update Declarative API
        if (region.hasOwnProperty("type")) {
            region.typeName = ({
                "StackPanelDashboardLayoutRegion": LayoutTypes.StackPanelLayoutRegion,
                "WidgetDashboardLayoutRegion": LayoutTypes.WidgetLayoutRegion,
                "TabPanelDashboardLayoutRegion": LayoutTypes.TabPanelDashboardLayoutRegion
            } as any)[(region as any).type] as LayoutTypes;
        }
        if (!region.hasOwnProperty("uuid")) {
            // this region doesn't have an ID because it's old
            region.uuid = UUID.uuid4();
        }
        const properties = {...region.properties};
        // HACK: Convert any string props to colors
        const colorProps = [
            "backgroundColor",
            "borderColor",
            "captionBackground",
            "captionColor"
        ] as const;
        colorProps.forEach((color) => {
            if (color in region.properties) {
                properties[color] = new Color("" + properties[color]);
            }
        });
        switch (region.typeName) {
            case LayoutTypes.WidgetLayoutRegion:
                const widgetUUID = (region as ISerializedWidgetRegion).guid;
                const widget = root.getPart(widgetUUID);
                if (widget == null) {
                    throw Error("Child not found for WidgetLayoutRegion: " + widgetUUID);
                }
                const widgetRegion = new WidgetLayoutRegion(root, widget, widgetUUID, region.uuid);
                if (!("caption" in properties) && widget.title.label !== "") {
                    // don't use setLayoutProperty
                    properties.caption = widget.title.label;
                }
                widgetRegion.properties = {...properties};
                return widgetRegion;
            case LayoutTypes.StackPanelLayoutRegion:
                const stack = new StackPanelLayoutRegion(root, region.uuid);
                stack.properties = {...properties};
                for (let i = 0; i < (region as ISerializedStackPanel).children.length; i++) {
                    const child = (region as ISerializedStackPanel).children[i];
                    const childInstance = LayoutSerializer.fromJson(child, root);
                    stack.addChild(childInstance);
                    let flexSize: number | null, fixedSize: number | null;
                    if (region.attachedProperties == null) {
                        // backwards compat
                        fixedSize = (child.properties as any)["fixedSize.px"] || null;
                        flexSize = (child.properties as any)["flexSize"] || null;
                    } else {
                        fixedSize = region.attachedProperties[i]["Fixed Size (px)"] || null;
                        flexSize = region.attachedProperties[i]["Stretch"] || null;
                        StackPanelLayoutRegion.IsExpanded.set(
                            childInstance,
                            region.attachedProperties[i]["Expanded"]
                        );
                    }
                    // FixedSize takes priority if set. Otherwise, use flexSize of 1
                    if (fixedSize != null) {
                        StackPanelLayoutRegion.FixedSize.set(childInstance, fixedSize);
                    } else {
                        StackPanelLayoutRegion.FlexSize.set(childInstance, flexSize || 1);
                    }
                }
                return stack;
            case LayoutTypes.TabPanelDashboardLayoutRegion:
                const tabPanel = new TabPanelDashboardLayoutRegion(root, region.uuid);
                tabPanel.properties = {...properties};
                for (const child of (region as ISerializedTabPanel).children) {
                    tabPanel.addChild(LayoutSerializer.fromJson(child, root));
                }
                // HACK: TabPanel will overwrite the ForegroundIndex when children
                // are added. The "right" way to add this is probably to add some
                // afterLoad hook or message, but I'd rather not do that until
                // something else needs it as well
                tabPanel.setLayoutProperty(
                    "ForegroundIndex",
                    (properties as Partial<ITabPanelProperties>).ForegroundIndex || 0
                );
                return tabPanel;
            case LayoutTypes.CanvasLayoutRegion:
                const canvas = new CanvasLayoutRegion(root, region.uuid);
                const canvasModel = region as ISerializedCanvas;
                canvas.properties = {...properties};
                for (let i = 0; i < canvasModel.children.length; i++) {
                    const child = canvasModel.children[i];
                    const childInstance = LayoutSerializer.fromJson(child, root);
                    let rectangle: string | null = null;
                    if ((child.properties as any)["canvas.rectangle"] != null) {
                        // backwards compat
                        rectangle = (child.properties as any)["canvas.rectangle"];
                    } else if (region.attachedProperties != null) {
                        rectangle = region.attachedProperties[i]["Canvas Panel.Rectangle"] || null;
                    }

                    if (rectangle != null) {
                        CanvasLayoutRegion.Rectangle.set(childInstance, rectangle);
                    }
                    canvas.addChild(childInstance);
                }
                return canvas;
            case LayoutTypes.GridPanelLayoutRegion:
                const grid = new GridLayoutRegion(root, region.uuid);
                grid.properties = {...properties};
                const model = (region as ISerializedGridPanel);
                for (let i = 0; i < model.children.length; i++) {
                    const child = model.children[i];
                    const childInst = LayoutSerializer.fromJson(child, root);
                    if (region.attachedProperties) {
                        GridLayoutRegion.Column.set(childInst, region.attachedProperties[i]["Grid Panel.Column"]);
                        GridLayoutRegion.ColSpan.set(childInst, region.attachedProperties[i]["Grid Panel.Column Span"]);
                        GridLayoutRegion.Row.set(childInst, region.attachedProperties[i]["Grid Panel.Row"]);
                        GridLayoutRegion.RowSpan.set(childInst, region.attachedProperties[i]["Grid Panel.Row Span"]);
                    }
                    grid.addChild(childInst);
                }
                return grid;
            default:
                throw Error("Unsupported layout type: " + region.typeName);
        }
    }

    export interface ISerializedLayoutRegion {
        properties: Partial<IDashboardLayoutProperties>;
        attachedProperties?: {[propName: string]: any}[];
        typeName: LayoutTypes;
        uuid: string;
    }

    export interface ISerializedStackPanel extends ISerializedLayoutRegion {
        properties: Partial<IStackPanelProperties>;
        children: ISerializedLayoutRegion[];
        typeName: LayoutTypes.StackPanelLayoutRegion;
    }

    export interface ISerializedTabPanel extends ISerializedLayoutRegion {
        properties: Partial<ITabPanelProperties>;
        children: ISerializedLayoutRegion[];
        typeName: LayoutTypes.TabPanelDashboardLayoutRegion;
    }

    export interface ISerializedCanvas extends ISerializedLayoutRegion {
        properties: Partial<ICanvasProperties>;
        children: ISerializedLayoutRegion[];
        typeName: LayoutTypes.CanvasLayoutRegion;
    }

    export interface ISerializedGridPanel extends ISerializedLayoutRegion {
        properties: Partial<GridLayoutRegion.ILayoutProps>;
        children: ISerializedLayoutRegion[];
        typeName: LayoutTypes.GridPanelLayoutRegion;
    }

    export interface ISerializedWidgetRegion extends ISerializedLayoutRegion {
        // TODO: Clarify widget guid vs layout guid.
        guid: string;
        typeName: LayoutTypes.WidgetLayoutRegion;
    }
}
