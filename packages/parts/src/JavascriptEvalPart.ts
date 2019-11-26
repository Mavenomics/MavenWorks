import { PromiseDelegate } from "@phosphor/coreutils";
import { OptionsBag } from "./OptionsBag";
import { Part } from "./Part";
import { URLExt, PathExt } from "@jupyterlab/coreutils";
import { DisposableDelegate } from "@phosphor/disposable";
import { HoverManager, PropertiesEditor, TypeEditor, ReactWrapperWidget } from "@mavenomics/ui";
import { Widget } from "@phosphor/widgets";
import { MessageLoop } from "@phosphor/messaging";
import { FrameTools, Converters, Types, AsyncTools, JSONObject } from "@mavenomics/coreutils";
import * as React from "react";
import { IDashboardLink } from "./formatting-helpers";
import { PartServices } from "./PartServices";

export namespace JavascriptEvalPart {
    export type IUDPWrapperPart = UDPWrapperPart;

    export function isUDPWrapper(part: Part): part is IUDPWrapperPart {
        return ((part as any).configObject != null
            && (part as any).configObject.typeName === "Part");
    }

    export interface IUDPModel {
        arguments: {
            name: string;
            typeAnnotation: string;
            metadata: unknown;
            defaultValue: JSONObject | null;
        }[];
        data: UDPBody;
        name: string;
    }
    export interface UDPBody {
        htmlText: string;
        cssText: string;
        jsText: string;
    }

    export abstract class UDPWrapperPart extends Part {
        public readonly configObject: IUDPModel;
        private path: string;
        private onInitialized = new PromiseDelegate<IUDPThisBinding>();
        private onFrameSetup = new PromiseDelegate<void>();
        private udpThis: IUDPThisBinding | undefined;
        private frame: Widget;
        private bubbleHandler: DisposableDelegate | undefined;
        private hasInitialized = false;
        private hasSetupFrame = false;
        private mustWaitForSetup = false;
        private frameSetupMutex = new AsyncTools.Mutex();

        constructor({obj, path, ...opts}: Part.IOptions & {obj: IUDPModel, path: string}) {
            super(opts);
            this.path = path;
            this.configObject = obj;
            this.title.label = obj.name;
            this.frame = new Widget({node: document.createElement("iframe")});
            Object.assign(this.frame.node.style, {
                "width": "100%",
                "height": "100%",
                "border": "0"
            });
        }

        public async initialize() {
            if (this.udpThis == null) {
                this.mustWaitForSetup = true;
                return; // must await attachment to the DOM
            }
            // TODO: This hack can be removed when UDPs are updated to use a
            // more complete part interface. For now though, this'll have to
            // do.
            this.udpThis!.context = new UDPContext(
                this.context.hover,
                this,
                this.context.baseViewUrl,
                this.context.dashboardLinker
            );
            await this.udpThis!.initialize();
        }

        public async render(bag: OptionsBag) {
            // We need to do this since parts aren't attached during initialize,
            // but iframes will not execute until they are attached and
            // displayed.
            if (this.mustWaitForSetup) {
                await this.onFrameSetup.promise;
                this.mustWaitForSetup = false;
                this.udpThis!.context = new UDPContext(
                    this.context.hover,
                    this,
                    this.context.baseViewUrl,
                    this.context.dashboardLinker
                );
                await this.udpThis!.initialize();
            }
            // setup the context get/set to work correctly
            // We can remove these once UDPs are updated to use a better interface
            this.udpThis!.context.__setOptionsBag(bag);
            // UDP render() methods take args as a list of arguments, instead of positional args.
            await this.udpThis!.render([...bag.values()]);
        }

        public dispose() {
            if (this.isDisposed) return;
            if (this.bubbleHandler != null) {
                this.bubbleHandler.dispose();
            }
            delete this.udpThis; //unpin from memory
            this.frame.dispose();
            super.dispose();
        }

        protected async onAfterAttach() {
            if (!this.hasInitialized) {
                this.hasInitialized = true;
                await this.frameSetupMutex.aquire();
                this.setupFrame();
            } else {
                await this.maybeRefreshFrame();
            }
            const node = this.frame.node as HTMLIFrameElement;
            this.bubbleHandler = FrameTools.bubbleEvents(node.contentDocument!, node);
        }

        protected onAfterShow() {
            if (!this.hasInitialized) return;
            this.maybeRefreshFrame();
        }

        protected onBeforeDetach() {
            if (this.bubbleHandler != null) {
                this.bubbleHandler.dispose();
            }
        }

