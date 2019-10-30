import { IDisposable } from "@phosphor/disposable";
import { HoverManager } from "@mavenomics/ui";
import { IClientSession } from "@jupyterlab/apputils";
import { IRenderMimeRegistry } from "@jupyterlab/rendermime";

export class PartServices implements IDisposable {
    public isDisposed = false;
    private readonly _hover: HoverManager;
    private readonly _session?: IClientSession;
    private readonly _rendermime?: IRenderMimeRegistry;
    private readonly _dashboardId: string;
    private readonly _baseUrl: string;
    private readonly _baseViewUrl: string;

    constructor({session, rendermime, dashboardId, baseUrl, baseViewUrl}: PartServices.IOptions) {
        this._hover = HoverManager.GetManager();
        this._session = session;
        this._rendermime = rendermime;
        this._dashboardId = dashboardId;
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
        dashboardId: string;
        baseUrl: string;
        baseViewUrl: string;
    }
}
