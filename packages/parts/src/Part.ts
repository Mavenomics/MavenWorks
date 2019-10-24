import { Widget, StackedLayout } from "@phosphor/widgets";
import { Type } from "@mavenomics/coreutils";
import { ReactWrapperWidget } from "@mavenomics/ui";
import { UUID, JSONObject } from "@phosphor/coreutils";
import { OptionsBag } from "./OptionsBag";
import { PartServices } from "./PartServices";
import { Observable, Subject } from "rxjs";
import { PartOverlay } from "./PartOverlay";
import * as React from "react";
import { Message, MessageLoop } from "@phosphor/messaging";

export interface Part {
    // TSC throws a "TS18006" error when classes have properties named 'constructor',
    // even if they're only used for typing. By declaration merging the part with
    // this interface, we can sidestep that.
    constructor: typeof Part;
}

/**
 * Abstract Base Class representing MavenWorks Parts that run on the client side.
 *
 * MavenWorks Parts have an HTML Node they render into- parts should not do anything to the global DOM unless
 * absolutely necessary (for instance, tooltips). For compatibility with JQuery plugins, the node is not isolated in any
 * way and is attached to the DOM when initialize() and render() are called.
 *
 * User Defined Parts render into an IFrame- this offers enhanced isolation and safety, which is sometimes required for
 * complex frameworks and simplifies the development workflow (as it is safe to write to the `window` inside a frame).
 *
 * Parts extend Phosphor Widgets- this allows you to implement hooks for handling node detachment and
 * re-attachment, resizing, alterations, updates, etc. Please see the Phosphor documentation for further information:
 * http://phosphorjs.github.io/phosphor/api/widgets/classes/widget.html
 */
export abstract class Part extends Widget {
    /**
     * A static identifier for this part set by PartFactory#registerPart.
     */
    public static _FactoryName: string;

    /**
     * Gets the metadata for this part. Override this function to define the options your part will have.
     * @returns {Part.PartMetadata} A data structure representing all the options and other metadata about
     * this part.
     */
    public static GetMetadata(): Part.PartMetadata {
        return new Part.PartMetadata();
    }

    // "constructor": typeof Part;

    /**
     * An external ID that this part will be referenced by
     */
    public uuid: string;
    /**
     * An observable that emits whenever this part should refresh.
     * The PartManager will handle this event by evaluating any stale options and re-rendering the part.
     */
    public RefreshRequested: Observable<boolean>;
    public CancelRequested: Observable<void>;
    public layout: StackedLayout;
    /**
     * A set of helper methods for using the framework interactions, such as opening tooltips.
     */
    protected readonly context: PartServices;
    /**
     * The overlay for this part. Overlays are controlled by the framework and display state
     * information to the user.
     * TODO: Turn this into a nicer class
     */
    private readonly overlay: Widget;
    private _isInitialized = false;
    private _isIdle = true;
    private _state: Part.State = Part.State.Uninitialized;
    private _stateDetail: unknown;
    private _refreshRequested = new Subject<boolean>();
    private _cancelRequested = new Subject<void>();

    protected constructor({ services, uuid }: Part.IOptions) {
        super();
        this.uuid = uuid || UUID.uuid4();
        this.id = this.uuid;
        this.RefreshRequested = this._refreshRequested.asObservable();
        this.CancelRequested = this._cancelRequested.asObservable();
        this.title.label = this.getName();
        this.layout = new StackedLayout();
        this.context = services;
        this.addClass("m-Part");
        // todo: abstract this into an overlay widget class
        this.overlay = new Part.Overlay(this);
        this.overlay.hide();
        this.layout.addWidget(this.overlay);
    }

    /**
     * The current state of the part
     */
    public get state() { return this._state; }

    /**
     * An object that describes additional detail about the state of this part.
     * If the state is Error, the detail will be the actual error thrown.
     * If the state is Calculating, the detail will be a string list of
     * currently calculating options.
     */
    public get stateDetail() { return this._stateDetail; }

