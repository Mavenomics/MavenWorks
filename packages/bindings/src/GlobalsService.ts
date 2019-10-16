import { Observable, Subject } from "rxjs";
import { Type, Converters, IDirtyable } from "@mavenomics/coreutils";
import { IDisposable } from "@phosphor/disposable";
import { isEqual } from "lodash";

/**
 * The GlobalsService tracks changes in dashboard-level global variables. This class exposes a hook for listening to
 * changes in Globals, getters and setters for individual globals, and facilities for evaluating binding expressions.
 *
 * Binding Expressions are short snippets of kernel code, that allows Globals to be referenced directly. When these
 * globals are referenced, consumers can re-run those expressions in response to changes in global values.
 */
export class GlobalsService implements IDirtyable, IDisposable, Iterable<Readonly<GlobalsService.IGlobal>> {
    /**
     * An Observable that fires whenever the value of a single global has changed.
     *
     * The value emitted contains the old state, new state, and the type of change that occurred.
     *
     * This fires asynchronously, within the same VM turn as a global change.
     */
    public OnChange: Observable<GlobalsService.IGlobalChange>;
    /**
     * An Observable that fires once the globals become dirty. It will not fire
     * again until `setClean()` is called.
     */
    public OnDirty: Observable<void>;

    private OnChangeSrc$ = new Subject<Readonly<GlobalsService.IGlobalChange>>();
    private OnDirtySrc$ = new Subject<void>();
    private globalValues = new Map<string, Readonly<GlobalsService.IGlobal>>();
    private _isDirty = false;
    private _isDisposed = false;

    constructor() {
        this.OnChange = this.OnChangeSrc$.asObservable();
        this.OnDirty = this.OnDirtySrc$.asObservable();
    }

    public get isDirty() {
        return this._isDirty;
    }

    public get isDisposed() {
        return this._isDisposed;
    }

    public setClean() {
        this._isDirty = false;
    }

    public dispose() {
        if (this._isDisposed) {
            return;
        }
        this._isDisposed = true;
        this.OnChangeSrc$.complete();
        this.OnDirtySrc$.complete();
        this.globalValues.clear();
    }

    public [Symbol.iterator]() {
        return this.globalValues.values();
    }

    /**
     * Return the current value of a single Global.
     * @throws Error if there is no global having the given name
     */
    public get(globalName: string): unknown {
        this._ensureGlobalExists(globalName);
        return this.globalValues.get(globalName)!.value;
    }

    /**
     * Returns the type annotation of a single Global
     * @throws Error if there is no global having the given name
     */
    public getType(globalName: string): Type {
        this._ensureGlobalExists(globalName);
        return this.globalValues.get(globalName)!.type;
    }

    /**
     * Set the value of a global, triggering update notifications in the same VM turn.
     * If the new value does not strictly equal the old value, the change will not be
     * committed and no event will be fired.
     * @throws Error if there is no global having the given name
     */
    public set(globalName: string, newValue: unknown): void {
        this._ensureGlobalExists(globalName);
        const oldGlobal = this.globalValues.get(globalName)!;
        if (isEqual(oldGlobal.value, newValue)) {
            console.debug("[GlobalsService]", "Ignoring global change- references match");
            return;
        }
        this._setOrAddGlobal(globalName, oldGlobal.type, newValue, "update");
    }

    /** Test if the globals service has a particular global. */
    public has(globalName: string) {
        return this.globalValues.has(globalName);
    }

    /**
     * Add a new global variable to the GlobalsService.
     * @throws if the GlobalsService already has a global with the given globalName
     */
    public addGlobal<T>(globalName: string, globalType: Type, globalValue: T) {
        if (this.globalValues.has(globalName)) {
            throw Error("A global already exists having the name " + globalName);
        }
        this._setOrAddGlobal(globalName, globalType, globalValue, "add");
    }

    /**
     * Removes a global from the GlobalsService
     * @throws if the GlobalsService doesn't have a global by the given name
     */
    public removeGlobal(globalName: string) {
        this._ensureGlobalExists(globalName);
        const oldGlobal = this.globalValues.get(globalName)!;
        this.globalValues.delete(globalName);
        console.debug("[GlobalsService]", "Global value deleted");
        this.OnChangeSrc$.next(Object.freeze({
            ...oldGlobal,
            action: "delete",
            oldName: oldGlobal.name,
            oldType: oldGlobal.type,
            oldValue: oldGlobal.value,
        } as GlobalsService.IGlobalChange));
        this.setDirty();
    }

    /**
     * Change the type annotation of a global variable. If the types are incompatible,
     * the value of the global will be cleared and set to null.
     * @throws if the global to change doesn't exist
     */
    public changeType(globalName: string, newType: Type): void {
        this._ensureGlobalExists(globalName);
        const oldGlobal = this.globalValues.get(globalName)!;
        if (oldGlobal.type.equals(newType)) {
            return; // no change
        }
        let newValue = null;
        try {
            newValue = Converters.convert(oldGlobal.value, oldGlobal.type, newType);
        } catch (e) {
            console.debug("[GlobalsService]", `Cannot convert ${globalName} from`,
                          `${oldGlobal.type.serializableName} to ${newType.serializableName}, coercing to null`);
            console.debug(e);
        }
        this._setOrAddGlobal(globalName, newType, newValue, "cast");
    }

    /**
     * Change the global name.
     * @throws if no global exists by globalName, or if a global already exists at newName
     */
    public renameGlobal(globalName: string, newName: string) {
        this._ensureGlobalExists(globalName);
        if (this.globalValues.has(newName)) {
            throw Error("A global already exists having the name " + newName);
        }
        const oldGlobal = this.globalValues.get(globalName)!;
        this._setOrAddGlobal(newName, oldGlobal.type, oldGlobal.value, "rename");
    }

    /** Clear all globals and reset state.
     *
     * ### Notes
     *
     * This is called whenever the model providing global definitions has
     * changed.
     */
    public clearGlobals() {
        for (const global of this.globalValues.keys()) {
            this.removeGlobal(global);
        }
    }

    private _ensureGlobalExists(globalName: string) {
        if (!this.globalValues.has(globalName)) {
            throw Error("No global named " + globalName + " exists");
        }
    }

    private _setOrAddGlobal<T>(globalName: string,
            globalType: Type,
            globalValue: T,
            action: GlobalsService.IChangeType) {
        const newGlobal = Object.freeze({
            name: globalName,
            value: globalValue,
            type: globalType,
        });
        const change: GlobalsService.IGlobalChange = {
            ...newGlobal,
            action
        };
        if (action !== "add") {
            const oldGlobal = this.globalValues.get(globalName)!;
            change.oldName = oldGlobal.name;
            change.oldType = oldGlobal.type;
            change.oldValue = oldGlobal.value;
        }
        this.globalValues.set(globalName, newGlobal);
        const pastTense = action.endsWith("e") ? action + "d" : action === "add" ? "added" : "cast";
        console.debug("[GlobalsService]", "Global value", pastTense);
        this.OnChangeSrc$.next(Object.freeze(change));
        this.setDirty();
    }

    private setDirty() {
        if (this._isDirty) {
            return;
        }
        this._isDirty = true;
        this.OnDirtySrc$.next();
    }
}

export namespace GlobalsService {
    export interface IGlobal {
        name: string;
        type: Type;
        value: unknown;
    }

    export type IChangeType = "add" | "rename" | "update" | "delete" | "cast";

    export interface IGlobalChange extends IGlobal {
        action: IChangeType;
        oldName?: string;
        oldType?: Type;
        oldValue?: unknown;
    }
}
