import { Widget, BoxLayout, BoxPanel, Layout } from "@phosphor/widgets";
import { UUID, PromiseDelegate } from "@phosphor/coreutils";
import { MessageLoop, Message } from "@phosphor/messaging";
import { FrameTools, MathTools } from "@mavenomics/coreutils";
import { ReactWrapperWidget } from "./reactwidget";
import { Interactions } from "./widgets/interactionwidgets";
import { first } from "rxjs/operators";

/**
 * Manages hovers, tooltips, popups, and what-nots.
 *
 * DO NOT instantiate this class directly- only one may be active at any given time.
 */
export class HoverManager extends Widget {
    public static Instance: HoverManager | undefined;

    public static GetManager() {
        return this.Instance || new HoverManager();
    }

    private hovers = new Map<string, HoverManager.HoverWrapper>();

    protected constructor() {
        super();
        if (HoverManager.Instance != null) {
            this.dispose(); // immediately throw everything away
            throw Error("Cannot instantiate multiple HoverManagers!");
        }
        HoverManager.Instance = this;
        this.addClass("m-HoverManager");
        window.addEventListener("beforeunload", () => {
            for (const hover of this.hovers.values()) {
                hover.dispose();
            }
        });
    }

    public openDialog(
        {
            hover,
            owner,
            width,
            height
        }: Pick<HoverManager.OpenHoverOptions, "hover" | "owner" | "width" | "height">
    ) {
        return this.openHover({
            hover,
            owner,
            x: 0,
            y: 0,
            width,
            height,
            mode: "dialog"
        });
    }

    public openErrorDialog(
        error: any,
        raw = false
    ) {
        const errStack = (raw || error instanceof Error) ? error : new Error(error);
        let stack: Widget;
        if (raw) {
            stack = new Widget();
            stack.node.innerHTML = errStack;
        } else {
            stack = new Widget({node: document.createElement("pre")});
            stack.node.innerText = raw ? ("" + errStack) : (errStack.stack || errStack.message);
            stack.node.style.overflow = "auto";
            stack.node.style.margin = "0";
        }
        return this.openDialog({
            hover: new HoverManager.DialogWithButtons(stack, [{text: "Dismiss"}]),
            owner: this,
            height: 400,
            width: 800
        });
    }

    /** An error dialog with optional error details hidden in a disclosure element.
     *
     * Use this for errors that have a known cause and don't need to expose
     * details about the stack trace.
     */
    public openErrorMsgDialog(
        msg: string,
        error?: any,
        raw = false
    ) {
        const dialog = new Widget();
        dialog.node.innerHTML = msg;

        if (error != null) {
            const errStack = (raw || error instanceof Error) ? error : new Error(error);
            const stack = document.createElement("pre");
            if (raw) {
                stack.innerHTML = errStack;
            } else {
                stack.innerText = raw ? ("" + errStack) : (errStack.stack || errStack.message);
                stack.style.overflow = "auto";
                stack.style.margin = "0";
            }
            const details = document.createElement("details");
            details.appendChild(stack);
            const summary = document.createElement("summary");
            summary.innerText = "Error Details";
            details.appendChild(summary);
            dialog.node.appendChild(details);
        }

        const hover = new HoverManager.DialogWithButtons(dialog, [{text: "Dismiss"}]);
        hover.title.label = "Error";
        return this.openDialog({
            hover,
            owner: this,
            height: 400,
            width: 800
        });
    }

    public async launchDialog<T>(
        dialog: HoverManager.IWidgetWithValue<T>,
        owner: Widget,
        width: number,
        height: number,
        title: string,
        buttons: HoverManager.IButton[] = []
    ): Promise<HoverManager.IDialogResults<T>> {
        const hover = new HoverManager.DialogWithButtons(dialog, buttons);
        hover.title.label = title;
        const vm = this.openDialog({ hover, owner, width, height });
        await vm.onClosed;
        return {
            accept: hover.accept || false,
            clicked: hover.clicked || "",
            result: hover.result
        };
    }

