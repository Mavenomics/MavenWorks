import { Widget } from "@phosphor/widgets";
import { ReactElement, createElement } from "react";
import { ReactWrapperWidget } from "@mavenomics/ui";
import { OptionsBag } from "./OptionsBag";
import { Part } from "./Part";
import { MessageLoop } from "@phosphor/messaging";

/**
 * Abstract helper class for parts written in React.
 *
 * @export
 * @abstract
 * @class ReactPart
 *
 * @remarks
 *
 * This class is not required for using React, but handles some of the DOM
 * interfacing and is a bit more convenient. Instead of using initialize and
 * render, subclasses should instead override the similarly-named
 * initializeReact and renderReact. These methods are called by their public
 * counterparts, and are used by this wrapper to separate React from the
 * rendering logic.
 *
 * Implementing initializeReact is optional, but recommended.
 */
export abstract class ReactPart extends Part {
    protected container: ReactComponent;

    constructor(opts: Part.IOptions) {
        super(opts);
        this.container = new ReactComponent(createElement("span"));
        this.container.addClass("m-ReactPart-Container");
        this.layout.insertWidget(0, this.container);
    }

    public async initialize() {
        this.container.el = await this.initializeReact();
        // synchronously send an update request to force any errors to bubble up
        MessageLoop.sendMessage(this.container, Widget.Msg.UpdateRequest);
        MessageLoop.flush();
    }

    public async render(bag: OptionsBag) {
        this.container.el = await this.renderReact(bag);
        // synchronously send an update request to force any errors to bubble up
        MessageLoop.sendMessage(this.container, Widget.Msg.UpdateRequest);
        MessageLoop.flush();
    }

    public dispose() {
        if (this.isDisposed) {
            return;
        }
        super.dispose();
    }

    protected initializeReact(): ReactElement | Promise<ReactElement> {
        return createElement("span");
    }

    protected abstract renderReact(bag: OptionsBag): ReactElement | Promise<ReactElement>;
}

class ReactComponent extends ReactWrapperWidget {
    public el: React.ReactElement;

    constructor(el: React.ReactElement) {
        super();
        this.el = el;
    }

    protected render() {
        return this.el;
    }
}
