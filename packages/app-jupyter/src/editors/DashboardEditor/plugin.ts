import { JupyterFrontEndPlugin, ILayoutRestorer, JupyterFrontEnd } from "@jupyterlab/application";
import { ICommandPalette, IWidgetTracker, WidgetTracker } from "@jupyterlab/apputils";
import { Token } from "@phosphor/coreutils";
import { IRenderMimeRegistry } from "@jupyterlab/rendermime";
import { ILauncher } from "@jupyterlab/launcher";
import { IFileBrowserFactory } from "@jupyterlab/filebrowser";
import { DashboardEditor } from "./editor";
import { DashboardEditorFactory } from "./factory";
import { IPartFactory } from "@mavenomics/parts";
import { Contents } from "@jupyterlab/services";
import { ScriptEditor } from "./scripteditor";
import { nbformat } from "@jupyterlab/coreutils";
import { IEditorServices } from "@jupyterlab/codeeditor";
import { IMainMenu, IRunMenu, IKernelMenu, IFileMenu } from "@jupyterlab/mainmenu";
import { Widget } from "@phosphor/widgets";
import { HoverManager } from "@mavenomics/ui";
import { RegisterActions } from "@mavenomics/dashboard-devtools";

export type IDashboardEditorTracker = IWidgetTracker<DashboardEditor>;
export const IDashboardEditorTracker = new Token<IDashboardEditorTracker>(
    "jupyterlab-mavenworks:DashboardEditorTracker"
);

namespace CommandIds {
    /** Create a new Dashboard with an empty layout */
    export const CreateNew = "dashboard:create";
    /** Open the Dashboard Script Editor */
    export const OpenScriptEditor = "dashboard:open-script-editor";
    /** Open a new KernelConsole for the dashboard's kernel
     *
     * #### Notes
     *
     * This is useful for exploration and trying things out, but any setup
     * code _must_ go into the Dashboard Script.
     */
    export const OpenNewConsole = "dashboard:open-new-console";
    /** Restart the kernel for the open document */
    export const RestartKernel = "dashboard:restart-kernel";
}

