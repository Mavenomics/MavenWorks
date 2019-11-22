import { IDisposable } from "@phosphor/disposable";
import { UUID } from "@phosphor/coreutils";
import { Subject, Observable, Subscription } from "rxjs";
import {
    Converters,
    JSONObject,
    IDirtyable,
    CancelError,
    StartTimingAsync,
    CancelToken,
    AsyncTools
} from "@mavenomics/coreutils";
import { IClientSession } from "@jupyterlab/apputils";
import { IRenderMimeRegistry } from "@jupyterlab/rendermime";
import { MessageLoop } from "@phosphor/messaging";
import { isEqual } from "lodash";
import { OptionsBag, Part, PartServices, PartFactory, PartSerializer, ErrorPart } from "@mavenomics/parts";
import { BindingsProvider, GlobalsService, ErrorBindingsEvaluator } from "@mavenomics/bindings";

export class PartManager implements IDirtyable, IDisposable {
    public OnDirty: Observable<void>;
    public bindings: BindingsProvider;

    private globals: GlobalsService;
    private OnDirtySrc$ = new Subject<void>();
    private optionsBags = new Map<PartManager.PartID, OptionsBag>();
    private partMap = new Map<PartManager.PartID, Part>();
    private partEvaluations = new Map<PartManager.PartID, PartEvaluationState>();
    private subscriptions = new Map<string, PartManager.GlobalSubscription[]>();
    private globalChangeSubscription: Subscription;
    private partServices: PartServices;
    private factory: PartFactory;
    private _isDisposed = false;
    private _isDirty = false;
    // number of error parts currently in the manager
    private _nErrorParts = 0;

    constructor({
        globals,
        session,
        rendermime,
        factory,
        dashboardId,
        bindings,
        baseUrl,
        baseViewUrl,
        dashboardLinker,
     }: PartManager.IOptions) {
        this.OnDirty = this.OnDirtySrc$.asObservable();
        this.globals = globals;
        this.factory = factory;
        this.bindings = bindings;
        this.partServices = new PartServices({
            session,
            rendermime,
            dashboardId,
            baseUrl,
            baseViewUrl,
            dashboardLinker,
        });
        this.globalChangeSubscription = this.globals.OnChange.subscribe(i => {
            if (!this.subscriptions.has(i.name)) {
                return;
            }
            if (i.action === "delete") {
                this.subscriptions.delete(i.oldName || i.name);
                return;
            }
            if (i.action === "rename") {
                const subs = this.subscriptions.get(i.oldName!) || [];
                this.subscriptions.delete(i.oldName!);
                this.subscriptions.set(i.name, subs);
                return;
            }
            const subs = this.subscriptions.get(i.name)!;
            for (const sub of subs) {
                const bag = this.optionsBags.get(sub.partId)!;
                const optionMetadata = bag.getMetadata(sub.option);
                const bindingModel = optionMetadata.binding!;
                if (bindingModel.type === "Global") {
                    bag.set(sub.option, i.value);
                }
                bag.setStale([[sub.option, optionMetadata]]);
                this.evaluateOrWaitForUser(sub.partId);
            }
        });
    }

    public get isDisposed() { return this._isDisposed; }
    public get isDirty() { return this._isDirty; }
    /**
     * A flag indicating whether the PartManager currently has any ErrorParts.
     *
     * @readonly
     *
     * @remarks
     *
     * This is set by #addPart and cleared by #clearParts or #removePart (if the
     * part removed is the last error part).
     */
    public get hasErrorParts() { return this._nErrorParts > 0; }

    public [Symbol.iterator]() {
        return this.partMap.entries();
    }

    public setClean() {
        this._isDirty = false;
    }

    public dispose() {
        if (this._isDisposed) {
            return;
        }
        this.globalChangeSubscription.unsubscribe();
        this._isDisposed = true;
        this.OnDirtySrc$.complete();
        this.partEvaluations.forEach((_, id) => this.cancelPartEvaluations(id));
        this.optionsBags.forEach(i => i.dispose());
        this.optionsBags.clear();
        this.partMap.clear();
    }