    public async launchEditorDialog<T>(
        dialog: HoverManager.IWidgetWithValue<T>,
        owner: Widget,
        width: number,
        height: number,
        title: string,
        onApply: (this: void, arg: T) => void,
    ): Promise<HoverManager.IDialogResults<T>> {
        const hover = new HoverManager.EditorDialog(dialog, onApply);
        hover.title.label = title;
        const vm = this.openDialog({ hover, owner, width, height });
        await vm.onClosed;
        return {
            accept: hover.accept || false,
            clicked: hover.clicked || "",
            result: hover.result
        };
    }

    /**
     * Opens a new hover, returning a viewmodel that can be used to reference the hover and manipulate it.
     * @param hover The widget instance to turn into a hover
     * @param owner A widget that will "own" the hover. If the owner is disposed, so will the hover. Additionally,
     * tooltip hovers cannot leave the bounds of the owner and will close on owner mouseleave
     */
    public openHover({hover, owner, ...options}: HoverManager.OpenHoverOptions) {
        const id = UUID.uuid4();
        const onClose = new PromiseDelegate<void>();
        const vm = new HoverManager.HoverViewModel(id, onClose.promise);
        if (options.offsetMode === "relative") {
            let ownerOffset = owner.node.getBoundingClientRect();
            options.x = options.x + ownerOffset.left;
            options.y = options.y + ownerOffset.top;
        }
        owner.disposed.connect(() => {
            this._handleOwnerDisposed(id);
        });
        hover.disposed.connect(() => {
            this._handleOwnerDisposed(id);
        });
        const wrapper = HoverManager.HoverWrapperFactory(hover, owner, options.mode || "hover", {
            x: options.x || 0,
            y: options.y || 0,
            width: options.width || 300,
            height: options.height || 300
        });
        wrapper.disposed.connect(() => {
            onClose.resolve();
        });
        if (options.mode === "popup") {
            const features = [
                "left=" + options.x,
                "top=" + options.y,
                "width=" + options.width,
                "height=" + options.height
            ].join(",");
            let childWindow = window.open("about:blank", id, features);
            // write to the window asynchronously, on the next tick. This is a
            // bug in firefox, that (as best as I can tell) might be related to
            // the following bugs:
            // https://bugzilla.mozilla.org/show_bug.cgi?id=347079
            // https://bugzilla.mozilla.org/show_bug.cgi?id=656234
            // Essentially, by waiting 16ms, we're giving the popup blocker time
            // to finish setting up the document (otherwise it's going to give
            // us a fake document to write into- this behavior is apparently
            // undocumented, as I can't find any reference to it on MDN.).
            setTimeout(() => {
                this.writeToPopup(childWindow, wrapper, id, owner, options.cloneEvents);
            }, 0);
        } else {
            Widget.attach(wrapper, this.node);
        }
        this.hovers.set(id, wrapper);
        return vm;
    }

    public resizeHover(hover: HoverManager.HoverViewModel | string, width: number, height: number): Widget {
        const key = this.getKey(hover);
        const hoverInst = this.hovers.get(key)!;
        hoverInst.data.width = width;
        hoverInst.data.height = height;
        MessageLoop.sendMessage(hoverInst, Widget.Msg.UpdateRequest);
        return hoverInst;
    }

    /**
     * Sends a close-request to the hover, and then removes it from the window.
     * If options.disposeAtClose is true (default), the manager will also dispose the widget.
     * @param hover A key to reference the hover that should be closed.
     * @param options Optional parameters
     * @returns The widget that was hovered
     * @see open
     */
    public closeHover(hover: HoverManager.HoverViewModel | string,
            {
                disposeAtExit
            }: HoverManager.CloseHoverOptions = {
                disposeAtExit: true
            }): Widget {
        const key = this.getKey(hover);
        const hoverInst = this.hovers.get(key)!;
        if (disposeAtExit) {
            // will also close the widget
            hoverInst.dispose();
        } else if (hoverInst.isAttached) {
            hoverInst.close();
        }
        return hoverInst;
    }

