import { Widget, BoxLayout, BoxPanel } from "@phosphor/widgets";
import { JupyterFrontEnd } from "@jupyterlab/application";
import { DocumentRegistry } from "@jupyterlab/docregistry";
import { StatusToolbar } from "./status";

export class ViewerShell extends Widget implements JupyterFrontEnd.IShell {
    public readonly currentWidget: Widget = this;
    public readonly layout: BoxLayout = new BoxLayout();
    public readonly toolbar: StatusToolbar;
    public readonly mainArea: BoxPanel;
    private readonly wrapperWidget: BoxPanel;
    private _embed = false;

    constructor() {
        super();

        this.addClass("m-ViewerShell");

        this.toolbar = new StatusToolbar({
            showOverlay: false
        });

        BoxLayout.setSizeBasis(this.toolbar, 32);
        BoxLayout.setStretch(this.toolbar, 0);
        this.layout.insertWidget(0, this.toolbar);

        this.mainArea = new BoxPanel();
        this.mainArea.addClass("m-OutputPanel");
        BoxLayout.setStretch(this.mainArea, 1);    
        
        // wrap the panel so we can add the shadow
        // (phosphor doesn't like margins)
        this.wrapperWidget = new BoxPanel();
        this.wrapperWidget.addClass("m-OutputPanel-Wrapper");
        BoxLayout.setStretch(this.wrapperWidget, 1);

        this.addMainAreaWithWrapper();
    }

    public dispose() {
        this.wrapperWidget.dispose();
        this.mainArea.dispose();
        this.toolbar.dispose();
        super.dispose();
    }

    /** If true, compress the style of the app to fit in a small window.
     * 
     * This will remove a few extraneous UI elements and tighten up padding in
     * a few chroming elements.
     */
    public get embed() { return this._embed; }
    public set embed(setEmbed: boolean) {
        if (setEmbed) {
            this.toolbar.hide();
            this.addMainArea();
        } else {
            this.toolbar.show();
            this.addMainAreaWithWrapper();
        }
    }

    activateById(id: string): void {
        const candidate = this.mainArea.widgets.find(i => i.id === id);
        if (candidate) {
            candidate.activate();
        }
    }

    add(widget: Widget, _area?: string, opts?: DocumentRegistry.IOpenOptions) {
        const rank = opts ? (opts.rank ? opts.rank : 0) : 0;
        this.mainArea.insertWidget(rank, widget);
        if (opts && opts.activate) {
            widget.activate();
        }
    }

    widgets(_area?: string) {
        return this.mainArea.layout!.iter();
    }

    private addMainAreaWithWrapper() {
        this.wrapperWidget.addWidget(this.mainArea);
        this.layout.addWidget(this.wrapperWidget);
    }

    private addMainArea() {
        this.layout.removeWidget(this.wrapperWidget);
        this.layout.addWidget(this.mainArea);
    }
}
