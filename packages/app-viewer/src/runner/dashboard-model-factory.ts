import { DocumentRegistry } from "@jupyterlab/docregistry";
import { NotebookModel } from "@jupyterlab/notebook";
import { IModelDB } from "@jupyterlab/observables";
import { DashboardSerializer } from "@mavenomics/dashboard";
import { nbformat } from "@jupyterlab/coreutils";
import { RenderedDashboard } from "@mavenomics/jupyterutils";

export class DashboardDocModelFactory implements DocumentRegistry.IModelFactory<DashboardDocModel> {
    public readonly name = "dashboard";
    public readonly contentType = "file";
    public readonly fileFormat = "text";
    private _isDisposed = false;

    public get isDisposed() { return this._isDisposed; }

    public dispose() {
        this._isDisposed = true;
    }

    public createNew(languagePreference?: string, modelDB?: IModelDB): DashboardDocModel {
        return new DashboardDocModel({
            languagePreference,
            modelDB
        });
    }

    public preferredLanguage(_: string): string {
        return "";
    }
}

/**
 * A model that translates Dashboard Docs to notebooks, for convenience
 *
 * @export
 * @class DashboardDocModel
 */
export class DashboardDocModel extends NotebookModel {
    fromJSON(value: unknown) {
        const data = value as DashboardSerializer.IDashboardDocument;
        const newModel: nbformat.INotebookContent = {
            cells: [],
            metadata: {
                kernelspec: {
                    name: "python3",
                    language: "python",
                    display_name: "Python 3"
                },
                orig_nbformat: nbformat.MAJOR_VERSION,
                globals: (data.globals || {}) as any,
            },
            nbformat: nbformat.MAJOR_VERSION,
            nbformat_minor: nbformat.MINOR_VERSION
        };
        // Code cell from script
        const initCell: nbformat.ICodeCell = {
            cell_type: "code",
            execution_count: null,
            source: (data.init || []).join("\n"),
            metadata: {},
            outputs: []
        };
        const dashboardCell: nbformat.ICodeCell = {
            cell_type: "code",
            execution_count: null,
            source: RenderedDashboard.getPythonCode(data),
            metadata: {
                showinviewer: "true"
            },
            outputs: [
                {
                    output_type: "execute_result",
                    execution_count: null,
                    data: {
                        [DashboardSerializer.MAVEN_LAYOUT_MIME_TYPE]: DashboardSerializer.DEFAULT_DASHBOARD as any
                    },
                    metadata: {}
                }
            ]
        };

        newModel.cells.push(initCell, dashboardCell);
        super.fromJSON(newModel);
    }
}
