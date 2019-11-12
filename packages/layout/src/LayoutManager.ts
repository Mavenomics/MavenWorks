import { Widget, PanelLayout, StackedLayout } from "@phosphor/widgets";
import { StackPanelLayoutRegion } from "./StackPanelLayoutRegion";
import { LayoutSerializer } from "./LayoutSerializer";
import { RegionWithChildren } from "./RegionWithChildren";
import { DashboardLayoutRegion } from "./DashboardLayoutRegion";
import { MessageLoop, Message } from "@phosphor/messaging";
import { Signal, ISignal } from "@phosphor/signaling";
import { Subject } from "rxjs";
import { LayoutActions } from "./layoutactions";
import { DockPreview } from "./dockpreview";
import { IterTools, IDirtyable } from "@mavenomics/coreutils";
import { ReactWrapperWidget, HoverManager, ListBox } from "@mavenomics/ui";
import * as React from "react";
import { WidgetLayoutRegion } from "./WidgetLayoutRegion";

/**
 * Enum for layout type names
 */
export enum LayoutTypes {
    StackPanelLayoutRegion,
    WidgetLayoutRegion,
    TabPanelDashboardLayoutRegion,
    CanvasLayoutRegion,
    GridPanelLayoutRegion
}

/**
 * Base layout for Maven Dashboards
 *
 * This class manages the layout operations of a set of widgets, which are
 * arranged in a tree and consist of DashboardLayoutRegions. These regions have
 * a set of layout properties that describe appearance and layout behavior- for
 * instance, all regions have properties like `borderWidth.px` and
 * `borderColor`.
 */
export class LayoutManager extends Widget implements IDirtyable {
    public layout: PanelLayout;
    public dockPreview: DockPreview;
    public root: StackPanelLayoutRegion;
    private partManager: LayoutManager.IPartManager;
    private factory: LayoutManager.IFactory;
    private externalParts = new Map<string, Widget>();
    private _maximizedRegion: DashboardLayoutRegion<any> | null = null;
    private _focusedRegion: DashboardLayoutRegion<any> | null = null;
    private _onFocusedChanged = new Signal<this, DashboardLayoutRegion<any> | null>(this);
    private _isDirty = false;
    private _OnDirtySrc = new Subject<void>();
    private _OnDirty = this._OnDirtySrc.asObservable();
    private _forceTitlebars = false;

    constructor(partManager: LayoutManager.IPartManager, factory: LayoutManager.IFactory) {
        super();
        this.node.tabIndex = -1;
        this.addClass("m-LayoutManager");
        this.partManager = partManager;
        this.factory = factory;
        this.layout = new StackedLayout();
        this.root = new StackPanelLayoutRegion(this);
        this.root.setLayoutProperty("caption", "Dashboard");
        this.root.setFresh();
        this.root.OnStale.subscribe(() => this.setDirty());
        this.dockPreview = new DockPreview({ owner: this });
        this.dockPreview.hide();
        this.layout.addWidget(this.root);
        this.layout.addWidget(this.dockPreview);
    }

    /** The layout region that currently has focus, if any. */
    public get focusedRegion() { return this._focusedRegion; }

    /**
     * A signal that emits when the focused layout region changes.
     *
     * #### Notes
     *
     * A region's focus is not related to DOM focus.
     *
     * @see DashboardLayoutRegion.LayoutMsg.BeforeFocus*/
    public get focusedRegionChanged(): ISignal<this, DashboardLayoutRegion<any> | null> {
        return this._onFocusedChanged;
    }

    /** Whether this layout has unsaved changes */
    public get isDirty() { return this._isDirty; }

    /** An Observable that emits whenever this layout becomes dirty */
    public get OnDirty() { return this._OnDirty; }

    /** If true, override [[showTitle]] on all layout regions with `true`. */
    public get forceTitlebars() { return this._forceTitlebars; }

    /** Set forceTitlebars and update the layout */
    public set forceTitlebars(force: boolean) {
        if (force === this._forceTitlebars) return;
        this._forceTitlebars = force;
        this.setDirty();
    }

    /** Mark this layout as having been synchronized with the model */
    public setClean() {
        this._isDirty = false;
        this.update();
    }

    // TODO: Remove this
    getPart(id: string) {
        return this.partManager.getPartById(id) || this.externalParts.get(id);
    }

    setExternalParts(parts: Map<string, Widget>) {
        this.externalParts = parts;
    }