    public dispose() {
        if (this.isDisposed) {
            return;
        }
        for (const hover of this.hovers.values()) {
            hover.dispose();
        }
        super.dispose();
    }

    public closeAllHovers() {
        for (const hover of this.hovers.values()) {
            hover.dispose();
        }
    }

    private writeToPopup(
        childWindow: Window | null,
        wrapper: Widget,
        id: string,
        owner: Widget,
        cloneEvents?: boolean
    ) {
        // if window.open returns null, that means the window didn't open properly according to MDN
        // cf. https://developer.mozilla.org/en-US/docs/Web/API/Window/open
        if (childWindow == null) {
            throw Error("Window did not open as expected, cannot continue");
        }
        // copy the title so that "about:blank" doesn't show up
        childWindow.window.document.title = wrapper.title.label || "MavenWorks";
        // set the favicon to the mavenworks M
        // TODO: Branding: Better icon
        const icon = childWindow.document.createElement("link");
        icon.rel = "icon";
        // tslint:disable-next-line
        icon.href = "data:image/png;base64,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";
        childWindow.document.head.appendChild(icon);
        // copy css rules so that things looks less "off"
        FrameTools.copyStylesheets(document, childWindow.document);

        // Adopt the node from this document into the popup document
        MessageLoop.sendMessage(wrapper, ReactWrapperWidget.BeforeChangeDocumentOwner);
        const newNode = childWindow.document.adoptNode(wrapper.node);
        // force the wrapper node to be the newly adopted node
        (wrapper as any).node = newNode;
        MessageLoop.sendMessage(wrapper, ReactWrapperWidget.AfterChangeDocumentOwner);

        // Normally we'd do Widget.attach, but that method includes a check to see if the host
        // is a child of the document body. That is obviously wrong in the case of popups, so
        // we do the attachment ourselves.
        MessageLoop.sendMessage(wrapper, Widget.Msg.BeforeAttach);
        childWindow.document.body.appendChild(newNode);
        childWindow.addEventListener("beforeunload", () => {
            // we may not catch this event, but if we do, dispose the widget
            // TODO: Some other, backup way of checking for this (such as an interval check)
            // Because the wrapper doesn't live on the main DOM, we need to detatch it ourselves
            MessageLoop.sendMessage(wrapper, Widget.Msg.BeforeDetach);
            if (childWindow != null) {
                childWindow.document.body.removeChild(wrapper.node);
            }
            MessageLoop.sendMessage(wrapper, Widget.Msg.AfterDetach);
            this._handleOwnerDisposed(id);
        });
        childWindow.addEventListener("resize", () => {
            wrapper.update();
        });
        const handler = cloneEvents ? FrameTools.bubbleEvents(childWindow.document!, owner.node) : null;
        wrapper.disposed.connect(() => {
            // close the window on disposal
            if (handler != null) {
                handler.dispose();
            }
            if (childWindow != null) {
                childWindow.close();
            }
        });
        MessageLoop.sendMessage(wrapper, Widget.Msg.AfterAttach);
    }

    private _handleOwnerDisposed(id: string) {
        if (!this.hovers.has(id)) {
            // this has already been taken care of
            return;
        }
        const hover = this.hovers.get(id)!;
        hover.dispose();
    }

    private getKey(hover: HoverManager.HoverViewModel | string): string {
        const key = typeof hover === "string" ? hover : hover.id;
        if (!this.hovers.has(key)) {
            throw Error("Hover does not exist");
        }
        return key;
    }
}

export namespace HoverManager {
    export class HoverViewModel {
        constructor(
            public readonly id: string,
            public readonly onClosed: Promise<void>
        ) {}
    }

    export interface CloseHoverOptions {
        disposeAtExit: boolean;
    }

