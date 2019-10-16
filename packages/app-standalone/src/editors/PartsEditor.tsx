import { DocumentModel } from "@jupyterlab/docregistry";
import { CodeMirrorEditorFactory, CodeMirrorMimeTypeService } from "@jupyterlab/codemirror";
import { PartEditor } from "@mavenomics/dashboard-devtools";
import { SplitPanel, Widget, BoxLayout } from "@phosphor/widgets";
import { ReactWrapperWidget, ListBox } from "@mavenomics/ui";
import * as React from "react";
import { UUID } from "@phosphor/coreutils";
import { Signal, ISignal } from "@phosphor/signaling";
import { Dashboard } from "@mavenomics/dashboard";
import { JavascriptEvalPart } from "@mavenomics/parts";

export class PartsEditor extends Widget {
    public layout: BoxLayout;
    panel: SplitPanel;
    activeEditor: PartEditor | Widget; // part editor or a placeholder
    document: DocumentModel;
    parts: { [id: string]: JavascriptEvalPart.IUDPModel } = {};
    private readonly listbox: PartsEditor.LeftPaneWidget;
    private baseUrl: string;
    private baseViewUrl: string;
    private activeId: string | undefined;

    constructor(dashboard: Dashboard, baseUrl: string, baseViewUrl: string) {
        super();
        this.addClass("m-PartsEditor");

        this.baseUrl = baseUrl;
        this.baseViewUrl = baseViewUrl;
        this.layout = new BoxLayout();
        this.panel = new SplitPanel({
            orientation: "horizontal"
        });
        this.layout.addWidget(this.panel);

        // Deep copy the dashboard parts
        this.parts = JSON.parse(JSON.stringify(dashboard.localParts)) as typeof dashboard["localParts"];

        this.document = new DocumentModel();

        this.listbox = new PartsEditor.LeftPaneWidget(this.getPartsAsListItems(), this);
        this.listbox.selectionChanged.connect(this.onSelectionChanged, this);
        this.listbox.itemRenamed.connect(this.onRename, this);
        this.panel.addWidget(this.listbox);

        this.activeEditor = PartsEditor.BuildPlaceholder();
        this.panel.addWidget(this.activeEditor);
        this.panel.setRelativeSizes([0.5, 1.5]);
    }

    public dispose() {
        if (this.isDisposed) return;

        this.listbox.selectionChanged.disconnect(this.onSelectionChanged, this);
        this.listbox.itemRenamed.disconnect(this.onRename, this);
        this.panel.dispose();
        this.document.dispose();
        super.dispose();
    }

    public getValue() {
        this.saveDocument();

        return this.parts;
    }

    public addPart() {
        const id = UUID.uuid4();
        const part = { ...PartEditor.DEFAULT_UDP };
        this.parts[id] = part;
        this.listbox.selectedItem = id;
        this.listbox.parts = this.getPartsAsListItems();
        this.loadPart(id);
    }

    public deletePart(id?: string) {
        if (id == null) {
            if (this.listbox.selectedItem == null) return;
            id = this.listbox.selectedItem;
        }
        delete this.parts[id];

        this.listbox.selectedItem = null;
        this.document.dispose();
        this.document = new DocumentModel();
        const sizes = this.panel.relativeSizes();
        this.activeEditor.dispose();
        this.activeEditor = PartsEditor.BuildPlaceholder();
        this.panel.addWidget(this.activeEditor);
        this.panel.setRelativeSizes(sizes);
        this.listbox.parts = this.getPartsAsListItems();
    }

    public editPartName() {
        if (this.listbox.selectedItem == null) return;
        this.listbox.edit();
    }

    protected async loadPart(id: string) {
        const sizes = this.panel.relativeSizes();
        if (this.activeEditor instanceof PartEditor) {
            // use the old sizes for UX consistency
            this.saveDocument();
        }

        this.activeEditor.dispose();
        this.activeEditor = PartsEditor.BuildPlaceholder({loading: true});
        this.panel.addWidget(this.activeEditor);
        this.panel.setRelativeSizes(sizes);
        let part = this.parts[id];
        const editor = new PartEditor({
            context: {
                session: null,
                path: "/" + part.name,
                isReady: false,
                last_modified: ""
            },
            editorServices: {
                factoryService: new CodeMirrorEditorFactory(),
                mimeTypeService: new CodeMirrorMimeTypeService()
            },
            mimeType: "",
            baseUrl: this.baseUrl,
            baseViewUrl: this.baseViewUrl
        });

        this.document.fromJSON(part as any);
        this.activeId = id;

        await editor.renderModel(this.document as any);
        this.activeEditor.dispose();
        this.activeEditor = editor;
        this.panel.addWidget(this.activeEditor);
        this.panel.setRelativeSizes(sizes);
    }

