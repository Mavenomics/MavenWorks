import { Widget, BoxLayout } from "@phosphor/widgets";
import { InputWidgets } from "@mavenomics/ui";
import { BindingsProvider, GlobalsService } from "@mavenomics/bindings";
import { OptionsBag } from "@mavenomics/parts";

export class TableBindingEditor extends Widget {
    public readonly layout: BoxLayout;
    private selectWidget: InputWidgets.Select;
    private textEditor: InputWidgets.Code;

    constructor(
        private globals: GlobalsService,
        private bindingsProvider: BindingsProvider,
        binding: Readonly<OptionsBag.Binding> | null
    ) {
        super();
        this.node.style.width = "50vw";
        this.node.style.minWidth = "600px";
        this.node.style.height = "80vh";
        this.layout = new BoxLayout();

        const type = binding == null ? "None" : binding.type;
        const expr = binding == null ? "" : binding.expr;
        this.selectWidget = new InputWidgets.Select();
        this.selectWidget.valueDidChange.subscribe(() => {
            this.handleBindingTypeChanged();
        });
        this.textEditor = new InputWidgets.Code();
        const metadata = bindingsProvider.getBindingEvaluator(type).getMetadata();
        this.textEditor.mime = metadata && metadata.editorMode || "text/plain";
        this.textEditor.context = { globals: this.globals };
        this.textEditor.value = expr;
        BoxLayout.setStretch(this.selectWidget, 0);
        BoxLayout.setSizeBasis(this.selectWidget, 30);
        BoxLayout.setStretch(this.textEditor, 1);
        this.selectWidget.options = bindingsProvider.getBindingNames();
        this.selectWidget.value = type;

        this.layout.addWidget(this.selectWidget);
        this.layout.addWidget(this.textEditor);
    }

    public getValue() {
        const type = "" + this.selectWidget.value;

        if (type === "None") return null;

        const expr = "" + this.textEditor.value;
        const binding = this.bindingsProvider.getBindingEvaluator(type);
        return {
            type,
            expr,
            globals: binding.getGlobalsForBinding(expr)
        } as OptionsBag.Binding;
    }

    private handleBindingTypeChanged() {
        const type = "" + this.selectWidget.value;
        const bindingEvaluator = this.bindingsProvider.getBindingEvaluator(type);
        const metdata = bindingEvaluator.getMetadata();
        this.textEditor.mime = metdata && metdata.editorMode || "text/plain";
    }
}
