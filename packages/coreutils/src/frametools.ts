import { DisposableDelegate } from "@phosphor/disposable";

/**
 * A set of utility functions and helpers for IFrames
 */
export namespace FrameTools {
    const mouseEvents = [
        "mouseenter",
        "mouseover",
        "mousemove",
        "mousedown",
        "mouseup",
        "pointerdown",
        "pointerenter",
        "pointerdown",
        "pointermove",
        "pointerup",
        "pointercancel",
        "pointerout",
        "pointerleave",
        "gotpointercapture",
        "lostpointercapture",
        "auxclick",
        "click",
        "dblclick",
        "contextmenu",
        "wheel",
        "mouseleave",
        "mouseout",
        "select",
        "pointerlockchange",
        "pointerlockerror",
    ];

    const dragEvents = [
        "dragstart",
        "drag",
        "dragenter",
        "dragexit",
        "dragleave",
        "dragover",
        "drop",
        "dragend"
    ];

    const keyboardEvents = [
        "keydown",
        "keypress",
        "keyup"
    ];

    const focusEvents = [
        "focus",
        "blur",
        "focusin",
        "focusout",
    ];

    /**
     * Copy stylesheets and base-urls from one document to another.
     *
     * @param fromDocument The document to copy <link> and <style> nodes from.
     * Nodes can appear anywhere in the document.
     * @param toDocument The document to paste the new nodes into. Nodes will be
     * pasted into the document's <head>, even if they appeared elsewhere in the
     * fromDocument's DOM. However, the order they appeared in will be
     * preserved. Additional properties, such as SRI hashes, will _not_ be
     * copied.
     *
     * base-urls are needed for about:blank documents, as without them relative URLs won't work. The base url will be
     * defined in the toDocument via a <base> node: cf. https://developer.mozilla.org/en-US/docs/Web/HTML/Element/base
     */
    export function copyStylesheets(fromDocument: HTMLDocument, toDocument: HTMLDocument) {
        const query = fromDocument.querySelectorAll("style, link");
        const url = fromDocument.location!.href;
        const newBase = toDocument.createElement("base");
        newBase.href = url;
        toDocument.head!.appendChild(newBase);
        // NodeList's definitions in lib.dom.d.ts don't include values, even though those are present in the spec
        for (const child of (query as NodeListOf<HTMLElement> & {values(): Iterable<HTMLElement>}).values()) {
            if (child.tagName === "LINK" && (child as HTMLLinkElement).rel === "stylesheet") {
                const newLink = toDocument.createElement("link");
                newLink.rel = "stylesheet";
                newLink.type = (child as HTMLLinkElement).type;
                newLink.href = (child as HTMLLinkElement).href;
                toDocument.head!.appendChild(newLink);
            }
            if (child.tagName === "STYLE" && (child as HTMLStyleElement).type === "text/css") {
                const newStyle = toDocument.createElement("style");
                newStyle.innerHTML = child.innerHTML;
                toDocument.head!.appendChild(newStyle);
            }
        }
    }

    // accounts for shift in clientx/clienty in mouse events
    function getCorrectedPosition(ev: MouseEvent, ref: HTMLElement): {clientX: number, clientY: number} {
        const framePosition = ref.getBoundingClientRect();
        return {
            clientX: ev.clientX + framePosition.left,
            clientY: ev.clientY + framePosition.top
        };
    }

    // allows copying of all enumerable options, respecting prototypes
    function getAllPropertiesOfObject(obj: any) {
        const copiedArgs: {[key: string]: any, [index: number]: any} = {};
        let protoObj = obj;
        do {
            for (const property of Object.getOwnPropertyNames(protoObj)) {
                copiedArgs[property] = (obj)[property];
            }
        } while (protoObj = Object.getPrototypeOf(protoObj));
        return copiedArgs;
    }

    // Clone an event to `el`
    // The strange typing is because constructor types are contravariant, but we
    // want covariance. So we use functions, which are covariant in return types.
    function cloneEvent<T extends new(type: string, args: EventInit) => Event>(
        type: string,
        ctor: T,
        ev: InstanceType<T>,
        el: HTMLElement,
        correctForPosition = false
    ) {
        const eventArgs = Object.assign(
            {},
            getAllPropertiesOfObject(ev),
            correctForPosition ? getCorrectedPosition(ev as unknown as MouseEvent, el) : {}
        );
        const newEv = new ctor(type, eventArgs);
        const res = el.dispatchEvent(newEv);
        if (!res) {
            // this event was cancelled, cancel the frame's event as well (for consistency)
            ev.preventDefault();
            // We don't cancel events since at this point it already reached the <body> tag
        }
    }