        /** Refresh the part if the frame is invalid.
         * @see verifyFrameValidity
         */
        private async maybeRefreshFrame() {
            if (this.isFrameValid()) {
                // nothing to do
                return;
            }
            if (!this.frameSetupMutex.isFree) {
                return void await this.frameSetupMutex.lock;
            }
            await this.frameSetupMutex.aquire();
            // destroy the old frame
            this.frame.dispose();
            // If the frame was sucessfully setup previously, then it is
            // necessary to create a new PromiseDelegate since the old one
            // was already resolved. Otherwise, don't, since the framework
            // might be awaiting it elsewhere. We can safely do this, since
            // the old frame was already destroyed.
            // TODO: Fix this with a proper semaphore
            if (this.hasSetupFrame) {
                this.hasSetupFrame = false;
                this.onInitialized = new PromiseDelegate<IUDPThisBinding>();
                this.onFrameSetup = new PromiseDelegate<void>();
            }
            // manually setup the part
            MessageLoop.sendMessage(this, Part.Lifecycle.BeforeInitialize);
            this.frame = new Widget({node: document.createElement("iframe")});
            Object.assign(this.frame.node.style, {
                "width": "100%",
                "height": "100%",
                "border": "0"
            });
            this.setupFrame();
            try {
                await this.onFrameSetup.promise;
                await this.initialize();
                MessageLoop.sendMessage(this, Part.Lifecycle.AfterInitialize);
                this.refresh();
            } catch (err) {
                this.error(err, "init-error");
            }
        }

        /**
         * A helper function to affirm that the frame is in a healthy state.
         *
         * This is to ensure that the frame remains in a consistent state
         * after a display:none or detatch/reattach. Some of these actions
         * are destructive to the frame (depending on browser), so if the
         * frame is no longer in a good state it needs to be fixed.
         */
        private isFrameValid() {
            const frame = this.frame.node as HTMLIFrameElement;
            return (
                // the window and document should be setup
                frame.contentDocument != null && frame.contentWindow != null
                // The initializer semaphore should be present
                && frame.contentWindow.hasOwnProperty("onInitialized")
                // The <body> should have a data-udp-id equal to this.uuid
                && frame.contentDocument.body.dataset["udpId"] === this.uuid
                // The UDP <script> tag should be reachable
                && frame.contentDocument.getElementById("udp-js") != null
            );
        }

        /** Setup the iframe and iframe meta-code */
        private setupFrame() {
            this.layout.insertWidget(0, this.frame); // insert at the bottom
            const node = this.frame.node as HTMLIFrameElement;
            (node.contentWindow! as HTMLIFrameElement["contentWindow"]
                                    & {onInitialized: PromiseDelegate<IUDPThisBinding>}).onInitialized
                                    = this.onInitialized;
            node.contentDocument!.open();

            let replaceAll = (text: string, repls: any) => {
                Object.keys(repls).forEach(key => {
                    text = text.replace(`%${key}%`, repls[key]);
                });
                return text;
            };
            const url = new URL(this.context.baseUrl);
            const path = PathExt.dirname(this.path);
            let replacements: any = {
                "PART_DIR": path,
                "ORIGIN": url.origin,
                "BASE_HREF": URLExt.join(url.href, path || "")
            };


            let partHtml = replaceAll(this.configObject.data!.htmlText, replacements);
            let partCss = replaceAll(this.configObject.data!.cssText, replacements);

            let envJsText = Object.keys(replacements)
                .reduce((s, key) => `${s}window.${key} = "${replacements[key]}";\n`, "");

            node.contentDocument!.write(`
<!doctype html>
<html>
    <head>
        <base href="${replacements.BASE_HREF}/" />
    </head>
    <body data-udp-id=${this.uuid}>
        ${partHtml}
        <script id="udp-js">
        ${envJsText}
        const userThis = {
            initialize() {
                console.log("default initialize");
            },
            render() {
                console.log("default render");
            }
        };
        (function() {
            ${this.configObject.data!.jsText};
        }).call(userThis);
        window.onInitialized.resolve(userThis);
        </script>
        <style id="udp-style">${partCss}</style>
    </body>
</html>`);
            node.contentDocument!.close();
            this.onInitialized.promise.then(res => {
                this.udpThis = res;
                this.hasSetupFrame = true;
                this.frameSetupMutex.release();
                this.onFrameSetup.resolve();
            });
        }
    }

    export function generateWrapper(obj: IUDPModel, path: string): typeof UDPWrapperPart {
        class UDPDerivedWrapper extends UDPWrapperPart implements IUDPWrapperPart {
            public static GetMetadata() {
                const metadata = super.GetMetadata();
                for (const option of obj.arguments) {
                    metadata.addOption(option.name,
                                       Types.findType(option.typeAnnotation) || Types.Any,
                                       Converters.deserialize(option.defaultValue));
                }
                return metadata;
            }

            constructor(opts: Part.IOptions) {
                super({obj, path, ...opts});
            }

            public getName() {
                return obj.name;
            }
        }
        Object.defineProperty(UDPDerivedWrapper, "name", {
            value: obj.name,
            configurable: false,
            writable: false
        });
        return UDPDerivedWrapper;
    }

