import { DocumentRegistry, IDocumentWidget, DocumentWidget } from "@jupyterlab/docregistry";
import { Toolbar } from "@jupyterlab/apputils";
import { Widget, BoxLayout } from "@phosphor/widgets";

/**
 * Generic interface for a main-area widget.
 *
 * This is akin to IDocumentWidget
 *
 * @export
 * @interface IViewerWidget
 * @template T The type of content widget to render
 * @template U The type of model associated with the widget
 */
export interface IViewerWidget<
    T extends Widget,
    U extends DocumentRegistry.IModel
> extends IDocumentWidget<T, U> {
    /** The toolbar to render.
     *
     * Note that unlike JupyterLab, this toolbar is not rendered.
     *
     * In the future, the toolbar may be placed at the top of the screen,
     * instead of as a sibling of the content. This would supplant the current
     * status indicator.
     */
    toolbar: Toolbar<Widget>;
}

export class ViewerWidget<
    T extends Widget = Widget,
    U extends DocumentRegistry.IModel = DocumentRegistry.IModel
> extends Widget implements IViewerWidget<T, U> {
    public readonly layout: BoxLayout;
    public readonly content: T;
    public readonly context: DocumentRegistry.IContext<U>;
    public readonly revealed: Promise<void>;
    public readonly toolbar: Toolbar<Widget>;

    constructor({
        context,
        content,
        node,
        reveal,
        toolbar
    }: DocumentWidget.IOptions<T, U>) {
        super({ node });
        this.layout = new BoxLayout();
        this.context = context;
        this.content = content;
        this.revealed = reveal || Promise.resolve();
        this.toolbar = toolbar || new Toolbar();
        this.layout.addWidget(this.content);
    }

    setFragment(fragment: string): void {
        /* no op */
    }
}