    export interface OpenHoverOptions {
        /**
         * The widget that owns the hover. The hover will be closed and disposed if the owner is disposed.
         */
        owner: Widget;
        /**
         * The widget to hover
         */
        hover: Widget;
        /**
         * X-coordinate, in pixels from the left of the screen, that the hover will appear at.
         */
        x: number;
        /**
         * Y-coordinate, in pixels from the top of the screen, that the hover will appear at.
         */
        y: number;
        /**
         * The width of the hover, in screen pixels.
         */
        width: number;
        /**
         * The height of the hover, in screen pixels.
         */
        height: number;
        /**
         * How the hover will appear.
         * In "hover" mode, the hover wil be stationary at the place it was created.
         * In "tooltip" mode, the hover will follow the mouse until the mouse leaves the bounding rect of the owner.
         * When that happens, the hover will be closed automatically.
         * In "popup" mode, the hover will appear in a new browser window. There are important caveats to this that
         * developers should be aware of, refer to the documentation for "popHover".
         * In "dialog" mode, the hover will appear as a draggable/resizable dialog.
         */
        mode: "hover" | "tooltip" | "popup" | "dialog";
        /**
         * Whether the coordinates given by `x` and `y` are absolute (eg, with respect to the window)
         * or relative with respect to the owner.
         *
         * Default: absolute
         */
        offsetMode?: "relative" | "absolute";
        /**
         * For the "popup" mode, whether to clone events from the popup to the parent.
         *
         * Event cloning is a utility to keep things 'mostly' working, but can
         * introduce perplexing bugs in components that weren't designed for the
         * additional caveats that cloned events can bring. Setting this to
         * 'false' may result in users not being able to interact as they might
         * expect to, but it would keep these problematic components functional.
         *
         * Default: true
         */
        cloneEvents?: boolean;
    }

    export interface IWidgetWithValue<T = any> extends Widget {
        getValue?(): T;
    }

    export interface IDialogResults<T = any> {
        /**
         * Whether the dialog was 'accepted' by the user.
         * @see IButton
         */
        accept: boolean;
        /**
         * The result of the dialog, if it was 'accepted' and the dialog
         * implemented a `getValue` function.
         * @see IWidgetWithValue
         */
        result?: T;
        /** The label of the button that was clicked. */
        clicked: string;
    }

    /** Interface for declaring a button in `HoverManager#launchDialog`. */
    export interface IButton {
        /** The text label to display for this button */
        text: string;
        /** Whether this button should 'accept' the results of a dialog.
         * If false, this will dismiss the dialog without returning the value.
         *
         * @default false
         */
        accept?: boolean;
        /** Whether this button should be displayed in red.
         *
         * Use this for destructive actions that can't be undone, such as
         * reverting unsaved changes.
         *
         * @default false
         */
        warn?: boolean;
    }

    function buttonWithDefaults(btn: IButton) {
        return Object.assign({}, {
            accept: false,
            warn: false
        }, btn) as Required<IButton>;
    }

    export class DialogWithButtons<T> extends Widget {
        public readonly layout: BoxLayout;
        protected _accept?: boolean;
        protected _result?: T;
        protected _clicked?: string;
        protected btnBar: BoxPanel;

        constructor(
            protected hover: IWidgetWithValue<T>,
            protected buttons: IButton[]
        ) {
            super();
            this.layout = new BoxLayout();
            this.layout.direction = "top-to-bottom";
            BoxLayout.setStretch(hover, 1);
            this.layout.addWidget(hover);
            this.btnBar = new BoxPanel({
                direction: "right-to-left",
            });
            this.setupButtons();
            Layout.setHorizontalAlignment(this.btnBar, "right");
            BoxLayout.setSizeBasis(this.btnBar, 50);
            this.layout.addWidget(this.btnBar);
        }

        public get accept() { return this._accept; }
        public get clicked() { return this._clicked; }
        public get result() { return this._result; }

        protected onCloseRequest() {
            if (this._accept && this.hover.getValue) {
                this._result = this.hover.getValue();
            }
            this.dispose();
        }

