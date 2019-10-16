import { Dashboard, DashboardSerializer } from "@mavenomics/dashboard";
import { JupyterFrontEnd } from "@jupyterlab/application";
import { Menu, Widget } from "@phosphor/widgets";
import { RegionPropertiesEditor, TableBindingEditor } from "./editors";
import * as React from "react";
import { UUID } from "@phosphor/coreutils";
import {
    TabPanelDashboardLayoutRegion,
    LayoutActions,
    WidgetLayoutRegion,
    DashboardLayoutRegion
} from "@mavenomics/layout";
import { Part, PartSerializer, JavascriptEvalPart, PartUtils, OptionsBag } from "@mavenomics/parts";
import { ReactWrapperWidget, HoverManager, TypeEditorHost, InputWidgets } from "@mavenomics/ui";
import { RegisterGridCommands } from "@mavenomics/chart-parts";
import { Table } from "@mavenomics/table";
import { ExportToWorkbook, IExcelExportConfig } from "./ExcelExport";

/**
 * A set of routines to perform actions on dashboards.
 *
 * This is meant as a stand-in for real Phosphor commands, since due to the
 * current architechture we need to duplicate some work here. Until we can
 * factor out the dashboards into an independent plugin, this will have to do
 * for now.
 */
export function DashboardActions(dashboard: Dashboard) {
    const { layoutManager, partManager, globals } = dashboard;
    return class {
        /**
         * Show or hide the titlebar of the focused layout region.
         *
         * #### Notes
         *
         * This sets the `showTitle` layout property.
         */
        public static ToggleTitlebar() {
            const region = layoutManager.focusedRegion;
            if (region == null) {
                return;
            }
            const oldProperty = region.getLayoutProperty("showTitle");
            region.setLayoutProperty("showTitle", !oldProperty);
        }

        /**
         * Open a properties editor for the focused layout region.
         *
         * #### Notes
         *
         * This is currently just a placeholder function for some properties
         * editor.
         */
        public static async EditProperties() {
            const region = layoutManager.focusedRegion;
            if (region == null) {
                return;
            }
            const el = new class extends ReactWrapperWidget {
                constructor() {
                    super();
                    this.title.label = region instanceof WidgetLayoutRegion ?
                        "Edit Part Properties" : "Edit Layout Properties";
                }
                protected render() {
                    return React.createElement(TypeEditorHost.Context.Provider, {
                            value: {
                                owner: this
                            }
                        } as React.ProviderProps<TypeEditorHost.IContext>,
                        [React.createElement(RegionPropertiesEditor, {
                            region,
                            dashboard,
                            showLabel: false
                        })]
                    );
                }
            };
            const hover = HoverManager.Instance!.openDialog({
                hover: el,
                width: 400,
                height: 600,
                owner: dashboard
            });
            await hover.onClosed;
            el.dispose();
        }

        /**
         * Allow the user to change a region's caption, if it is visible.
         *
         * #### Notes
         *
         * This opens an `<input type="text" />` in the titlebar, which is
         * styled to look like the regular caption. As soon as it's focused, the
         * text is selected to indicate that it's editable and allow for quick
         * renames.
         */
        public static async EditCaption() {
            const region = layoutManager.focusedRegion;
            if (region == null) {
                return;
            }
            if (region.parentRegion instanceof TabPanelDashboardLayoutRegion) {
                // we need to do something different
                const node = document.createElement("input");
                node.type = "text";
                node.value = region.getLayoutProperty("caption");
                const editor = new Widget({ node });
                (editor as Widget & {getValue: () => string}).getValue = () => {
                    return node.value;
                };
                await HoverManager.GetManager().launchEditorDialog(
                    editor,
                    dashboard,
                    200,
                    125,
                    "Region Caption",
                    (res) => {
                        if (res == null) return;
                        region.setLayoutProperty("caption", res);
                    }
                );
                return;
            }
            region.setLayoutProperty("showTitle", true);
            region.titlebar.edit();
        }

        /**
         * Add a new part to the active layout region.
         *
         * @param partType The type of part to add.
         *
         * #### Notes
         *
         * If the active region's parent isn't already a Tab Panel, the
         * active region will be surrounded with one.
         */
        public static async AddNewTab(
            partType: string | null,
            __called = false
        ): Promise<void> {
            if (partType == null) return;
            let region: DashboardLayoutRegion<any> | null = layoutManager.focusedRegion;
            if (region == null) {
                region = layoutManager.root;
            }
            let parent = region.parentRegion as TabPanelDashboardLayoutRegion | null;
            if (!(parent instanceof TabPanelDashboardLayoutRegion)) {
                if (__called) return; // don't re-add a tab panel
                if (region === layoutManager.root) {
                    // add a new tab panel
                    parent = new TabPanelDashboardLayoutRegion(layoutManager);
                    parent.setLayoutProperty("prunable", true);
                    parent.setFresh();
                    layoutManager.root.addChild(parent);
                    region = null;
                } else {
                    LayoutActions.SurroundWith({
                        layoutManager,
                        target: region.id,
                        regionType: LayoutActions.ContainerTypes.TabPanel,
                        prunable: true
                    });
                    return this.AddNewTab(partType, true);
                }
            }
            const part = await partManager.addPart(partType);
            const newRegion = new WidgetLayoutRegion(layoutManager, part, part.uuid);
            parent.addChild(newRegion);
            // focus the new child
            parent.setLayoutProperty("ForegroundIndex", parent.widgets.length - 1);
            newRegion.focus();
        }

        /** Refresh the focused part */
        public static RefreshPart() {
            const region = layoutManager.focusedRegion;
            if (!(region instanceof WidgetLayoutRegion && region.content instanceof Part)) {
                return;
            }
            region.content.refresh();
        }

        /** Close the focused region. */
        public static CloseRegion() {
            const region = layoutManager.focusedRegion;
            if (!region) return;
            region.close();
        }

        /**
         * Returns the model for the dashboard, optionally with localized UDPs.
         *
         * This is a hacky function and should not be used in production
         *
         * @param [selfcontained=false] If true, includes the UDPs as local JSEPs.
         * @returns the dashboard model
         */
        public static ExportToDashboard(selfcontained = false) {
            const model = DashboardSerializer.toJson(dashboard);
            if (selfcontained) {
                model.localParts = { ...model.localParts };

                for (const [partId, part] of dashboard.partManager) {
                    if (!JavascriptEvalPart.isUDPWrapper(part)) {
                        console.warn("Could not package part", partId);
                        continue;
                    }
                    const configModel = part.configObject;
                    if (configModel.name in model.localParts) {
                        // part was already packaged
                        continue;
                    }
                    model.localParts[configModel.name] = configModel;
                }
            }
            return model;
        }

        /**
         * Duplicates the focused part, cloning bindings and layout props.
         *
         * Duplicated parts have a different ID but are otherwise identical to
         * their originator- all bindings are copied, along with the layout
         * properties of the owning WidgetLayoutRegion.
         */
        public static async DuplicatePart() {
            const focusedRegion = layoutManager.focusedRegion;
            if (!(focusedRegion instanceof WidgetLayoutRegion)) return;
            const part = focusedRegion.getChild();
            if (!(part instanceof Part)) return;

            const model = PartSerializer.toJson(part, partManager.getBagById(part.uuid)!);
            model.id = UUID.uuid4();
            const newPart = await partManager.addPart(model.name, model);
            const widget = new WidgetLayoutRegion(layoutManager, newPart, newPart.uuid);
            // copy from old props
            widget.properties = {...focusedRegion.properties};
            const idx = focusedRegion.parentRegion!.widgets.indexOf(focusedRegion);
            focusedRegion.parentRegion!.insertChild(idx + 1, widget);
        }

        public static CopyOptionsToClipboard() {
            const focusedRegion = layoutManager.focusedRegion;
            if (!(focusedRegion instanceof WidgetLayoutRegion)) return;
            const part = focusedRegion.getChild();
            if (!(part instanceof Part)) return;

            if (!PartUtils.isTablePart(part)) return;

            const content = focusedRegion.content;
            const bag = partManager.getBagById(focusedRegion.guid);
            if (!(content instanceof Part) || bag == null) return;

            const fragment = PartSerializer.toJson(content, bag).options[PartUtils.INPUT_OPTION];
            localStorage.setItem("mavenworks:clipboard:options", JSON.stringify(fragment));
        }

        public static PasteOptionsFromClipboard() {
            const focusedRegion = layoutManager.focusedRegion;
            if (!(focusedRegion instanceof WidgetLayoutRegion)) return;
            const part = focusedRegion.getChild();
            if (!(part instanceof Part)) return;

            if (!PartUtils.isTablePart(part)) return;
            const data = localStorage.getItem("mavenworks:clipboard:options");
            if (data == null) return;
            const model = JSON.parse(data) as PartSerializer.ISerializedPartOptions[string];

            partManager.setOptionForPart(focusedRegion.guid,
                PartUtils.INPUT_OPTION,
                model);
        }

        public static async EditTablePartBinding() {
            const focusedRegion = layoutManager.focusedRegion;
            if (!(focusedRegion instanceof WidgetLayoutRegion)) return;
            const part = focusedRegion.getChild();
            if (!(part instanceof Part)) return;

            if (!PartUtils.isTablePart(part)) return;

            const bag = partManager.getBagById(part.uuid)!;
            const metadata = bag.getMetadata(PartUtils.INPUT_OPTION);

            const body = new TableBindingEditor(dashboard.globals, dashboard.bindings, metadata.binding!);

            await HoverManager.Instance!.launchEditorDialog(
                body,
                dashboard,
                500,
                500,
                "Edit Binding",
                (arg) => {
                    if (arg == null) return;
                    partManager.setOptionForPart(part.uuid, PartUtils.INPUT_OPTION, arg);
                }
            );
        }

        public static async EditValuePartBinding() {
            const focusedRegion = layoutManager.focusedRegion;
            if (!(focusedRegion instanceof WidgetLayoutRegion)) return;
            const part = focusedRegion.getChild();
            if (!(part instanceof Part)) return;

            if (!PartUtils.isValuePart(part)) return;

            const opt = PartUtils.getValueOption(part)!;
            const editor = new InputWidgets.Text();
            editor.label = "Global:";
            editor.value = "";

            await HoverManager.Instance!.launchEditorDialog(
                editor,
                dashboard,
                250,
                125,
                "Edit Binding",
                () => {
                    if (editor.value == null || editor.value === "") return;
                    if (!globals.has(editor.value)) {
                        globals.addGlobal(editor.value, opt.type, opt.value);
                    }
                    const arg = {
                        expr: editor.value,
                        globals: [editor.value],
                        type: "Global"
                    } as OptionsBag.Binding;
                    partManager.setOptionForPart(part.uuid, opt.name, arg);
                }
            );
        }

        public static async ExportToExcel() {
            const focusedRegion = layoutManager.focusedRegion;
            if (!(focusedRegion instanceof WidgetLayoutRegion)) return;
            const part = focusedRegion.getChild();
            if (!(part instanceof Part)) return;

            if (!PartUtils.isValuePart(part)) return;

            const bag = partManager.getBagById(part.uuid)!;
            const table = bag.get(PartUtils.INPUT_OPTION) as Table;

            const hasFormatting = part.constructor.GetMetadata().getMetadataForOption("Formatting") != null;
            const formatting = hasFormatting
                ? <any>JSON.parse(<string>bag.get("Formatting"))
                : {};
            const hasShowPath = part.constructor.GetMetadata().getMetadataForOption("Show Path Column") != null;
            const showPath = hasShowPath
                ? <boolean>bag.get("Show Path Column")
                : false;

            const config: Partial<IExcelExportConfig> = {
                showPath: showPath,
                rowGrouping: showPath,
                columnGrouping: true,
            };

            if (table && table.rows) {
                let workbook = ExportToWorkbook(table, config, formatting);

                workbook.xlsx.writeBuffer({useStyles: true})
                    .then(function (buffer) {
                        const pseudolink = document.createElement("a");
                        pseudolink.download = "export.xlsx";
                        const href = URL.createObjectURL(new Blob(
                            [buffer],
                            { type: "application/octet-strea" })
                        );
                        pseudolink.href = href;
                        pseudolink.click();
                        URL.revokeObjectURL(href);
                    });
            }
        }
    };
}

