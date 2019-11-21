import { JupyterFrontEndPlugin } from "@jupyterlab/application";
import { IDocumentManager, DocumentManager } from "@jupyterlab/docmanager";
import { Context, DocumentRegistry } from "@jupyterlab/docregistry";
import { ClientSession, IClientSession } from "@jupyterlab/apputils";
import { RenderMimeRegistry } from "@jupyterlab/rendermime";
import { UUID } from "@phosphor/coreutils";
import { PathExt } from "@jupyterlab/coreutils";
import { Widget } from "@phosphor/widgets";

/**
 * A special Context that forces the creation of a new, independent kernel session
 *
 * Normally sessions are reused as much as possible, the user-story being oriented
 * towards a single user with a single server.
 *
 * The viewer, however, is not meant for that. The Viewer's user-story is around
 * rapid iteration, and a key component of that is being able to safely share
 * URLs as a temporary "try this and tell me what you think" measure.
 *
 * By forcing a new, isolated context, we can also give better dev cycles around
 * what the actual end user experience will be; since each new user should get
 * their own kernel anyway (regardless of whether they're on a proper JupyterHub
 * or just on a regular Jupyter Server).
 *
 * @export
 * @class IsolationContext
 * @template T
 */
export class IsolatedContext<T extends DocumentRegistry.IModel> extends Context<T> {
    constructor(options: Context.IOptions<T>) {
        super(options);
        this.session.dispose();
        // A few hacks follow:
        //
        // The superclass already setup a session, but hasn't yet initialized
        // it. We need to throw that out and replace it with a session that is
        // isolated from other sessions. To do that, we append
        // `-isolation-<UUID>` to the path, transforming `/foo/bar/example.ipynb`
        // into `/foo/bar/example.ipynb-isolation-2d2436ba-40dd-4f55-bdc2-3d49da41b5d9`.
        // This breaks same-path lookups in kernel session initiation, allowing
        // us to have a fresh kernel for each context (hence, "Isolated" context).
        // The extra junk at the end _does_ break anything that might use the
        // client session path and rely on the filename- but it _doesn't_ break
        // anything that might pull the DirName (like the UDP service).
        //
        // Since we create a new client session, we also need to rehook anything
        // that depended on it (like the UrlResolver). Finally, since we don't
        // want autosave anyway, we omit anything related to autosave setup.
        //
        // In the future, this should get replaced with something more idomatic,
        // since this hack is fragile.
        (this as any).session = new ClientSession({
            manager: options.manager.sessions,
            path: this.path + "-isolation-" + UUID.uuid4(),
            type: PathExt.extname(this.path) === ".ipynb" ? "notebook" : "file",
            name: PathExt.basename(this.localPath),
            kernelPreference: options.kernelPreference || { shouldStart: false },
            setBusy: options.setBusy
        });
        this.session.propertyChanged.connect(this["_onSessionChanged"], this);
        (this as any).urlResolver = new RenderMimeRegistry.UrlResolver({
            session: this.session,
            contents: options.manager.contents
        });
    }
}

// @ts-ignore 2415 We need to override _createContext, without reimplementing the whole class
// Technically this is a massive anti-pattern that's only made possible by the
// fact that TS can't fundamentally disallow this anyway.
export class ViewerDocumentManager extends DocumentManager {
    private _createContext(
        path: string,
        factory: DocumentRegistry.ModelFactory,
        kernelPreference: IClientSession.IKernelPreference
    ) {
        let adopter = (
            widget: Widget,
            options?: DocumentRegistry.IOpenOptions
        ) => {
            // HACK: Use brackets to access private members
            this["_widgetManager"].adoptWidget(context, widget);
            this["_opener"].open(widget, options);
        };
        let modelDBFactory =
            this.services.contents.getModelDBFactory(path) || undefined;
        // This is the main diff between ViewerDocumentManager and DocumentManager
        let context = new IsolatedContext({
            opener: adopter,
            manager: this.services,
            factory,
            path,
            kernelPreference,
            modelDBFactory,
            setBusy: this["_setBusy"]
        });
        context.disposed.connect(this["_onContextDisposed"], this);
        this["_contexts"].push(context);
        return context;
    }
}

const plugin: JupyterFrontEndPlugin<IDocumentManager> = {
    id: "@mavenomics/viewer:jupyterlab:doc-manager",
    provides: IDocumentManager,
    activate: (app) => {
        const {
            serviceManager: manager,
            docRegistry: registry,
            shell
        } = app;

        const docManager = new ViewerDocumentManager({
            registry,
            manager,
            opener: {
                open(widget, options) {
                    shell.add(widget, "main", options);
                }
            }
        });
        // Disable autosave unconditionally
        docManager.autosave = false;

        return docManager;
    }
};

export default plugin;
