import * as React from "react";
import { ITypeEditorProps } from "./interfaces";
import { Type, Types, Converters } from "@mavenomics/coreutils";
import { Widget, BoxLayout } from "@phosphor/widgets";
import { IEditorFactoryService, CodeEditorWrapper, CodeEditor } from "@jupyterlab/codeeditor";
import { CodeMirrorEditorFactory } from "@jupyterlab/codemirror";
import * as _ from "lodash";
import { UncontrolledInput, useIntermediate } from "../components";

export const FallbackEditor: React.FC<ITypeEditorProps<any>> = ({
    type, value, onValueChanged
}) => {
    const toEdit = Private.toEditableFormat(value, type);
    const [lastValue, setLastValue] = React.useState(value);
    const [isValid, setIsValid] = React.useState(true);
    if (Private.toEditableFormat(lastValue, type) !== toEdit) {
        // this occurs on outside changes
        setLastValue(value);
        setIsValid(true);
    }
    let className = "m-FallbackEditor-" + type.serializableName;
    if (!isValid) {
        className += " m-FallbackEditor-invalid";
    }
    const [val, key, setVal] = useIntermediate(toEdit || "", val => {
        try {
            const newVal = Private.fromEditableFormat(val, type);
            onValueChanged.call(void 0, newVal);
            setIsValid(true);
            setLastValue(newVal);
        } catch {
            setIsValid(false);
        }
    });
    return (<UncontrolledInput key={key}
        className={className}
        value={val}
        valueChanged={setVal} />);
};

export class FallbackDetailEditor extends Widget {
    public readonly layout: BoxLayout;
    private value: unknown;
    private type: Type;
    private onChangeCb: (this: void, change: unknown) => void;
    private readonly editorFactory: IEditorFactoryService;
    private editorModel: CodeEditor.IModel | null = null;
    private editor: CodeEditorWrapper | null = null;
    private mime: string;

    constructor({value, type, onValueChanged, metadata}: ITypeEditorProps<unknown>) {
        super();
        this.addClass("m-FallbackDetailEditor");
        this.layout = new BoxLayout();
        this.value = value;
        this.type = type;
        this.mime = (metadata && metadata.mime) || (Private.isEditable(type) ? "text/plain" : "application/json");
        this.onChangeCb = onValueChanged;
        this.editorFactory = new CodeMirrorEditorFactory();
        this.setup();
    }

    public dispose() {
        if (this.isDisposed) return;
        this.onChangeCb = () => void 0;
        if (this.editorModel) this.editorModel.dispose();
        super.dispose();
    }

    private setup() {
        const code = Private.toEditableFormat(this.value, this.type) || "";
        if (this.isEditorStale()) {
            this.buildEditor(this.mime, code);
            return;
        }
        this.editorModel!.mimeType = this.mime;
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
            this.trySetValue(_sender.text);
        });
        this.editor = new CodeEditorWrapper({
            factory: this.editorFactory.newDocumentEditor,
            model: this.editorModel
        });
        this.layout.addWidget(this.editor);
    }

    private trySetValue(code: string) {
        this.removeClass("m-FallbackEditor-invalid");
        try {
            const val = Private.fromEditableFormat(code, this.type);
            this.onChangeCb.call(void 0, val);
        } catch (err) {
            this.addClass("m-FallbackEditor-invalid");
        }
    }
}

namespace Private {
    function pad(num: number, len: number) {
        return (num.toString() as any).padStart(len, "0");
    }

    function dateTimeToEditableFormat(date: Date) {
        return pad(date.getUTCFullYear(), 4) +
        "-" + pad(date.getUTCMonth() + 1, 2) +
        "-" + pad(date.getUTCDate(), 2) +
        "T" + pad(date.getUTCHours(), 2) +
        ":" + pad(date.getUTCMinutes(), 2) +
        ":" + pad(date.getUTCSeconds(), 2);
    }
    function dateToEditableFormat(date: Date) {
        return pad(date.getUTCFullYear(), 4) +
            "-" + pad(date.getUTCMonth() + 1, 2) +
            "-" + pad(date.getUTCDate(), 2);
    }

    /** returns true if there's a friendly format available for this type */
    export function isEditable(type: Type) {
        switch (type) {
            case Types.Boolean:
            case Types.Number:
            case Types.String:
            case Types.Date:
            case Types.DateTime:
                return true;
            default:
                return false;
        }
    }

    export function toEditableFormat(value: any, type: Type) {
        if (value == null)
            return null;
        switch (type) {
            case Types.Boolean:
            case Types.Number:
            case Types.String:
                // simple coercion works well enough
                return "" + value;
            case Types.Date:
                if (!(value instanceof Date)) {
                    value = new Date(value);
                }
                return dateToEditableFormat(value as Date);
            case Types.DateTime:
                if (!(value instanceof Date)) {
                    value = new Date(value);
                }
                return dateTimeToEditableFormat(value as Date);
            default:
                // use the converters, to at least display *something* useful
                try {
                    let serialized = Converters.serialize(value, type);
                    // strip the type info
                    value = serialized && serialized.value;
                } catch (err) {
                    console.error("Failed to serialize value", value);
                }
                return JSON.stringify(value);
        }
    }


    export function fromEditableFormat(value: string, type: Type) {
        if (value === null || (value.length === 0 && type !== Types.String))
            return null;
        // If this function throws, assume that the value isn't safe to commit
        switch (type) {
            case Types.Boolean:
                if (value.match(/^t(?:rue)?$/i)) return true;
                if (value.match(/^f(?:alse)?$/i)) return false;
                throw Error("Not a boolean");
            case Types.String:
                return value;
            case Types.Number:
                let num = Number.parseFloat(value);
                if (Number.isNaN(num))
                    throw new Error("Invalid number: " + value);
                return num;
            case Types.Date:
            case Types.DateTime:
                let date = new Date(value);
                if (Number.isNaN(date.getTime()))
                    throw new Error("Invalid date: " + value);
                return date;
            default:
                return Converters.deserialize({
                    value: JSON.parse(value),
                    typeName: type.serializableName
                });
        }
    }
}