    public async addPart(
        partName: string,
        model?: PartSerializer.ISerializedPart
    ): Promise<Part> {
        const uuid = !!model ? model.id : UUID.uuid4();
        const part = this.factory.createPart(partName, { uuid, services: this.partServices });
        if (part instanceof ErrorPart) {
            // don't run the part, don't initialize the part
            part.setModel(model);
            this.partMap.set(part.uuid, part);
            this.optionsBags.set(part.uuid, new OptionsBag([]));
            this._nErrorParts++;
            return part;
        }
        const metadata = part.constructor.GetMetadata();
        const bag = new OptionsBag(metadata);
        if (model != null) {
            for (const optName in model.options) {
                const opt = model.options[optName];
                this.trySetOption(optName, opt, bag, part);
            }
        }
        this.partMap.set(part.uuid, part);
        part.RefreshRequested.subscribe((userRequest) => {
            const bag = this.optionsBags.get(part.uuid);
            if (!bag) {
                // Throwing an error in an observable callback will unhook it
                // So if this is the result of a memory leak, this will notify
                // and unhook (removing it from the garbage collection tree)
                throw Error("Could not refresh part: no options bag found for ID " + part.uuid);
            }
            this.cancelPartEvaluations(part.uuid);
            bag.setAllOptionsStale();
            this.evaluateOrWaitForUser(part.uuid, userRequest);
        });
        part.CancelRequested.subscribe(() => {
            if (!this.optionsBags.get(part.uuid))
                throw Error("Could not cancel part: no options bag found for ID " + part.uuid);
            this.cancelPart(part.uuid);
        });
        part.disposed.connect(this.onPartDisposed, this);
        this.optionsBags.set(part.uuid, bag);
        this.partEvaluations.set(part.uuid, { renderLock: new AsyncTools.Mutex(), evals: new Map() });
        bag.OnOptionChanged.subscribe((opt) => { if (opt.isStale) this.handleOptionChanged(part.uuid); });
        StartTimingAsync("InitializePart", () => this.initializePart(part.uuid));
        return part;
    }

    public removePart(id: PartManager.PartID): Part;
    public removePart(part: Part): Part;
    public removePart(partOrId: Part | PartManager.PartID): Part {
        let part: Part;
        if (typeof partOrId === "string") {
            if (!this.partMap.has(partOrId)) {
                console.error("[PartManager]", "Attempted to remove unknown part");
                throw Error("Cannot remove part: No part exists w/ ID " + partOrId);
            }
            part = this.partMap.get(partOrId)!;
        } else {
            part = partOrId;
        }
        if (part instanceof ErrorPart) {
            this._nErrorParts--;
        }
        this.cancelPartEvaluations(part.uuid);
        this.partEvaluations.delete(part.uuid);
        this.partMap.delete(part.uuid);
        this.optionsBags.get(part.uuid)!.dispose();
        this.optionsBags.delete(part.uuid);
        this.unhookPartSubscriptions(part.uuid);
        part.disposed.disconnect(this.onPartDisposed, this);
        part.dispose();
        return part;
    }

    public getPartById(id: PartManager.PartID): Part | null {
        return this.partMap.get(id) || null;
    }

    /**
     * This function is meant for editors that need external access to the options
     * bag. User code should not call this function.
     */
    public getBagById(id: PartManager.PartID): OptionsBag | null {
        return this.optionsBags.get(id) || null;
    }

    /**
     * Set the binding on an option and update the manager.
     *
     * @remarks
     *
     * This function, like [getBagById], is _not_ meant for user code. It is
     * intended for UI editors to change the state of the bindings.
     */
    public setOptionForPart(
        id: PartManager.PartID,
        optionName: string,
        newBinding: OptionsBag.Binding | JSONObject | null
    ) {
        const bag = this.getBagById(id);
        const part = this.getPartById(id);

        if (bag == null || part == null) return;

        this.trySetOption(optionName, newBinding, bag, part);
    }

    /**
     * Remove all parts in the PartManager and reset the Manager's state.
     *
     */
    public clearParts() {
        for (const [_, part] of this.partMap) {
            this.removePart(part);
        }
    }

    private trySetOption(
        name: string,
        model: OptionsBag.Binding | JSONObject | null,
        bag: OptionsBag,
        part: Part
    ) {
        const oldOpt = bag.getMetadata(name);
        this.unhookStaleSubscriptions(part.uuid, oldOpt);

        if (!model) {
            bag.clearBinding(name);
            bag.set(name, null);
            return;
        }
        if (model.hasOwnProperty("typeName")) {
            bag.clearBinding(name);
            bag.set(name, Converters.deserialize(model as JSONObject));
            return;
        }
        // narrow the type
        model = model as OptionsBag.Binding;
        // A hackish flag set by the textual declarative API. If present and
        // true, the deserializer should parse the globals instead of trusting
        // the model (which it currently does).
        if (model.__detect_globals) {
            const evaluator = this.bindings.getBindingEvaluator(model.type);
            model.globals = evaluator.getGlobalsForBinding(model.expr);
        }
        bag.setBinding(name, model.type, model.expr, model.globals);
        if (model.type === "Global") {
            if (!this.globals.has(model.expr)) {
                const error = new Error("No global named " + model.expr + " exists!");
                part.error(error, "option-error");
            } else {
                bag.set(name, this.globals.get(model.expr));
            }
        }
        this.setSubscriptions(part.uuid, bag.getMetadata(name));
    }

