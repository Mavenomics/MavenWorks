import { IDisposable } from "@phosphor/disposable";
import { Observable, Subject } from "rxjs";
import { Token } from "@phosphor/coreutils";
import { URLExt } from "@jupyterlab/coreutils";
import { DashboardSerializer } from "@mavenomics/dashboard";
import { HoverManager } from "@mavenomics/ui";

/**
 * A UrlManager is a simple class for interfacing with the browser URL.
 *
 * The UrlManager is not intended to store state, and will not allow many->many
 * bindings to the URL.
 *
 * @export
 * @interface IUrlManager
 */
export interface IUrlManager {
    /**
     * The current URL path, relative to a base url.
     *
     * On set, will navigate to the given path and add a history item to the
     * user-agent's history stack.
     *
     * #### Note
     *
     * Setting this will _not_ trigger an [[onPathChange]] event.
    */
    path: string;
    /**
     * The current query parameters of the URL.
     *
     * On set, will navigate to the same path with the given query parameters,
     * _replacing_ the history item in the user-agent's history stack.
     *
     * #### Note
     *
     * As with [[path]], setting this will not trigger [[onQueryChange]].
    */
    query: Readonly<URLSearchParams>;
    /**
     * The currently imported dashboard, if specified in the URL.
     *
     */
    importedDashboard?: DashboardSerializer.ISerializedDashboard;
    /**
     * An event emitted when the path is changed by user-agent navigation.
     *
     * This is typically a change that occurs due to hitting the 'back' button.
     */
    onPathChange: Observable<string>;
    /**
     * An event emitted when the query string is changed by user-agent navigation.
     */
    onQueryChange: Observable<Readonly<URLSearchParams>>;
    /**
     * An event emitted when the URLManager has imported a dashboard model
     */
    onDashboardImport?: Observable<DashboardSerializer.ISerializedDashboard>;
    /**
     * Create a new URL with the given path and query.
     *
     * @param path The path component of the URL to construct
     * @param query The query component of the URL to construct
     * @returns A URL that will point to the given path/query combination
     *
     * #### Notes
     *
     * Occasionally, you may need to construct a URL for your own purposes
     * outside of the URL manager (such as for a dashboard hover or opening in a
     * new tab), but you still need assurances that the URL is valid.
     * `#makeUrlFromComponents` is the best way to accomplish this without
     * having to rewrite some URL management code yourself.
     *
     * This function will _not_ modify any state.
     */
    makeUrlFromComponents(path: string, query: string): string;

    /**
     * Resolve the full path of a src:url string
     *
     * @param url The value of a src:url parameter
     * @returns The fully-qualified URL that the src:url parameter points to
     *
     * @remarks
     * Like {@link makeUrlFromComponents}, this is meant for consumption by
     * tooling that needs to work with URLs (such as Dashboard Links). This
     * function does not modify state.
     */
    resolveSrcUrl(url: string): string;
}

export class UrlManager implements IDisposable, IUrlManager {
    /**
     * URL Parameter Blacklist
     *
     * Any parameter whose name matches an entry in this blacklist will be
     * excluded from the parameters object exposed by this class.
     *
     * @private
     * @static
     */
    private static readonly ParameterBlacklist = [
        "src:url",
    ];
    private baseUrl: string;
    private _path: string;
    private _query: Readonly<URLSearchParams>;
    private _isDisposed = false;
    private _onPathChange = new Subject<string>();
    private _onQueryChange = new Subject<Readonly<URLSearchParams>>();
    private _onDashboardImport = new Subject<DashboardSerializer.ISerializedDashboard>();
    private _importedDashboardKey?: string;
    private _importedDashboard?: DashboardSerializer.ISerializedDashboard;