    initLayout(serializedLayout: LayoutSerializer.ISerializedLayoutRegion) {
        if (!serializedLayout) {
            return; // no layout to setup
        }

        this.root.dispose();
        this.root = LayoutSerializer.fromJson(serializedLayout, this) as StackPanelLayoutRegion;
        this.root.setFresh();
        this.root.OnStale.subscribe(() => this.setDirty());
        this.root.titlebar.hide(); // TODO: RootLayoutRegion?
        this.layout.insertWidget(0, this.root);
    }

    public getRegion(uuid: string): DashboardLayoutRegion<any> | null {
        // TODO: map for storing region UUIDs
        if (uuid === this.root.uuid) {
            return this.root;
        }
        for (const region of IterTools.dfs_iter(
            this.root.widgets,
            i => i instanceof RegionWithChildren ? i.widgets : undefined
        )) {
            if (region.uuid === uuid) {
                return region;
            }
        }
        return null; // region not found
    }

    public getParentRegion(uuid: string) {
        // TODO: map for storing region UUIDs
        if (uuid === this.root.uuid) {
            return this.root; // root is it's own parent
        }
        const region = this.getRegion(uuid);
        if (region != null && region.parentRegion != null) {
            return region.parentRegion;
        }
        return null; // parent not found
    }

    public removeRegion(uuid: string) {
        const toRemove = this.getRegion(uuid);
        if (!toRemove) {
            throw Error("Region with " + uuid + " not found!");
        }
        const parent = toRemove.parentRegion;
        toRemove.dispose();
        this.setDirty();
        if (parent) {
            parent.fit();
            parent.update();
        }
        this.root.pruneSubtree();
    }

    public dispose() {
        if (this.isDisposed) {
            return;
        }
        this._OnDirtySrc.complete();
        this._focusedRegion = null;
        this.root.dispose();
        this.externalParts.forEach(i => i.dispose());
        this.externalParts.clear();
        super.dispose();
    }

    public handleEvent(ev: FocusEvent): void {
        switch (ev.type) {
            case "focusin":
            case "mousedown":
                return this._handleFocus(ev);
        }
    }

    public moveToRootZone(zone: LayoutActions.RootDropZone, target: string) {
        return LayoutActions.MoveToRootZone({
            layoutManager: this,
            zone,
            target
        });
    }

    public moveToRelativeZone(
        zone: LayoutActions.RelativeDropZone,
        target: string,
        reference: string
    ) {
        return LayoutActions.MoveToRelativeZone({
            layoutManager: this,
            zone,
            target,
            reference
        });
    }

    public async showAddPartDialog() {
        const items: ListBox.ListItem[] = [];
        for (const name of this.factory.keys()) {
            items.push({
                key: name,
                label: name
            });
        }
        items.sort((a, b) => a.key.localeCompare(b.key));
        let selectedPart: string | null = null;
        const hover = ReactWrapperWidget.Create(
            () => React.createElement<ListBox.IProps>(ListBox, {
                items,
                selectedKey: selectedPart,
                onSelect: (key) => {
                    selectedPart = key;
                    hover.update();
                },
                onCommit: (key) => {
                    selectedPart = key;
                    MessageLoop.sendMessage(
                        hover.parent!,
                        HoverManager.DialogMsg.AcceptRequest
                    );
                },
                isEditing: false,
                onEdit: () => void 0,
            })
        );
        hover.node.style.overflowY = "auto";
        const res = await HoverManager.Instance!.launchDialog(
            hover,
            this,
            300,
            600,
            "Add New Part",
            [{ text: "Dismiss" }, { text: "Ok", accept: true }]
        );
        if (!res.accept) return;
        return selectedPart;
    }

    public async addPartToRegion(target: string, type: string) {
        const region = this.getRegion(target);
        if (!(region instanceof RegionWithChildren)) {
            throw Error("Cannot add region to parent");
        }
        const widget = await this.factory.get(type);
        const widgetRegion = new WidgetLayoutRegion(this, widget, widget.id);
        region.addChild(widgetRegion);
    }

    get bounds(): { width: number, height: number } {
        const bounds = (this.node.getBoundingClientRect());
        return { width: bounds.width, height: bounds.height };
    }

