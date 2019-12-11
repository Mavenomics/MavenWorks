import { IDisposable } from "@phosphor/disposable";
import { HoverManager } from "@mavenomics/ui";
import { IClientSession } from "@jupyterlab/apputils";
import { IRenderMimeRegistry } from "@jupyterlab/rendermime";
import { Widget } from "@phosphor/widgets";

export class PartServices implements IDisposable {
    public isDisposed = false;
    private readonly _hover: HoverManager;
    private readonly _session?: IClientSession;
    private readonly _rendermime?: IRenderMimeRegistry;
    private readonly _dashboardLinker?: PartServices.IDashboardLinker;
    private readonly _dashboardId: string;
    private readonly _baseUrl: string;
    private readonly _baseViewUrl: string;

    constructor({
        session,
        rendermime,
        dashboardId,
        baseUrl,
        baseViewUrl,
        dashboardLinker,
    }: PartServices.IOptions) {
        this._hover = HoverManager.GetManager();
        this._session = session;
        this._rendermime = rendermime;
        this._dashboardId = dashboardId;
        this._dashboardLinker = dashboardLinker;
        this._baseUrl = baseUrl;
        this._baseViewUrl = baseViewUrl;
    }

    /** An interface for managing floating windows, popups, and tooltips */
    public get hover() { return this._hover; }
    /** An interface for communicating with the Jupyter kernel */
    public get session() { return this._session || null; }
    /** A registry of data renderers for Jupyter MIME bundles */
    public get rendermime() { return this._rendermime || null; }
    /** The unique ID assigned to the parent Dashboard */
    public get dashboardId() { return this._dashboardId; }
    /** A base URL which parts can request additional assets from */
    public get baseUrl() { return this._baseUrl; }
    /** The base URL for referencing dashboards via relative path.
     * baseUrl + '/view' in MavenWorks, baseUrl in standalone app */
    public get baseViewUrl() { return this._baseViewUrl; }
    /** A helper to render DashboardLinks */
    public get dashboardLinker() { return this._dashboardLinker; }

    public dispose() {
        if (this.isDisposed) {
            return;
        }
        this.isDisposed = true;
    }
}

export namespace PartServices {
    export interface IOptions {
        session?: IClientSession;
        rendermime?: IRenderMimeRegistry;
        dashboardLinker?: IDashboardLinker;
        dashboardId: string;
        baseUrl: string;
        baseViewUrl: string;
    }

    export interface IDashboardLinker {
        /**
         * Create a Dashboard Link from a cell.
         *
         * @param cell A value to create a dashboard link from.
         * @returns A promise that resolves to a Dashboard Widget if 'cell' is
         * a valid dashboard link, or to a error preview otherwise.
         */
        makeDashboardLink(cell: unknown): Promise<IDashboardHover>;

        /**
         * Return a URL that, when visited by a user-agent, will render the dashboard.
         *
         * This is only possible with some types of dashboards- in-dashboard
         * embeds do _not_ work using this mechanism (yet- presumably we could
         * arrive at something similar to what MavenScape did).
         *
         * @param cell The value to create a dashboard link from
         * @returns Either a URL, or null if no dashboard can be embedded
         */
        embedDashboard(cell: unknown): string | null;
    }

    interface IDashboardHover {
        hover: Widget;
        width: number;
        height: number;
    }
}
