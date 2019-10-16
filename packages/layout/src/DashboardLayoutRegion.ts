import { UUID, MimeData } from "@phosphor/coreutils";
import { IDisposable, DisposableSet } from "@phosphor/disposable";
import { IDragEvent, Drag } from "@phosphor/dragdrop";
import { Message, MessageLoop } from "@phosphor/messaging";
import { BoxLayout, PanelLayout, Widget } from "@phosphor/widgets";
import { Subject } from "rxjs";
import { LayoutManager, LayoutTypes } from "./LayoutManager";
import { RegionWithChildren } from "./RegionWithChildren";
import { TitleBar } from "./TitleBar";
import { AttachedProperty } from "@phosphor/properties";
import { FrameTools, IStaleable, Type, Types, Color } from "@mavenomics/coreutils";

/** Generic layout properties for layout regions.
 * **Important**! `flexSize` and `fixedSize.px` _must not_ be defined together! Only one may be defined per region.
 * @property `fixedSize.px` The dimension (in pixels) of this region, along some parent-determined basis axis.
 * @property `flexSize` The dimension of this region, as a ratio of equal-spacing : this-region's-size
 * @property `borderWidth.px` The size of this region's border. If 0, null, or undefined, the border isn't shown.
 * @property `borderColor` The color of the border to display. If null or undefined, the border is black.
 * @property `backgroundColor` The color of this region's background, as a CSS color. Defaults to "none"
 * @property `padding.px` Whether to shrink the content of this region, and if so, by how many pixels.
 *
 * @see DashboardLayoutRegion
 */
export interface IDashboardLayoutProperties {
    "borderWidth.px": number;
    "borderColor": Color;
    "backgroundColor": Color;
    "padding.px": number;
    "showTitle": boolean;
    "maximized": boolean;
    "showRegion": boolean;
    "caption": string;
    "captionColor": Color;
    "captionBackground": Color;
}

export interface DashboardLayoutRegion {
    constructor: typeof DashboardLayoutRegion;
}

/** An abstract representation of a DashboardLayoutRegion. All things that might appear in a Dashboard
 * layout should subclass this.
 *
 * Defines some layout framework classes for the handling of layout in Phosphor.
 */
export abstract class DashboardLayoutRegion<LayoutProps extends IDashboardLayoutProperties = IDashboardLayoutProperties>
    extends Widget
    implements IDisposable, IStaleable
