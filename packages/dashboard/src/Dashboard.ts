import { Widget, BoxLayout } from "@phosphor/widgets";
import { PartManager } from "./PartManager";
import { IRenderMimeRegistry } from "@jupyterlab/rendermime";
import { Subject, Observable, merge, from, SubscriptionLike } from "rxjs";
// TODO: Remove apputils dependency
import { IClientSession } from "@jupyterlab/apputils";
import { DashboardSerializer } from "./DashboardSerializer";
import { UUID, JSONObject, JSONValue } from "@phosphor/coreutils";
import { delayWhen, mapTo, bufferTime, filter } from "rxjs/operators";
import { AsyncTools, Types, Converters, IDirtyable, deserialize, IterTools } from "@mavenomics/coreutils";
import { LayoutManager, LayoutSerializer, LayoutTypes } from "@mavenomics/layout";
import {
    PartFactory,
    PartSerializer,
    JavascriptEvalPart,
    ErrorPart,
    PartServices,
    IDashboardLink
} from "@mavenomics/parts";
import generateWrapper = JavascriptEvalPart.generateWrapper;
import { GlobalsService, BindingsProvider, IExpressionEvaluator } from "@mavenomics/bindings";
import { nbformat, PageConfig } from "@jupyterlab/coreutils";
import { IDisposable } from "@phosphor/disposable";
import { HoverManager } from "@mavenomics/ui";

export class Dashboard extends Widget implements IDirtyable {
    public readonly layoutManager: LayoutManager;
    public OnDirty: Observable<void>;
    public readonly partManager: PartManager;
    public readonly factory: PartFactory;
    public readonly globals: GlobalsService;
    public readonly bindings: BindingsProvider;
    private readonly OnDirtySrc$ = new Subject<void>();
    private readonly isLoading = new AsyncTools.Mutex();
    private readonly externalPartRenderer?: Dashboard.IExternalPartRenderer;

    private _isDirty = false;
    private _shouldNotifyDirty = false;
    private _uuid = UUID.uuid4();
    private _localParts: { [id: string]: JavascriptEvalPart.IUDPModel } = {};
    private _partUpdateHook: SubscriptionLike;

    constructor({
        rendermime,
        factory,
        session,
        evaluator,
        baseUrl,
        baseViewUrl,
        externalPartRenderer,
        dashboardLinker
    }: Dashboard.IOptions) {
        super();
        this.addClass("m-Dashboard");
        this.id = "dashboard-" + this._uuid;
        this.OnDirty = this.OnDirtySrc$.pipe(
            delayWhen(() => from(this.isLoading.lock))
        );
        this._partUpdateHook = factory.OnUpdated.pipe(
            // 500ms btw updates to reduce jank with many kernel parts
            bufferTime(500),
            filter(i => i.length > 0)
        ).subscribe(parts => {
            if (!this.partManager.hasErrorParts) return;

            let shouldReset = false;
            for (const [_, part] of this.partManager) {
                if (!(part instanceof ErrorPart)) continue;
                if (part.originalModel && parts.includes(part.originalModel.name)) {
                    shouldReset = true;
                    break;
                }
            }

            if (shouldReset) {
                // flash the dashboard to load the new part
                const model = DashboardSerializer.toJson(this);
                this.loadFromModel(model);
            }
        });
        if (externalPartRenderer == null && rendermime != null) {
            this.externalPartRenderer = new Dashboard.DefaultExternalPartRenderer(rendermime);
        } else {
            this.externalPartRenderer = externalPartRenderer;
        }
        //Wrap the factory so that we don't pollute the global factory with local parts.
        this.factory = new PartFactory(factory);
        this.globals = new GlobalsService();
        this.bindings = new BindingsProvider(this.globals, evaluator);
        const dashboardLinkerInst = (
            dashboardLinker != null
            ? dashboardLinker
            : new Dashboard.DefaultDashboardLinker({
                baseUrl,
                baseViewUrl,
                evaluator,
                externalPartRenderer,
                factory,
                rendermime,
                session
            }, this)
        );
        this.partManager = new PartManager({
            session,
            rendermime,
            factory: this.factory,
            globals: this.globals,
            dashboardId: this.uuid,
            bindings: this.bindings,
            baseUrl,
            baseViewUrl,
            dashboardLinker: dashboardLinkerInst
        });
        this.layoutManager = new LayoutManager({
            getPartById: (id: string) => {
                let part = this.partManager.getPartById(id);
                if (part != null) return part;
                if (!this.externalPartRenderer) return null;
                return this.externalPartRenderer.getPartById(id);
            }
        }, {
            keys: () => this.factory.keys(),
            has: (type) => this.factory.has(type),
            get: (type) => this.partManager.addPart(type)
        });
        // this will be unhooked when the part manager is disposed
        merge(
            this.partManager.OnDirty.pipe(mapTo("PartManager" as const)),
            this.layoutManager.OnDirty.pipe(mapTo("LayoutManager" as const)),
            this.globals.OnDirty.pipe(mapTo("Globals" as const))
        ).subscribe((reason) => this.setDirty(reason));
        const layout = this.layout = new BoxLayout();
        layout.addWidget(this.layoutManager);
        this.update();
    }