    private setDirty() {
        if (this._isDirty) return;
        this._isDirty = true;
        this.OnDirtySrc$.next();
    }

    private async handleOptionChanged(id: string): Promise<void> {
        this.evaluateOrWaitForUser(id);
    }

    private evaluateOrWaitForUser(id: PartManager.PartID, userRequest: boolean = false) {
        const part = this.getPartById(id);
        if (part == null) {
            return;
        }
        //Todo: UI for WaitForUser option.
        if ((<any>window).WaitForUser && !userRequest) {
            //Show the WaitForUser overlay
            MessageLoop.sendMessage(part, Part.Lifecycle.WaitForUser);
            return;
        }

        //Don't refresh a canceled part unless the user requested it.
        if (part.isCanceled && !userRequest)
            return;

        this.evaluateOptions(id);

    }

    /**
     * Evaluate the options of a part and then render. If nothing is stale this will render the part.
     */
    private evaluateOptions(id: PartManager.PartID): void {
        const part = this.getPartById(id);
        const bag = this.optionsBags.get(id);
        const state = this.partEvaluations.get(id);
        if (bag == null || part == null || state == null) {
            return;
        }

        //Nothing to evaluate. Render instead
        if (!bag.isStale) {
            this.renderPart(id);
            return;
        }

        if (state.evals.size === 0) {
            //None of the options are currently running
            MessageLoop.sendMessage(part, Part.Lifecycle.BeforeCalculate);
        }

        for (const [optionName, staleMetadata] of bag.getStaleOptionValues()) {
            //If this option is already evaluating, lets cancel it.
            let prevToken = state.evals.get(optionName);
            if (prevToken)
                prevToken.cancel();

            const cancel = new CancelToken<void>();
            state.evals.set(optionName, cancel);

            this.evaluateOptionForPart(id, optionName, staleMetadata, cancel)
                .then((result) => this.handleOptionFinished(id, optionName, cancel, result));
        }

        //This is an assertion that bag.isStale and bag.getStaleOptionValues aren't out of sync
        if (state.evals.size === 0) {
            console.error("Stale optionbag but no evaluations were started");
            this.handlePartFinished(id);
        }
    }

    private handleOptionFinished(
        id: PartManager.PartID,
        optionName: string,
        cancelToken: CancelToken<void>,
        result: { error?: Error, canceled: boolean }
    ) {
        //Received results for a part that was removed.
        const part = this.getPartById(id);
        const bag = this.optionsBags.get(id);
        const state = this.partEvaluations.get(id);
        if (bag == null || part == null || state == null) {
            return;
        }

        //Remove this evaluation
        let evalToken = state.evals.get(optionName);
        if (!evalToken || evalToken.guid !== cancelToken.guid)
            return; //This is an old evaluation
        state.evals.delete(optionName);

        if (result.canceled) {
            //Ignore canceled options
        } else if (result.error) {
            //Currently we will cancel all options if one comes back as an error
            this.cancelPartEvaluations(id);
        } else {
        }

        if (state.evals.size === 0) {
            //All of the options have finished executing
            this.handlePartFinished(id);
        }
    }
    private handlePartFinished(id: string) {
        const part = this.getPartById(id);
        const bag = this.optionsBags.get(id);
        const evals = this.partEvaluations.get(id);
        if (bag == null || part == null || evals == null) {
            return;
        }
        if (!part.isError && !part.isCanceled) {
            bag.setFresh();
            MessageLoop.sendMessage(part, Part.Lifecycle.AfterCalculate);
        }
        this.renderPart(part.uuid);
    }

    /**
     * Iterates the bound options canceling their evaluations. This doesn't modify the part state.
     * @param id partID
     */
    private cancelPartEvaluations(id: PartManager.PartID): void {
        const part = this.getPartById(id);
        const bag = this.getBagById(id);

        if (part == null || bag == null) {
            throw Error("Invalid Part ID" + id);
        }

        const state = this.partEvaluations.get(id);
        if (state) {
            for (const token of state.evals.values()) {
                token.cancel();
            }
            state.evals.clear();
        }
    }