// tslint:disable-next-line:one-line
{
    /**
     * Get metadata about this layout region, for display in UI editors.
     */
    public static GetMetadata(): DashboardLayoutRegion.Metadata<any> {
        // the mapped types are a developer convenience, not a reliable safety mechanism
        // TODO: Put the type parameter in a covariant position so that subclasses can
        // safely extend GetMetadata without casts
        const metadata = new DashboardLayoutRegion.Metadata<IDashboardLayoutProperties>({
            iconClass: "material-icons md-18 md-dark",
            iconText: "insert_chart"
        });
        metadata.addMetadata("backgroundColor", {
            prettyName: "Appearance.Background Color",
            type: Types.Color,
            documentation: "The background color for this region.",
            default: new Color("transparent")
        });
        metadata.addMetadata("borderWidth.px", {
            prettyName: "Appearance.Border Width (px)",
            type: Types.Number,
            documentation: "The width of the border, in pixels.\nIf 0, the border will not be shown.",
            default: 0
        });
        metadata.addMetadata("borderColor", {
            prettyName: "Appearance.Border Color",
            type: Types.Color,
            documentation: "The color of the border around this region",
            default: new Color("black")
        });
        metadata.addMetadata("caption", {
            prettyName: "Title.Caption",
            type: Types.String,
            documentation: "The text displayed in this region's titlebar, if the titlebar is visible",
            default: "New Region"
        });
        metadata.addMetadata("captionBackground", {
            prettyName: "Title.Background Color",
            type: Types.Color,
            documentation: "The background color of the titlebar. If not transparent, the color will be " +
                "used even when the region is focused.",
            default: new Color("transparent"),
        });
        metadata.addMetadata("captionColor", {
            prettyName: "Title.Text Color",
            type: Types.Color,
            documentation: "The font color used for the caption.",
            default: new Color("transparent"),
        });
        metadata.addMetadata("padding.px", {
            prettyName: "Appearance.Padding (px)",
            type: Types.Number,
            documentation: "Padding applied to the interior of this layout region",
            default: 0,
        });
        metadata.addMetadata("showRegion", {
            prettyName: "General.Show Region?",
            type: Types.Boolean,
            documentation: "If false, this region will be hidden from view.",
            default: true
        });
        metadata.addMetadata("showTitle", {
            prettyName: "Title.Show Titlebar?",
            type: Types.Boolean,
            documentation: "If false, the titlebar for this region will be hidden from view.",
            default: true
        });
        metadata.addMetadata("maximized", {
            prettyName: "General.Maximized",
            type: Types.Boolean,
            documentation: "",
            default: false
        });
        return metadata;
    }
    public abstract readonly typeName: LayoutTypes;
    /** The absolute size of this region. May be pre-defined, or calculated. May
     * be undefined until the first call to
     * `DashboardLayoutRegion#sizeContentToFit()`
     * @see sizeContentToFit
     * @deprecated Layout algorithms should use top-down styling
     */
    public calculatedSize: { width: number, height: number, left?: number, top?: number } | undefined;
    /** The titlebar for this region.
     * @see TitleBar
    */
    public readonly titlebar: TitleBar.WidgetWrapper;
    /** An immutable ID assigned to this layout region that is unique within
     * it's dashboard */
    public readonly id: string;
    public readonly layout: DashboardLayoutRegion.DashboardPanelLayout;
    /** Private flag that is set to true after an update-request.
     *
     * This is used by the layout algorithm to ensure that all subtrees updated
     * properly, since some Phosphor containers will skip updating in certain
     * cases.
     *
     * @private
     */
    public _didUpdate = false;
    protected readonly metadata: DashboardLayoutRegion.Metadata<LayoutProps>;
    private _properties: Partial<LayoutProps> = {};
    private _content: Widget = new Widget();
    private _isFocused = false;
    private _parentRegion: RegionWithChildren<any> | null = null;
    private readonly _owner: LayoutManager;
    private _isStale = false;
    private _OnStaleSrc = new Subject<void>();
    private _OnStale = this._OnStaleSrc.asObservable();
    private overlay: DisposableSet = new DisposableSet();
    private rootOverlay: DisposableSet = new DisposableSet();

    protected constructor(owner: LayoutManager, uuid: string = UUID.uuid4()) {
        super();
        this._owner = owner;
        this.metadata = this.constructor.GetMetadata();
        this.layout = new DashboardLayoutRegion.DashboardPanelLayout();
        // allow closing
        this.title.closable = true;
        this.titlebar = new TitleBar.WidgetWrapper(this);
        this.titlebar.hide();
        this.layout.addWidget(this.titlebar);
        BoxLayout.setStretch(this.titlebar, 0);
        this.addClass("maven_dashboard");
        this.id = uuid; // TODO: Continue using UUID or move to id only?
        this.metadata = this.constructor.GetMetadata();
    }

    public dispose() {
        if (this.isDisposed) return;
        this._OnStaleSrc.complete();
        // make sure that these aren't pinned in memory
        delete (this as any)._owner;
        delete this._parentRegion;
        super.dispose();
    }

    /** The content of this layout region.
     * The content is where children and content should go, as this will be
     * given the "main area" of the region. The titlebar will, if shown, take up
     * the top 1em of the region.
     */
    public get content() {
        return this._content;
    }

    public set content(newContent: Widget) {
        if (this._content != null) {
            this._content.removeClass("m-Region-Content");
        }
        this._content = newContent;
        this.content.addClass("m-Region-Content");
        this.content.node.setAttribute("tabindex", "-1");
        this.layout.addWidget(this.content);
        BoxLayout.setStretch(this.content, 1);
    }

    /** A key-value dictionary of metadata that defines how this layout region
     * should display itself */
    public get properties(): Readonly<Partial<LayoutProps>> {
        return this._properties;
    }

    public set properties(newProps: Readonly<Partial<LayoutProps>>) {
        this._properties = newProps;
    }

    /** An immutable ID assigned to this layout region that is unique within
     * it's dashboard
     * @deprecated Use ID directly */
    public get uuid() {
        return this.id;
    }

    /**
     * A layout region that controls this region. For root regions and regions
     * that are not attached, this returns null.
     */
    public get parentRegion() {
        return this._parentRegion;
    }

    public set parentRegion(newRegion: RegionWithChildren<any> | null) {
        // TODO: Update the old and new parent regions
        if (newRegion === this.parentRegion) {
            return; // don't do anything
        }
        this._parentRegion = newRegion;
        Private.Chroming.set(this, new DisposableSet());
    }

    /** Whether this region is currently focused by the MavenWorks framework */
    public get isFocused() { return this._isFocused; }

    /**
     * Whether this region has changes that it's parent hasn't acknowledged
     *
     * This is used by the framework to track dirtiness and update reactively.
     */
    public get isStale() { return this._isStale; }

    /** An Observable that emits whenever this region becomes stale */
    public get OnStale() { return this._OnStale; }

    /** The Layout Manager that owns this region */
    protected get owner() {
        return this._owner;
    }

    /** Size the content of the layout region to fit within the given bounds
     *
     * This is normally called by the dashboarding framework, or by layout regions with children after they have
     * fit themselves.
     *
     * Subclassers may implement additional logic that is relevant to how they should be displayed, such as background
     * color.
     * @param bounds The width and height that the layout region should fit into.
     * @deprecated A later commit will move this to top-down styling, as practiced by Phosphor
     */
    sizeContentToFit(bounds: { width: number, height: number, left?: number, top?: number }): void {
        if (this.getLayoutProperty("maximized")) {
            bounds = this.owner.bounds!;
            this.addClass("m-Region-Maximized");
        } else {
            this.removeClass("m-Region-Maximized");
        }

        this.calculatedSize = bounds;
        this.title.label = this.getLayoutProperty("caption");
        this.title.caption = this.getLayoutProperty("caption");
        // show is inverse of hidden
        this.setHidden(!this.getLayoutProperty("showRegion"));
        const {background, color} = this.title.dataset;
        const captionBg = this.getLayoutProperty("captionBackground");
        const captionColor = this.getLayoutProperty("captionColor");
        if (
            (background !== captionBg.color)
            || (color !== captionColor.color)
        ) {
            // update the dataset to a new reference with the updated props
            // this will trigger an `update-request` on the titlebar
            this.title.dataset = {
                ...this.title.dataset,
                background: captionBg ? captionBg.color : null,
                color: captionColor  ? captionColor.color : null,
            };
        }
        if (this.parentRegion && this.parentRegion.hasClass("m-hide-child-titlebars")) {
            // something else is controlling the display of the titlebar
            this.titlebar.hide();
        } else if (this.owner.forceTitlebars) {
            // the user wants to temporarily see all titlebars
            this.titlebar.show();
        } else {
            this.titlebar.setHidden(!this.getLayoutProperty("showTitle"));
        }
    }

    /** Mark this region as having changes that need to be synced with something
     *
     * #### Notes
     *
     * Examples of this include layout properties, which need to be saved to a
     * model, and added/removed children, which need the dashboard to issue
     * update requests.
     */
    public setStale() {
        if (this.isStale) return;
        this._isStale = true;
        this._OnStaleSrc.next();
    }

    /** Acknowledge changes in this part
     *
     * #### Notes
     *
     * This function is called by the framework, and should not be called by
     * user code.
    */
    public setFresh() {
        this._isStale = false;
    }

    /** Return the value of a layout region property.
     *
     * This should fall back to default values if the property is undefined, and
     * respect per-property logic (such as flexSize/fixedSize precedence)
     * @param propertyName The name of the layout property to retrieve
     */
    public getLayoutProperty<K extends keyof LayoutProps>(
        propertyName: K
    ): LayoutProps[K] {
        const prop = this._properties[propertyName];
        if (prop != null) {
            return prop!;
        }
        const defaultVal = this.getDefault("" + propertyName);
        if (defaultVal != null) {
            return defaultVal as any; // see above comment about null typing in generics
        }
        // try to get an attached property
        if (this.parentRegion) {
            return this.parentRegion.getAttachedPropertyForChild("" + propertyName, this);
        }
        throw Error("Property " + propertyName + " not found");
    }

    /** Set a layout property and update this region as appropriate. */
    public setLayoutProperty<K extends keyof LayoutProps>(
        propertyName: K, value: LayoutProps[K]
    ) {
        // handling for mutual exclusivity of flexSize/fixedSize
        this._properties[propertyName] = value;
        this.setStale();
    }

    /** Focus this region. */
    public focus() {
        this.content.node.focus();
    }

    /**
     * Update the region's actual size in the DOM.
     *
     * This is called whenever the region recieves an `update-request`
     */
    public updateFromProperties() {
        const bounds = this.calculatedSize || {width: 0, height: 0};
        const style = this.node.style;
        style.width = `${Math.floor(bounds.width)}px`;
        style.height = `${Math.floor(bounds.height)}px`;
        style.borderWidth = `${this.getLayoutProperty("borderWidth.px")}px`;
        style.borderStyle = "solid";
        style.borderColor = this.getLayoutProperty("borderColor").color;
        style.backgroundColor = this.getLayoutProperty("backgroundColor").color;
        style.padding = `${this.getLayoutProperty("padding.px")}px`;
        style.left = `${bounds.left || 0}px`;
        style.top = `${bounds.top || 0}px`;
        this._didUpdate = true;
    }

    public startDrag(clientX: number, clientY: number) {
        if (this.parentRegion == null) {
            // This region is either the root, or unattached. It cannot be
            // docked.
            return;
        }
        //Disable dragging maximized regions
        if (this.getLayoutProperty("maximized"))
            return;

        const parent = this.parentRegion || this.owner.root;
        const dragImage = parent.createDragShadow(this, clientX, clientY);
        const mimeData = new MimeData();
        mimeData.setData("text/vnd.maven.target", this.id);
        mimeData.setData("text/vnd.maven.startPosition", [clientX, clientY]);
        const drag = new Drag({
            mimeData,
            dragImage,
            proposedAction: "move",
            source: this,
        });
        this.setLayoutProperty("showRegion", false);
        this.owner.root.showRootOverlay();
        FrameTools.DisableFramePointerEvents();
        drag.start(clientX, clientY)
        .then((res) => {
            this.setLayoutProperty("showRegion", true);
            this.owner.root.hideRootOverlay();
            this.owner.dockPreview.stopPreview();
            FrameTools.EnableFramePointerEvents();
        });
    }

    public handleEvent(ev: IDragEvent) {
        switch (ev.type) {
            case "p-dragenter":
                this.onDragEnter(ev);
                break;
            case "p-dragover":
                this.onDragOver(ev);
                break;
            case "p-dragleave":
                this.onDragLeave(ev);
                break;
            case "p-drop":
                this.onDrop(ev);
                break;
        }
    }

    /** Attach a new element to this region's chrome.
     *
     * Region chroming is a way of attaching transient or parent-specific
     * elements to the DOM, without interfering with the base class or the
     * implementation of the region children.
     *
     * To remove the chrome, simply `#dispose()` it.
     *
     * Region chroming is automatically cleared whenever the parentRegion
     * changes.
     */
    public attachChrome(chromeElement: Widget) {
        const chroming = Private.Chroming.get(this);
        chroming.add(chromeElement);
        this.layout.addWidget(chromeElement);
    }

    public showOverlay() {
        // the brackets syntax is a TSC escape hatch, which we use because
        // DisposableSet doesn't expose any way of inspecting the contents
        // beyond what a WeakSet would provide (internally it uses a normal Set)
        if (!this.overlay.isDisposed && (this.overlay["_items"].size > 0) ) {
            return;
        }
        for (const dropzone of [
            "center",
            "inner-left",
            "inner-right",
            "inner-top",
            "inner-bottom",
            "outer-left",
            "outer-right",
            "outer-top",
            "outer-bottom"
        ]) {
            this.createDropzoneTarget(dropzone);
        }
    }

    public showRootOverlay() {
        for (const dropzone of [
            "far-outer-left",
            "far-outer-right",
            "far-outer-top",
            "far-outer-bottom"
        ]) {
            this.createDropzoneTarget(dropzone);
        }
    }

    public hideRootOverlay() {
        this.rootOverlay.dispose();
        this.rootOverlay = new DisposableSet();
    }

    public hideOverlay() {
        this.overlay.dispose();
        this.overlay = new DisposableSet();
        this.content.removeClass("temp-disable-pointer");
    }

    //#region Layout message handlers
    public processMessage(msg: Message) {
        switch (msg.type) {
            case "before-focus":
                this._isFocused = true;
                this.titlebar.addClass("m-mod-active");
                this.onBeforeFocus(msg);
                break;
            case "after-focus":
                this.onAfterFocus(msg);
                break;
            case "before-blur":
                this.onBeforeBlur(msg);
                break;
            case "after-blur":
                this._isFocused = false;
                this.titlebar.removeClass("m-mod-active");
                this.onAfterBlur(msg);
                break;
            default:
                super.processMessage(msg);
        }
    }

    /** A handler that is called before this region is about to recieve focus.
     *
     * #### Notes
     *
     * The default implementation is a no-op.
     */
    protected onBeforeFocus(msg: Message): void { }

    /** A handler that is called after this region has recieved focus.
     *
     * #### Notes
     *
     * The default implementation is a no-op.
     */
    protected onAfterFocus(msg: Message): void { }

    /** A handler that is called before this region is about to lose focus.
     *
     * #### Notes
     *
     * The default implementation is a no-op.
     */
    protected onBeforeBlur(msg: Message): void { }

    /** A handler that is called after this region has lost focus.
     *
     * #### Notes
     *
     * The default implementation is a no-op.
    */
    protected onAfterBlur(msg: Message): void { }
    //#endregion

    //#region Drag n' Drop event handlers
    protected onDragEnter(ev: IDragEvent) {
        if (!ev.mimeData.hasData("text/vnd.maven.target")) {
            // not an event we can do anything with
            return;
        }
        ev.preventDefault();
        ev.stopPropagation();
        this.content.addClass("temp-disable-pointer");
    }

    protected onDragOver(ev: IDragEvent) {
        if (!ev.mimeData.hasData("text/vnd.maven.target")) {
            // not an event we can do anything with
            return;
        }
        this.showOverlay();
        ev.preventDefault();
        ev.stopPropagation();
    }

    protected onDragLeave(ev: IDragEvent) {
        if (!ev.mimeData.hasData("text/vnd.maven.target")) {
            // not an event we can do anything with
            return;
        }
        // check to see if it descended into a child of this node
        // if not, we need to hide the overlay
        if (ev.relatedTarget != null) {
            const node = ev.relatedTarget as HTMLElement;
            if (node.matches(`div[data-owner="${this.id}"].dropzone`)) {
                ev.stopPropagation();
                return; // this is one of the children
            }
        }
        this.hideOverlay();
    }

    protected onDrop(ev: IDragEvent) {
        if (!ev.mimeData.hasData("text/vnd.maven.target")) {
            // not an event we can do anything with
            return;
        }
        // do nothing
        ev.preventDefault();
        ev.stopPropagation();
    }
    //#endregion

    //#region Phosphor message handlers
    protected onAfterAttach() {
        this.node.addEventListener("p-dragenter", this);
        this.node.addEventListener("p-dragover", this);
        this.node.addEventListener("p-dragleave", this);
        this.node.addEventListener("p-drop", this);
    }

    protected onBeforeDetach() {
        this.node.removeEventListener("p-dragenter", this);
        this.node.removeEventListener("p-dragover", this);
        this.node.removeEventListener("p-dragleave", this);
        this.node.removeEventListener("p-drop", this);
    }

    /** Close this layout region and dispose of it.
     *
     * #### Notes
     *
     * Phosphor defaults to merely unparenting a region when it's closed-
     * Dashboard layouts don't really need this.
     */
    protected onCloseRequest() {
        this.owner.removeRegion(this.uuid);
    }

    protected onActivateRequest() {
        this.focus();
    }
    //#endregion

    /** Get the default value for a layout property.
     *
     * @internal Do not override this function.
     */
    protected getDefault(
        propertyName: string
    ): unknown {
        return this.metadata.getMetadata(propertyName as any)!.default;
    }

    private createDropzoneTarget(dropzone: string) {
        // TODO: Move this into a separate class
        const node = document.createElement("div");
        const isRoot = dropzone.startsWith("far");
        node.classList.add("dropzone");
        node.dataset["zone"] = dropzone;
        node.dataset["owner"] = this.id;
        node.addEventListener("p-dragenter", (ev: any) => {
            ev.preventDefault();
            ev.stopPropagation();
        });
        node.addEventListener("p-dragover", (ev: any) => {
            ev.preventDefault();
            ev.stopPropagation();
            ev.dropAction = "move";
            if (isRoot) {
                this.owner.dockPreview.startPreviewFor(dropzone as any);
            } else {
                this.owner.dockPreview.startPreviewFor(dropzone as any, this.id);
            }
        });
        node.addEventListener("p-dragleave", (ev: any) => {
            ev.preventDefault();
            ev.stopPropagation();
            if (ev.relatedTarget && ev.relatedTarget.matches(`div[data-owner="${this.id}"].dropzone`)) {
                return;
            }

            this.owner.dockPreview.stopPreview();

            if (dropzone.startsWith("far")) {
                return; // the root zones should never hide
            }

            this.hideOverlay();
        });
        node.addEventListener("p-drop", (ev: any) => {
            this.hideOverlay();
            ev.preventDefault();
            ev.stopPropagation();
            ev.dropAction = "move";
            const target = ev.mimeData.getData("text/vnd.maven.target") as string;
            if (dropzone.startsWith("far")) {
                this.owner.moveToRootZone(dropzone as any, target);
                return;
            }
            const reference = this.id;
            this.owner.moveToRelativeZone(dropzone as any, target, reference);
        });
        const preview = document.createElement("div");
        preview.classList.add("dropzone__preview");
        node.appendChild(preview);
        const widget = new Widget({ node });
        this.attachChrome(widget);
        (isRoot ? this.rootOverlay : this.overlay).add(widget);
    }
}