    public get localParts() { return this._localParts; }

    /** An ID that uniquely refers to this dashboard within a client.
     *
     * #### Notes
     *
     * This is only initialized once over a particular instance, and is not
     * modified after repeated calls to `loadFromModel`.
    */
    public get uuid() { return this._uuid; }

    public get isDirty() { return this._isDirty; }

    /** Whether the user should be notified about changes to this dashboard.
     *
     * @remarks
     *
     * This is a special case of dirtyness, where changes to globals are
     * explicitly ignored. The intent is to allow users to change global state
     * without getting a prompt-on-close, in environments where that makes
     * sense.
     *
     * The thinking is that global changes are usually insignificant, if the
     * dashboard isn't otherwise dirty. This is because globals are usually used
     * to glue interaction elements together (like sliders). Constant prompting
     * cheapens the 'unsaved dashboard' notifications, since the user would
     * encounter them more regularly. With enough time, they might become blind
     * to even a significant inadvertent change (like deleting a whole
     * subsection, or overriding carefully chosen defaults).
     *
     * Obviously, this is bad.
     */
    public get shouldNotifyDirty() { return this._shouldNotifyDirty; }

    public get externalParts() { return this.externalPartRenderer; }

    public setClean() {
        this._isDirty = false;
        this._shouldNotifyDirty = false;
        this.globals.setClean();
        this.partManager.setClean();
        this.layoutManager.setClean();
    }

    public async loadFromModel(data: DashboardSerializer.ISerializedDashboard) {
        return this.loadFromModelWithOverrides(data, null);
    }

    public async loadFromModelWithOverrides(
        data: DashboardSerializer.ISerializedDashboard,
        overrides: { [name: string]: any } | null) {
        await this.isLoading.aquire();
        try {
            this.clearDashboard();
            //Register the local parts before constructing them.
            for (const id in data.localParts) {
                const part = data.localParts[id];
                this._localParts[id] = part;
                // no relevant path for local parts
                this.factory.registerPart(part.name, generateWrapper(part, "/" + part.name));
            }

            const { parts, metadata, layout, globals } = data;
            this.loadGlobals(globals);
            this.applyGlobalOverrides(overrides);
            await this.loadParts(parts, metadata);
            this.layoutManager.initLayout(layout);
            this.setClean();
        } catch (err) {
            this.clearDashboard();
            console.error("[Dashboard] Failed to load from model");
            console.error(err);
            HoverManager.Instance!.openErrorDialog(err);
        }
        finally {
            this.isLoading.release();
        }
    }

    dispose() {
        if (this.isDisposed) {
            return;
        }
        this.layoutManager.dispose();
        this.partManager.dispose();
        if (this.externalPartRenderer != null) {
            this.externalPartRenderer.dispose();
        }
        this.globals.dispose();
        this.bindings.dispose();
        this.OnDirtySrc$.complete();
        this._partUpdateHook.unsubscribe();
        super.dispose();
    }

    private setDirty(reason: "PartManager" | "LayoutManager" | "Globals") {
        if (this._shouldNotifyDirty) return;
        if (reason !== "Globals") {
            this._shouldNotifyDirty = true;
        }
        if (this._isDirty) return;
        this._isDirty = true;
        this.OnDirtySrc$.next();
    }

    private clearDashboard() {
        this.globals.clearGlobals();

        this.partManager.clearParts();

        //Unregister the previously registered parts
        for (const id in this.localParts) {
            const part = this.localParts[id];
            this.factory.unregisterPart(part.name);
        }
        this._localParts = {};
        this.layoutManager.initLayout(DashboardSerializer.DEFAULT_DASHBOARD["layout"]);
    }