    /**
     * Whether this part has completely initialized.
     */
    public get isInitialized() { return this._isInitialized; }

    /**
     * Whether the part's current state is an error.
     */
    public get isError() { return this.state === Part.State.Error; }

    /**
     * Whether the part's current state is canceled.
     */
    public get isCanceled() { return this.state === Part.State.Canceled; }

    /**
     * Whether this part is idle.
     *
     * #### Notes
     *
     * A part is idle if it is not initializing, rendering, or having any of
     * it's options calculated.
     */
    public get isIdle() { return this._isIdle; }

    //#region Framework lifecycle management
    /**
     * Request that the framework refresh this part as soon as possible.
     * This is used to do things like clearing error state and reconstructing
     * IFrames after being removed from the DOM.
     */
    public refresh() {
        this._refreshRequested.next(false);
    }

    /**
     * This indicates a refresh was requested by the user.
     */
    public userRefresh() {
        this._refreshRequested.next(true);
    }


    /**
     * Request that the framework stop evaluating this part's options.
     */
    public cancel() {
        this._cancelRequested.next();
    }
    //#endregion

    /**
     * `initialize` is called just after the Part is created, and is only called once. Parts should front-load as much
     * work as they can into `initialize`, to make the Part more responsive.
     *
     * If you need to do some prolonged or asynchronous work (such as querying a remote server), then you may return a
     * promise. The framework will wait for the promise to resolve before continuing execution.
     * @returns {void | Promise<void>}
     */
    public abstract initialize(): void | Promise<void>;

    /**
     * `render` is called every time the framework decides the options have become stale, immediately after
     * `initialize`, and whenever the user decides to explicitly re-run this part. For usability purposes, `render`
     * should do as little work as possible. Utilize early bailout and avoid nuking the output with every call, if you
     * can, as this is much faster and the user _will_ notice.
     *
     * If you need to do some prolonged or asynchronous rendering, return a promise. The framework will wait for that
     * promise to resolve before continuing execution.
     *
     * @param options An OptionsBag representing the options of this part. Parts should load their values by calling
     * `get` on this object, and may set their options by calling `set`.
     * @returns {void | Promise<void>}
     * @see OptionsBag
     */
    public abstract render(options: OptionsBag): void | Promise<void>;

    /**
     * Clean up this part, and any resources it held.
     *
     * `dispose()` is called at least once, but may be called any number of times. Parts should check `this.isDisposed`
     * if they can only clean up a resource once. At the end of your implementation, be sure to call `super.dispose()`.
     *
     * For more information, please refer to the PhosphorJS docs on IDisposable objects.
     * @see IDisposable
     */
    public dispose() {
        if (this.isDisposed) {
            return;
        }
        this._refreshRequested.complete();
        this._cancelRequested.complete();
        this._stateDetail = null; // clear the reference in case this might pin it
        super.dispose();
    }

    /**
     * Get the name of this part as it appeared in the factory.
     *
     * @remarks
     * Wrapper parts may override this and provide their own behavior.
     */
    public getName(): string {
        return this.constructor._FactoryName || this.constructor.name;
    }

