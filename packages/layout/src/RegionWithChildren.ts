import { DashboardLayoutRegion, IDashboardLayoutProperties } from "./DashboardLayoutRegion";
import { Panel, Widget } from "@phosphor/widgets";
import { takeWhile } from "rxjs/operators";
import { Message, MessageLoop, IMessageHook } from "@phosphor/messaging";
import { AttachedProperty } from "@phosphor/properties";
import { IterTools, Types, Type } from "@mavenomics/coreutils";
import { Interactions } from "@mavenomics/ui";
import { LayoutManager } from "./LayoutManager";

export interface RegionWithChildren {
    constructor: typeof DashboardLayoutRegion & {
        GetMetadata(): RegionWithChildren.ParentMetadata<any>
    };
}

/**
 * A base class for layout regions that have children.
 *
 * #### Notes
 *
 * This class uses a Phosphor panel for managing the lifecycle of the children-
 * subclassers should choose a subclass of Panel appropriate for their use-case.
 * Panel is itself appropriate for subclasses with custom layout algorithms.
 */
export abstract class RegionWithChildren<
    LayoutProps extends RegionWithChildren.IProps
                      = RegionWithChildren.IProps
> extends DashboardLayoutRegion<LayoutProps> {
    public static GetMetadata(): RegionWithChildren.ParentMetadata<any> {
        const oldMetadata: DashboardLayoutRegion.Metadata<RegionWithChildren.IProps> = super.GetMetadata();
        const metadata = new RegionWithChildren.ParentMetadata<RegionWithChildren.IProps>({
            iconClass: oldMetadata.iconClass,
            iconText: oldMetadata.iconText
        });
        metadata.copyFrom(oldMetadata);
        metadata.getMetadata("showTitle")!.default = false;
        metadata.addMetadata("prunable", {
            prettyName: "Prunable?",
            type: Types.Boolean,
            documentation: "Internal. Whether this region is elibible to be auto-pruned by the framework.",
            default: true,
        });
        return metadata;
    }

    public readonly abstract content: Panel;
    protected readonly metadata!: RegionWithChildren.ParentMetadata<LayoutProps>;
    private readonly addPartOverlay = new Panel();

    constructor(owner: LayoutManager, uuid?: string) {
        super(owner, uuid);
        this.properties = {
            ...this.properties,
            caption: this.constructor.GetMetadata().name
        };
        this.setupAddPartOverlay();
    }

    /** A read-only array of this StackPanel's children. */
    public get widgets(): ReadonlyArray<DashboardLayoutRegion<any>> {
        return this.content.widgets as ReadonlyArray<DashboardLayoutRegion<any>>;
    }

    /** Iterate through all the children of this region, depth-first. */
    public subtree() {
        return IterTools.dfs_iter(this.widgets, (i: any) => i.widgets);
    }

    /** Copy attached properties from one child to another */
    public copyAttachedProperties(
        oldChild: DashboardLayoutRegion<any>,
        newChild: DashboardLayoutRegion<any>
    ) {
        for (let [propName, _] of this.metadata.getAllAttachedProperties()) {
            const prop = this.metadata.getAttachedProperty(propName);
            if (prop == null) continue;
            prop.set(newChild, prop.get(oldChild));
        }
    }

    /** Reset all attached properties for a region */
    public clearAttachedProperties(child: DashboardLayoutRegion<any>) {
        for (let propname of this.metadata.getAllAttachedPropertyNames()) {
            const prop = this.metadata.getAttachedProperty(propname);
            prop!.set(child, null);
        }
    }

    /** Insert a new child at the "end" of this container.
     *
     * #### Notes
     *
     * The default implementation of this function calls insertChild() with
     * the length of the children as 'i'.
     *
     * @param widget The new child to insert into this container
     * @see insertWidget
     */
    public addChild(widget: DashboardLayoutRegion<any>) {
        this.insertChild(this.widgets.length, widget);
    }

    /** Insert a new child into this container at a particular index.
     *
     * #### Notes
     *
     * If the widget is already in this region's children, then the widget is
     * moved instead. This matches the behavior of Phosphor panels.
     *
     * This function also sets the parentRegion of the widget to this region.
     *
     *
     * @param i The index to insert the child into
     * @param widget The child to insert
     */
    public insertChild(i: number, widget: DashboardLayoutRegion<any>) {
        const oldParent = widget.parentRegion;
        widget.parentRegion = this;
        widget.OnStale.pipe(
            // takeWhile unhooks when the predicate becomes false, so we don't
            // need to unhook this
            takeWhile(() => !this.isDisposed && this.widgets.indexOf(widget) > -1)
        ).subscribe(() => {
            // move staleness upwards
            this.setStale();
        });
        this.content.insertWidget(i, widget);
        // Check to see if we can prune the tree
        if (!!oldParent) {
            const ancestor = this.findCommonAncestor(oldParent);
            if (ancestor != null) {
                ancestor.pruneSubtree();
            }
        }
        this.setStale();
    }

    public getAttachedPropertyForChild(
        propertyName: string,
        child: DashboardLayoutRegion<any>
    ) {
        const prop = this.metadata.getAttachedProperty(propertyName);
        if (prop == null) {
            throw Error("Cannot find attached property with name " + prop);
        }
        return prop.get(child);
    }

    /** Synchronously arrange the children of this region.
     *
     * #### Notes
     *
     * The MavenWorks framework uses a slightly different layout algorithm than
     * Phosphor layouts- MavenWorks is top-down and starts with root-level
     * invariants (such as window size) and moves downwards. This allows many
     * layout panels to use analytical, linear-time algorithms even when
     * flexible boxes are considered.
     *
     * The downside of this is that it requires some reinventing-of-the-wheel
     * as Phosphor doesn't map 1:1 with this approach. If a subclass has a
     * trivial setup (such as the Tab Panel), then this may just need to query
     * the size of the node and set CSS maxWidth/maxHeight before calling
     * `this.content.fit()`.
     *
     * This function must call `DashboardLayoutRegion#sizeContentToFit()` on all
     * visible children of this region.
     */
    public abstract layoutChildren(): void;

    public updateFromProperties() {
        this.updateOverlay();
        super.updateFromProperties();
    }

    /** Set this region and all it's children as fresh.
     *
     * @see IStaleable
     */
    public setFresh() {
        for (const child of this.widgets) {
            child.setFresh();
        }
        super.setFresh();
    }

    /**
     * Clean up this subtree by removing auto-generated empty regions.
     *
     * #### Notes
     *
     * This is a framework function and not meant to be called by user code.
     * The MavenWorks framework will automatically manage the health of the layout,
     * pruning when useful.
     *
     * Whether a region is "prunable" or not is specified by the `[[prunable]]`
     * layout property. For regions created with SurroundWith, this property is
     * true.
     *
     * @see IRegionWithChildrenProps.prunable
     * @see DashboardActions.SurroundWith
     */
    public pruneSubtree() {
        let nodes: RegionWithChildren[];
        while ((nodes = this.findPrunableChildren()).length > 0) {
            this.setStale();
            for (const node of nodes) {
                if (node.isDisposed) {
                    continue; // this will be removed later by Phosphor
                }
                // If it has a single child, move the child before pruning
                if (node.widgets.length === 1) {
                    const parent = node.parentRegion || this.owner.root;
                    const child = node.widgets[0];
                    const index = parent.widgets.indexOf(node as any);
                    parent.insertChild(index, node.widgets[0]);
                    if (child.isFocused) {
                        child.activate(); // focus will be destroyed by the move
                    }
                }
                node.dispose();
            }
        }
    }

    public sizeContentToFit(bounds: {width: number, height: number}) {
        super.sizeContentToFit(bounds);
        this.layoutChildren();
    }

    public processMessage(msg: Message) {
        if (msg.type === "region-child-removed") {
            this.onChildRegionRemoved((msg as Widget.ChildMessage).child as DashboardLayoutRegion);
        } else if (msg.type === "region-child-added") {
            this.onChildRegionAdded((msg as Widget.ChildMessage).child as DashboardLayoutRegion);
        }
        super.processMessage(msg);
    }

    /**
     * Create a drag shadow for one of this region's children.
     *
     * @param child The region that is being dragged
     * @param clientX The X coordinate that the drag will start from
     * @param clientY The Y coordinate that the drag will start from
     *
     * @returns A valid HTML node that will follow the mouse during the drag.
     *
     * @remarks
     *
     * Drag shadows are signifiers of the region being dragged, and indicate to
     * the user what the dragged region is. For some regions (like the Canvas),
     * it's useful to customize this shadow to expose more information (such as
     * how it will be positioned in the CanvasPanel).
     *
     * The shadow must be completely static- it will not recieve any events, and
     * will be destroyed at the end of the drag operation.
     *
     */
    public createDragShadow(
        child: DashboardLayoutRegion<any>,
        clientX: number,
        clientY: number
    ): HTMLElement {
        const node = document.createElement("span");
        node.classList.add("m-DragShadow");
        node.textContent = child.getLayoutProperty("caption");
        return node;
    }

    /** Private method to mark a subtree in an update loop.
     *
     * This is only intended for use by the DashboardLayout.
     *
     * @private
     */
    public _markSubtreeForUpdate() {
        for (const widget of this.subtree()) {
            widget._didUpdate = false;
        }
    }

    /** Private method to update skipped subtrees in an update loop.
     *
     * This is only intended for use by the DashboardLayout.
     *
     * @private
     */
    public _updateSkippedSubtrees() {
        for (const widget of IterTools.filter(this.subtree(), (i) => !i._didUpdate)) {
            widget.updateFromProperties();
        }
    }

    protected onCloseRequest() {
        if (this.parentRegion == null) {
            return; // don't allow closing of root regions
        }
        super.onCloseRequest();
    }

    protected getDefault(propertyName: string) {
        if (this.metadata.getAttachedProperty("" + propertyName)) {
            return this.metadata.getAttachedMetadata("" + propertyName)!.default;
        }
        return super.getDefault(propertyName);
    }

    /** Installs a message tap on the content to listen for child-removed.
     *
     * This tap is necessary for regions that use a custom layout algorithm,
     * since the parent won't necessarily be notified when a Panel child is
     * removed.
     */
    protected installContentTap() {
        const tap = Private.InstalledTaps.get(this as RegionWithChildren<any>);
        MessageLoop.installMessageHook(this.content, tap);
    }

    /**
     * Handle that gets called when this region recieves a new child.
     *
     * @param newChild The child being added
     *
     * @remarks
     * Subclassers can override this method to implement custom logic, such as
     * adding UI chroming or CSS classes.
     *
     * The default implementation is a no-op.
     */
    protected onChildRegionAdded(newChild: DashboardLayoutRegion) {
        // no-op
    }

    /**
     * Handle that gets called when a child is removed from this region.
     *
     * @param oldChild
     *
     * @remarks
     * Subclassers can override this method to implement custom logic, such as
     * removing CSS classes or event handlers. Custom chroming elements added
     * via Region Chroming will be removed automatically.
     *
     * This function is not called until after the oldChild has been moved, and
     * will not be called if the old child is disposed. It will also not be
     * called when this region is being disposed.
     *
     * The default implementation of this function is a no-op.
     */
    protected onChildRegionRemoved(oldChild: DashboardLayoutRegion) {
        // no-op
    }

    /**
     * Traverse the parents of this and another region to find common ancestor.
     *
     * #### Notes
     *
     * Returns null if no common ancestor was found. This can happen if the
     * other node is unattached (ie, a new node that hasn't yet been added).
     */
    private findCommonAncestor(other: RegionWithChildren) {
        const candidates: WeakSet<RegionWithChildren> = new WeakSet();

        let region: RegionWithChildren<any> | null = this;
        while (!!region) {
            candidates.add(region);
            region = region.parentRegion;
        }

        let otherRegion: RegionWithChildren | null = other;
        while (!!otherRegion) {
            if (candidates.has(otherRegion)) {
                return otherRegion;
            }
            otherRegion = otherRegion.parentRegion;
        }

        return null;
    }

    /** Return all children of this subtree eligible for pruning */
    private findPrunableChildren() {
        const prunableRegions = [];
        for (const region of this.subtree()) {
            if (region instanceof RegionWithChildren
                && region.widgets.length <= 1
                && region.getLayoutProperty("prunable")) {
                prunableRegions.push(region);
            }
        }
        return prunableRegions;
    }

    private setupAddPartOverlay() {
        this.addPartOverlay.addClass("m-AddPartOverlay");
        const btn = new Interactions.Button();
        btn.addClass("m-AddPartOverlay-btn");
        btn.label = "Add New Part...";
        btn.onClicked.subscribe(async () => {
            const selectedType = await this.owner.showAddPartDialog();
            if (selectedType == null) return;
            this.owner.addPartToRegion(this.id, selectedType);
        });
        this.addPartOverlay.addWidget(btn);
        this.layout.addWidget(this.addPartOverlay);
    }

    private updateOverlay() {
        if (this.parentRegion != null || this.widgets.length > 0) {
            this.addPartOverlay.hide();
            return;
        }
        this.addPartOverlay.show();
    }
}