export namespace DashboardLayoutRegion {
    export namespace LayoutMsg {
        /**
         * A message sent when the framework is about to focus a layout region.
         *
         * #### Notes
         *
         * `before-focus` events are sent immediately before the region is
         * set to be focused by the framework, and may not line up 1:1 with
         * related concepts like DOM focus or Phosphor's `activate-request`.'
         *
         * Often this event is triggered by a `focus` DOM event on the region's
         * subtree. Therefore, regions should not try to `#focus()` nodes as it
         * might clobber the user's intended state.
         */
        export const BeforeFocus = new Message("before-focus");

        /**
         * A message sent after the framework has marked a region as focused.
         *
         * #### Notes
         *
         * A region may be considered "focused" even when it has lost DOM focus-
         * this is because the focus may have travelled to an opaque region of
         * the page (such as an `<iframe>` element). Additionally, it is
         * sometimes helpful to be able to switch between multiple tabs (such
         * as a documentation page and a JupyterLab tab) and still being able
         * to fire the focus-dependent layout actions, like `Ctrl-E, P`.
         */
        export const AfterFocus = new Message("after-focus");

        /**
         * A message sent before a region is about to lose focus.
         *
         * #### Notes
         *
         * This occurs when the framework has determined that another region
         * should be focused instead, such as by user action.
         */
        export const BeforeBlur = new Message("before-blur");