    /**
     * Used to apply global overrides prior to initializing parts.
     * That way part options aren't initially evaluated with "stale" globals.
     * @param overrides Key/Value object containing globals to override. Values are the deserialized value.
     */
    private applyGlobalOverrides(overrides: { [name: string]: any; } | null) {
        if (overrides == null)
            return;

        for (let [key, val] of Object.entries(overrides)) {
            this.globals.set(key, val);
        }
        this.globals.setClean();
    }

    private loadGlobals(globalsModel: DashboardSerializer.ISerializedDashboard["globals"]) {
        if (globalsModel == null) {
            return;
        }
        for (const global of globalsModel) {
            const type = Types.findType(global.type) || Types.Any;
            let value: { typeName: string, value: any };
            if (global.value && (global.value as any).typeName) {
                value = global.value as any;
            } else {
                value = {
                    typeName: global.type,
                    value: global.value
                };
            }
            this.globals.addGlobal(
                global.name,
                type,
                Converters.deserialize(value)
            );
        }
        this.globals.setClean();
    }

    private async loadParts(
        partsModel: DashboardSerializer.ISerializedDashboard["parts"],
        metadata: DashboardSerializer.ISerializedDashboard["metadata"]
    ) {
        const promises: Array<Promise<void>> = [];
        for (const partId in partsModel) {
            const partData = partsModel[partId];
            const partModel = partData[PartSerializer.MIMETYPE];
            if (partModel != null) {
                // this is a part
                await this.partManager.addPart(partModel.name, {
                    name: partModel.name,
                    options: partModel.options,
                    id: partId
                });
            } else if (this.externalPartRenderer != null) {
                promises.push(this.externalPartRenderer.renderModel(
                    partData,
                    (metadata || {})[partId],
                    partId
                ));
            }
        }
        await Promise.all(promises);
    }
}

export namespace Dashboard {
    export interface IOptions {
        factory: PartFactory;
        session?: IClientSession;
        rendermime?: IRenderMimeRegistry;
        externalPartRenderer?: IExternalPartRenderer;
        evaluator?: IExpressionEvaluator;
        dashboardLinker?: PartServices.IDashboardLinker;
        baseUrl: string;
        baseViewUrl: string;
    }

    /**
     * Generic interface for an external part renderer.
     *
     * @export
     * @interface IExternalPartRenderer
     *
     * @remarks
     *
     * Sometimes, it's inconvenient to force the use of parts wholesale. (For
     * instance, it's nice to be able to stick `Markdown()` directly into a
     * dashboard, instead of writing an inline PythonPart.). To support this
     * use case without complicating the Dashboard API, consumers can supply
     * some 'renderer' for these external parts that will handle rendering,
     * construction (deserialization), and serialization.
     *
     * Note that external parts _cannot_ utilize the rest of the Dashboard
     * framework- Globals, bindings, etc. are completely off-limits. The idea
     * is that external parts should be reasonably static and straight-forward.
     */
    export interface IExternalPartRenderer extends IDisposable {
        /**
         * Get a single part from the renderer.
         *
         * @param id The unique ID provided to this renderer in `#renderModel`
         * @returns The widget to display, or null
         */
        getPartById(id: string): Widget | null;

        /**
         * Get the IDs of all parts this renderer is managing
         */
        getAllPartIds(): IterableIterator<string>;

        /**
         * Render a serialized model into a Phosphor widget.
         *
         * @param model The JSON model encountered in deserialization
         * @param metadata Metadata that was included with this part definition
         * @param id The ID that the framework is assigning to this widget
         * @returns A valid widget
         *
         * @remarks
         *
         * The model is provided by the serialized Dashboard JSON, and is
         * not strictly typed.
         *
         * If your external part doesn't use Phosphor, you still need to wrap
         * the part in a Phosphor widget.
         */
        renderModel(
            model: JSONObject,
            metadata: JSONValue | undefined,
            id: string
        ): Promise<void>;

        /** Return info on the available parts, for use in a palette. */
        getMetadata(): { name: string, model: JSONObject }[];

        /**
         * Serialize the part using a previously-given ID
         *
         * @param id The id of the part assigned by the framework
         * @returns A [data, metadata] JSON tuple
         */
        serializePart(id: string): [JSONObject, JSONValue];
    }

    /** A default IExternalPartRenderer that uses the Rendermime Registry.
     *
     * The RenderMime registry is optional- if not provided, there will be no
     * default renderer.
     */
    export class DefaultExternalPartRenderer implements IExternalPartRenderer {
        protected externalParts = new Map<string, Widget>();
        protected externalData = new Map<
            string,
            [nbformat.IMimeBundle, nbformat.OutputMetadata | null]
        >();
        protected rendermime: IRenderMimeRegistry;
        private _isDisposed = false;

