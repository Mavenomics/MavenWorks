import { INotebookViewerTracker } from "./runner/plugin";
import { IPartFactory } from "@mavenomics/parts";
import { JupyterFrontEndPlugin } from "@jupyterlab/application";
import { DisplayHandleManager, SyncMetadata, registerUDPs, RenderedDashboard } from "@mavenomics/jupyterutils";
import { DashboardSerializer } from "@mavenomics/dashboard";

const dashboardRendererPlugin: JupyterFrontEndPlugin<void> = {
    id: "@mavenomics/viewer:dashboard-renderer",
    autoStart: true,
    requires: [
        INotebookViewerTracker,
        IPartFactory
    ],
    activate: (
        app,
        nbTracker: INotebookViewerTracker,
        partFactory: IPartFactory
    ) => {
        nbTracker.widgetAdded.connect((_, panel) => {
            const { context, content } = panel;
            const { session } = context;
            const { rendermime } = content;
            const partFactoryInst = partFactory.get(context);
            const handleManager = DisplayHandleManager.GetManager(session);
            const syncMetadata = new SyncMetadata(session, partFactoryInst, handleManager);
            const registerUDPsPromise = registerUDPs(partFactoryInst, session.path);
            const ready = Promise.all([
                syncMetadata.ready,
                registerUDPsPromise
            ]).then(() => void 0 as void);
            rendermime.addFactory({
                safe: false,
                mimeTypes: [DashboardSerializer.MAVEN_LAYOUT_MIME_TYPE],
                defaultRank: 75,
                createRenderer: () => {
                    return new RenderedDashboard({
                        factory: partFactoryInst,
                        rendermime,
                        session,
                        ready,
                        expandToFill: true,
                    });
                },
            });
        });
    }
};
export default dashboardRendererPlugin;