        /**
         * A message sent after a region has lost focus
         */
        export const AfterBlur = new Message("after-blur");
    }

    export class DashboardPanelLayout extends PanelLayout {
        // overrides Layout#parent
        public parent!: DashboardLayoutRegion | null;

        protected onFitRequest(msg: Message) {
            const size = this.parent!.calculatedSize || {width: 0, height: 0};
            this.parent!.sizeContentToFit(size);
        }

        protected onResize(msg: Widget.ResizeMessage) {
            let newSize: {width: number, height: number};
            let oldSize = this.parent!.calculatedSize || {};
            if (msg === Widget.ResizeMessage.UnknownSize) {
                newSize = this.parent!.calculatedSize || {...oldSize, width: 0, height: 0};
            } else {
                newSize = {
                    ...oldSize,
                    width: msg.width,
                    height: msg.height
                };
            }
            if (!this.parent!.calculatedSize
                || newSize.width !== this.parent!.calculatedSize.width
                || newSize.height !== this.parent!.calculatedSize.height
            ) {
                // the size has changed, update the widget to reflect that
                this.parent!.sizeContentToFit(newSize);
            }
            this._update();
        }

        protected onUpdateRequest(msg: Message) {
            this._update();
        }

        private _update() {
            this.parent!.updateFromProperties();

            const hasParentRegion = this.parent!.parentRegion != null;

            if (hasParentRegion) {
                this.parent!.parentRegion!._markSubtreeForUpdate();
            }

            // send resize messages to the children
            for ( const widget of this.widgets ) {
                MessageLoop.sendMessage(widget, Widget.ResizeMessage.UnknownSize);
            }

            // Update any subtrees that were skipped by the resize message
            if (hasParentRegion) {
                this.parent!.parentRegion!._updateSkippedSubtrees();
            }

        }
    }

