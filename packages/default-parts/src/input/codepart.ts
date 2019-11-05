import { Part, OptionsBag } from "@mavenomics/parts";
import { Types } from "@mavenomics/coreutils";
import { IEditorFactoryService, CodeEditorWrapper, CodeEditor } from "@jupyterlab/codeeditor";
import { CodeMirrorEditorFactory } from "@jupyterlab/codemirror";

export class CodeEditorPart extends Part {
    public static GetMetadata() {
        const metadata = super.GetMetadata();

        metadata.description = "A multiline text editor part with syntax highlighting";

        metadata.remarks = `
Internally this part uses the CodeMirror editor. A list of highlighting modes is
available [via the CodeMirror docs](https://codemirror.net/mode/).
Additionally, MavenWorks provides highlighters for MQL (\`mql\` or \`text/x-mql\`)
and JS bindings (\`jsmql\` or \`text/x-jsmql\`).

The "Language type" parameter accepts either MIME types or short identifiers,
which are passed to CodeMirror as the \`mode\` parameter.
`;

        metadata.addOption("Code", Types.String, "");
        metadata.addOption("Language type", Types.String, "", {
            description: "The MIME type or short name of the syntax to highlight with"
        });

        return metadata;
    }

    private readonly editorFactory: IEditorFactoryService;
    private editorModel: CodeEditor.IModel | null = null;
    private editor: CodeEditorWrapper | null = null;

    constructor(opts: Part.IOptions) {
        super(opts);
        this.editorFactory = new CodeMirrorEditorFactory();
    }

    public initialize() {
        // no-op
    }

    public render(opts: OptionsBag) {
        const mime = opts.get("Language type") as string | undefined || "text/plain";
        const code = opts.get("Code") as string | undefined || "";
        if (this.isEditorStale(mime)) {
            this.buildEditor(mime, code, opts);
            return;
        }
        this.editorModel!.mimeType = mime;
        if (this.editorModel!.value.text !== code) {
            this.editorModel!.value.text = code;
        }

    }

    private isEditorStale(mime: string) {
        return this.editorModel == null || this.editor == null;
    }

    private buildEditor(mime: string, code: string, bag: OptionsBag) {
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
            bag.set("Code", _sender.text);
        });
        this.editor = new CodeEditorWrapper({
            factory: this.editorFactory.newDocumentEditor,
            model: this.editorModel
        });
        this.layout.insertWidget(0, this.editor);
    }
}