        protected setupButtons() {
            for (const button of this.buttons.reverse()) {
                const btn = new Interactions.Button();
                btn.addClass("m-Dialog-Btn");
                btn.dataset["type"] = button.warn ? "warn" : (button.accept ? "accept" : "neutral");
                btn.label = button.text.toLocaleUpperCase();
                btn.node.style.maxWidth = "100px";
                this.setupButton(btn, button);
                this.btnBar.addWidget(btn);
            }
        }

        protected setupButton(btn: Interactions.Button, btnModel: IButton) {
            btn.onClicked.pipe(first()).toPromise().then(() => {
                this._clicked = btnModel.text;
                this._accept = btnModel.accept != null ? btnModel.accept : false;
                this.close();
            });
        }
    }

    export class EditorDialog<T> extends DialogWithButtons<T> {
        private onApplyCallback: (this: void, arg: T) => void;
        constructor(
            hover: IWidgetWithValue<T>,
            onApply: (this: void, arg: T) => void
        ) {
            super(hover, [
                { text: "OK", accept: true },
                { text: "Dismiss" },
                { text: "Apply", accept: true },
            ]);
            this.onApplyCallback = onApply;
        }

        protected setupButton(btn: Interactions.Button, btnModel: IButton) {
            if (btnModel.text === "Apply" || btnModel.text === "OK") {
                btn.onClicked.subscribe(() => {
                    let value: T;
                    try {
                        value = this.hover.getValue ? this.hover.getValue!() : undefined as any as T;
                    } catch (err) {
                        console.error("Uncaught error in Editor Dialog calling getValue:");
                        console.error(err);
                        return;
                    }
                    this.onApplyCallback.call(void 0, value);
                    if (btnModel.text === "OK") this.close();
                });
            } else {
                super.setupButton(btn, btnModel);
            }
        }
    }

    export function HoverWrapperFactory(
        toWrap: Widget,
        owner: Widget,
        mode: HoverManager.OpenHoverOptions["mode"],
        data: {x: number, y: number, width: number, height: number}
    ): HoverWrapper {
        switch (mode) {
            case "tooltip":
                return new TooltipHover(toWrap, owner, data);
            case "popup":
                return new PopupHover(toWrap, owner, data);
            case "dialog":
                return new DialogHover(toWrap, owner, data);
            default:
                return new HoverWrapper(toWrap, owner, mode, data);
        }
    }

    /**
     * Internal class that wraps a widget inside a movable container in screen space.
     * Do not use this widget directly.
     */
    export class HoverWrapper extends Widget {
        public readonly owner: Widget;
        public readonly layout: BoxLayout;
        public readonly mode: HoverManager.OpenHoverOptions["mode"];
        public data: {
            x: number,
            y: number,
            width: number,
            height: number
        };
        private readonly widget: Widget;

        constructor(toWrap: Widget,
                owner: Widget,
                mode: HoverManager.OpenHoverOptions["mode"],
                data: {x: number, y: number, width: number, height: number}) {
            super();
            this.owner = owner;
            this.layout = new BoxLayout();
            this.widget = toWrap;
            this.layout.addWidget(this.widget);
            this.addClass("m-Hover");
            this.data = data;
            this.mode = mode;
            this.dataset["mode"] = this.mode;
            this.title.label = toWrap.title.label;
            this.update();
        }

        public dispose() {
            if (this.isDisposed) {
                return;
            }
            super.dispose();
        }

        public processMessage(msg: Message) {
            switch (msg.type) {
                case "before-change-doc-owner":
                case "after-change-doc-owner":
                    MessageLoop.sendMessage(this.widget, msg);
                    break;
                default:
                    super.processMessage(msg);
            }
        }

        protected onUpdateRequest() {
            this.updatePosition();
        }