    /**
     * Struct for describing a region's metadata.
     *
     * Type parameters:
     * T - The type of _this_ region's layout properties
     */
    export class Metadata<T extends IDashboardLayoutProperties> {
        protected static defaultData = {
            type: Types.Any,
            documentation: "",
            default: null
        };

        public iconClass: string;
        public iconText: string;
        public description = "";
        public remarks = "";
        public name = "";

        private metadataMap = new Map<keyof T, IPropertyMetadata<T[keyof T]>>();

        constructor(
            {iconClass, iconText}: IOptions
        ) {
            this.iconClass = iconClass;
            this.iconText = iconText;
        }

        public addMetadata<K extends keyof T>(
            propertyName: K,
            metadata: Partial<IPropertyMetadata<T[K]>>
        ) {
            const withDefaults = Object.assign(
                { prettyName: propertyName },
                Metadata.defaultData,
                metadata,
            );
            this.metadataMap.set(propertyName, withDefaults);
        }

        public getMetadata<K extends keyof T>(
            propertyName: K
        ) {
            return this.metadataMap.get(propertyName);
        }

        public getAllProperties() {
            return this.metadataMap.entries();
        }
    }

    // A note on the IPseudoSchema: The cleanest way to add enums without another
    // type is to bolt them onto Strings. Extending that idea, we could validate
    // said enum with a generic schema validator (instead of something specific
    // to String types, or an untyped blob of metadata). For now, YAGNI applies
    // since there's no other UI support for it. But by having this structured
    // as a schema, we can open the door to later things like PerspectiveConfig
    // and TableFormatting "types".
    interface IPseudoSchema {
        type: "string";
        // as implied above, schemas aren't real right now. The dropdown "type"
        // editor pulls it's keys from this hard-coded property.
        enum: string[];
    }

    export interface IPropertyMetadata<_Default = any> {
        prettyName: string;
        type: Type;
        documentation: string;
        default: _Default;
        /** Optionally define a schema to validate this property against */
        schema?: IPseudoSchema;
    }

    interface IOptions {
        iconClass: string;
        iconText: string;
    }
}

namespace Private {
    /**
     * Attached property for region chroming.
     *
     * The RegionChroming is for _transient_ or _parent-dependent_ UX elements,
     * such as the Canvas resizer or the Docking Overlay. These elements are
     * cleared whenever the parentRegion changes.
     */
    export const Chroming = new AttachedProperty<DashboardLayoutRegion<any>, DisposableSet>({
        create: () => new DisposableSet(),
        changed: (_owner, oldValue, newValue) => {
            oldValue.dispose();
        },
        name: "RegionChroming"
    });
}
