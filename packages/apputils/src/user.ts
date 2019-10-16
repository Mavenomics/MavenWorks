import { Observable, Subject } from "rxjs";
import { IDisposable } from "@phosphor/disposable";
import { AuthenticationError, TransportError, NetworkError } from "./errors";
import { Token } from "@phosphor/coreutils";
import { URLExt, PageConfig } from "@jupyterlab/coreutils";

/**
 * Interface for a user authentication state manager.
 *
 * @export
 * @interface IUserManager
 */
export interface IUserManager {
    /**
     * Observable that emits whenever the state of the user's sign-in has
     * changed. UIs consuming this manager to display login state should update
     * when this emits.
     *
     */
    onAuthStateChange: Observable<void>;

    /**
     * The username of the signed in user, or the string "Sign in..."
     */
    username: string;

    /**
     * Whether the user is signed in.
     *
     * This isn't guaranteed to be 1:1 with server sign-in, the only way to be
     * sure is to call [[checkIsSignedIn]]. But this gives a good-enough
     * approximation for UI state display.
     *
     * The differences arise when the server restarts, for instance- then the
     * session token becomes invalid and the user must sign-in again.
     */
    isSignedIn: boolean;

    /**
     * Log-in the user, with the given username and password pair.
     *
     * Note: Logs a loud warning to the console when called over HTTP.
     *
     * @param username
     * @param password
     * @returns A promise that resolves if the action succeeded.
     * @throws {NetworkError} (Promise rejection) for network errors
     * @throws {TransportError} (Promise rejection) for HTTP errors
     * @throws {AuthenticationError} (Promise rejection) when the credentials were incorrect.
     */
    login(username: string, password: string): Promise<void>;

    /**
     * Log-out the user.
     *
     * Note: This is save to issue even if the user isn't logged in. The server
     * will simply ignore it in that case.
     *
     * @returns A promise that resolves if the action succeeded.
     * @throws {NetworkError} (Promise rejection) for network errors
     * @throws {TransportError} (Promise rejection) for HTTP errors
     */
    logout(): Promise<void>;

    /**
     * Checks user status against the server. This is intended for situations
     * in which the client wants to verify login status, such as part of an
     * early authentication check.
     *
     * @returns A promise that resolves to the sign-in state.
     * @throws {NetworkError} (Promise rejection) for network errors
     * @throws {TransportError} (Promise rejection) for HTTP errors
     */
    checkIsSignedIn(): Promise<boolean>;
}

/**
 * Default implementation of IUserManager
 *
 * @export
 * @class HttpUserManager
 */
export class HttpUserManager implements IUserManager, IDisposable {
    private _isDisposed = false;
    private _onAuthStateChange = new Subject<void>();
    private _username = "Sign in...";
    private _isSignedIn = false;
    private baseUrl: string;

    constructor(baseUrl?: string) {
        this.baseUrl = baseUrl || PageConfig.getBaseUrl();
    }

    public get isDisposed() { return this._isDisposed; }
    public get onAuthStateChange(): Observable<void> { return this._onAuthStateChange; }
    public get username() { return this._username; }
    public get isSignedIn() { return this._isSignedIn; }

    public dispose() {
        if (this._isDisposed) return;
        this._isDisposed = true;
        this._onAuthStateChange.complete();
    }

    public async login(username: string, password: string): Promise<void> {
        const body = new URLSearchParams({username, password});
        await this.issueRequest("/login", "POST", body);

        if (!this._isSignedIn) {
            this._isSignedIn = true;
            this._onAuthStateChange.next();
        }
    }

    public async logout(): Promise<void> {
        await this.issueRequest("/logout", "GET");

        if (this._isSignedIn) {
            this._isSignedIn = true;
            this._onAuthStateChange.next();
        }
    }

    public async checkIsSignedIn(): Promise<boolean> {
        const res = await this.issueRequest("/status", "GET");
        const isLoggedIn = (await res.json() as {isLoggedIn: boolean}).isLoggedIn;
        if (this._isSignedIn !== isLoggedIn) {
            this._isSignedIn = isLoggedIn;
            this._onAuthStateChange.next();
        }
        return isLoggedIn;
    }

    protected async issueRequest(endpoint: string, method: string = "GET", body?: URLSearchParams) {
        let response: Response;
        try {
            response = await fetch(URLExt.join(this.baseUrl, "user", endpoint), {
                credentials: "include",
                method,
                body,
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
                default:
                    throw new TransportError(response.status, body);
            }
        }
        return response;
    }
}

export const IUserManager = new Token<IUserManager>("User State Manager");
