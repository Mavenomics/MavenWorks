import { Application } from "@phosphor/application";
import { Part } from "@mavenomics/parts";
import { SlickGridPart } from "./SlickGrid";
import {
    getFormattingMetadata,
    getFormattingWithDefaults,
    IColumnFormatting,
    stripDefaultsFromFormatting
} from "./grid/helpers";
import { ReactWrapperWidget, PropertiesEditor, TypeEditor, HoverManager } from "@mavenomics/ui";
import { Widget, BoxLayout } from "@phosphor/widgets";
import * as React from "react";
import { TableEditorPart } from "./tableeditor/part";
import { Types } from "@mavenomics/coreutils";
import { IEditorFactoryService, CodeEditorWrapper, CodeEditor } from "@jupyterlab/codeeditor";
import { CodeMirrorEditorFactory } from "@jupyterlab/codemirror";

export function RegisterGridCommands(
    app: Application<any>,
    getFocusedPart: () => Part | null,
    namespace: string,
    regionSelector: string
) {
    const { commands, contextMenu } = app;

    if (commands == null) return; // viewer hack

    const CommandIds = {
        EditColumnProperties: namespace + "mavenworks:edit-column-properties",
        CopyColumnProperties: namespace + "mavenworks:copy-column-properties",
        PasteColumnProperties: namespace + "mavenworks:paste-column-properties",
        AddNewColumn: namespace + "mavenworks:table-editor:add-new",
        EditColumn: namespace + "mavenworks:table-editor:edit-name",
        DeleteColumn: namespace + "mavenworks:table-editor:delete-column",
        DeleteRow: namespace + "mavenworks:table-editor:delete-row",
        EditTableAsCsv: namespace + "mavenworks:table-editor:edit-as-csv",
    };

    commands.addCommand(CommandIds.EditColumnProperties, {
        label: "Edit Column Properties",
        isEnabled: () => {
            const focusedPart = getFocusedPart();
            return focusedPart != null
                && focusedPart instanceof SlickGridPart
                && focusedPart.lastColumn != null;
        },
        execute: async () => {
            const focusedPart = getFocusedPart();
            if (focusedPart == null
                || !(focusedPart instanceof SlickGridPart)
                || focusedPart.lastColumn == null
            ) {
                return;
            }
            const name = focusedPart.lastColumn;
            if (!name) {
                return;
            }
            const colFormatting = focusedPart.getColumnFormatting(name);

            const metadata = getFormattingMetadata();
            let formattingWithDefaults = getFormattingWithDefaults(colFormatting);
            const body = new class extends ReactWrapperWidget {
                protected render() {
                    return (<PropertiesEditor
                        properties={metadata}
                        renderEditor={this.renderEditor.bind(this)}/>);
                }

                protected renderEditor(
                    key: string,
                    metadata: PropertiesEditor.IPropertyMetadata
                ) {
                    return (<TypeEditor key={key}
                        value={formattingWithDefaults[key as keyof IColumnFormatting]}
                        type={metadata.type}
                        schema={metadata.schema}
                        onValueChanged={(change) => {
                            // create a new object
                            formattingWithDefaults = {
                                ...formattingWithDefaults, [key]: change
                            };
                            this.update();
                        }} />);
                }
            };
            body.node.style.overflowY = "auto";
            await HoverManager.GetManager().launchEditorDialog(
                body,
                focusedPart,
                400,
                800,
                "Column Properties",
                () => {
                    const newFormatting = stripDefaultsFromFormatting(formattingWithDefaults);
                    focusedPart.setColumnFormatting(name, newFormatting);
                }
            );
        }
    });
    contextMenu.addItem({
        command: CommandIds.EditColumnProperties,
        selector: regionSelector + " .m-SlickGridPart:not(.m-TableEditorPart) .slick-header-column"
    });

    commands.addCommand(CommandIds.CopyColumnProperties, {
        label: "Copy Column Properties",
        isEnabled: () => {
            const focusedPart = getFocusedPart();
            return focusedPart != null
                && focusedPart instanceof SlickGridPart
                && focusedPart.lastColumn != null;
        },
        execute: async () => {
            const focusedPart = getFocusedPart();
            if (focusedPart == null
                || !(focusedPart instanceof SlickGridPart)
                || focusedPart.lastColumn == null
            ) {
                return;
            }
            const name = focusedPart.lastColumn;
            if (!name) {
                return;
            }
            const colFormatting = focusedPart.getColumnFormatting(name);
            localStorage.setItem("mavenworks:column-properties", JSON.stringify(colFormatting));
        }
    });
    contextMenu.addItem({
        command: CommandIds.CopyColumnProperties,
        selector: regionSelector + " .m-SlickGridPart:not(.m-TableEditorPart) .slick-header-column"
    });

    commands.addCommand(CommandIds.PasteColumnProperties, {
        label: "Paste Column Properties",
        isEnabled: () => {
            const focusedPart = getFocusedPart();
            return focusedPart != null
                && focusedPart instanceof SlickGridPart
                && focusedPart.lastColumn != null;
        },
        execute: async () => {
            const focusedPart = getFocusedPart();
            if (focusedPart == null
                || !(focusedPart instanceof SlickGridPart)
                || focusedPart.lastColumn == null
            ) {
                return;
            }
            const name = focusedPart.lastColumn;
            if (!name) {
                return;
            }
            const colFormatting = localStorage.getItem("mavenworks:column-properties");
            if (colFormatting == null) {
                return;
            }
            focusedPart.setColumnFormatting(name, JSON.parse(colFormatting));
        }
    });
    contextMenu.addItem({
        command: CommandIds.PasteColumnProperties,
        selector: regionSelector + " .m-SlickGridPart:not(.m-TableEditorPart) .slick-header-column"
    });

    commands.addCommand(CommandIds.AddNewColumn, {
        label: "Add New Column",
        isEnabled: () => {
            const focusedPart = getFocusedPart();
            return focusedPart != null
                && focusedPart instanceof TableEditorPart;
        },
        execute: async () => {
            const focusedPart = getFocusedPart();
            if (focusedPart == null
                || !(focusedPart instanceof TableEditorPart)
            ) {
                return;
            }
            const editor = new ColumnNameEditor("New column", "Any");
            await HoverManager.GetManager().launchEditorDialog(
                editor,
                focusedPart,
                500,
                500,
                "Add New Column",
                (res) => {
                    focusedPart.addNewColumn(res.name, res.type);
                }
            );
        }
    });
    contextMenu.addItem({
        command: CommandIds.AddNewColumn,
        selector: regionSelector + " .m-TableEditorPart .slick-header"
    });


    commands.addCommand(CommandIds.EditColumn, {
        label: "Edit Column",
        isEnabled: () => {
            const focusedPart = getFocusedPart();
            return focusedPart != null
                && focusedPart instanceof TableEditorPart
                && focusedPart.activeColumn != null;
        },
        execute: async () => {
            const focusedPart = getFocusedPart();
            if (focusedPart == null
                || !(focusedPart instanceof TableEditorPart)
                || focusedPart.activeColumn == null
            ) {
                return;
            }
            const name = focusedPart.activeColumn;
            if (!name) {
                return;
            }
            const editor = new ColumnNameEditor(
                name,
                focusedPart.getTypeForCol(name).serializableName
            );
            await HoverManager.GetManager().launchEditorDialog(
                editor,
                focusedPart,
                500,
                500,
                "Edit Column",
                (res) => focusedPart.changeColumnName(name, res.name, res.type)
            );
        }
    });
    contextMenu.addItem({
        command: CommandIds.EditColumn,
        selector: regionSelector + " .m-TableEditorPart .slick-header-column"
    });

    commands.addCommand(CommandIds.DeleteColumn, {
        label: "Delete Column",
        isEnabled: () => {
            const focusedPart = getFocusedPart();
            return focusedPart != null
                && focusedPart instanceof TableEditorPart
                && focusedPart.activeColumn != null;
        },
        execute: async () => {
            const focusedPart = getFocusedPart();
            if (focusedPart == null
                || !(focusedPart instanceof TableEditorPart)
                || focusedPart.activeColumn == null
            ) {
                return;
            }
            const name = focusedPart.activeColumn;
            if (!name) {
                return;
            }
            focusedPart.deleteColumn(name);
        }
    });
    contextMenu.addItem({
        command: CommandIds.DeleteColumn,
        selector: regionSelector + " .m-TableEditorPart .slick-header-column"
    });

    contextMenu.addItem({
        type: "separator",
        selector: regionSelector + " .m-TableEditorPart .slick-pane-header"
    });

    commands.addCommand(CommandIds.DeleteRow, {
        label: "Delete Row",
        isEnabled: () => {
            const focusedPart = getFocusedPart();
            return focusedPart != null
                && focusedPart instanceof TableEditorPart
                && focusedPart.activeCell != null;
        },
        execute: async () => {
            const focusedPart = getFocusedPart();
            if (focusedPart == null
                || !(focusedPart instanceof TableEditorPart)
                || focusedPart.activeCell == null
            ) {
                return;
            }
            const cell = focusedPart.activeCell;
            if (!cell) {
                return;
            }
            focusedPart.deleteRow(cell.row);
        }
    });
    contextMenu.addItem({
        command: CommandIds.DeleteRow,
        selector: regionSelector + " .m-TableEditorPart .slick-row"
    });

    commands.addCommand(CommandIds.EditTableAsCsv, {
        label: "Edit Table as CSV",
        isEnabled: () => {
            const focusedPart = getFocusedPart();
            return focusedPart != null
                && focusedPart instanceof TableEditorPart;
        },
        execute: async () => {
            const focusedPart = getFocusedPart();
            if (focusedPart == null
                || !(focusedPart instanceof TableEditorPart)
            ) {
                return;
            }
            const str = focusedPart.toCsv();
            const body = new CodeEditorPopup(str);

            await HoverManager.GetManager().launchEditorDialog(
                body,
                focusedPart,
                600,
                600,
                "Edit CSV",
                (res) => focusedPart.fromCsv("" + res)
            );
        }
    });
    contextMenu.addItem({
        command: CommandIds.EditTableAsCsv,
        selector: regionSelector + " .m-TableEditorPart"
    });
}

