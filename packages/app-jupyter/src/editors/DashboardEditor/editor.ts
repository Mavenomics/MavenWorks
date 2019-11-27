import { DocumentRegistry, DocumentWidget } from "@jupyterlab/docregistry";
import { ToolbarButton, CommandToolbarButton, Toolbar } from "@jupyterlab/apputils";
import { IRenderMimeRegistry } from "@jupyterlab/rendermime";
import { CommandRegistry } from "@phosphor/commands";
import { KernelMessage, Session } from "@jupyterlab/services";
import { KernelError } from "@mavenomics/jupyterutils";
import { PromiseDelegate } from "@phosphor/coreutils";
import { Dashboard, DashboardSerializer } from "@mavenomics/dashboard";
import { HoverManager } from "@mavenomics/ui";

/**
 * A standalone editor for MavenWorks dashboards.
 *
 * ### Notes
 *
 * While this editor uses the same codepaths as standalone dashboards, the
 * difference is that this does not need a kernel to work, nor does it make any
 * assumptions about the kernel.
 */
export class DashboardEditor
    extends DocumentWidget<Dashboard, DocumentRegistry.ICodeModel>
// tslint:disable-next-line:one-line
{
    private readonly _rendermime: IRenderMimeRegistry;
    private readonly _commands: CommandRegistry;
    private _script: string | null = null;
    private _ready = new PromiseDelegate<void>();

    constructor(args: DashboardEditor.IOptions) {
        super(args);
        this.addClass("m-DashboardEditor");
        this.title.iconClass = "m-PanelIcon material-icons";
        this.title.iconLabel = "dashboard";
        const {context, rendermime, commands} = args;
        this._rendermime = rendermime;
        this._commands = commands;
        this.setupToolbar();
        context.ready.then(() => this.setupDashboard());
        // TODO: Respond to file changes? Right now it loads once and that's it.
    }

    public get ready() { return this._ready.promise; }
    public get session() { return this.context.session; }
    public get rendermime() { return this._rendermime; }
    public get globals() { return this.content.globals; }
    public get script() { return this._script || ""; }
    public set script(newScript: string) {
        this._script = newScript;
        this.writeToModel();
        this.waitUntilExecuteScript();
    }

    public async run() {
        await this.waitUntilExecuteScript();
    }

    protected setupToolbar() {
        const openDesigner = new CommandToolbarButton({
            commands: this._commands,
            id: "visual-editor:open"
        });

        this.toolbar.addItem("Open Editor", openDesigner);

        const openGlobals = new CommandToolbarButton({
            commands: this._commands,
            id: "@mavenomics/dashboard-devtools:GlobalsEditor:openEditor"

        });

        this.toolbar.addItem("Open Globals", openGlobals);

        const script = new ToolbarButton({
            iconClassName: "fa fa-external-link-square",
            tooltip: this._commands.caption("dashboard:open-script-editor"),
            onClick: () => {
                this._commands.execute("dashboard:open-script-editor", {id: this.id});
            }
        });
        this.toolbar.addItem("Open Script Editor", script);
        const save = new ToolbarButton({
            iconClassName: "jp-Icon jp-Icon-16 jp-SaveIcon",
            onClick: () => {
                this.context.save();
            }
        });
        this.toolbar.addItem("Save", save);

        // Default items for JupyterLab
        this.toolbar.addItem("interrupt", Toolbar.createInterruptButton(this.session));
        this.toolbar.addItem("restart", Toolbar.createRestartButton(this.session));
        this.toolbar.addItem("spacer", Toolbar.createSpacerItem());
        this.toolbar.addItem("kernelName", Toolbar.createKernelNameItem(this.session));
        this.toolbar.addItem("kernelStatus", Toolbar.createKernelStatusItem(this.session));
    }

    protected async setupDashboard() {
        // TODO: Comprehensive Dashboard model
        let model = this.context.model.toJSON() as unknown as DashboardSerializer.IDashboardDocument;
        if (model == null) {
            model = DashboardSerializer.DEFAULT_DASHBOARD;
        }
        // wait until the kernel is ready before rendering the dashboard
        await this.waitUntilKernel();
        if (model.init != null) {
            this._script = model.init.join("\n");
            await this.executeScript();
        }
        this.content.loadFromModel(model)
            .then(() => this._ready.resolve());
        this.content.OnDirty.subscribe(() => {
            this.content.setClean();
            this.writeToModel();
        });
        this.globals.OnDirty.subscribe(() => {
            this.globals.setClean();
            this.writeToModel();
        });
    }

    protected writeToModel() {
        // TODO: Should we minify when saving to disk?
        // As it stands, this lets us get diffable blobs for committing
        const model = DashboardSerializer.toJson(this.content) as DashboardSerializer.IDashboardDocument;
        model.init = this.script.split("\n");
        this.context.model.fromString(JSON.stringify(model, null, "\t"));
    }

    protected async waitUntilExecuteScript() {
        if (this.session.kernel != null && this.session.kernel.isReady) {
            return await this.executeScript();
        }
        await this.waitUntilKernel();
        return await this.executeScript();
    }

    protected async waitUntilKernel() {
        if (this.session.kernel != null) {
            await this.session.kernel.ready;
            return;
        }
        const kernelChanged = new PromiseDelegate<void>();
        const onChange = (_: unknown, {newValue}: Session.IKernelChangedArgs) => {
            if (newValue != null) {
                kernelChanged.resolve(void 0);
            }
        };
        // TODO: Respond to all kernel changes while the widget is active
        this.session.kernelChanged.connect(onChange);
        await kernelChanged.promise;
        this.session.kernelChanged.disconnect(onChange);
        await this.session.kernel!.ready;
    }

    protected async executeScript() {
        const future = this.session.kernel!.requestExecute({
            code: this.script,
            silent: true,
        });
        future.onIOPub = this.handleResponse.bind(this);
        await future.done;
    }

    private async handleResponse(msg: KernelMessage.IIOPubMessage) {
        if (KernelMessage.isErrorMsg(msg)) {
            const err = await KernelError.Create(
                msg.content.traceback.join("\n"),
                this.session.kernelDisplayName
            );
            console.error("[DashboardDocument]", "Error in setup script");
            console.error(err);
            const widget = `<div
                class="jp-RenderedText"
                style="maxWidth: 62em;background: var(--jp-error-color3)">
                ${err.prettyTraceback}
            </div>`;
            HoverManager.Instance!.openErrorDialog(widget, true);
        }
    }
}

export namespace DashboardEditor {
    export interface IOptions
        extends DocumentWidget.IOptions<Dashboard, DocumentRegistry.ICodeModel>
    // tslint:disable-next-line:one-line
    {
        rendermime: IRenderMimeRegistry;
        commands: CommandRegistry;
    }
}