interface ICmdPalette {
    addItem(args: {
        category: string,
        command: string,
        args?: any,
        rank?: number
    }): void;
}

//#region Dashboard Hack Commands
/**
 * Register Phosphor commands for interacting with dashboards
 *
 * #### Notes
 *
 * These exist because we don't currently have the Dashboard as an
 * independent plugin. Without that, there is some duplicated effort. This
 * function abstracts most of that away, so at least we just have to repeat a
 * single function call.
 */
export function RegisterActions(
    app: JupyterFrontEnd,
    getDashboard: () => Dashboard | null,
    namespace: string,
    regionSelector: string,
    namePrefix?: string,
    palette?: ICmdPalette
) {
    const {commands, contextMenu} = app;
    // HACK: The Dashboard Viewer doesn't have a Command Registry. Because it
    // just fakes these things, we need to sidestep it for now.
    if (commands == null) return;
    // context menu items must explicitly target layout regions
    const contextMenuSelector = regionSelector + " .m-Dashboard .m-LayoutManager .maven_dashboard";
    // shortcuts shouldn't fire in regions that have focus
    const shortcutSelector = regionSelector + " :not(input)";
    const DashboardCmds = {
        EditProperties:     namespace + ":hack:edit-properties",
        EditCaption:        namespace + ":hack:edit-caption",
        ToggleTitlebar:     namespace + ":hack:toggle-titlebar",
        ToggleMaximize:     namespace + ":hack:toggle-maximize",
        SurroundWith:       namespace + ":hack:surround-with-region",
        AddNewTab:          namespace + ":hack:add-new-tab",
        AddNewTabCustom:    namespace + ":hack:add-new-tab-custom",
        RefreshPart:        namespace + ":hack:refresh-part",
        CloseRegion:        namespace + ":hack:close-region",
        Export:             namespace + ":hack:export-dashboard",
        Import:             namespace + ":hack:import-dashboard",
        DuplicatePart:      namespace + ":hack:duplicate-part",
        CopyOptions:        namespace + ":hack:copy-options",
        PasteOptions:       namespace + ":hack:paste-options",
        EditTableBinding:   namespace + ":hack:edit-table-binding",
        EditValueBinding:   namespace + ":hack:edit-value-binding",
        ExportToExcel:      namespace + ":hack:export-to-excel"
    };
    function getFocusedRegion() {
        const dashboard = getDashboard();
        if (dashboard == null || dashboard.layoutManager.focusedRegion == null) {
            return null;
        }
        return dashboard.layoutManager.focusedRegion;
    }

    //#region Commands
    commands.addCommand(DashboardCmds.EditProperties, {
        label: () => {
            const focusedRegion = getFocusedRegion();
            if (focusedRegion == null) return "Edit Properties";
            return focusedRegion instanceof WidgetLayoutRegion ? "Edit Part Properties" : "Edit Layout Properties";
        },
        isEnabled: () => getFocusedRegion() != null,
        execute: () => {
            const dashboard = getDashboard();
            if (dashboard == null) return;
            return DashboardActions(dashboard).EditProperties();
        }
    });

    commands.addCommand(DashboardCmds.EditCaption, {
        label: "Edit Caption",
        isEnabled: () => getFocusedRegion() != null,
        execute: () => {
            const dashboard = getDashboard();
            if (dashboard == null) return;
            return DashboardActions(dashboard).EditCaption();
        }
    });

    commands.addCommand(DashboardCmds.ToggleMaximize, {
        label: () => {
            const focusedRegion = getFocusedRegion();
            if (focusedRegion == null) return "Toggle Maximize";
            const isMax = focusedRegion.getLayoutProperty("maximized");
            return isMax ? "Unmaximize" : "Maximize";
        },
        isEnabled: () => {
            let focused = getFocusedRegion();
            const dashboard = getDashboard();
            if (dashboard == null) return false;
            return focused != null && focused !== dashboard.layoutManager.root;
        },
        execute: () => {
            const focusedRegion = getFocusedRegion();
            if (focusedRegion != null) {
                focusedRegion.setLayoutProperty("maximized", !focusedRegion.getLayoutProperty("maximized"));
                focusedRegion.update();
            }
        }
    });


    commands.addCommand(DashboardCmds.ToggleTitlebar, {
        label: () => {
            const focusedRegion = getFocusedRegion();
            if (focusedRegion == null) return "Toggle Title";
            const isShown = focusedRegion.getLayoutProperty("showTitle");
            return isShown ? "Hide Title" : "Show Title";
        },
        isEnabled: () => {
            const region = getFocusedRegion();
            return !(
                   region == null
                || region.parentRegion instanceof TabPanelDashboardLayoutRegion
            );
        },
        execute: () => {
            const dashboard = getDashboard();
            if (dashboard == null) return;
            return DashboardActions(dashboard).ToggleTitlebar();
        }
    });

    commands.addCommand(DashboardCmds.SurroundWith, {
        label: ({regionType}) => "" + regionType,
        isEnabled: () => getFocusedRegion() != null,
        execute: (args) => {
            const regionType = args["regionType"] as LayoutActions.ContainerTypes;
            const prunable = args["prunable"] == null ? true : !!args["prunable"];
            if (regionType == null) return;
            const dashboard = getDashboard();
            if (dashboard == null) return;
            const layoutManager = dashboard.layoutManager;
            const targetRegion = getFocusedRegion();
            if (targetRegion == null) return;
            const target = targetRegion.id;
            return LayoutActions.SurroundWith({ layoutManager, regionType, target, prunable });
        }
    });

    commands.addCommand(DashboardCmds.AddNewTab, {
        label: ({partType}) => "Add New " + partType,
        isEnabled: () => {
            const region = getFocusedRegion();
            const dashboard = getDashboard();
            return region != null
                && dashboard != null
                && (region.parentRegion != null
                    || region instanceof TabPanelDashboardLayoutRegion
                    || region === dashboard.layoutManager.root);
        },
        execute: ({partType}) => {
            const dashboard = getDashboard();
            if (dashboard == null) return;
            return DashboardActions(dashboard).AddNewTab(partType as string | null);
        }
    });

    commands.addCommand(DashboardCmds.AddNewTabCustom, {
        label: "Add New Part...",
        isEnabled: () => {
            const region = getFocusedRegion();
            const dashboard = getDashboard();
            return region != null
                && dashboard != null
                && (region.parentRegion != null
                    || region instanceof TabPanelDashboardLayoutRegion
                    || region === dashboard.layoutManager.root);
        },
        execute: async () => {
            const dashboard = getDashboard();
            if (dashboard == null) return;
            const selectedPart = await dashboard.layoutManager.showAddPartDialog();
            if (selectedPart == null) return;
            return DashboardActions(dashboard).AddNewTab(selectedPart);
        }
    });

    commands.addCommand(DashboardCmds.RefreshPart, {
        label: "Refresh Part",
        isEnabled: () => {
            const region = getFocusedRegion();
            return region != null
                && region instanceof WidgetLayoutRegion
                && region.content instanceof Part;
        },
        execute: () => {
            const dashboard = getDashboard();
            if (dashboard == null) return;
            return DashboardActions(dashboard).RefreshPart();
        }
    });

    commands.addCommand(DashboardCmds.CloseRegion, {
        label: () => getFocusedRegion() instanceof WidgetLayoutRegion ? "Close Part" : "Close Panel",
        isEnabled: () => {
            const region = getFocusedRegion();
            return region != null && region.parentRegion != null;
        },
        execute: () => {
            const dashboard = getDashboard();
            if (dashboard == null) return;
            return DashboardActions(dashboard).CloseRegion();
        }
    });

    commands.addCommand(DashboardCmds.DuplicatePart, {
        label: "Duplicate Part",
        isEnabled: () => {
            const focusedRegion = getFocusedRegion();
            return (
                focusedRegion instanceof WidgetLayoutRegion
                && focusedRegion.getChild() instanceof Part
            );
        },
        execute: () => {
            const dashboard = getDashboard();
            if (dashboard == null) return;
            return DashboardActions(dashboard).DuplicatePart();
        }
    });

    // This command is hackish and not really meant for production use.
    // It doesn't account for CWD, nor does it account for things like not being
    // able to write to the output dir.
    commands.addCommand(DashboardCmds.Export, {
        label: "Export Dashboard",
        isEnabled: () => getDashboard() != null,
        execute: async () => {
            const dashboard = getDashboard();
            if (dashboard == null) return;
            const content = DashboardActions(dashboard).ExportToDashboard(true);
            const pseudolink = document.createElement("a");
            pseudolink.download = "Untitled Dashboard.dashboard";
            const href = URL.createObjectURL(new Blob(
                // make exports pretty
                [JSON.stringify(content, void 0, "\t")],
                { type: "application/json" })
            );
            pseudolink.href = href;
            pseudolink.click();
            URL.revokeObjectURL(href);
        }
    });

    commands.addCommand(DashboardCmds.Import, {
        label: "Import Dashboard",
        isEnabled: () => getDashboard() != null,
        execute: async () => {
            const dashboard = getDashboard();
            if (dashboard == null) return;
            // because HTML is weird, we can't just say we want a file
            // picker. We have to create an `<input type="file"/>`, simulate
            // a click on it, get the file, create a file *reader*, attach
            // a load event to it, read it, and *then* we'll have the text
            // content of the file. And of course it's all callbacks...
            const fileInput = document.createElement("input");
            fileInput.type = "file";
            fileInput.addEventListener("change", () => {
                if (fileInput.files == null) return;
                const file = fileInput.files[0];
                if (file == null) return;

                const reader = new FileReader();
                reader.addEventListener("load", (ev) => {
                    if (ev.target == null) return;
                    const model = (ev.target as FileReader).result as string;
                    let data: DashboardSerializer.ISerializedDashboard;
                    try {
                        data = JSON.parse(model);
                    } catch (err) {
                        HoverManager.Instance!.openErrorDialog(err);
                        return;
                    }
                    HoverManager.Instance!.closeAllHovers();
                    dashboard.loadFromModel(data);
                });
                reader.readAsText(file);
            });
            fileInput.click();
        }
    });

    commands.addCommand(DashboardCmds.CopyOptions, {
        label: "Copy Query Binding",
        isEnabled: () => {
            const region = getFocusedRegion();
            return region != null
                && region instanceof WidgetLayoutRegion
                && region.content instanceof Part
                && PartUtils.isTablePart(region.content);
        },
        execute: () => {
            const dashboard = getDashboard();
            if (dashboard == null) return;
            return DashboardActions(dashboard).CopyOptionsToClipboard();
        }
    });
    commands.addCommand(DashboardCmds.PasteOptions, {
        label: "Paste Query Binding",
        isEnabled: () => {
            const region = getFocusedRegion();
            return region != null
                && region instanceof WidgetLayoutRegion
                && region.content instanceof Part
                && PartUtils.isTablePart(region.content)
                && localStorage.getItem("mavenworks:clipboard:options") != null;
        },
        execute: () => {
            const dashboard = getDashboard();
            if (dashboard == null) return;
            return DashboardActions(dashboard).PasteOptionsFromClipboard();
        }
    });

    commands.addCommand(DashboardCmds.EditTableBinding, {
        label: "Edit Query",
        isEnabled: () => {
            const region = getFocusedRegion();
            return region != null
                && region instanceof WidgetLayoutRegion
                && region.content instanceof Part
                && PartUtils.isTablePart(region.content);
        },
        execute: () => {
            const dashboard = getDashboard();
            if (dashboard == null) return;
            return DashboardActions(dashboard).EditTablePartBinding();
        }
    });

    commands.addCommand(DashboardCmds.EditValueBinding, {
        label: "Edit Binding",
        isEnabled: () => {
            const region = getFocusedRegion();
            return region != null
                && region instanceof WidgetLayoutRegion
                && region.content instanceof Part
                && PartUtils.isValuePart(region.content);
        },
        execute: () => {
            const dashboard = getDashboard();
            if (dashboard == null) return;
            return DashboardActions(dashboard).EditValuePartBinding();
        }
    });

    commands.addCommand(DashboardCmds.ExportToExcel, {
        label: "Export to Excel",
        isEnabled: () => {
            const region = getFocusedRegion();
            return region != null
                && region instanceof WidgetLayoutRegion
                && region.content instanceof Part
                && PartUtils.isValuePart(region.content);
        },
        execute: () => {
            const dashboard = getDashboard();
            if (dashboard == null) return;
            return DashboardActions(dashboard).ExportToExcel();
        }
    });
    //#endregion

    //#region Shortcuts
    commands.addKeyBinding({
        command: DashboardCmds.EditProperties,
        keys: ["Accel E", "Accel P"],
        selector: shortcutSelector
    });

    commands.addKeyBinding({
        command: DashboardCmds.AddNewTab,
        keys: ["Alt T"],
        selector: shortcutSelector,
        args: {partType: "SlickGrid"}
    });

    commands.addKeyBinding({
        command: DashboardCmds.AddNewTabCustom,
        keys: ["Alt Shift T"],
        selector: shortcutSelector,
    });

    commands.addKeyBinding({
        command: DashboardCmds.RefreshPart,
        keys: ["Accel R"],
        selector: shortcutSelector,
    });

    commands.addKeyBinding({
        command: DashboardCmds.CloseRegion,
        keys: ["Alt W"],
        selector: shortcutSelector
    });

    commands.addKeyBinding({
        command: DashboardCmds.CopyOptions,
        keys: ["Accel Shift C"],
        selector: shortcutSelector
    });

    commands.addKeyBinding({
        command: DashboardCmds.PasteOptions,
        keys: ["Accel Shift V"],
        selector: shortcutSelector
    });

    commands.addKeyBinding({
        command: DashboardCmds.EditTableBinding,
        keys: ["Accel E", "Accel Q"],
        selector: shortcutSelector,
    });

    commands.addKeyBinding({
        command: DashboardCmds.EditValueBinding,
        keys: ["Accel E", "Accel B"],
        selector: shortcutSelector
    });

    commands.addKeyBinding({
        command: DashboardCmds.ToggleMaximize,
        keys: ["Accel M"],
        selector: shortcutSelector,
    });

    //#endregion

    //#region Context menu items
    for (const cmd of [
        "DuplicatePart",
        "EditProperties",
        "EditTableBinding",
        "EditValueBinding",
        "EditCaption",
        "ToggleTitlebar",
        "ToggleMaximize",
        "RefreshPart",
        "CloseRegion",
        "AddNewTabCustom",
        "CopyOptions",
        "PasteOptions"
    ] as const) {
        contextMenu.addItem({
            command: DashboardCmds[cmd],
            selector: contextMenuSelector
        });
    }
    contextMenu.addItem({
        command: DashboardCmds.AddNewTab,
        selector: contextMenuSelector,
        args: {partType: "SlickGrid"}
    });
    const surroundWithMenu = new Menu({
        commands
    });
    surroundWithMenu.title.label = "Surround With";
    for (const regionType of [
        LayoutActions.ContainerTypes.TabPanel,
        LayoutActions.ContainerTypes.StackPanel,
        LayoutActions.ContainerTypes.CanvasPanel,
    ]) {
        surroundWithMenu.addItem({
            command: DashboardCmds.SurroundWith,
            args: { regionType, prunable: false }
        });
    }

    contextMenu.addItem({
        type: "submenu",
        submenu: surroundWithMenu,
        selector: contextMenuSelector
    });
    contextMenu.addItem({
        type: "separator",
        selector: contextMenuSelector
    });

    contextMenu.addItem({
        type: "command",
        command: DashboardCmds.Export,
        selector: contextMenuSelector
    });

    contextMenu.addItem({
        type: "command",
        command: DashboardCmds.Import,
        selector: contextMenuSelector
    });
    contextMenu.addItem({
        type: "command",
        command: DashboardCmds.ExportToExcel,
        selector: contextMenuSelector
    });
    contextMenu.addItem({
        type: "separator",
        selector: contextMenuSelector
    });
    //#endregion

    //#region Command Palette
    if (palette != null) {
        for (const command of Object.values(DashboardCmds)) {
            palette.addItem({
                command,
                category: (namePrefix ? namePrefix + " " : "") + "Dashboard"
            });
        }
    }
    //#endregion

    // Add grid commands
    RegisterGridCommands(
        app,
        () => {
            const focusedRegion = getFocusedRegion();
            if (!focusedRegion) return null;
            if (!(focusedRegion.content instanceof Part)) return null;
            return focusedRegion.content;
        },
        namespace,
        regionSelector
    );
}
