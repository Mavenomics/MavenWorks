import * as React from "react";
import { MessageLoop } from "@phosphor/messaging";
import { PanelLayout, Widget, SplitPanel, Panel } from "@phosphor/widgets";
import { Toolbar, ToolbarButton } from "@jupyterlab/apputils";
import { IEditorServices, CodeEditorWrapper, CodeEditor } from "@jupyterlab/codeeditor";
import { PathExt } from "@jupyterlab/coreutils";
import { IRenderMimeRegistry } from "@jupyterlab/rendermime";
import { Part, OptionsBag, PartServices, JavascriptEvalPart } from "@mavenomics/parts";
import { HoverManager, ReactWrapperWidget } from "@mavenomics/ui";
import { OptionsEditor } from "../components";


export class PartEditor extends Widget {
    public layout: PanelLayout;
    private rendermime?: IRenderMimeRegistry;
    private context: PartEditor.ICodeContext;
    private editorServices: IEditorServices;
    private partServices: PartServices;
    private partWidget: JavascriptEvalPart.IUDPWrapperPart & Part | undefined;

    constructor(options: PartEditor.IOptions) {
        super();
        this.addClass("m-PartEditor");
        this.rendermime = options.rendermime;
        this.context = options.context;
        this.editorServices = options.editorServices;
        this.partServices = new PartServices({
            rendermime: this.rendermime,
            session: this.context.session,
            dashboardId: "editor", // TODO: Should we expose this?
            baseUrl: options.baseUrl,
            baseViewUrl: options.baseViewUrl,
        });
        this.layout = new PanelLayout();
        const panel = new SplitPanel({
            orientation: "horizontal"
        });
        this.layout.addWidget(panel);
    }

    public renderModel(model: PartEditor.IModel) {
        const layout = this.layout.widgets[0] as SplitPanel;

        for (const widget of layout.widgets) {
            widget.dispose();
        }

        const left = new SplitPanel({
            orientation: "vertical"
        });
        const right = new SplitPanel({
            orientation: "vertical"
        });

        layout.addWidget(left);
        layout.addWidget(right);

        const filename = PathExt.basename(this.context.path);

        let data = model.toJSON();
        if (data == null) {
            // a default value for the new UDP
            const newVal = { ...PartEditor.DEFAULT_UDP };
            model.fromJSON(newVal);
            data = model.toJSON();
        }
        const obj = data;

        const jsConfig = {
            lint: { "tooltips": true, options: { esversion: 9 } }, //enable the lint addon
            gutters: ["CodeMirror-lint-markers"],
            extraKeys: { "Ctrl-Space": "autocomplete" }, //enable the hints addon
            hintOptions: {
                completeSingle: false,
                additionalContext: {
                    this: {
                        context: {
                            set: function () { },
                            get: function () { },
                            getFrame: function () { },
                            openHtmlHover: function () { },
                            openHover: function () { },
                        }
                    }
                }
            }
        } as any;

        for (const codeType of (["jsText", "htmlText", "cssText"] as (keyof JavascriptEvalPart.UDPBody)[])) {
            const code = data.data[codeType];
            const codeModel = new CodeEditor.Model({
                mimeType: "text/" + (codeType === "jsText" ? "javascript" : codeType === "htmlText" ? "html" : "css"),
                value: code
            });
            codeModel.value.changed.connect((sender, _) => {
                data.data[codeType] = sender.text;
                model.fromJSON(obj);
            });
            const editor = new CodeEditorWrapper({
                factory: this.editorServices.factoryService.newDocumentEditor,
                model: codeModel,
                config: codeType === "jsText" ? jsConfig : void 0
            });
            if (codeType !== "cssText") {
                left.addWidget(editor);
            } else {
                right.addWidget(editor);
            }
        }

        const partPanel = new Panel();
        partPanel.addClass("m-PartEditor-PreviewPanel");
        const toolbar = new Toolbar();
        const refresh = new ToolbarButton({
            className: "fa fa-play",
            tooltip: "Re-Render Part",
            onClick: () => {
                if (this.partWidget == null) {
                    return;
                }
                this.renderPart();
            }
        });
        const reload = new ToolbarButton({
            className: "fa fa-refresh",
            tooltip: "Reload Part",
            onClick: () => {
                this.updatePart(data, partPanel);
            }
        });
        const optionsEditor = new ToolbarButton({
            className: "fa fa-cogs",
            tooltip: "Open Options Editor",
            onClick: async () => {
                let dialog = new class extends ReactWrapperWidget {
                    private args: OptionsEditor.ISerializedArgument[] = obj.arguments;

                    public getValue() { return this.args; }

                    protected render() {
                        return React.createElement(OptionsEditor, {
                            arguments: this.args,
                            onArgsChanged: (newArgs: OptionsEditor.ISerializedArgument[]) => {
                                this.args = newArgs;
                                this.update();
                            }
                        });
                    }
                };
                const manager = HoverManager.GetManager();
                await manager.launchEditorDialog(
                    dialog,
                    this,
                    800,
                    480,
                    filename + "Options Editor",
                    (result) => {
                        if (result == null) return;
                        data.arguments = result;
                        model.fromJSON(data);
                        this.updatePart(data, partPanel);
                    }
                );
            }
        });

        toolbar.addItem("Render", refresh);
        toolbar.addItem("Reload", reload);
        toolbar.addItem("Edit Options...", optionsEditor);

        partPanel.addWidget(toolbar);

        right.addWidget(partPanel);

        this.updatePart(data, partPanel);

        return Promise.resolve();
    }

