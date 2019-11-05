import { Subject, Observable } from "rxjs";
import RcSelect, { Option } from "rc-select";
import * as React from "react";
import { ReactWrapperWidget } from "../reactwidget";
import { Widget, BoxLayout } from "@phosphor/widgets";
import { IEditorFactoryService, CodeEditorWrapper, CodeEditor } from "@jupyterlab/codeeditor";
import { CodeMirrorEditorFactory } from "@jupyterlab/codemirror";
import { UUID } from "@phosphor/coreutils";

export namespace InputWidgets {
    // This class exists to give typing info in a TS friendly way. Don't use it.
    abstract class IInputWidget<T> extends Widget {
        value!: T | null;
        valueDidChange!: Observable<T>;

        protected setValue(newValue: T) { }
    }

    function makeABC<C>(superclass: C): typeof IInputWidget & C {
        // tslint:disable-next-line: class-name
        abstract class __generatedABC<T> extends (superclass as any) {
            private _value: T | null = null;
            private _valueDidChangeSrc$ = new Subject<T>();
            private _valueDidChange = this._valueDidChangeSrc$.asObservable();

            public get value() { return this._value; }
            public get valueDidChange() { return this._valueDidChange; }

            public set value(newValue: T | null) {
                this._value = newValue; // does not trigger valueDidUpdate
                this.update();
            }

            public dispose() {
                if (this.isDisposed) return;
                this._valueDidChangeSrc$.complete();
                super.dispose();
            }

            protected setValue(newValue: T) {
                this._value = newValue;
                this._valueDidChangeSrc$.next(newValue);
                this.update();
            }
        }
        return __generatedABC as any;
    }

    const BaseReactWidget = makeABC(ReactWrapperWidget);
    const BaseWidget = makeABC(Widget);

    export class Select extends BaseReactWidget<string> {
        private _options: string[] = [];

        constructor() {
            super();
            this.addClass("m-InputWidget-Select");
        }

        public get options() { return this._options; }
        public set options(newOptions: string[]) {
            this._options = newOptions.slice();
            this.update();
        }

        protected render() {
            const opts = this.options.map(i => {
                const key = "" + i; //coerce to string
                if (key === "") return; // don't allow empty strings
                return (<Option
                    key={key}
                    value={key}>{key}</Option>);
            });
            return (
                <RcSelect value={"" + this.value}
                    onChange={(value) => this.setValue(value as string)}
                    style={{ width: "100%" }}>
                    {opts}
                </RcSelect>);
        }
    }

    export class Code extends BaseWidget<string> {
        public readonly layout: BoxLayout;
        private readonly editorFactory: IEditorFactoryService;
        private editorModel: CodeEditor.IModel | null = null;
        private editor: CodeEditorWrapper | null = null;
        private _mime = "text/plain";
        private _context = null;

        constructor() {
            super();
            this.layout = new BoxLayout();
            this.editorFactory = new CodeMirrorEditorFactory();
        }

        public get context() { return this._context; }
        public set context(context: any) {
            this._context = context;
            this.update();
        }

        public get mime() { return this._mime; }
        public set mime(newMimeType: string) {
            this._mime = newMimeType;
            this.update();
        }

        public dispose() {
            if (this.isDisposed) return;
            if (this.editorModel) this.editorModel.dispose();
            super.dispose();
        }

        protected onUpdateRequest() {
            const code = "" + this.value;
            if (this.isEditorStale()) {
                this.buildEditor(this._mime, code);
                return;
            }
            this.editorModel!.mimeType = this._mime;
            if (this.editorModel!.value.text !== code) {
                this.editorModel!.value.text = code;
            }
        }

        private isEditorStale() {
            return this.editorModel == null || this.editor == null;
        }

        private buildEditor(mime: string, code: string) {
            if (this.editorModel) {
                this.editorModel.dispose();
            }
            if (this.editor) {
                this.editor.dispose();
            }
            this.editorModel = new CodeEditor.Model({
                mimeType: mime,
                value: code
            });
            this.editorModel.value.changed.connect((_sender) => {
                this.setValue(_sender.text);
            });
            this.editor = new CodeEditorWrapper({
                factory: this.editorFactory.newDocumentEditor,
                model: this.editorModel,
                config: {
                    lint: { "tooltips": true, options: { esversion: 9 } }, //enable the lint addon
                    gutters: ["CodeMirror-lint-markers"],
                    extraKeys: {
                        // enable the hints addon
                        "Ctrl-Space": "autocomplete",
                        // and the gotodef addon
                        "F11": "gotodef-mql"
                    },
                    hintOptions: { completeSingle: false },
                    context: this.context
                } as any
            });
            this.layout.addWidget(this.editor);
        }
    }

    export class Text extends BaseReactWidget<string> {
        private _type = "text";
        private _label = "";
        private _name = UUID.uuid4();
        private _autocomplete?: string;

        constructor() {
            super();
            this.addClass("m-TextInput");
        }

        public get type() { return this._type; }
        public get label() { return this._label; }
        public get name() { return this._name; }
        public get autocomplete() { return this._autocomplete; }

        public set type(newMode: string) {
            this._type = newMode;
            this.update();
        }
        public set label(newLabel: string) {
            this._label = newLabel;
            this.update();
        }
        public set name(newName: string) {
            this._name = newName;
            this.update();
        }
        public set autocomplete(newMode: string | undefined) {
            this._autocomplete = newMode;
            this.update();
        }

        protected render() {
            return (<span>
                <label htmlFor={this.name}>{this.label}</label>
                <input type={this._type}
                    name={this.name}
                    value={this.value || ""}
                    autoComplete={this._autocomplete}
                    onChange={(ev) => this.setValue(ev.currentTarget.value)} />
            </span>
            );
        }
    }
}
