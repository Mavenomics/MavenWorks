import { DashboardSerializer } from "@mavenomics/dashboard";
import { Token } from "@phosphor/coreutils";
import { AuthenticationError, TransportError, NetworkError, ConfigError } from "./errors";

import ISerializedDashboard = DashboardSerializer.ISerializedDashboard;
import { URLExt } from "@jupyterlab/coreutils";

export interface IConfigManager {
    /**
     * Fetch a single dashboard from the config
     *
     * @param path The path of the dashboard
     * @returns A Promise resolving to the dashboard model
     * @throws {NetworkError} (Promise rejection) for network errors
     * @throws {TransportError} (Promise rejection) for HTTP errors
     * @throws {AuthenticationError} (Promise rejection) when the user isn't signed in
     * @throws {ConfigError} (Promise rejection) for errors in the Config Server
     */
    getDashboard(path: string): Promise<ISerializedDashboard>;

    /**
     * Create a new dashboard having the given path
     *
     * @param path The path of the dashboard to create
     * @param object The model of the new dashboard.
     * @returns A Promise that resolves if the request succeeded.
     * @throws {NetworkError} (Promise rejection) for network errors
     * @throws {TransportError} (Promise rejection) for HTTP errors
     * @throws {AuthenticationError} (Promise rejection) when the user isn't signed in
     * @throws {ConfigError} (Promise rejection) for errors in the Config Server
     */
    newDashboard(path: string, object: ISerializedDashboard): Promise<void>;

    /**
     * Overwrite an existing dashboard with an updated model
     *
     * @param path The path of the dashboard to update
     * @param object The model of the dashboard to be saved
     * @returns A Promise that resolves if the request succeeded.
     * @throws {NetworkError} (Promise rejection) for network errors
     * @throws {TransportError} (Promise rejection) for HTTP errors
     * @throws {AuthenticationError} (Promise rejection) when the user isn't signed in
     * @throws {ConfigError} (Promise rejection) for errors in the Config Server
     */
    saveDashboard(path: string, object: ISerializedDashboard): Promise<void>;

    /**
     * Rename a dashboard at a given path to a new name.
     *
     * @remarks The old path will no longer be valid after the rename.
     *
     * @param path The path of the dashboard to rename
     * @param newName The new name to give to that dashboard
     * @returns A Promise that resolves if the request succeeded.
     * @throws {NetworkError} (Promise rejection) for network errors
     * @throws {TransportError} (Promise rejection) for HTTP errors
     * @throws {AuthenticationError} (Promise rejection) when the user isn't signed in
     * @throws {ConfigError} (Promise rejection) for errors in the Config Server
     */
    renameDashboard(path: string, newName: string): Promise<void>;

    /**
     * Delete a dashboard at a given path.
     *
     * @param path The path of the dashboard to delete.
     * @returns A Promise that resolves if the request succeeded.
     * @throws {NetworkError} (Promise rejection) for network errors
     * @throws {TransportError} (Promise rejection) for HTTP errors
     * @throws {AuthenticationError} (Promise rejection) when the user isn't signed in
     * @throws {ConfigError} (Promise rejection) for errors in the Config Server
     */
    deleteDashboard(path: string): Promise<void>;

    /**
     * Retrieve the paths of all known dashboards in the config.
     *
     * @remarks A future optimization may paginate this function.
     *
     * @returns A Promise that resolves to a list of paths if the request succeeded.
     * @throws {NetworkError} (Promise rejection) for network errors
     * @throws {TransportError} (Promise rejection) for HTTP errors
     * @throws {AuthenticationError} (Promise rejection) when the user isn't signed in
     * @throws {ConfigError} (Promise rejection) for errors in the Config Server
     */
    getAllDashboardNames(): Promise<ReadonlyArray<string>>;
}

/**
 * The default implementation of IConfigManager. Communicates across an HTTP
 * boundary to a remote config server.
 *
 * @export
 * @class HttpConfigManager
 */
export class HttpConfigManager implements IConfigManager {
    private readonly configUrl: string;

    constructor(config: string) {
        this.configUrl = URLExt.normalize(config);
    }

    public async getDashboard(path: string): Promise<ISerializedDashboard> {
        if (path === "" || path === "/") {
            // this won't return a useful result
            // TODO: Better differentiation in API responses btw files and dirs
            throw Error("Not a Dashboard: " + path);
        }
        const res = await this.issueRequest(path);
        return await res.json();
    }

    public async newDashboard(path: string, object: ISerializedDashboard): Promise<void> {
        return void await this.issueRequest(path, "PUT", JSON.stringify(object));
    }

    public async saveDashboard(path: string, object: ISerializedDashboard): Promise<void> {
        return void await this.issueRequest(path, "POST", JSON.stringify(object));
    }

    public async renameDashboard(path: string, newName: string): Promise<void> {
        return void await this.issueRequest(path, "PATCH", JSON.stringify({name: newName}));
    }

    public async deleteDashboard(path: string): Promise<void> {
        return void await this.issueRequest(path, "DELETE");
    }

    public async getAllDashboardNames(): Promise<readonly string[]> {
        const res = await this.issueRequest("/", "GET");
        return (await res.json() as {data: string[]}).data.map(i => URLExt.join("/", i));
    }

    protected async issueRequest(endpoint: string, method: string = "GET", body?: string) {
        let response: Response;
        try {
            response = await fetch(URLExt.join(this.configUrl, endpoint), {
                credentials: "include",
                method,
                body,
                headers: {
                    "Content-Type": "application/json"
                }
            });
        } catch (err) {
            throw new NetworkError(err);
        }
        if (!response.ok) {
            let body;
            try {
                body = await response.text();
            } catch {
                body = response.statusText;
            }
            switch (response.status) {
                case 401:
                    throw new AuthenticationError(body);
                case 404:
                    throw new ConfigError("Object not found");
                case 409:
                    throw new ConfigError("Object already exists, use save or pick a different name");
                default:
                    throw new TransportError(response.status, body);
            }
        }
        return response;
    }
}

export const IConfigManager = new Token<IConfigManager>("MavenWorks Config Manager");
