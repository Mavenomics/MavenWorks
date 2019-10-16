import { LayoutManager } from "./LayoutManager";
import { StackPanelLayoutRegion } from "./StackPanelLayoutRegion";
import { MessageLoop } from "@phosphor/messaging";
import { Widget } from "@phosphor/widgets";
import { RegionWithChildren } from "./RegionWithChildren";
import { TabPanelDashboardLayoutRegion } from "./TabPanelLayoutRegion";
import { DashboardLayoutRegion } from "./DashboardLayoutRegion";
import { CanvasLayoutRegion } from "./CanvasLayoutRegion";

export namespace LayoutActions {
    // TODO: Some sort of layout region factory
    export const enum ContainerTypes {
        StackPanel = "Stack Panel",
        TabPanel = "Tab Panel",
        CanvasPanel = "Canvas",
    }

    interface SurroundWithArgs {
        layoutManager: LayoutManager;
        regionType: ContainerTypes;
        target: string;
        prunable: boolean;
    }

    /**
     * Surround a layout region in-place with a new parent.
     *
     * @param layoutManager The manager controlling the layout.
     * @param regionType The type of region to add.
     * @param target The ID of the region to surround.
     *
     * @throws If the target ID does not exist in the layout.
     * @throws If the target region doesn't have a parent region.
     *
     * #### Notes
     *
     * This won't check to see if the parent is already of the given type.
     * That is, it will *always* surround with the given region. Callers
     * that use this function automatically should first check to see that
     * the parent is of the type they need.
     */
    export function SurroundWith(
        {layoutManager, regionType, target, prunable}: SurroundWithArgs
    ) {
        const region = layoutManager.getRegion(target);
        if (region == null) {
            throw Error("Target region not found in layout");
        }
        const parentRegion = region.parentRegion;
        if (parentRegion == null) {
            // This is because it's either the root, or not attached
            throw Error("Target region does not have a valid parent");
        }
        const index = parentRegion.widgets.indexOf(region);
        let newParent: RegionWithChildren<any>;
        switch (regionType) {
            case "Stack Panel":
                newParent = new StackPanelLayoutRegion(layoutManager);
                break;
            case "Tab Panel":
                newParent = new TabPanelDashboardLayoutRegion(layoutManager);
                break;
            case "Canvas":
                newParent = new CanvasLayoutRegion(layoutManager);
                break;
            default:
                throw Error("Unknown region type " + regionType);
        }
        parentRegion.copyAttachedProperties(region, newParent);
        newParent.setLayoutProperty("prunable", prunable);
        newParent.setFresh();
        // addChild will unhook it from the previous parent
        newParent.addChild(region);
        parentRegion.insertChild(index, newParent);
        region.activate();
        return newParent.id;
    }

    /**
     * 4 drop zones are possible on the root node.
     * These are along the 4 sides of the dashboard- dropping a node here will
     * cause all the current root nodes to be moved to a new container. That
     * new container will share half the root size with the target region to
     * drop.
     */
    export const enum RootDropZone {
        FarOuterLeft = "far-outer-left",
        FarOuterRight = "far-outer-right",
        FarOuterTop = "far-outer-top",
        FarOuterBottom = "far-outer-bottom",
    }

    interface MoveToRootArgs {
        layoutManager: LayoutManager;
        zone: RootDropZone;
        target: string;
    }

    /** Move a region to the layout root
     *
     * @param layoutManager The manager controlling the Layout
     * @param zone The drop zone to move the region to
     * @param target The ID of the region to move
     *
     * @throws if no region in the manager can be found with id `target`
     */
    export function MoveToRootZone(
        {layoutManager, zone, target}: MoveToRootArgs
    ) {
        const toMove = layoutManager.getRegion(target);
        if (toMove == null) {
            throw Error("Drag target invalid! No region with id " + target);
        }

        const rootChildren = Array.from(layoutManager.root.widgets);
        const newContainer = new StackPanelLayoutRegion(layoutManager);
        // create a new reference
        newContainer.properties = {...layoutManager.root.properties};
        newContainer.setLayoutProperty("prunable", true);
        newContainer.setStale();
        toMove.setLayoutProperty("flexSize", 1);
        for (const child of rootChildren) {
            newContainer.addChild(child);
        }
        switch (zone) {
            case RootDropZone.FarOuterBottom:
            case RootDropZone.FarOuterRight:
                layoutManager.root.addChild(newContainer);
                layoutManager.root.addChild(toMove);
                break;
            case RootDropZone.FarOuterTop:
            case RootDropZone.FarOuterLeft:
                layoutManager.root.addChild(toMove);
                layoutManager.root.addChild(newContainer);
                break;
        }
        const isRootHorizontal = (zone === RootDropZone.FarOuterLeft ||
                                  zone === RootDropZone.FarOuterRight);
        layoutManager.root.setLayoutProperty("horizontal", isRootHorizontal);
        layoutManager.root.pruneSubtree();
        MessageLoop.sendMessage(layoutManager, Widget.Msg.UpdateRequest);
    }

