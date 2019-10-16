import * as React from "react";
import { GlobalsService } from "@mavenomics/bindings";
import { IterTools, Converters, Types } from "@mavenomics/coreutils";
import { HoverManager, ReactWrapperWidget, TypeEditorHost } from "@mavenomics/ui";
import { OptionsEditor } from "../components";
import { IDashboardTracker } from "../interfaces";
import { IPlugin, Application } from "@phosphor/application";
import { Widget } from "@phosphor/widgets";


export namespace GlobalsEditorCommands {
    export const OpenGlobals = "@mavenomics/dashboard-devtools:GlobalsEditor:openEditor";
}

function serializeGlobals(globalsService: GlobalsService): OptionsEditor.ISerializedArgument[] {
    return Array.from(IterTools.map(globalsService, (i) => {
        return {
            name: i.name,
            typeAnnotation: i.type.serializableName,
            metadata: null,
            defaultValue: Converters.serialize(i.value, i.type)
        } as OptionsEditor.ISerializedArgument;
    }));
}

export const globalsEditorPlugin = {
    id: "@mavenomics/dashboard-devtools:globals-editor",
    autoStart: true,
    requires: [
        IDashboardTracker
    ],
    activate: (app, tracker: IDashboardTracker) => {
        const { commands, contextMenu } = app;
        commands.addCommand(GlobalsEditorCommands.OpenGlobals, {
            label: "Open Globals Editor",
            iconClass: "fa fa-globe",
            isEnabled: () => tracker.getCurrentDashboard() != null,
            execute: async () => {
                let dashboard = tracker.getCurrentDashboard();
                if (dashboard == null) {
                    return;
                }
                let globals = dashboard.globals;

                let serializedGlobals = serializeGlobals(globals);
                const hover = new class extends ReactWrapperWidget {
                    private context: TypeEditorHost.IContext = {
                        portalHostNode: void 0,
                        owner: this,
                    };
                    protected render() {
                        return React.createElement(
                            TypeEditorHost.Context.Provider,
                            { value: this.context },
                            React.createElement(OptionsEditor, {
                                arguments: serializedGlobals,
                                onArgsChanged: (newArgs) => {
                                    serializedGlobals = newArgs;
                                }
                            } as OptionsEditor.IProps)
                        ) as React.ReactElement<unknown>;
                    }

                    protected onAfterChangeDocumentOwner() {
                        this.context = {
                            portalHostNode: this.node.ownerDocument!.body,
                            owner: this
                        };
                        this.update();
                    }
                };
                await HoverManager.GetManager().launchEditorDialog(
                    hover,
                    dashboard,
                    700,
                    500,
                    "Globals Editor",
                    () => {
                        // TODO: Globals#mergeGlobals()
                        const unvisitedGlobals = new Set(IterTools.map(globals, i => i.name));
                        const visitedGlobals = new Set<string>();
                        for (const global of serializedGlobals) {
                            if (!unvisitedGlobals.has(global.name)) {
                                globals.addGlobal(
                                    global.name,
                                    Types.findType(global.typeAnnotation) || Types.Any,
                                    Converters.deserialize(global.defaultValue)
                                );
                                continue;
                            }
                            unvisitedGlobals.delete(global.name);
                            visitedGlobals.add(global.name);
                        }
                        for (const toDelete of unvisitedGlobals.values()) {
                            globals.removeGlobal(toDelete);
                        }
                        for (const toChange of visitedGlobals.values()) {
                            const global = serializedGlobals.find(i => i.name === toChange)!;
                            globals.changeType(toChange, Types.findType(global.typeAnnotation) || Types.Any);
                            globals.set(toChange, Converters.deserialize(global.defaultValue));
                        }
                    }
                );
            }
        });
        commands.addKeyBinding({
            command: GlobalsEditorCommands.OpenGlobals,
            keys: ["Accel G"],
            selector: ".jp-Notebook.jp-mod-commandMode:not(.p-mod-hidden)"
        });
        contextMenu.addItem({
            command: GlobalsEditorCommands.OpenGlobals,
            selector: ".jp-Notebook:not(.p-mod-hidden)"
        });
        commands.addKeyBinding({
            command: GlobalsEditorCommands.OpenGlobals,
            keys: ["Accel G"],
            selector: ".m-DashboardEditor:not(.p-mod-hidden)"
        });
        contextMenu.addItem({
            command: GlobalsEditorCommands.OpenGlobals,
            selector: ".m-DashboardEditor:not(.p-mod-hidden)"
        });
    }
} as IPlugin<Application<Widget>, void>;
