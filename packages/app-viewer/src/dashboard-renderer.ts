import { IPartFactory } from "@mavenomics/parts";
import { DisplayHandleManager, SyncMetadata, registerUDPs, RenderedDashboard } from "@mavenomics/jupyterutils";
import { DashboardSerializer } from "@mavenomics/dashboard";
import { IViewerWidget } from "./utils/viewerwidget";
import { Widget } from "@phosphor/widgets";
import { DocumentRegistry } from "@jupyterlab/docregistry";
import { IRenderMimeRegistry } from "@jupyterlab/rendermime";

export async function registerDashboard(
    widget: IViewerWidget<Widget & {rendermime: IRenderMimeRegistry}, DocumentRegistry.IModel>,
    partFactory: IPartFactory
) {
    const { context, content } = widget;
    const { session, ready } = context;
    const { rendermime } = content;
    const partFactoryInst = partFactory.get(context);
    const handleManager = DisplayHandleManager.GetManager(session);
    const syncMetadata = new SyncMetadata(session, partFactoryInst, handleManager);
    const registerUDPsPromise = registerUDPs(partFactoryInst, session.path);
    rendermime.addFactory({
        safe: false,
        mimeTypes: [DashboardSerializer.MAVEN_LAYOUT_MIME_TYPE],
        defaultRank: 75,
        createRenderer: () => {
            return new RenderedDashboard({
                factory: partFactoryInst,
                rendermime,
                session,
                expandToFill: true,
                ready: Promise.resolve()
            });
        },
    });
    await Promise.all([
        ready,
        syncMetadata.ready,
        registerUDPsPromise
    ]);
}
