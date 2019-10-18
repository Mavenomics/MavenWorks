import { JupyterFrontEndPlugin, JupyterFrontEnd } from "@jupyterlab/application";
import { IDashboardTracker } from "@mavenomics/dashboard-devtools";
import { NotebookPanel } from "@jupyterlab/notebook";
import { DashboardEditor } from "../editors/DashboardEditor/editor";
import { CodeCell } from "@jupyterlab/cells";
import { Panel } from "@phosphor/widgets";
import { Dashboard, DashboardSerializer } from "@mavenomics/dashboard";

export class JupyterDashboardTracker implements IDashboardTracker {
    constructor(
        private app: JupyterFrontEnd,
    ) {}

    public getCurrentDashboard() {
        const currentWidget = this.app.shell.currentWidget;
        if (currentWidget instanceof NotebookPanel) {
            if (!this.isActiveCellDashboard(currentWidget)) {
                return null;
            }
            const cell = currentWidget.content.activeCell as CodeCell;
            // cell.outputArea.widgets is an atomic list of a phosphorJS Panel
            // the second child of that panel is the output.
            // you'd think they'd have an API for this...
            const renderer = (cell.outputArea.widgets[0] as Panel).widgets[1];
            let maybeDashboard = (renderer as any).dashboard;
            if (maybeDashboard != null && maybeDashboard instanceof Dashboard) {
                return maybeDashboard;
            }
            return null;
        }
        if (currentWidget instanceof DashboardEditor) {
            return currentWidget.content;
        }
        return null;
    }

    public isActiveCellDashboard(panel: NotebookPanel) {
        return panel.content.activeCell != null
            && panel.content.activeCell instanceof CodeCell
            && panel.content.activeCell.outputArea.model.length > 0
            && DashboardSerializer.MAVEN_LAYOUT_MIME_TYPE in panel.content.activeCell.outputArea.model.get(0).data;
    }
}

export const dashboardTrackerPlugin: JupyterFrontEndPlugin<IDashboardTracker> = {
    id: "jupyterlab-mavenworks:dashboard-tracker",
    provides: IDashboardTracker,
    activate: (app) => new JupyterDashboardTracker(app)
};