    /** Handle Phosphor messages.
     *
     * #### Notes
     *
     * This function should not be called by user code.
     */
    public processMessage(msg: Message) {
        switch (msg.type) {
            case "before-initialize":
                this._isIdle = false;
                this.setState(Part.State.Initializing);
                return this.onBeforeInitialize(msg);
            case "after-initialize":
                this._isIdle = true;
                this._isInitialized = true;
                this.setState(Part.State.Idle);
                return this.onAfterInitialize(msg);
            case "before-render":
                this._isIdle = false;
                this.setState(Part.State.Rendering);
                return this.onBeforeRender(msg);
            case "after-render":
                this._isIdle = true;
                this.setState(Part.State.Idle);
                return this.onAfterRender(msg);
            case "before-calculate":
                this._isIdle = false;
                this.setState(Part.State.Calculating, []);
                return this.onBeforeCalculate(msg);
            case "after-calculate":
                this._isIdle = true;
                this.setState(Part.State.Idle);
                return this.onAfterCalculate(msg);
            case "before-option-calc":
                const opts = msg as Part.Lifecycle.CalculatingMessage;
                if (this.state !== Part.State.Calculating) {
                    // don't stomp error details
                    this._stateDetail = [...opts.options];
                    this.layout.addWidget(this.overlay);
                    this.overlay.update();
                } else {
                    (this._stateDetail as string[]).push(...opts.options);
                    this.layout.addWidget(this.overlay);
                    this.overlay.update();
                }
                return this.onOptionCalculating(opts);
            case "after-option-calc":
                const evaledOpts = msg as Part.Lifecycle.CalculatingMessage;
                const detail = this.stateDetail as string[];
                if (this.state !== Part.State.Calculating) {
                    // bail out early
                    return this.onOptionCalculated(evaledOpts);
                }
                const items = new Set(evaledOpts.options);
                const newDetail = [];
                for (let i = 0; i < detail.length; i++) {
                    if (!items.has(detail[i])) {
                        newDetail.push(detail[i]);
                        continue;
                    }
                    items.delete(detail[i]);
                }
                this._stateDetail = newDetail;
                this.layout.addWidget(this.overlay);
                this.overlay.update();
                return this.onOptionCalculated(evaledOpts);
            case "init-error":
            case "render-error":
            case "option-error":
                this._isIdle = true;
                const err = msg as Part.Lifecycle.ErrorMessage;
                this.setState(Part.State.Error, err.errorDetail);
                return this.onError(err);
            case "cancel":
                this._isIdle = true;
                this.setState(Part.State.Canceled);
                return this.onCancel(msg);
            case "wait-for-user":
                this._isIdle = true;
                this.setState(Part.State.WaitForUser);
                return;
            default:
                super.processMessage(msg);
        }
    }

    /** Convenience for sending an error message to this part */
    public error(
        detail: any,
        type: "init-error" | "render-error" | "option-error"
    ) {
        const msg = new Part.Lifecycle.ErrorMessage(detail, type);
        MessageLoop.sendMessage(this, msg);
    }

    /** Convenience for sending option calculation updates to this part */
    public optionCalculating(
        type: "before-option-calc" | "after-option-calc",
        optionOrOptions: Iterable<string> | string
    ) {
        const options = typeof optionOrOptions === "string" ? [optionOrOptions] : optionOrOptions;
        const msg = new Part.Lifecycle.CalculatingMessage(type, new Set(options));
        MessageLoop.sendMessage(this, msg);
    }

    /** This part is about to initialize.
     *
     * #### Notes
     *
     * The default implementation of this function is a no-op
     */
    protected onBeforeInitialize(msg: Message) { }

    /** This part initialized successfully, and is now idle.
     *
     * #### Notes
     *
     * The default implementation of this function is a no-op
     */
    protected onAfterInitialize(msg: Message) { }

    /** This part is about to render.
     *
     * #### Notes
     *
     * The default implementation of this function is a no-op
     */
    protected onBeforeRender(msg: Message) { }

    /** This part rendered successfully, and is now idle.
     *
     * #### Notes
     *
     * The default implementation of this function is a no-op
     */
    protected onAfterRender(msg: Message) { }

    /** The framework is about to calculate this part's options
     *
     * #### Notes
     *
     * The default implementation of this function is a no-op
     */
    protected onBeforeCalculate(msg: Message) { }

    /** The framework has successfully calculated all this part's options.
     *
     * #### Notes
     *
     * The default implementation of this function is a no-op
     */
    protected onAfterCalculate(msg: Message) { }

    /** An error occurred while this part was being evaluated.
     *
     * The message can be investigated for more detail, such as when the error
     * occurred or any detail provided with the error (such as a stack trace)
     *
     * #### Notes
     *
     * The default implementation of this function is a no-op
     */
    protected onError(msg: Part.Lifecycle.ErrorMessage) { }