        constructor(rendermime: IRenderMimeRegistry) {
            this.rendermime = rendermime;
        }

        public get isDisposed() { return this._isDisposed; }

        public dispose() {
            if (this._isDisposed) return;

            this.externalData.clear();
            this.externalParts.forEach(i => i.dispose());
            this.externalParts.clear();
            this._isDisposed = true;
        }

        public getPartById(id: string) {
            return this.externalParts.get(id) || null;
        }

        public getAllPartIds() {
            return this.externalParts.keys();
        }

        public getMetadata() {
            return [] as { name: string, model: JSONObject }[];
        }

        public async renderModel(
            data: nbformat.IMimeBundle,
            metadata: nbformat.OutputMetadata | undefined,
            id: string
        ) {
            this.externalData.set(id, [data, metadata || null]);
            const mimetype = this.rendermime.preferredMimeType(data, "any");
            const renderer = this.rendermime.createRenderer(mimetype || "text/plain");
            const mime = this.rendermime.createModel({
                data,
                metadata,
                trusted: true,
            });
            this.externalParts.set(id, renderer);
            await renderer.renderModel(mime);
            return;
        }

        public serializePart(id: string) {
            return this.externalData.get(id)!;
        }
    }

    export class DefaultDashboardLinker implements PartServices.IDashboardLinker {
        // Inserting stub types since this introduces a circular type
        // dependency. This circular dep _only_ exists in typings, and is
        // removed on compile, but it breaks TS project references
        public urlManager?: { resolveSrcUrl: (url: string) => string };
        public configManager?: {
            getDashboard: (path: string) => Promise<DashboardSerializer.ISerializedDashboard>
        };

        constructor(
            public dashboardOpts: Dashboard.IOptions,
            public dashboard?: Dashboard
        ) { }

        public async makeDashboardLink(cell: unknown) {
            if (!IDashboardLink.isDashboardLink(cell)) throw Error("Not a DashboardLink cell!");

            const { name, path, src, width, height, overrides } = cell;

            let model: DashboardSerializer.ISerializedDashboard | null = null;

            switch (src) {
                case IDashboardLink.DashboardSrc.Config:
                    if (this.configManager == null) {
                        throw Error("Cannot create Dashboard Link: No ConfigManager provided to resolve config link");
                    }
                    model = await this.configManager.getDashboard(path);
                    break;
                case IDashboardLink.DashboardSrc.Url:
                    let url = new URL(path, PageConfig.getBaseUrl()).href;
                    if (this.urlManager != null) {
                        // If the url manager is supplied, use that instead to
                        // allow better urls (if applicable).
                        url = this.urlManager.resolveSrcUrl(path);
                    }
                    const data = await fetch(url);
                    if (!data.ok) throw Error(`Fetch Error: ${data.status} ${data.statusText}`);
                    model = await data.json();
                    break;
                case IDashboardLink.DashboardSrc.Embed:
                    if (this.dashboard == null) {
                        throw Error("Cannot create Dashboard Link: No reference to Dashboard template");
                    }
                    const regionName = path;
                    for (const region of this.dashboard.layoutManager.root.subtree()) {
                        if (region.getLayoutProperty("caption") !== regionName) {
                            continue;
                        }
                        model = DashboardSerializer.toJsonFromPartial(this.dashboard, region.id);
                        break;
                    }
                    break;
                default:
                    throw Error("Unsupported source: " + src);
            }

            if (model == null) {
                throw Error("Failed to load model");
            }

            const globalOverrides: Record<string, any> = {};

            for (const [key, value] of Object.entries(overrides)) {
                globalOverrides[key] = deserialize(value);
            }

            const hover: Dashboard = new Dashboard({
                ...this.makeDashboardArguments(this.dashboardOpts),
                dashboardLinker: this
            });

            hover.title.label = name;
            // leave this to finish asynchronously
            hover.loadFromModelWithOverrides(
                model,
                overrides
            );

            return { width, height, hover };
        }

        /** Given the args to the parent dashboard, create a set of arguments for the link.
         *
         * Subclasses can override this to customize the arguments that get
         * passed to linked dashboards.
         *
         * The default implementation simply returns it's argument.
         */
        protected makeDashboardArguments(args: Dashboard.IOptions): Dashboard.IOptions {
            return args;
        }

    }
}