    /**
     * Cancels the part's running options and marks the part as canceled.
     * @param id partId
     */
    private cancelPart(id: PartManager.PartID): void {
        const part = this.getPartById(id);
        const bag = this.getBagById(id);

        if (part == null || bag == null) {
            throw Error("Invalid Part ID" + id);
        }

        MessageLoop.sendMessage(part, Part.Lifecycle.Cancel);
        //If we are in WaitForUser mode then we want to display the WaitForUser overlay instead of the canceled overlay.
        if ((<any>window).WaitForUser)
            MessageLoop.sendMessage(part, Part.Lifecycle.WaitForUser);

        this.cancelPartEvaluations(id);
    }

    /**
     * Evaluate the given option, and return whether it evaluated successfully.
     *
     * @private
     * @param id The ID of the part to evaluate
     * @param optionName The name of the option to evaluate
     * @param staleMetadata The last known metadata for the option
     * @param cancelToken Used to cancel the option evaluation
     * @returns Promise indicating if the evaluation succeeded, errored or was canceled.
     */
    private async evaluateOptionForPart(
        id: string,
        optionName: string,
        staleMetadata: OptionsBag.PartOption,
        cancelToken: CancelToken<any>
    ): Promise<{ error?: Error, canceled: boolean }> {
        const part = this.getPartById(id);
        const bag = this.getBagById(id);

        // Hack: It looks like the binding evaluator isn't cancelling the promise
        // in a timely manner. For now, to ensure proper UX state, track whether
        // it was cancelled.
        let wasCancelled = false;

        if (part == null || bag == null) {
            throw Error("Invalid Part ID" + id);
        }

        part.optionCalculating("before-option-calc", optionName);
        try {
            const freshMetadata = bag.getMetadata(optionName);
            if (this.isOptionChangeAlwaysStalable(staleMetadata, freshMetadata)) {
                // set dirtiness now
                this.setDirty();
            }
            const bindingModel = freshMetadata.binding;
            if (bindingModel == null) {
                return { canceled: cancelToken.isCanceled };
            }

            let evaluator = this.bindings.getBindingEvaluator(bindingModel.type);
            try {
                if (evaluator instanceof ErrorBindingsEvaluator) {
                    throw Error(`Invalid binding for option ${optionName}: ${bindingModel.expr}`);
                }

                //Register with the cancellation token
                let canCancel = true; //Todo: Implement a way to unregister onCancel callbacks
                cancelToken.onCancel(() => {
                    if (!canCancel) return;
                    wasCancelled = true;
                    part.optionCalculating("after-option-calc", optionName);
                    evaluator.cancel(cancelToken.guid);
                });

                const value = await StartTimingAsync(`EvaluateOption-${optionName}`, async () =>
                    await evaluator.evaluate(cancelToken.guid, bindingModel.expr, bindingModel.globals));

                //Evaluation finished, disable the cancellation
                canCancel = false;

                if (part.isDisposed)
                    return { canceled: true };

                if (!cancelToken.isCanceled) {
                    // Todo: Generalize this to some sort of two-way binding handler.
                    if (evaluator.name === "Global") {
                        // custom equality checking for globals 2-way bindings
                        // If the bag value didn't change, it originated from the globals
                        if (!isEqual(bag.get(optionName), value)) {
                            this.globals.set(bindingModel.expr, bag.get(optionName));
                        }
                    } else {
                        bag.setBindingValue(optionName, value);
                    }
                }
            } catch (err) {
                if (err instanceof CancelError) {
                    return { canceled: true };
                }

                console.error("[PartManager]", "Option", optionName, "failed to calculate");
                console.error(part.stateDetail);
                bag.setError([optionName]);
                part.error(err, "option-error");
                return { error: err, canceled: cancelToken.isCanceled };
            }
        } finally {
            if (!part.isDisposed && !wasCancelled) {
                part.optionCalculating("after-option-calc", optionName);
            }
        }
        return { canceled: cancelToken.isCanceled };
    }

    private getGlobalsForBinding(optModel: OptionsBag.PartOption) {
        if (optModel.binding == null) return [];
        const bindingModel = optModel.binding;
        let binding = this.bindings.getBindingEvaluator(bindingModel.type);
        return binding.getGlobalsForBinding(bindingModel.expr);
    }
    /**
     * Removes all global subscriptions for the given part. This is used when removing the part
     * @param id part id
     */
    private unhookPartSubscriptions(id: PartManager.PartID) {
        for (const [key, subs] of this.subscriptions.entries()) {
            this.subscriptions.set(key, subs.filter(s => s.partId !== id));
        }
    }
    private unhookStaleSubscriptions(id: PartManager.PartID, optModel: OptionsBag.PartOption) {
        for (const global of this.getGlobalsForBinding(optModel)) {
            const subs = this.subscriptions.get(global);
            if (subs == null) return;
            const newSubs = subs.filter(i => i.partId !== id || i.option !== optModel.name);
            this.subscriptions.set(global, newSubs);
        }
    }

