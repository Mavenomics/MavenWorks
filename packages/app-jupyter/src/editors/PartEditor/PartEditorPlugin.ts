import { JupyterFrontEndPlugin, JupyterFrontEnd, ILayoutRestorer } from "@jupyterlab/application";
import { ABCWidgetFactory, DocumentRegistry, IDocumentWidget, DocumentWidget } from "@jupyterlab/docregistry";
import { IWidgetTracker, WidgetTracker } from "@jupyterlab/apputils";
import { Token } from "@phosphor/coreutils";
import { IFileBrowserFactory } from "@jupyterlab/filebrowser";
import { ILauncher } from "@jupyterlab/launcher";
import { IEditorServices } from "@jupyterlab/codeeditor";
import { IRenderMimeRegistry } from "@jupyterlab/rendermime";
import { URLExt, PageConfig } from "@jupyterlab/coreutils";
import { PartEditor } from "@mavenomics/dashboard-devtools";

export type IPartEditorTracker = IWidgetTracker<IDocumentWidget<PartEditor>>;

export class PartEditorFactory extends ABCWidgetFactory<IDocumentWidget<PartEditor>, DocumentRegistry.ICodeModel> {
    private editorServices: IEditorServices;
    private rendermime: IRenderMimeRegistry;

    constructor(options: PartEditorFactoryNS.IOptions) {
        super(options);
        this.editorServices = options.editorServices;
        this.rendermime = options.rendermime;
    }
    protected createNewWidget(context: DocumentRegistry.CodeContext) {
        const content = new PartEditor({
            mimeType: context.model.mimeType,
            editorServices: this.editorServices,
            rendermime: this.rendermime,
            context: {
                get isReady() { return context.isReady; },
                get last_modified() { return context.contentsModel!.last_modified; },
                get path() { return context.path; },
                get session() { return context.session; }
            },
            baseUrl: URLExt.join(PageConfig.getBaseUrl(), "/files"),
            baseViewUrl: URLExt.join(PageConfig.getBaseUrl(), "/view")
        });
        const widget = new DocumentWidget({content, context});
        widget.title.iconClass = "m-PanelIcon material-icons";
        widget.title.iconLabel = "insert_chart";
        return widget;
    }
}

export namespace PartEditorFactoryNS {
    export interface IOptions extends DocumentRegistry.IWidgetFactoryOptions {
        editorServices: IEditorServices;
        rendermime: IRenderMimeRegistry;
    }
}

export namespace PartEditorCommands {
    export const createNew = "parteditor:create-new";
}

function activateEditor(// required dependencies
                            app: JupyterFrontEnd,
                            editorServices: IEditorServices,
                            rendermime: IRenderMimeRegistry,
                            restorer: ILayoutRestorer,
                            browserFactory: IFileBrowserFactory,
                        // optional dependencies
                            launcher?: ILauncher,
                        ): IPartEditorTracker {
    // FYI because the docs don't make this clear: trackers seem primarily aimed at JLab framework stuff
    // (layout restore, active focus, etc). Providing one is optional and by it's own, doesn't do much.
    // But you can setup layout restore so that when a user reloads a tab, the editor will still be there.
    const tracker = new WidgetTracker<IDocumentWidget<PartEditor>>({
        namespace: "parteditor"
    });
    const factory = new PartEditorFactory({
        name: "Part Editor",
        modelName: "text",
        fileTypes: ["part"],
        defaultFor: ["part"],
        editorServices,
        rendermime
    });
    app.docRegistry.addWidgetFactory(factory);
    app.docRegistry.addFileType({
        name: "part",
        displayName: "Part",
        fileFormat: "text",
        mimeTypes: ["text/plain"],
        extensions: [".part"],
        iconClass: "m-FileIcon material-icons",
        iconLabel: "insert_chart",
    });
    factory.widgetCreated.connect((sender, widget) => {
        tracker.add(widget);
        widget.context.pathChanged.connect(() => {
            tracker.save(widget);
        });
        widget.context.ready.then(() => {
            widget.content.renderModel(widget.context.model as any as PartEditor.IModel);
        });
    });
    restorer.restore(tracker, {
        command: "docmanager:open",
        args: widget => ({path: widget.context.path, factory: "Part Editor"}),
        name: widget => widget.context.path
    });

    app.commands.addCommand(PartEditorCommands.createNew, {
        label: "Part",
        caption: "Create a new User Defined Part",
        iconClass: "material-icons m-LauncherIcon m-Icon-Part",
        iconLabel: "insert_chart",
        execute: args => {
            let cwd = args["cwd"] || browserFactory.defaultBrowser.model.path;
            return app.commands.execute("docmanager:new-untitled", {
                path: cwd,
                type: "file",
                ext: ".part"
            })
            .then(model => app.commands.execute("docmanager:open", {
                path: model.path,
                factory: "Part Editor"
            }));
        }
    });

    if (launcher != null) {
        launcher.add({
            command: PartEditorCommands.createNew,
            category: "MavenWorks"
        });
    }

    return tracker;
}

export const IPartEditorTracker = new Token<IPartEditorTracker>("parteditor-instance-tracker");

export const partEditorPlugin: JupyterFrontEndPlugin<IPartEditorTracker> = {
    id: "jupyterlab-mavenworks:parteditor-plugin",
    autoStart: true,
    provides: IPartEditorTracker,
    requires: [
        IEditorServices,
        IRenderMimeRegistry,
        ILayoutRestorer,
        IFileBrowserFactory,
    ],
    optional: [
        ILauncher,
    ],
    activate: activateEditor
};