    protected onSelectionChanged(_sender: PartsEditor.LeftPaneWidget, id: string | null) {
        if (id == null) {
            // use the old sizes for UX consistency
            const sizes = this.panel.relativeSizes();
            if (this.activeEditor instanceof PartEditor) {
                this.saveDocument();
            }

            this.activeEditor.dispose();
            this.activeEditor = PartsEditor.BuildPlaceholder();
            this.panel.addWidget(this.activeEditor);
            this.panel.setRelativeSizes(sizes);
            return;
        }
        this.loadPart(id);
    }

    protected onRename(sender: PartsEditor.LeftPaneWidget, args: {key: string, newLabel: string}) {
        this.parts[args.key].name = args.newLabel;
        sender.parts = this.getPartsAsListItems();
    }

    protected saveDocument() {
        if (!this.document.dirty) return;

        let json = this.document.toJSON() as any | null;
        if (!json) {
            return;
        }
        let model: JavascriptEvalPart.IUDPModel;
        let partId = this.activeId;
        if (partId == null) {
            partId = UUID.uuid4();
        }
        if (partId in this.parts) {
            model = this.parts[partId];
            model.data = json.data;
            model.arguments = json.arguments;
        } else {
            model = json;
        }

        this.parts[partId] = model;
    }

    protected onAfterAttach() {
        // Normally, when we call setRelativeSizes, it results in an update call
        // to the layout. This would be fine, but there's usually at least one
        // update tick where dialogs aren't attached yet (And thus have 0 size).
        // Due to a bug in how Phosphor uses those relative sizes, it ends up
        // throwing them away (setting them to 0:0, which is effectively 1:1).
        // This works around that reliably- onAfterAttach is normally called
        // before the layout update in the same stack, but the message loop runs
        // on animation frames, so the _next_ animation frame is guaranteed to
        // run afterwards.
        requestAnimationFrame(() => this.panel.setRelativeSizes([0.25, 0.75]));
    }

    private getPartsAsListItems() {
        return Object.keys(this.parts).map(i => ({
            key: i,
            label: this.parts[i].name
        }));
    }
}

export namespace PartsEditor {
    export class LeftPaneWidget extends ReactWrapperWidget {
        private _owner: PartsEditor;
        private _parts: ReadonlyArray<ListBox.ListItem>;
        private _selectedItem: string | null = null;
        private _selectionChanged = new Signal<this, string | null>(this);
        private _itemRenamed = new Signal<this, {key: string, newLabel: string}>(this);
        private _editing = false;

        constructor(parts: ReadonlyArray<ListBox.ListItem>, owner: PartsEditor) {
            super();
            this._owner = owner;
            this._parts = parts;
            this.node.style.overflowY = "auto";
        }

        /** Get the parts list. */
        public get parts() {
            return this._parts;
        }

        /** Set the parts list and re-render the pane.
         *
         * Note: This must *always* be a new array reference.
        */
        public set parts(newParts: ReadonlyArray<ListBox.ListItem>) {
            this._parts = newParts;
            this.update();
        }

        /** A signal that emits when the selected part changes */
        public get selectionChanged(): ISignal<this, string | null> {
            return this._selectionChanged;
        }

        public get itemRenamed(): ISignal<this, {key: string, newLabel: string}> {
            return this._itemRenamed;
        }

        /** Get the currently selected key */
        public get selectedItem() {
            return this._selectedItem;
        }

        /** Set the currently selected key and re-render the pane.
         *
         * Note: This will not cause `selectionChanged` to emit.
         */
        public set selectedItem(newKey: string | null) {
            this._selectedItem = newKey;
            this.update();
        }

        public edit() {
            this._editing = true;
            this.update();
        }

        protected render() {
            return (<div className="m-PartsEditor-leftpane">
                <h3>Local Parts</h3>
                <ListBox items={this.parts}
                    isEditing={this._editing}
                    selectedKey={this._selectedItem}
                    onEdit={this.onEdit.bind(this)}
                    onSelect={this.onSelect.bind(this)} />
                <button onClick={this.onClick.bind(this)} className="fa fa-plus"></button>
            </div>);
        }

        protected onEdit(key: string, newLabel: string) {
            this._itemRenamed.emit({key, newLabel});
            this._editing = false;
            // the owner will trigger an update
        }

        protected onClick() {
            this._owner.addPart();
        }

        protected onSelect(key: string | null) {
            this._selectedItem = key;
            this._selectionChanged.emit(key);
            this.update();
        }
    }

    export interface PlaceholderOpts {
        loading: boolean;
    }

    export function BuildPlaceholder({loading}: PlaceholderOpts = {loading: false}) {
        const widget = new Widget();
        widget.addClass("m-PartsEditor-placeholder");
        if (loading) {
            widget.node.textContent = "Loading...";
        } else {
            widget.node.textContent = "Select a part on the left";
        }
        return widget;
    }
}
