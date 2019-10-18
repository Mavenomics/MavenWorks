import { JupyterFrontEndPlugin } from "@jupyterlab/application";
import { IPartFactory } from "@mavenomics/parts";
import { INotebookTracker, NotebookActions } from "@jupyterlab/notebook";
import { IDashboardTracker, RegisterActions } from "@mavenomics/dashboard-devtools";
import { ICommandPalette, Dialog, showDialog, CommandToolbarButton } from "@jupyterlab/apputils";
import { DashboardSerializer } from "@mavenomics/dashboard";
import { AsyncTools } from "@mavenomics/coreutils";
import { RenderedDashboard, DisplayHandleManager, SyncMetadata, registerUDPs } from "@mavenomics/jupyterutils";


export const mavenLayoutRendererPlugin: JupyterFrontEndPlugin<void> = {
    id: "maven-noteboard:layout-renderer",
    autoStart: true,
    requires: [
        IPartFactory,
        INotebookTracker,
        IDashboardTracker
    ],
    optional: [
        ICommandPalette
    ],
    activate: (
        app,
        factory: IPartFactory,
        nbTracker: INotebookTracker,
        dashboardTracker: IDashboardTracker,
        palette?: ICommandPalette
    ) => {
        const { commands } = app;

        // Label-less proxy commands for the toolbar buttons.
        // The Viewer "proxy" also implements the maybeInsert functionality of
        // the old VisualEditorTracker
        commands.addCommand("jovian:open-cell-dashboard-visual-editor", {
            iconClass: "fa fa-desktop",
            execute: async () => {
                const nbPanel = nbTracker.currentWidget;
                if (nbPanel == null) return;
                if (dashboardTracker.getCurrentDashboard() == null) {
                    const res = await showDialog({
                        title: "Add new dashboard?",
                        body: "It looks like you haven't selected a dashboard cell. Would you like to add one?",
                        buttons: [Dialog.okButton(), Dialog.cancelButton()]
                    });
                    if (!res.button.accept) return; // cancelled
                    NotebookActions.insertBelow(nbPanel.content);
                    NotebookActions.hideCode(nbPanel.content);
                    const cellModel = nbTracker.activeCell!.model;
                    cellModel.value.text = RenderedDashboard.getPythonCode(DashboardSerializer.DEFAULT_DASHBOARD);
                    cellModel.metadata.set("showinviewer", "true");
                    await NotebookActions.run(nbPanel.content, nbPanel.session);
                    await AsyncTools.waitUntil(() => dashboardTracker.getCurrentDashboard() != null, 1000, 100);
                }
                return commands.execute("visual-editor:open");
            }
        });
        commands.addCommand("jovian:open-cell-dashboard-globals-editor", {
            iconClass: "fa fa-globe",
            execute: () => commands.execute("maven-noteboard:GlobalsEditor:openEditor")
        });

        nbTracker.widgetAdded.connect((_tracker, panel) => {
            const { context, session } = panel;
            const rendermime = panel.content.rendermime;
            const partFactory = factory.get(context);
            const handleManager = DisplayHandleManager.GetManager(session);
            const syncMetadata = new SyncMetadata(session, partFactory, handleManager);
            const registerUDPsPromise = registerUDPs(partFactory, session.path);
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
                        factory: partFactory,
                        rendermime,
                        session,
                        ready
                    });
                },
            });

            const openDesigner = new CommandToolbarButton({
                commands,
                id: "jovian:open-cell-dashboard-visual-editor"
            });

            const openGlobals = new CommandToolbarButton({
                commands,
                id: "jovian:open-cell-dashboard-globals-editor"
            });

            panel.toolbar.insertItem(0, "Open Editor", openGlobals);
            panel.toolbar.insertItem(0, "add-visual-cell", openDesigner);
            panel.disposed.connect(() => {
                rendermime.removeMimeType(DashboardSerializer.MAVEN_LAYOUT_MIME_TYPE);
                syncMetadata.dispose();
                handleManager.dispose();
                partFactory.dispose();
            });
        });

        RegisterActions(
            app,
            () => dashboardTracker.getCurrentDashboard(),
            "cell-dashboard",
            ".jp-Notebook.jp-mod-commandMode:not(.p-mod-hidden) .m-RenderedLayout",
            "Cell",
            palette
        );
    }
};
