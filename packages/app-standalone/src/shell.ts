import { Widget, BoxLayout } from "@phosphor/widgets";
import { RenderMimeRegistry, standardRendererFactories } from "@jupyterlab/rendermime";
import { Dashboard } from "@mavenomics/dashboard";
import { PartFactory } from "@mavenomics/parts";
import { URLExt } from "@jupyterlab/coreutils";
import { IDirtyable } from "@mavenomics/coreutils";
import { Subject } from "rxjs";

// strip the filename and trailing slash
const baseUrl = URLExt.join(window.location.origin, window.location.pathname).replace(/\/([^\/]*)$/, "");

export class MavenWorksShell extends Widget implements IDirtyable {
    public layout: BoxLayout;
    public factory: PartFactory = new PartFactory();
    public dashboardLinker: Dashboard.DefaultDashboardLinker;
    public dashboard: Dashboard;
    public rendermime = new RenderMimeRegistry({
        initialFactories: standardRendererFactories,
    });
    public activeDashboard = "";
    private shouldPrompt = false;
    private OnDirtySrc$ = new Subject<void>();
    private _OnDirty = this.OnDirtySrc$.asObservable();
    private _isDirty = false;

    constructor() {
        super();
        this.dashboardLinker = new Dashboard.DefaultDashboardLinker({
            factory: this.factory,
            baseUrl,
            baseViewUrl: baseUrl,
        });
        this.dashboard = new Dashboard({
            factory: this.factory,
            dashboardLinker: this.dashboardLinker,
            baseUrl: baseUrl,
            baseViewUrl: baseUrl,
        });
        this.dashboardLinker.dashboard = this.dashboard;
        this.addClass("main-app");
        this.addClass("m-DashboardEditor"); // hack
        this.layout = new BoxLayout;
        this.layout.addWidget(this.dashboard);
        // this.layout.addWidget(view);
    }

    /** Whether the dashboard has changed enough to require a user prompt.
     * @see Dashboard#shouldNotifyDirty
     */
    public get shouldPromptDirty() { return this.shouldPrompt; }

    public get isDirty() { return this._isDirty; }

    public get OnDirty() { return this._OnDirty; }

    public dispose() {
        if (this.isDisposed) return;
        this.dashboard.dispose();
        window.removeEventListener("beforeunload", this);
        super.dispose();
    }

    public handleEvent(ev: Event) {
        if (ev instanceof BeforeUnloadEvent && this.shouldPrompt) {
            const msg = "Are you sure? This dashboard has unsaved changes";
            (ev as any).returnValue = msg;
            ev.preventDefault();
            ev.stopImmediatePropagation();
            return msg;
        }
    }

    public setClean() {
        this._isDirty = false;
        this.shouldPrompt = false;
    }

    protected async onAfterAttach() {
        this.dashboard.setClean();
        this.dashboard.OnDirty.subscribe(() => {
            this.setDirty();
            this.dashboard.setClean();
            this.dashboard.update();
        });
    }

    private setDirty() {
        if (this.dashboard.shouldNotifyDirty) {
            this.shouldPrompt = true;
            window.addEventListener("beforeunload", this);
        }
        this._isDirty = true;
        this.OnDirtySrc$.next();
    }
}