    protected updateMaximizedRegion() {
        let regionToMaximize = null;
        for (const region of IterTools.dfs_iter(
            this.root.widgets,
            i => i instanceof RegionWithChildren ? i.widgets : undefined
        )) {
            //Ignore the currently maximized region.
            //This allows us to handle the case where someone maximizes a region inside the designer
            if (this._maximizedRegion === region)
                continue;

            if (region.getLayoutProperty("maximized")) {
                if (!regionToMaximize) {
                    regionToMaximize = region;
                } else {
                    //Only allow 1 maximized region
                    region.setLayoutProperty("maximized", false);
                }
            }
        }

        //Handle the case where the root is maximized via the designer
        if (this.root.getLayoutProperty("maximized"))
            this.root.setLayoutProperty("maximized", false);

        //Nothing is maximized
        if (!this._maximizedRegion && !regionToMaximize)
            return;

        //Maximized region is still maximized and there is nothing new to maximize
        if (!regionToMaximize && this._maximizedRegion && this._maximizedRegion.getLayoutProperty("maximized"))
            return;

        //Remove the already maximized widget.
        //This is hit when either replacing the maximized widget or unmaximizing the widget
        if (this._maximizedRegion != null) {
            this._maximizedRegion.setLayoutProperty("maximized", false);
            //this.layout.removeWidget(this._maximizedRegion);
            document.querySelectorAll(".no-stack").forEach(i => i.classList.remove("no-stack"));
            this._maximizedRegion = null;
        }

        //Maximize the new widget
        if (regionToMaximize != null) {
            regionToMaximize.setLayoutProperty("maximized", true);
            this._maximizedRegion = regionToMaximize;
            let cur = regionToMaximize.parent;
            while (cur && cur !== this.root) {
                cur.addClass("no-stack");
                cur = cur.parent;
            }
            //this.layout.addWidget(regionToMaximize);
            this.setDirty();
        }
    }

    protected onUpdateRequest() {
        this.updateMaximizedRegion();
    }

    protected onAfterAttach() {
        this.node.addEventListener("focusin", this);
        this.node.addEventListener("mousedown", this);
    }

    protected onBeforeDetach() {
        this.node.removeEventListener("focusin", this);
        this.node.removeEventListener("mousedown", this);
    }

    private _handleFocus(ev: FocusEvent) {
        let target = ev.target as HTMLElement;
        // We can do this check because we won't get events *directly* from
        // iframes in parts. Instead, they'll be bubbled up via the event
        // copying mechanism.
        if (!this.root.node.contains(target)) {
            return; // not something we can focus
        }
        while (target.parentElement != null && target !== this.node) {
            if (!target.classList.contains("maven_dashboard")) {
                target = target.parentElement;
                continue;
            }
            const regionId = target.id;
            const region = this.getRegion(regionId);
            if (region == null) {
                return; // region isn't valid
                // though if this happens, something else is also wrong
            }
            this.setFocusedRegion(region);
            return;
        }
    }

    private setFocusedRegion(region: DashboardLayoutRegion<any>) {
        if (region === this._focusedRegion) {
            // do nothing
            return;
        }
        const oldRegion = this._focusedRegion;

        if (oldRegion != null) {
            MessageLoop.sendMessage(oldRegion, DashboardLayoutRegion.LayoutMsg.BeforeBlur);
        }

        MessageLoop.sendMessage(region, DashboardLayoutRegion.LayoutMsg.BeforeFocus);

        this._focusedRegion = region;
        this._onFocusedChanged.emit(region);

        MessageLoop.sendMessage(region, DashboardLayoutRegion.LayoutMsg.AfterFocus);

        if (oldRegion != null) {
            MessageLoop.sendMessage(oldRegion, DashboardLayoutRegion.LayoutMsg.AfterBlur);
        }
    }

    private setDirty() {
        this.root.setFresh();
        MessageLoop.sendMessage(this.root, Widget.Msg.FitRequest);
        MessageLoop.sendMessage(this.root, Widget.Msg.UpdateRequest);
        if (this._isDirty) return;
        this._isDirty = true;
        this._OnDirtySrc.next();
    }
}

export namespace LayoutManager {
    /**
     * An interface for some part provider.
     *
     * Parts are normally provided by the part manager, but this interface
     * allows the layout engine to work with things that aren't quite parts.
     * The only requirement is that they be referencable by some string ID.
     *
     * @export
     * @interface IPartManager
     */
    export interface IPartManager {
        getPartById(id: string): Widget | null;
    }

    export interface IFactory {
        keys(): Iterable<string>;
        has(key: string): boolean;
        get(key: string): Widget | Promise<Widget>;
    }
}