    /**
     * The part's option evaluations have been canceled.
     *
     * #### Notes
     *
     * The default implementation of this function is a no-op
     */
    protected onCancel(msg: Message) { }

    /** An option, or set of options, is now calculating.
     *
     * #### Notes
     *
     * The default implementation of this function is a no-op
     */
    protected onOptionCalculating(msg: Part.Lifecycle.CalculatingMessage) { }

    /** An option, or set of options, has finished calculating
     *
     * #### Notes
     *
     * The default implementation of this function is a no-op. If an option
     * errored out, it will be included in this message.
     */
    protected onOptionCalculated(msg: Part.Lifecycle.CalculatingMessage) { }

    /**
     * Set the state of this part, and display the overlay if appropriate
     */
    private setState(newState: Part.State, detail?: unknown) {
        this._state = newState;
        this._stateDetail = detail;
        // move overlay to the front
        this.layout.addWidget(this.overlay);
        this.overlay.update();
    }
}

export namespace Part {
    /** Phosphor messages relating to a part's lifecycle
     *
     * These messages are sent by the framework, and reflect various points in
     * it's execution.
     */
    export namespace Lifecycle {
        /** The framework is about to initialize this part */
        export const BeforeInitialize = new Message("before-initialize");
        /** This part initialized successfully, and is now idle */
        export const AfterInitialize = new Message("after-initialize");

        /** The framework is about to render this part */
        export const BeforeRender = new Message("before-render");
        /** This part was successfully rendered, and is now idle */
        export const AfterRender = new Message("after-render");

        /** The framework is about to begin calculating this part's options */
        export const BeforeCalculate = new Message("before-calculate");
        /** The framework has successfully calculated this part's options */
        export const AfterCalculate = new Message("after-calculate");

        export const Cancel = new Message("cancel");

        export const WaitForUser = new Message("wait-for-user");

        /** A message class that wraps an execution error.
         *
         * #### Notes
         *
         * These are sent by the framework, and include extra detail about the
         * error and when it occurred.
         */
        export class ErrorMessage extends Message {
            public static IsErrorMsg(msg: Message): msg is ErrorMessage {
                return [
                    "init-error",
                    "render-error",
                    "option-error"
                ].indexOf(msg.type) !== -1;
            }

            public errorDetail: any;

            constructor(errorDetail: any, type: "init-error" | "render-error" | "option-error") {
                super(type);
                if (!(errorDetail instanceof Error)) {
                    errorDetail = new Error(errorDetail);
                    errorDetail.message = "Wrapped" + errorDetail.message;
                }
                let msg = "";
                switch (type) {
                    case "init-error":
                        msg = "Error in Initialization";
                        break;
                    case "option-error":
                        msg = "Error in Option Evaluation";
                        break;
                    case "render-error":
                        msg = "Error in Rendering";
                        break;
                }
                errorDetail.message = `${msg}: ${errorDetail.message}`;
                this.errorDetail = errorDetail;
            }
        }

        /** A message sent when options are evaluating.
         *
         * #### Notes
         *
         * The messages contain state info about what options are being
         * evaluated, or have finished evaluating.
         */
        export class CalculatingMessage extends Message {
            public static IsCalcMsg(msg: Message): msg is CalculatingMessage {
                return msg.type === "before-option-calc" || msg.type === "after-option-calc";
            }

            public get isConflatable() { return true; }
            public options: Set<string>;

            constructor(type: "before-option-calc" | "after-option-calc", options: Set<string>) {
                super(type);
                this.options = options;
            }

