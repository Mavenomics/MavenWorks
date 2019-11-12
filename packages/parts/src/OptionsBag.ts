import { Type, IterTools, IStaleable } from "@mavenomics/coreutils";
import { Subject, Observable, asyncScheduler } from "rxjs";
import { IDisposable } from "@phosphor/disposable";
import { isEqual } from "lodash";
import { debounceTime } from "rxjs/operators";

/**
 * Stores the values of part options, and allows parts to get and set part values.
 *
 * OptionsBags are passed on render to parts, and are paired with the part.
 */
export class OptionsBag implements Iterable<OptionsBag.PartOption>, IDisposable {
    public readonly OnOptionChanged: Observable<OptionsBag.PartOptionChange>;
    private readonly optionsMap = new Map<string, OptionsBag.PartOption>();
    // Stale options are added here. When a part option changes, it's old value is moved here.
    private readonly staleOptions = new Map<string, OptionsBag.PartOption>();
    // Error options are added here. When an option errors, it's name is added here.
    private readonly errorOptions = new Map<string, OptionsBag.PartOption>();

    private readonly OnOptionChangedSrc$ = new Subject<OptionsBag.PartOptionChange>();

    private _isStale = false;
    private _isDisposed = false;
    // State variable to track if all changes came from the part owning this bag
    // Defaults to null if no change occurred.
    private _isSelfChange: boolean | null = null;


    constructor(defaults: Iterable<OptionsBag.PartOption>) {
        for (const opt of defaults) {
            this.optionsMap.set(opt.name, Object.freeze({
                ...opt
            }));
        }
        this.OnOptionChanged = this.OnOptionChangedSrc$.pipe(
            debounceTime(4, asyncScheduler)
        );
        // init options from metadata
    }

    public get isDisposed() { return this._isDisposed; }
    public get isStale() { return this._isStale; }
    /** True if the part originated a change, false otherwise. */
    public get isSelfChange() { return this._isSelfChange === null ? false : this._isSelfChange; }

    [Symbol.iterator]() {
        return this.optionsMap.values();
    }

    public values() {
        return IterTools.map(this.optionsMap.values(), i => i.value);
    }

    public setStale(staleOptions?: Iterable<[string, OptionsBag.PartOption]>) {
        if (staleOptions != null) {
            for (const opt of staleOptions) {
                let [optName, optModel] = opt;
                if (this.staleOptions.has(optName)) {
                    // this option is already stale, we need to merge the values
                    optModel = this.mergeStaleness(optModel);
                }
                this.staleOptions.set(optName, optModel);
            }
        }
        this._isStale = true;
    }

    /**
     * Marks all options as stale.
     *
     * This will cause the framework to re-evaluate all of them, which is
     * useful for "Refresh Part". This ensures that all options are up to date
     * and surfaces an escape hatch for the user if they know that the data is
     * stale.
     *
     */
    public setAllOptionsStale() {
        this._isSelfChange = false;
        this.setStale(this.optionsMap.entries());
    }

    public setError(erroredOptions: Iterable<string>) {
        for (const opt of erroredOptions) {
            this.errorOptions.set(opt, this.getMetadata(opt));
        }
    }

    /** Clears any errored options from this bag.
     *
     * Options are marked as 'errored' to keep them out of the staleness loop.
     * This allows option changes to result in re-evaluations, while preserving
     * some way of marking these options as needing to be evaluated.
     */
    public clearError() {
        this.errorOptions.clear();
    }

    public setFresh() {
        this.staleOptions.clear();
        this._isStale = false;
        this._isSelfChange = null;
    }

    public dispose() {
        if (this._isDisposed) {
            return;
        }
        this._isDisposed = true;
        this.OnOptionChangedSrc$.complete();
        this.staleOptions.clear();
        this.errorOptions.clear();
        this.optionsMap.clear();
    }

    /**
     * Retrieve the value of an option.
     * @throws if the option specified doesn't belong to this options bag
     */
    public get(name: string): unknown {
        this.ensureOption(name);
        return this.optionsMap.get(name)!.value;
    }

    /**
     * Sets the value of the given option. The part option is staled, and the
     * new value is set. If the value is an EvalBinding, the change is silently
     * rejected. Otherwise, the PartManager will set the bound global once it
     * recieves the staleness.
     * @throws if the option specified doesn't belong to this options bag
     */
    public set(name: string, value: unknown): void {
        this.ensureOption(name);
        const oldOption = this.optionsMap.get(name)!;
        if (isEqual(oldOption.value, value)) {
            console.debug("[OptionsBag]", "Ignoring option change- refs match");
            return;
        }
        if (this._isSelfChange !== null) {
            this._isSelfChange = true;
        }
        const newOption = Object.freeze({
            ...oldOption,
            value
        });
        this.optionsMap.set(name, newOption);
        this.setStale([[name, oldOption]]);
        this.OnOptionChangedSrc$.next({ option: newOption, isStale: true });
    }

    /**
     * Sets the value of a given option. Do not use in Parts.
     *
     * This is like [set], except it is meant for use by dashboard tooling
     * such as the Part Properties Editor. It is not meant for use by Parts, and
     * and part using this method may break assumptions made in the framework.
     *
     * @param name The name of the option to set
     * @param value The value that the option should take on
     */
    public _setExternal(name: string, value: unknown): void {
        this.set(name, value);
        this._isSelfChange = false;
    }

