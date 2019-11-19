import { JupyterFrontEndPlugin } from "@jupyterlab/application";
import { IDocumentManager, DocumentManager } from "@jupyterlab/docmanager";

const plugin: JupyterFrontEndPlugin<IDocumentManager> = {
    id: "@mavenomics/viewer:jupyterlab:doc-manager",
    provides: IDocumentManager,
    activate: (app) => {
        const {
            serviceManager: manager,
            docRegistry: registry,
            shell
        } = app;

        const docManager = new DocumentManager({
            registry,
            manager,
            opener: {
                open(widget, options) {
                    shell.add(widget, "main", options);
                }
            }
        });

        return docManager;
    }
};

export default plugin;
