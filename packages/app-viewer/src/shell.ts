import { Widget, BoxLayout, BoxPanel } from "@phosphor/widgets";
import { JupyterFrontEnd } from "@jupyterlab/application";
import { DocumentRegistry } from "@jupyterlab/docregistry";
import { StatusToolbar } from "./status";

export class ViewerShell extends Widget implements JupyterFrontEnd.IShell {
    public readonly currentWidget: Widget = this;
    public readonly layout: BoxLayout = new BoxLayout();
    public readonly toolbar: StatusToolbar;
    public readonly mainArea: BoxPanel;

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
        // wrap the panel so we can add the shadow
        // (phosphor doesn't like margins)
        const wrapperWidget = new Widget();
        (wrapperWidget.layout = new BoxLayout()).addWidget(this.mainArea);
        this.mainArea.addClass("m-OutputPanel");
        wrapperWidget.addClass("m-OutputPanel-Wrapper");

        BoxLayout.setStretch(wrapperWidget, 1);
        this.layout.addWidget(wrapperWidget);
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
}