    private setSubscriptions(id: PartManager.PartID, optModel: OptionsBag.PartOption) {
        for (const global of this.getGlobalsForBinding(optModel)) {
            let subs: PartManager.GlobalSubscription[];
            if (this.subscriptions.has(global)) {
                subs = this.subscriptions.get(global)!;
            } else {
                subs = [];
            }
            subs.push({
                option: optModel.name,
                partId: id
            });
            this.subscriptions.set(global, subs);
        }
    }

    private async initializePart(id: PartManager.PartID) {
        const part = this.getPartById(id);
        if (part == null) throw Error("No part with id " + id + " found!");
        try {
            MessageLoop.sendMessage(part, Part.Lifecycle.BeforeInitialize);
            await part.initialize();
            MessageLoop.sendMessage(part, Part.Lifecycle.AfterInitialize);
            //Only automatically run if initialize didn't cause an error.
            //Otherwise wait for user interaction before trying to run.
            if (!part.isError)
                this.evaluateOrWaitForUser(part.uuid);
        } catch (err) {
            console.log("[PartManager]", "Part failed to initialize");
            console.log(err);
            part.error(err, "init-error");
        }
    }

    private async renderPart(id: PartManager.PartID) {
        const part = this.getPartById(id);
        const state = this.partEvaluations.get(id);
        if (part == null || state == null) return;
        if (!part.isIdle) {
            console.error("renderPart called while part still running");
            return;
        }
        if (!part.isInitialized) {
            console.error("renderPart called while part is uninitialized");
            return;
        }
        //Skip rendering if we are in an error state or canceled.
        if (part.isError || part.isCanceled)
            return;

        await state.renderLock.aquire();
        try {
            //Make sure the part is still in a renderable state after acquiring the lock.
            if (this.getPartById(id) == null || !part.isIdle || part.isError || part.isCanceled)
                return;

            const bag = this.optionsBags.get(id)!;
            try {
                await StartTimingAsync("RenderPart", async () => {
                    MessageLoop.sendMessage(part, Part.Lifecycle.BeforeRender);
                    await part.render(bag);
                    MessageLoop.sendMessage(part, Part.Lifecycle.AfterRender);
                });

            } catch (err) {
                console.log("[PartManager]", "Part failed to render");
                console.log(err);
                part.error(err, "render-error");
            }
        } finally {
            state.renderLock.release();
        }
    }

    private onPartDisposed(sender: Part) {
        // remove part resources if this manager still holds any
        if (this.partMap.has(sender.uuid)) {
            this.removePart(sender.uuid);
        }
    }

    /** A helper method to check dirtiness.
     *
     * If a set of conditions are met, then the option _must_ be considered
     * stale. These are changes that would show up in the serialized model,
     * such as unbound option changes or binding expression changes.
     */
    private isOptionChangeAlwaysStalable(
        staleMetadata: OptionsBag.PartOption,
        freshMetadata: OptionsBag.PartOption
    ) {
        if (freshMetadata.binding == null) {
            // this isn't bound, meaning it always makes the part stale
            return true;
        }
        const staleBinding = staleMetadata.binding;
        const freshBinding = freshMetadata.binding;
        if (staleBinding == null
            || staleBinding.type !== freshBinding.type
            || staleBinding.globals !== freshBinding.globals
            || staleBinding.expr !== freshBinding.expr)
        // tslint:disable-next-line: one-line
        {
            // the binding itself changed, this always makes the part stale
            return true;
        }
        // the value changed, but we must defer to the binding evaluation to
        // determine staleness
        return false;
    }
}


type PartEvaluationState = { renderLock: AsyncTools.Mutex, evals: Map<string, CancelToken<void>> };

export namespace PartManager {
    export interface IOptions {
        globals: GlobalsService;
        session?: IClientSession;
        rendermime?: IRenderMimeRegistry;
        factory: PartFactory;
        dashboardId: string;
        bindings: BindingsProvider;
        baseUrl: string;
        baseViewUrl: string;
        dashboardLinker?: PartServices.IDashboardLinker;
    }

    // just so that we don't have a bunch of strings in the code
    export type PartID = string;

    export type GlobalSubscription = {
        partId: PartID;
        option: string;
    };
}
