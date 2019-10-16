import { ABCWidgetFactory, DocumentRegistry } from "@jupyterlab/docregistry";
import { DashboardEditor } from "./editor";
import { IRenderMimeRegistry } from "@jupyterlab/rendermime";
import { Dashboard } from "@mavenomics/dashboard";
import { IPartFactory } from "@mavenomics/parts";
import { CommandRegistry } from "@phosphor/commands";
import { PromiseDelegate } from "@phosphor/coreutils";
import { registerUDPs } from "../../util/register-udps";
import { KernelExpressionEvaluator } from "../../framework/KernelExpressionEvaluator";
import { URLExt, PageConfig } from "@jupyterlab/coreutils";

/**
 * Factory for creating Dashboard Editors.
 *
 * ### Notes
 *
 * This is for use by the JupyterLab document registry, and should not be used
 * directly.
 */
export class DashboardEditorFactory
extends ABCWidgetFactory<DashboardEditor, DocumentRegistry.ICodeModel>
// tslint:disable-next-line:one-line
{
    private readonly rendermime: IRenderMimeRegistry;
    private readonly factory: IPartFactory;
    private readonly commands: CommandRegistry;

    constructor({rendermime, factory, commands}: DashboardEditorFactory.IOptions) {
        super({
            canStartKernel: true,
            defaultFor: [
                "dashboard"
            ],
            fileTypes: [
                "dashboard"
            ],
            name: "Dashboard",
            modelName: "text",
            preferKernel: true,
        });
        this.rendermime = rendermime;
        this.factory = factory;
        this.commands = commands;
    }

    protected createNewWidget(
        context: DocumentRegistry.IContext<DocumentRegistry.ICodeModel>
    ) {
        const { rendermime, commands } = this;
        const { session } = context;
        const evaluator = new KernelExpressionEvaluator({session});
        const factory = this.factory.get(context);
        const udpFuture = registerUDPs(factory, session.path);
        const content = new Dashboard({
            rendermime,
            session,
            factory,
            evaluator,
            baseUrl: URLExt.join(PageConfig.getBaseUrl(), "/files"),
            baseViewUrl: URLExt.join(PageConfig.getBaseUrl(), "/view")
        });
        evaluator.globals = content.globals;
        const revealDelegate = new PromiseDelegate<void>();
        const reveal = revealDelegate.promise;
        const editor = new DashboardEditor({
            context,
            content,
            rendermime,
            commands,
            reveal
        });
        editor.disposed.connect(() => {
            evaluator.dispose();
            factory.dispose();
        });
        Promise.all([
            context.session.ready,
            editor.ready,
            udpFuture
        ]).then(() => {
            revealDelegate.resolve(void 0);
        }).catch(err => revealDelegate.reject(err));
        return editor;
    }
}

export namespace DashboardEditorFactory {
    export interface IOptions {
        rendermime: IRenderMimeRegistry;
        factory: IPartFactory;
        commands: CommandRegistry;
    }
}