    /**
     * Clone events from a given document to an HTMLElement on a different document.
     *
     * @param childDocument The document to capture events from
     * @param parentElement An HTML element to create new events on
     * @returns A disposable delegate that can be used to unhook the bubbling
     *
     * #### Notes
     *
     * This is used by the MavenWorks framework to clone events from popups and iframes
     * out to the parent window. There are a number of caveats, which are detailed
     * below.
     *
     * ##### Keyboard events
     *
     * Keyboard events are copied wholesale, using the original event as an event
     * init dict.
     *
     * Caveat: Keyboard events are not cloned if their target is the child
     * document's active element (meaning, it has focus).
     *
     * ##### Mouse events
     *
     * Mouse events have their clientX and clientY properties corrected to matcch
     * the parent document's positioning. No other properties are corrected in this
     * manner, though such corrections should be implemented if the need arises.
     *
     * ##### Drag events
     *
     * Drag events do not have their positions corrected, and do not include their
     * dataTransfer objects.
     *
     * ##### Focus events
     *
     * Focus events will *not* result in CSS focus being applied.
     */
    export function bubbleEvents(childDocument: HTMLDocument, parentElement: HTMLElement) {
        const handlers: Array<{ev: string, handler: EventListener}> = [];
        for (const ev of mouseEvents) {
            function handleMouseEvent(oldEv: MouseEvent) {
                cloneEvent(ev, MouseEvent, oldEv, parentElement, true);
            }
            childDocument!.addEventListener(ev, handleMouseEvent as EventListener);
            handlers.push({ev, handler: handleMouseEvent as EventListener});
        }

        for (const ev of dragEvents) {
            function handleDragEvent(oldEv: DragEvent) {
                cloneEvent(ev, DragEvent, oldEv, parentElement, true);
            }
            childDocument!.addEventListener(ev, handleDragEvent as EventListener);
            handlers.push({ev, handler: handleDragEvent as EventListener});
        }

        for (const ev of keyboardEvents) {
            function handleKeyboardEvent(oldEv: KeyboardEvent) {
                cloneEvent(ev, KeyboardEvent, oldEv, parentElement);
            }
            childDocument!.addEventListener(ev, handleKeyboardEvent as EventListener);
            handlers.push({ev, handler: handleKeyboardEvent as EventListener});
        }

        for (const ev of focusEvents) {
            function handleFocusEvent(oldEv: FocusEvent) {
                cloneEvent(ev, FocusEvent, oldEv, parentElement);
            }
            childDocument!.addEventListener(ev, handleFocusEvent as EventListener);
            handlers.push({ev, handler: handleFocusEvent as EventListener});
        }

        return new DisposableDelegate(() => {
            for (const fn of handlers) {
                childDocument.removeEventListener(fn.ev, fn.handler);
            }
        });
    }

    /**
     * Disable all mouse events in all iframes on this page.
     *
     * #### Notes
     *
     * This is necessary for many drag-n-drop operations, since without it the
     * frames will not only eat the events, but may leave applications in a bad
     * state.
     *
     * While the event copying utilities above mitigate this, they cannot prevent
     * it entirely.
     */
    export function DisableFramePointerEvents() {
        // use a copied array to prevent bugs caused by live selections
        for (const frame of Array.from(document.getElementsByTagName("iframe"))) {
            frame.style.pointerEvents = "none";
        }
    }

    /**
     * Enable all mouse events on all iframes on this page.
     *
     * #### Notes
     *
     * This accompanies DisableFramePointerEvents, and should be used to revert back
     * to a healthy state after a drag operation is complete.
     *
     * @see DisableFramePointerEvents
     */
    export function EnableFramePointerEvents() {
        // use a copied array to prevent bugs caused by live selections
        for (const frame of Array.from(document.getElementsByTagName("iframe"))) {
            frame.style.pointerEvents = null;
        }
    }
}