        protected updatePosition() {
            Object.assign(this.node.style, {
                "left": `${this.data.x}px`,
                "top": `${this.data.y}px`,
                "width": `${this.data.width}px`,
                "height": `${this.data.height}px`
            });
        }
    }

    class TooltipHover extends HoverWrapper {
        constructor(toWrap: Widget,
            owner: Widget,
            data: {x: number, y: number, width: number, height: number}
        ) {
            super(toWrap, owner, "tooltip", data);
            this.node.style.pointerEvents = "none";
            document.body.addEventListener("mousemove", this);
            this.owner.node.addEventListener("mouseleave", this);
        }

        public handleEvent(ev: MouseEvent) {
            switch (ev.type) {
                case "mousemove":
                    this.data = {
                        ...this.data,
                        x: ev.pageX + 10,
                        y: ev.pageY + 10
                    };
                    MessageLoop.sendMessage(this, Widget.Msg.UpdateRequest);
                    return;
                case "mouseleave":
                    this.dispose();
                    return;
                default:
                    console.trace("Unhandled event", ev.type);
                    return;
            }
        }

        public dispose() {
            if (this.isDisposed) return;
            document.body.removeEventListener("mousemove", this);
            this.owner.node.removeEventListener("mouseleave", this);
            super.dispose();
        }
    }

    class PopupHover extends HoverWrapper {
        constructor(toWrap: Widget,
            owner: Widget,
            data: {x: number, y: number, width: number, height: number}
        ) {
            super(toWrap, owner, "popup", data);
            this.data.x = 0;
            this.data.y = 0;
        }

        protected updatePosition() {
            Object.assign(this.node.style, {
                left: 0,
                right: 0,
                top: 0,
                bottom: 0
            });
        }
    }

    /** The last position of a dialog that was interacted with. */
    let LAST_POSITION: {x: number, y: number} | null = null;
    /** The # of pixels that any new dialog should be offset by. */
    const OFFSET = 25;

    /**
     * Given a dialog position, return a new position clamped to screen space.
     *
     * This ensures that at least an OFFSET x OFFSET square of the titlebar is
     * visible on-screen. This ensures that it is always grabbable by the user.
     *
     * It also ensures that the titlebar never spawns outside the window, as
     * might happen with a very short window, a tall dialog, and the open-in
     * center heuristic.
     *
     * @param position The requested start position of the dialog.
     * @returns The corrected position to use.
     */
    function clampToScreen(
        position: {x: number, y: number}
    ): {x: number, y: number} {
        const maxX = window.innerWidth - OFFSET;
        const maxY = window.innerHeight - OFFSET;
        const {x, y} = position;
        return {
            x: MathTools.Clamp(x, 0, maxX),
            y: MathTools.Clamp(y, 0, maxY)
        };
    }

    /** Helper to calculate the initial spawn position of a dialog */
    function getInitialSpawnPosition(
        data: { width: number, height: number }
    ): {x: number, y: number} {
        let newPosition: typeof LAST_POSITION;
        if (LAST_POSITION == null) {
            const x = window.innerWidth / 2 - data.width / 2;
            const y = window.innerHeight / 2 - data.height / 2;
            newPosition = {x, y};
        } else {
            newPosition = {
                x: LAST_POSITION.x + OFFSET,
                y: LAST_POSITION.y + OFFSET
            };
        }
        LAST_POSITION = clampToScreen(newPosition);
        return LAST_POSITION;
    }

    class DialogHover extends HoverWrapper {
        private static Z_INDEX = 1;
        constructor(toWrap: Widget,
            owner: Widget,
            data: {x: number, y: number, width: number, height: number}
        ) {
            super(toWrap, owner, "dialog", data);
            toWrap.node.style.padding = "5px";
            this.node.style.zIndex = "" + (++DialogHover.Z_INDEX);
            const spawn = getInitialSpawnPosition(data);
            this.data.x = spawn.x;
            this.data.y = spawn.y;
            const titlebar = new DialogTitlebar(this, toWrap.title.label);
            BoxLayout.setStretch(titlebar, 0);
            BoxLayout.setSizeBasis(titlebar, 25);
            BoxLayout.setStretch(toWrap, 1);
            this.layout.insertWidget(0, titlebar);
            const grippy = new Interactions.ResizerGrippy(this, document.body);
            grippy.onSizeChange.subscribe(([x, y, width, height]) => {
                this.data.width = width;
                this.data.height = height;
                this.update();
            });
            MessageLoop.sendMessage(grippy, Widget.Msg.BeforeAttach);
            this.node.appendChild(grippy.node);
            MessageLoop.sendMessage(grippy, Widget.Msg.AfterAttach);
        }