function activatePlugin(
    // REQUIRED dependencies
    app: JupyterFrontEnd,
    rendermime: IRenderMimeRegistry,
    factory: IPartFactory,
    layout: ILayoutRestorer,
    filebrowser: IFileBrowserFactory,
    editorServices: IEditorServices,
    // OPTIONAL dependencies
    launcher?: ILauncher,
    palette?: ICommandPalette,
    mainMenu?: IMainMenu,
) {
    const {commands, docRegistry} = app;
    const tracker = new WidgetTracker<DashboardEditor>({
        namespace: "dashboardEditor"
    });

    //#region Document Registry setup
    docRegistry.addFileType({
        displayName: "MavenWorks Dashboard",
        extensions: [
            ".dashboard"
        ],
        fileFormat: "text", //todo: JSON
        mimeTypes: [
            "text/plain",
        ],
        name: "dashboard",
        iconClass: "m-FileIcon material-icons",
        iconLabel: "dashboard"
    });
    const widgetFactory = new DashboardEditorFactory({
        rendermime,
        factory,
        commands
    });
    docRegistry.addWidgetFactory(widgetFactory);
    //#endregion

    //#region Instance tracker and layout restore
    widgetFactory.widgetCreated.connect((_sender, widget) => {
        tracker.add(widget);
        widget.context.pathChanged.connect(() => {
            tracker.save(widget);
        });
    });
    layout.restore(tracker, {
        command: "docmanager:open",
        args: widget => ({path: widget.context.path, factory: "Dashboard"}),
        name: widget => widget.context.path
    });
    //#endregion

    //#region Commands
    commands.addCommand(CommandIds.CreateNew, {
        label: "Dashboard",
        caption: "Create a new Dashboard",
        iconClass: "material-icons m-LauncherIcon m-Icon-Dashboard",
        iconLabel: "dashboard",
        execute: async (args) => {
            let cwd = args["cwd"] || filebrowser.defaultBrowser.model.path;
            const model = await commands.execute("docmanager:new-untitled", {
                path: cwd,
                type: "file",
                ext: ".dashboard"
            }) as Contents.IModel;
            await commands.execute("docmanager:open", {
                path: model.path,
                factory: "Dashboard"
            });
        }
    });
    if (launcher != null) {
        launcher.add({
            category: "MavenWorks",
            command: CommandIds.CreateNew,
        });
    }
    commands.addCommand(CommandIds.OpenNewConsole, {
        label: "Open console",
        caption: "Open a new console for the active dashboard",
        isEnabled: () => tracker.currentWidget != null,
        execute: async (args) => {
            let path = args.path;
            if (tracker.currentWidget == null) return;
            const widget = tracker.currentWidget;
            if (path == null) {
                path = widget.context.path;
            }
            await commands.execute("console:create", { path });
        }
    });
    if (palette != null) {
        palette.addItem({
            category: "Dashboard Editor",
            command: CommandIds.OpenNewConsole,

        });
    }
    commands.addCommand(CommandIds.OpenScriptEditor, {
        label: "Open Script Editor",
        caption: "Open the initialization script editor",
        isEnabled: () => tracker.currentWidget != null,
        execute: async ({id}: {id?: string}) => {
            let widget: DashboardEditor;
            if (id == null) {
                if (tracker.currentWidget == null) {
                    return;
                }
                widget = tracker.currentWidget;
            } else {
                const widgetOrNull = tracker.find(i => i.id === id);
                if (widgetOrNull == null) {
                    return;
                }
                widget = widgetOrNull;
            }
            const script = widget.script;
            const kernel = widget.session.kernel;
            let language: nbformat.ILanguageInfoMetadata;
            if (kernel == null) {
                language = {
                    name: widget.session.kernelPreference.language || ""
                };
            } else {
                language = kernel.info!.language_info;
            }
            const editor = new ScriptEditor({
                script,
                language,
                editorServices
            });
            HoverManager.GetManager()
                .launchEditorDialog(
                    editor,
                    widget,
                    500,
                    500,
                    "Initialization Script Editor",
                    () => {
                        widget.script = editor.value;
                    }
                );
        }
    });
    commands.addKeyBinding({
        command: CommandIds.OpenScriptEditor,
        keys: ["Accel E", "Accel S"],
        selector: ".m-DashboardEditor:not(.p-mod-hidden)"
    });
    commands.addCommand(CommandIds.RestartKernel, {
        label: "Restart Kernel",
        isEnabled: () => tracker.currentWidget != null,
        execute: () => {
            const { currentWidget } = tracker;
            if (currentWidget == null) return;
            return currentWidget.session.restart();
        }
    });
    commands.addKeyBinding({
        command: CommandIds.RestartKernel,
        keys: ["0", "0"],
        selector: ".m-DashboardEditor:not(.p-mod-hidden)"
    });
    if (palette != null) {
        palette.addItem({
            category: "Dashboard Editor",
            command: CommandIds.OpenScriptEditor
        });
    }

    RegisterActions(app,
        () => !!tracker.currentWidget ? tracker.currentWidget.content : null,
        "dashboard-editor",
        ".m-DashboardEditor:not(.p-mod-hidden)",
        "Standalone",
        palette
    );
    //#endregion

    //#region Menu integrations
    if (mainMenu != null) {
        const codeRunner: IRunMenu.ICodeRunner<DashboardEditor> = {
            tracker,
            noun: "Init Script",
            run: (ed) => ed.run(),
            restartAndRunAll: async (ed) => {
                const res = await ed.session.restart();
                if (!res) {
                    return false;
                }
                await ed.run();
                return true;
            }
        };
        const kernelUser: IKernelMenu.IKernelUser<DashboardEditor> = {
            tracker,
            noun: "Init Script",
            changeKernel: (ed) => ed.session.selectKernel(),
            interruptKernel: async (ed) => {
                if (ed.session.kernel == null) return;
                return await ed.session.kernel.interrupt();
            },
            restartKernel: (ed) => ed.session.restart(),
            shutdownKernel: (ed) => ed.session.shutdown()
        };
        const consoleCreator: IFileMenu.IConsoleCreator<DashboardEditor> = {
            tracker,
            name: "Dashboard Document",
            createConsole: ed => commands.execute("console:create", {
                path: ed.context.path,
                preferredLanguage: ed.context.model.defaultKernelLanguage,
                activate: true,
                ref: ed.id,
                insertMode: "split-bottom"
            })
        };
        // #add is contravariant
        mainMenu.runMenu.codeRunners.add(codeRunner as any as IRunMenu.ICodeRunner<Widget>);
        mainMenu.kernelMenu.kernelUsers.add(kernelUser as any as IKernelMenu.IKernelUser<Widget>);
        mainMenu.fileMenu.consoleCreators.add(consoleCreator as any as IFileMenu.IConsoleCreator<Widget>);
    }
    //#endregion

    return tracker;
}

const dashboardEditorPlugin: JupyterFrontEndPlugin<IDashboardEditorTracker> = {
    id: "jupyterlab-mavenworks:dashboard-editor",
    autoStart: true,
    requires: [
        IRenderMimeRegistry,
        IPartFactory,
        ILayoutRestorer,
        IFileBrowserFactory,
        IEditorServices,
    ],
    optional: [
        ILauncher,
        ICommandPalette,
        IMainMenu
    ],
    provides: IDashboardEditorTracker,
    activate: activatePlugin
};
export default dashboardEditorPlugin;