   public setBindingValue(name: string, value: unknown): void {
       this.ensureOption(name);
       const oldOption = this.optionsMap.get(name)!;
       if (isEqual(oldOption.value, value)) {
           console.debug("[OptionsBag]", "Ignoring option change- refs match");
           return;
       }
       this._isSelfChange = false;
       const newOption = Object.freeze({
           ...oldOption,
           value
       });
       this.optionsMap.set(name, newOption);
       this.errorOptions.delete(name);
       this.staleOptions.delete(name);
       this._isStale = this.staleOptions.size !== 0;
       this.OnOptionChangedSrc$.next({ option: newOption, isStale: false });
   }

    /**
     * Return the metadata about an option; including it's type and name.
     *
     * @throws if `name` is not a valid option
     */
    public getMetadata(name: string) {
        this.ensureOption(name);
        return this.optionsMap.get(name)!;
    }

    /**
     * Bind an option to a global, or binding expression.
     * When setting an eval binding, include the list of globals referenced in
     * the expression. Setting a binding will stale it.
     *
     * @throws if the option name isn't a valid option
     */
    public setBinding(name: string,
                      type: string,
                      expr: string,
                      globals?: ReadonlyArray<string>) {
        this.ensureOption(name);
        const oldOption = this.optionsMap.get(name)!;
        const bindingModel: OptionsBag.Binding = {
            type,
            expr,
            globals
        } as any;

        const oldBinding = oldOption.binding;
        if (this.testBindingModelsEquivalent(oldBinding, bindingModel)) {
            console.log("[OptionsBag]", "Ignoring binding change- models are equivalent");
            return;
        }
        const newOption = Object.freeze({
            ...oldOption,
            binding: Object.freeze(bindingModel)
        });
        this._isSelfChange = false;
        this.optionsMap.set(name, newOption);
        this.setStale([[name, oldOption]]);
        this.OnOptionChangedSrc$.next({ option: newOption, isStale: true });
    }

    /**
     * Remove a binding from an option
     * This will stale the option.
     */
    public clearBinding(name: string) {
        this.ensureOption(name);
        const oldOption = this.optionsMap.get(name)!;
        const newOption = Object.freeze({
            ...oldOption,
            binding: undefined
        });
        this.optionsMap.set(name, newOption);
        this.setStale([[name, oldOption]]);
        this.OnOptionChangedSrc$.next({ option: newOption, isStale: true });
    }

    public getStaleOptions(): Iterable<string> {
        return IterTools.mergeUnique(
            this.staleOptions.keys(),
            this.errorOptions.keys()
        );
    }

    public* getStaleOptionValues(): Iterable<[string, OptionsBag.PartOption]> {
        for (const option of this.getStaleOptions()) {
            const bag = this.staleOptions.has(option) ? this.staleOptions
                                                      : this.errorOptions;
            yield [
                option,
                bag.get(option)!
            ];
        }
    }

    private ensureOption(name: string) {
        if (!this.optionsMap.has(name)) {
            throw Error(name + " is not a valid option!");
        }
    }

    private mergeStaleness(model: OptionsBag.PartOption) {
        const oldModel = this.staleOptions.get(model.name);
        if (oldModel == null) {
            return model;
        }
        return Object.freeze({
            name: oldModel.name,
            type: oldModel.type,
            // use old binding, always. If multiple binding changes happen in a
            // single turn, that is a framework bug.
            binding: oldModel.binding,
            value: model.value // use latest value
        } as OptionsBag.PartOption);
    }

    private testBindingModelsEquivalent(
        oldBinding: OptionsBag.Binding | undefined,
        newBinding: OptionsBag.Binding
    ) {
        return oldBinding != null
            && oldBinding.type === newBinding.type
            && oldBinding.expr === newBinding.expr
            && oldBinding.globals.length === newBinding.globals.length
            && oldBinding.globals.every(i => newBinding.globals.includes(i));
    }
}

export namespace OptionsBag {
    /**
     * Framework type for storing the value and metadata about an option.
     * Changes to the value, type, or binding expression will result in a new
     * reference.
     */
    export interface PartOption {
        /** The name of this option. Option names should not be changed except via
         * options editors.
         */
        name: string;
        /** The value of this option. Changes to this value should be made
         * via `OptionsBag.set`
         * @see OptionsBag.set
         */
        value: unknown;
        /** The annotated datatype of this option. The types are used for
         * serialization and verifying types in binding expressions. Types should
         * not be changed except via options editors.
         */
        type: Type;
        /** A model that represents a global binding, or undefined if this option is
         * unbound. Changes to this should be made using setBinding and clearBinding
         * @see OptionsBag.setBinding
         * @see OptionsBag.clearBinding
         */
        binding?: Binding;
    }

    export interface Binding {
        type: string;
        expr: string;
        globals: ReadonlyArray<string>;
        __detect_globals?: true;
    }

    export interface PartOptionChange {
        option: PartOption;
        isStale: boolean;
    }
}