    /**
     * 9 drop actions are possible relative to a given reference region.
     *
     * A Center drop will create a tab panel and add both the reference and the
     * target to it. If the reference is already a tab panel, the target is
     * simply added to the reference.
     *
     * An Inner drop will create a stack panel and add both the reference and
     * the target to it. If the reference is a stack panel, and it's
     * \[\[horizontal\]\] property aligns with the direction of the drop (eg,
     * a vertical stack panel for inner-top or inner-bottom), then the target
     * is added to the reference.
     *
     * An Outer drop does the same thing as an inner drop, with the exception
     * that it works on the parent of the reference region.
     */
    export const enum RelativeDropZone {
        Center = "center",
        InnerLeft = "inner-left",
        InnerRight = "inner-right",
        InnerTop = "inner-top",
        InnerBottom = "inner-bottom",
        OuterLeft = "outer-left",
        OuterRight = "outer-right",
        OuterTop = "outer-top",
        OuterBottom = "outer-bottom",
    }

    interface MoveToZoneArgs {
        layoutManager: LayoutManager;
        zone: RelativeDropZone;
        target: string;
        reference: string;
    }

    /**
     * Move a region, relative to another region.
     *
     * @param layoutManager The manager controlling the layout
     * @param zone The drop zone to move the region to
     * @param target The ID of the region to move
     * @param reference The ID of the region that will be used as a reference
     *
     * @throws if `target` or `reference` aren't valid IDs in the layout
     * @throws if dropping to an outer target and the reference has no parent
     */
    export function MoveToRelativeZone(
        {layoutManager, zone, target, reference}: MoveToZoneArgs
    ) {
        const targetRegion = layoutManager.getRegion(target);
        let referenceRegion = layoutManager.getRegion(reference);

        if (targetRegion == null) {
            throw Error("Region to move not found in layout");
        }
        if (referenceRegion == null) {
            throw Error("Reference for relative move not found in layout");
        }

        switch (zone) {
            case RelativeDropZone.Center:
                let tabPanel: TabPanelDashboardLayoutRegion;
                if (referenceRegion instanceof TabPanelDashboardLayoutRegion) {
                    tabPanel = referenceRegion;
                } else if (referenceRegion.parentRegion instanceof TabPanelDashboardLayoutRegion) {
                    tabPanel = referenceRegion.parentRegion;
                } else {
                    tabPanel = layoutManager.getRegion(SurroundWith({
                        layoutManager,
                        target: reference,
                        regionType: ContainerTypes.TabPanel,
                        prunable: true
                    })) as TabPanelDashboardLayoutRegion;
                }
                tabPanel.addChild(targetRegion);
                tabPanel.setLayoutProperty("ForegroundIndex", tabPanel.widgets.length - 1);
                break;
            default:
                const stackPanel = layoutManager.getRegion(WrapIfNot(
                    StackPanelLayoutRegion,
                    [["horizontal", zone.endsWith("left") || zone.endsWith("right")]],
                    layoutManager,
                    // if it's an outer drop, use the parent stackpanel
                    zone.startsWith("inner") ? referenceRegion : referenceRegion.parentRegion
                )) as StackPanelLayoutRegion;
                MoveToStackPanel(stackPanel, targetRegion, zone);
        }
        layoutManager.root.pruneSubtree();

    }

    /**
     * Conditionally surround a region if it is not already a container.
     *
     * If the target is an instance of the `RegionClass`, then it is considered
     * a match and the target is returned without modification.
     *
     * If `propsMustMatch` is provided, each [property, value] pair will be
     * compared with the target. If any target\[\[property\]\] !== value, then
     * target will not be considered a match.
     *
     * @param RegionClass The constructor for the container to optionally create
     * @param propsMustMatch A set of properties that must match in order to re-use the region
     * @param layoutManager The layout manager
     * @param target The target region to conditionally surround
     */
    function WrapIfNot(
        RegionClass: { new(...args: any[]): RegionWithChildren<any> },
        propsMustMatch: [string, unknown][],
        layoutManager: LayoutManager,
        target: DashboardLayoutRegion | null
    ) {
        if (target == null) {
            throw Error("Cannot wrap a non-existent panel");
        }
        if (target instanceof RegionClass) {
            let didPropsMatch = true;
            for (const [propName, propValue] of propsMustMatch) {
                if (target.getLayoutProperty(propName as any) !== propValue) {
                    didPropsMatch = false;
                    break;
                }
            }
            if (didPropsMatch) {
                return target.id;
            }
        }
        return SurroundWith({
            layoutManager,
            target: target.id,
            prunable: true,
            regionType: (RegionClass === StackPanelLayoutRegion ? ContainerTypes.StackPanel : ContainerTypes.TabPanel)
        });
    }

    function MoveToStackPanel(
        reference: StackPanelLayoutRegion,
        target: DashboardLayoutRegion,
        zone: RootDropZone | RelativeDropZone
    ) {
        if (zone.endsWith("right") || zone.endsWith("bottom")) {
            reference.addChild(target);
        } else {
            reference.insertChild(0, target);
        }
        const isRootHorizontal = (zone.endsWith("left") || zone.endsWith("right"));
        reference.setLayoutProperty("horizontal", isRootHorizontal);
        return reference;
    }
}