            /** Conflate this message with another OptionEvalMessage
             *
             * #### Notes
             *
             * User code should not call this function!
             *
             * This means that any Option Eval Messages delivered synchronously
             * within the same loop will be *conflated* with one another- that
             * is, their state will be merged and only a single message will be
             * delivered to the widget.
             */
            conflate(other: Message) {
                if (!CalculatingMessage.IsCalcMsg(other)) {
                    return false;
                }
                if (other.type !== this.type) {
                    return false;
                }
                for (const value of other.options) {
                    this.options.add(value);
                }
                return true;
            }
        }
    }
    export class Overlay extends ReactWrapperWidget {
        private owner: Part;

        constructor(owner: Part) {
            super();
            this.addClass("m-PartOverlay");
            this.addClass("load");
            this.owner = owner;
        }

        /** Test if the overlays should be shown right now. */
        protected shouldShowRegion() {
            if (this.owner.state === State.Idle) {
                return false;
            }
            //Override the overlays settings when errored, canceled or waiting for user.
            let showRegion = !this.owner.hasClass("m-hide-part-overlays");
            if (!showRegion &&
                this.owner.state !== State.Error &&
                this.owner.state !== State.WaitForUser &&
                this.owner.state !== State.Canceled) {
                return false;
            }
            return true;
        }

        protected render() {
            if (!this.shouldShowRegion()) {
                this.hide();
                return React.createElement("div");
            }
            const partState = State[this.owner.state];
            const partStateDetail = this.owner.stateDetail;
            this.show();
            return React.createElement(PartOverlay, {
                key: "overlay",
                partState,
                partStateDetail,
                onRequestRefresh: () => this.owner.userRefresh(),
                onRequestCancel: () => this.owner.cancel()
            });
        }
    }

    export interface IOptions {
        services: PartServices;
        uuid?: string;
    }

    export interface IPartOptionMetadata {
        description?: string;
        /** An optional JSON schema to enhance editing experience with. */
        schema?: JSONObject;
    }

    export class PartMetadata implements Iterable<OptionsBag.PartOption & IPartOptionMetadata> {
        public description?: string;
        public remarks?: string;

        private options = new Map<string, OptionsBag.PartOption & IPartOptionMetadata>();

        /**
         * Describe a new option for this part.
         * @param name The name of the option, as a string.
         * @param type The type of the option, which will be used for serialization and type checking
         * @param value The default value. New instances of the part will have their options set to defaults.
         * @param metadata Metadata about this option, such as a short description of what it does
         *
         * > #### A note on types and schema
         * >
         * > Types and schema are not currently validated in the framework,
         * > except to provide additional UI features in editors. Providing a
         * > type will not guarantee that all values match that type, it will
         * > merely document that the option _should_ be a particular type and
         * > make the Part Properties dialog show a more appropriate type editor.
         * >
         * > In a similar vein, providing an 'enum' schema for a String option
         * > will make the Part Properties dialog show a dropdown with each enum
         * > value, instead of the usual string editor.
         * >
         * > At some point in the future, we will be tightening up the Type
         * > annotations system and hope to offer this guarantee to parts.
         */
        public addOption(
            name: string,
            type: Type,
            value: unknown,
            metadata: IPartOptionMetadata = {}
        ) {
            this.options.set(name, {
                name,
                type,
                value,
                ...metadata,
            });
        }

        [Symbol.iterator](): Iterator<OptionsBag.PartOption & IPartOptionMetadata> {
            return this.options.values();
        }

        public getMetadataForOption(name: string) {
            return this.options.get(name);
        }
    }

    export enum State {
        /** Part has not yet been run. */
        Uninitialized,
        /** Part is currently initializing or setting up, and isn't yet ready to
         * display anything */
        Initializing,
        /** Part is currently calcuating the values of it's options */
        Calculating,
        /** Part is currently rendering a new view, and may not be viewable */
        Rendering,
        /** Part has fully initialized/rendered, and is not calculating anything
         * or waiting on other calculations. */
        Idle,
        /** An error has prevented the part from functioning correctly, possibly
         * requiring user intervention */
        Error,
        /** Part option evaluation has been canceled. */
        Canceled,
        /** Part is waiting for the user to refresh the part before calculating inputs */
        WaitForUser
    }
}