    interface IUDPThisBinding {
        context: UDPContext;
        initialize(): void | Promise<void>;
        render(...args: any[]): void | Promise<void>;
    }

    // HACK: This whole class is a compat hack to preserve UDP functionality until their interface gets reworked
    class UDPContext {
        private optionsBag: OptionsBag | undefined;

        constructor(
            private hover: HoverManager,
            private parent: Part,
            private baseViewUrl: string,
            private linker?: PartServices.IDashboardLinker
        ) {}

        public __setOptionsBag(bag: OptionsBag) {
            this.optionsBag = bag;
        }

        public get(optionName: string) {
            return !!this.optionsBag ? this.optionsBag.get(optionName) : null;
        }

        public set(optionName: string, value: unknown) {
            return !!this.optionsBag ? this.optionsBag.set(optionName, value) : void 0;
        }

        /** HACK a helper frame widget */
        public getFrame(url: string, params: {name: string, value: unknown}[]) {
            const frame = new Widget();
            const frameEl = document.createElement("iframe");
            frameEl.src = URLExt.join(this.baseViewUrl, url)
                + "#embed=true;"
                + params
                    .map((param) => {
                        const serializedVal = Converters.serialize(
                            param.value,
                            Converters.inferType(param.value)
                        );
                        return {
                            name: param.name,
                            value: serializedVal && serializedVal.value
                        };
                    })
                    .map(param => `${param.name}=${JSON.stringify(param.value)}`)
                    .join(";");
            frameEl.style.width = "100%";
            frameEl.style.height = "100%";
            frame.node.appendChild(frameEl);
            return frame;
        }

        //HACK: This is used for creating a hover with specific html.
        //This allows us to create an iframe widget without exposing react's Widget class to JSEPs.
        public openHtmlHover(html: string, options: HoverManager.OpenHoverOptions) {
            const frame = new Widget();
            const frameEl = document.createElement("iframe");
            frameEl.style.width = "100%";
            frameEl.style.height = "100%";
            frameEl.style.margin = "0";
            frameEl.style.border = "0";

            let hoverId = this.hover.openHover({
                ...options,
                hover: frame,
                owner: this.parent
            });

            frameEl.onload = () => {
                let win = frameEl.contentWindow;
                win!.document.body.style.width = "100%";
                win!.document.body.style.height = "100%";
                win!.document.body.style.margin = "0";
                let doc = win!.document;
                doc.write(html);
                doc.close();

                doc.body.style.margin = "0";

                //Resize the hover based on the content size if no width/height was passed.
                let width = options.width || doc.body.scrollWidth;
                let height = options.height || doc.body.scrollHeight;
                frameEl.width = width.toString();
                frameEl.height = height.toString();
                this.hover.resizeHover(hoverId, width, height);
            };

            frame.node.appendChild(frameEl);

            return hoverId;
        }

        public openHover(options: HoverManager.OpenHoverOptions) {
            return this.hover.openHover({
                ...options,
                owner: this.parent
            });
        }

        public createLink(link: IDashboardLink) {
            if (!this.linker) return Promise.resolve(null);
            return this.linker.makeDashboardLink(link);
        }

        /** HACK: Expose a way to open the Properties Editor
         *
         * This allow custom k-v editing, and is intended for the SlickGrid
         * column formatting options.
         */
        public async openPropertiesEditor(
            properties: [string, {prettyName: string, default: any, documentation?: string, type: string}][],
            values: {[property: string]: unknown}
        ) {
            const correctedProps = properties.map(i => {
                const newType = Types.findType(i[1].type) || Types.Any;
                return [
                    i[0], {...i[1], type: newType}
                ] as [string, PropertiesEditor.IPropertyMetadata];
            });
            const valuesCopy = {...values};
            const editor = React.createElement(PropertiesEditor, {
                properties: correctedProps,
                renderEditor: (name, metadata) => {
                    return React.createElement(TypeEditor, {
                        key: name,
                        value: valuesCopy[name],
                        onValueChanged: (newValue) => {
                            valuesCopy[name] = newValue;
                        },
                        type: metadata.type
                    } as TypeEditor.IProps);
                }
            } as PropertiesEditor.IProps);
            const wrapper = ReactWrapperWidget.Create(editor);
            const future = await HoverManager.Instance!.launchDialog(
                wrapper,
                this.parent,
                400,
                800,
                "Edit Properties",
                [ { text: "Dismiss" }, { text: "Ok", accept: true }]
            );
            if (!future.accept) {
                throw Error("Cancel");
            }
            return valuesCopy;
        }
    }
}
