import { Widget } from "@phosphor/widgets";
import * as ReactDOM from "react-dom";
import { MessageLoop, Message } from "@phosphor/messaging";

/**
 * A class that renders some React inside a Phosphor widget.
 *
 * This duplicates what [ReactElementWidget] does from "@jupyterlab/apputils",
 * but disposes properly on JLab >= 0.35 and won't change between 0.35 and 1.0.
 * Further, it eliminates a common reason why many of our packages depend on
 * @jupyterlab/apputils in the first place.
 *
 * @export
 * @abstract
 * @class ReactWrapperWidget
 */
export abstract class ReactWrapperWidget extends Widget {
    /**
     * Create a wrapper widget that renders some static content
     *
     * @static
     * @param content A react element that will never change
     * @returns An instance of a ReactWrapperWidget that renders the content
     */
    public static Create(content: React.ReactElement): ReactWrapperWidget {
        // tslint:disable-next-line:class-name
        class _Wrapper extends ReactWrapperWidget {
            protected render() {
                return content;
            }
        }
        return new _Wrapper();
    }

    constructor() {
        super();
        this.update();
    }

    public dispose() {
        if (this.isDisposed) return;
        ReactDOM.unmountComponentAtNode(this.node);
        super.dispose();
    }

    public processMessage(msg: Message) {
        switch (msg.type) {
            case "before-change-doc-owner":
                this.onBeforeChangeDocumentOwner(msg);
                return;
            case "after-change-doc-owner":
                this.onAfterChangeDocumentOwner(msg);
                return;
            default:
                super.processMessage(msg);
        }
    }

    protected onUpdateRequest() {
        const vm = this.render();
        ReactDOM.render(vm, this.node);
    }

    protected onBeforeChangeDocumentOwner(msg: Message) {
        ReactDOM.unmountComponentAtNode(this.node);
    }

    protected onAfterChangeDocumentOwner(msg: Message) {
        MessageLoop.sendMessage(this, Widget.Msg.UpdateRequest);
    }

    protected abstract render(): React.ReactElement<unknown>;
}

export namespace ReactWrapperWidget {
    // TODO: Move this to a more appropriate place
    // We might also want to make the onBeforeChange/onAfterChange a mixin for
    // any Widget, not just ReactWrappers.
    /** Message sent before a DOM node is adopted by another Document.
     *
     * This process is required for React, which may break if a node is rendered
     * while parented to a certain Document and moved without first unmounting
     * that component.
     */
    export const BeforeChangeDocumentOwner = new Message("before-change-doc-owner");

    export const AfterChangeDocumentOwner = new Message("after-change-doc-owner");
}
