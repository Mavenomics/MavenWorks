import { Widget, BoxLayout } from "@phosphor/widgets";
import { IEditorServices, CodeEditor, CodeEditorWrapper } from "@jupyterlab/codeeditor";
import { nbformat } from "@jupyterlab/coreutils";

export class ScriptEditor extends Widget {
    public readonly layout: BoxLayout;
    private scriptModel: CodeEditor.IModel;
    private scriptEditor: CodeEditorWrapper;
    private readonly editorServices: IEditorServices;

    constructor({script, editorServices, language}: ScriptEditor.IOptions) {
        super();
        const style = this.node.style;
        style.width = "50vw";
        style.height = "50vh";
        this.layout = new BoxLayout();
        this.editorServices = editorServices;
        const mimeType = this.editorServices.mimeTypeService.getMimeTypeByLanguage(language);
        this.scriptModel = new CodeEditor.Model({
            mimeType,
            value: script
        });
        this.scriptEditor = new CodeEditorWrapper({
            factory: this.editorServices.factoryService.newDocumentEditor,
            model: this.scriptModel
        });
        this.layout.addWidget(this.scriptEditor);
    }

    public get value() {
        return this.scriptModel.value.text;
    }

    public dispose() {
        if (this.isDisposed) {
            return;
        }
        this.scriptEditor.dispose();
        this.scriptModel.dispose();
        super.dispose();
    }
}

export namespace ScriptEditor {
    export interface IOptions {
        script: string;
        language: nbformat.ILanguageInfoMetadata;
        editorServices: IEditorServices;
    }
}