export namespace RegionWithChildren {
    /**
     * Base class for RegionWithChildren properties
     */
    export interface IProps extends IDashboardLayoutProperties {
        /**
         * Whether this region is eligible to be coalesced.
         *
         * If true, the region may get culled by the Layout Manager if it has no
         * children.
         *
         * #### Notes
         *
         * This layout property is not meant for user editing, but is exposed
         * for testing and for rare cases in which a user might actually want it
         * to stay there.
         */
        prunable: boolean;
    }

    export class ParentMetadata<
        T extends RegionWithChildren.IProps
    > extends DashboardLayoutRegion.Metadata<T> {
        public description = "";
        public remarks = "";

        private attachedMetadataMap = new Map<
            string,
            DashboardLayoutRegion.IPropertyMetadata<unknown>
        >();
        private attachedPropertyMap = new Map<string, AttachedProperty<any, any>>();

        public copyFrom(other: DashboardLayoutRegion.Metadata<T>) {
            for (const [propName, prop] of other.getAllProperties()) {
                this.addMetadata(propName, prop);
            }
            this.description = other.description;
            this.remarks = other.remarks;
        }

        public addAttachedMetadata(
            property: AttachedProperty<any, any>,
            metadata: IAttachedPropertyMetadata
        ) {
            const withDefaults = Object.assign(
                { prettyName: property.name },
                ParentMetadata.defaultData,
                metadata
            );
            this.attachedMetadataMap.set(property.name, withDefaults);
            this.attachedPropertyMap.set(property.name, property);
        }

        public getAllAttachedProperties() {
            return this.attachedMetadataMap.entries();
        }

        public getAllAttachedPropertyNames() {
            return [...this.attachedMetadataMap.keys()];
        }

        public getAttachedMetadata(propertyName: string) {
            return this.attachedMetadataMap.get(propertyName);
        }

        public getAttachedProperty(propertyName: string) {
            return this.attachedPropertyMap.get(propertyName);
        }
    }

    interface IAttachedPropertyMetadata {
        type: Type;
        default: any;
        documentation: string;
    }
}

namespace Private {
    /**
     * Some layout classes need to be updated when a child is removed. For those
     * that do, this class will update the container as appropriate.
     */
    export class MessageTap implements IMessageHook {
        private owner: RegionWithChildren;

        constructor(owner: RegionWithChildren) {
            this.owner = owner;
        }

        public messageHook(_handler: Panel, msg: Message) {
            if (msg instanceof Widget.ChildMessage
                && !this.owner.isDisposed
                && !msg.child.isDisposed) {
                // update the parent when a child has been removed
                const newMsg = new Widget.ChildMessage(
                    "region-" + msg.type,
                    msg.child
                );
                MessageLoop.sendMessage(this.owner, newMsg);
            }
            return true;
        }
    }

    export const InstalledTaps = new AttachedProperty<RegionWithChildren, MessageTap>({
        create: (owner) => new MessageTap(owner),
        name: "MessageTap Instances"
    });
}