class ColumnNameEditor extends Widget {
    constructor(oldName: string, oldType: string) {
        super();
        this.node.innerHTML = `
        <span>
            <label for="colName">Column Name</label>
            <input type="text" value="${oldName}" name="colName" />
        </span>
        <span>
            <label for="colType">Column Type</label>
            <select value="${oldType}" name="colType">
                ${Types.registered.map(i =>
                    `<option ${i.serializableName === oldType ? "selected" : ""}>
                        ${i.serializableName}
                    </option>`
                ).join("\n")}
            </select>
        </span>`;
    }

    public getValue(): {name: string, type: string} {
        const nameEl = this.node.querySelector("input[name='colName']");
        const typeEl = this.node.querySelector("select[name='colType']");
        return {
            name: (nameEl as HTMLInputElement).value,
            type: (typeEl as HTMLSelectElement).value
        };
    }
}

class CodeEditorPopup extends Widget {
    private readonly editorFactory: IEditorFactoryService;
    private editorModel: CodeEditor.IModel;
    private editor: CodeEditorWrapper;

    constructor(initialText: string) {
        super();
        this.editorFactory = new CodeMirrorEditorFactory();
        this.editorModel = new CodeEditor.Model({
            mimeType: "text/csv",
            value: initialText
        });

        this.node.style.width = "800px";
        this.node.style.height = "600px";

        const layout = this.layout = new BoxLayout();

        this.editor = new CodeEditorWrapper({
            factory: this.editorFactory.newDocumentEditor,
            model: this.editorModel
        });
        layout.addWidget(this.editor);
    }

    dispose() {
        if (this.isDisposed) return;
        this.editorModel.dispose();
        super.dispose();
    }

    getValue() {
        return this.editorModel.value.text;
    }
}