        protected onActivateRequest() {
            if (this.node.style.zIndex !== "" + DialogHover.Z_INDEX) {
                this.node.style.zIndex = "" + (++DialogHover.Z_INDEX);
                LAST_POSITION = {
                    x: this.data.x,
                    y: this.data.y
                };
            }
        }
    }

    class DialogTitlebar extends Widget {
        public readonly layout: BoxLayout;
        private label = new Widget({node: document.createElement("span")});
        private btn = new Interactions.Button();
        private offset: MathTools.Vec2 = [0, 0];
        private startPos: MathTools.Vec2 = [0, 0];

        constructor(private owner: DialogHover, label: string) {
            super();
            this.addClass("m-Dialog-titlebar");
            this.layout = new BoxLayout({direction: "left-to-right"});
            this.label.node.textContent = label;
            this.btn.className = "fa fa-times";
            BoxLayout.setStretch(this.label, 1);
            BoxLayout.setStretch(this.btn, 0);
            BoxLayout.setSizeBasis(this.btn, 25);
            this.layout.addWidget(this.label);
            this.layout.addWidget(this.btn);
            this.btn.onClicked.subscribe(() => owner.dispose());
        }

        public handleEvent(ev: Event) {
            switch (ev.type) {
                case "pointerdown":
                    this.owner.activate();
                    this.startDrag(ev as PointerEvent);
                    break;
                case "pointermove":
                    this.onMouseMove(ev as PointerEvent);
                    break;
                case "pointerup":
                    this.endDrag();
                    break;
                case "keydown":
                    if (
                        (ev as KeyboardEvent).key === "Escape"
                        && !this.owner.node.contains(ev.target as HTMLElement)
                    ) {
                        this.endDrag();
                    }
                    break;
            }
        }

        protected onAfterAttach() {
            this.node.addEventListener("pointerdown", this);
        }

        protected onBeforeDetach() {
            this.endDrag();
            this.node.removeEventListener("pointerdown", this);
        }
        private startDrag(ev: PointerEvent) {
            if (ev.pointerType === "mouse" && ev.button !== 0) {
                // this is not a left click, don't drag
                return;
            }
            if (ev.target !== this.node) {
                return; // This was on the button
            }
            FrameTools.DisableFramePointerEvents();
            this.offset = [ev.pageX, ev.pageY];
            this.startPos = [this.owner.data.x, this.owner.data.y];
            window.addEventListener("pointermove", this);
            window.addEventListener("pointerup", this);
            window.addEventListener("keydown", this);
        }

        private onMouseMove(ev: PointerEvent) {
            const mouseDelta = MathTools.Vec2.Sub([ev.pageX, ev.pageY], this.offset);
            const pos = MathTools.Vec2.Add(this.startPos, mouseDelta);
            const correctedPos = clampToScreen({
                x: pos[0],
                y: pos[1]
            });
            this.owner.data.x = correctedPos.x;
            this.owner.data.y = correctedPos.y;
            LAST_POSITION = correctedPos;
            this.owner.update();
        }

        private endDrag() {
            window.removeEventListener("pointermove", this);
            window.removeEventListener("pointerup", this);
            window.removeEventListener("keydown", this);
            FrameTools.EnableFramePointerEvents();
            this.offset = [0, 0];
            this.startPos = [0, 0];
        }
    }
}