    /**
     * Creates an instance of UrlManager.
     *
     *
     * @param baseUrl The base URL of the app, off which the path would be constructed.
     *
     * > #### A note on paths
     * >
     * > Paths are more 'elegant' but require some backend configuration to
     * > properly handle things like links, tab duplications, reloads, etc. If
     * > the backend cannot handle this (eg, being served off GH-Pages), then
     * > the path support must be disabled. The application can instead use a
     * > URL parameter named `src:url`. URLs on this parameter are assumed to
     * > be relative, but may be full cross-origin URLs if the protocol is
     * > specified and URL-encoded. Eg,
     * > `?src:url=http%3A%2F%2Fexample.org%2Fmy-cool-thing.dashboard`.
     * >
     * > When using `src:url`, the dashboard should be treated as an 'imported'
     * > dashboard and will thus have no name or path. When the path is set, it
     * > will clear the `src:url` parameter.
     */
    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
        const basePath = new URL(this.baseUrl).pathname;
        this._path = URLExt.join(window.location.pathname.replace(basePath, ""));
        this._query = new URLSearchParams(this.readQuery());
        const overrides = this.removeBlacklistedParams();
        this.setOverrides(overrides);
        window.addEventListener("popstate", this);
        window.addEventListener("hashchange", this);
    }

    public dispose() {
        if (this._isDisposed) return;
        this._isDisposed = true;
        this._onPathChange.complete();
        this._onQueryChange.complete();
        window.removeEventListener("popstate", this);
        window.removeEventListener("hashchange", this);
    }

    public get isDisposed() { return this._isDisposed; }

    public get path() {
        return URLExt.join("/", this._path);
    }

    public set path(newPath: string) {
        this._path = newPath;
        this._importedDashboardKey = void 0;
        this._importedDashboard = void 0;
        window.history.pushState(null, "", this.setUrlFromCurrentState());
    }

    public get importedDashboard() { return this._importedDashboard; }

    public get onDashboardImport() { return this._onDashboardImport; }

    public get query() {
        return this._query;
    }

    public set query(params: Readonly<URLSearchParams>) {
        const toSet = new URLSearchParams([...params.entries()]);
        for (const blacklistedName of UrlManager.ParameterBlacklist) {
            if (params.has(blacklistedName)) {
                console.warn("Removing blacklisted name from query params: '" +
                    blacklistedName +
                    "'. These cannot be set using IUrlManager#query, and are" +
                    " either managed internally, or by some other mechanism."
                );
                toSet.delete(blacklistedName);
            }
        }
        this._query = toSet;
        // parameter updates should not be navigable in the history
        window.history.replaceState(null, "", this.setUrlFromCurrentState());
    }

    public get onPathChange(): Observable<string> { return this._onPathChange; }
    public get onQueryChange(): Observable<Readonly<URLSearchParams>> { return this._onQueryChange; }

    public makeUrlFromComponents(path: string, query: string): string {
        return URLExt.join(this.baseUrl, path + "?" + query);
    }

    public resolveSrcUrl(url: string) {
        return (new URL(url, this.baseUrl)).href;
    }

    public handleEvent() {
        const basePath = new URL(this.baseUrl).pathname;
        const path = URLExt.join(window.location.pathname.replace(basePath, "/"));
        const query = this.readQuery();
        if (query !== ("" + this._query)) {
            this._query = new URLSearchParams(query);
            const overrides = this.removeBlacklistedParams();
            this.setOverrides(overrides);
            this._onQueryChange.next(this._query);
        }
        if (path !== this._path) {
            this._path = path;
            this._importedDashboardKey = void 0;
            this._importedDashboard = void 0;
            this._onPathChange.next(path);
        }
    }

    protected setOverrides(overrides: Record<string, string>) {
        const keys = Object.keys(overrides);
        for (const key of keys) {
            const val = overrides[key];
            switch (key) {
                case "src:url":
                    if (this._importedDashboardKey !== val) {
                        const url = this.resolveSrcUrl(val);
                        this._importedDashboardKey = url;
                        fetch(url)
                            .then(i => i.json())
                            .then(i => this._importedDashboard = i)
                            .then(i => this._onDashboardImport.next(i))
                        .catch(err => {
                            const manager = HoverManager.GetManager();
                            manager.openErrorMsgDialog(
                                "<h3>Failed to fetch dashboard</h3>\n" +
                                "<p>Make sure that the src:url parameter is " +
                                "correct, and that the dashboard is accessible " +
                                "at the specified URL.</p><br \>",
                                err
                            );
                        });
                    }
                    break;
            }
        }
    }

    private removeBlacklistedParams(): Record<string, string> {
        const values: Record<string, string> = {};
        for (const blacklistedName of UrlManager.ParameterBlacklist) {
            if (!this._query.has(blacklistedName)) continue;
            values[blacklistedName] = this._query.get(blacklistedName)!;
            this._query.delete(blacklistedName);
        }
        return values;
    }


    private setUrlFromCurrentState() {
        if (!!this._importedDashboardKey) {
            const query = new URLSearchParams("" + this._query);
            query.set("src:url", this._importedDashboardKey);
            return this.makeUrlFromComponents("", "" + query);
        }
        return this.makeUrlFromComponents(this._path, "" + this._query);
    }

    private readQuery() {
        const query = window.location.search;
        let hash = window.location.hash;
        if (hash.startsWith("#")) hash = hash.slice(1);
        if (query.length > 1) {
            return query + "&" + hash;
        }
        return "?" + hash;
    }
}

export const IUrlManager = new Token<IUrlManager>("MavenWorks URL Manager");