    public dispose() {
        const panel = this.layout.widgets[0] as SplitPanel;
        // Disposing a layout does not automatically dispose the children. This
        // isn't documented, unfortunately.
        // Because widgets gets modified by the disposal, we need to copy it to reliably dispose everything
        Array.from(panel.widgets).map(subpanel => {
            Array.from((subpanel as SplitPanel).widgets).map(item => {
                if (item instanceof CodeEditorWrapper) {
                    item.dispose();
                } else {
                    // this is the editor
                    Array.from((item as Panel).widgets).map(i => i.dispose());
                }
            });
        });
        this.partServices.dispose();
        super.dispose();
    }

    private updatePart(viewModel: JavascriptEvalPart.IUDPModel, panel: Panel) {
        if (panel.widgets.length > 1) {
            // there's an old part here, dispose it before we continue
            const oldPart = panel.widgets[1];
            oldPart.parent = null;
            oldPart.dispose();
        }
        const PartConstructor = JavascriptEvalPart.generateWrapper(viewModel, this.context.path);
        // we need to do this because of weaknessess in how TSC types constructors.
        // partconstructor is actually a UDPWrapperPart, not a FramePart, but we can't really tell TSC that.
        const partInstance = this.partWidget = new (PartConstructor as any)({
            services: this.partServices
        }) as JavascriptEvalPart.IUDPWrapperPart;
        partInstance.RefreshRequested.subscribe(() => {
            this.renderPart();
        });
        panel.addWidget(partInstance);
        Promise.resolve()
            .then(() => this.initializePart())
            .then(() => this.renderPart())
            .catch((err) => console.log(err));
    }

    private async initializePart() {
        if (this.partWidget == null) {
            return;
        }

        MessageLoop.sendMessage(this.partWidget, Part.Lifecycle.BeforeInitialize);
        try {
            await this.partWidget.initialize();
        } catch (err) {
            this.partWidget.error(err, "init-error");
            return;
        }
        MessageLoop.sendMessage(this.partWidget, Part.Lifecycle.AfterInitialize);
    }

    private async renderPart() {
        if (this.partWidget == null) {
            return;
        }
        // This ugly cast happens because typescript isn't good at typing class constructors
        const metadata = (this.partWidget.constructor as any as {
            GetMetadata: () => Part.PartMetadata
        }).GetMetadata();
        const defaultBag = new OptionsBag(metadata);

        MessageLoop.sendMessage(this.partWidget, Part.Lifecycle.BeforeRender);
        try {
            await this.partWidget.render(defaultBag);
        } catch (err) {
            this.partWidget.error(err, "render-error");
            return;
        }
        MessageLoop.sendMessage(this.partWidget, Part.Lifecycle.AfterRender);
    }
}

export namespace PartEditor {
    export const MIMETYPE = "application/vnd.maven.config.udp+json";

    export const DEFAULT_UDP: Readonly<JavascriptEvalPart.IUDPModel> = Object.freeze(
        {
            arguments: [],
            data: {
                "htmlText": "<div class=\"foo\">\n  Hello <s>world</s>JupyterLab!\n</div>\n",
                // tslint:disable-next-line:max-line-length
                "jsText": "this.initialize = function() {\n    console.log(\"Part Initialized!\");\n}\n\nthis.render = function(args) {\n    console.log(\"Rendered!\", args);\n}\n",
                "cssText": ".foo {\n  color: white;\n  background-color: purple;\n}\n"
            },
            name: "New Part"
        });

    export interface IModel {
        toJSON(): JavascriptEvalPart.IUDPModel;
        fromJSON(body: JavascriptEvalPart.IUDPModel): void;
    }

    export interface IOptions {
        mimeType: string;
        editorServices: IEditorServices;
        context: ICodeContext;
        baseUrl: string;
        baseViewUrl: string;
        rendermime?: IRenderMimeRegistry;
    }

    export interface ICodeContext {
        readonly path: string;
        readonly session: any | null;
        readonly isReady: boolean;
        readonly last_modified: string;
    }
}
