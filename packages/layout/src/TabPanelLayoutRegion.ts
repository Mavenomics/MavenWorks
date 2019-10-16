import { TabPanel, TabBar, Widget } from "@phosphor/widgets";
import { DashboardLayoutRegion } from "./DashboardLayoutRegion";
import { LayoutTypes, LayoutManager } from "./LayoutManager";
import { RegionWithChildren } from "./RegionWithChildren";
import { h } from "@phosphor/virtualdom";
import { MessageLoop } from "@phosphor/messaging";
import { Types } from "@mavenomics/coreutils";

export interface ITabPanelProperties extends RegionWithChildren.IProps {
    ForegroundIndex: number;
}

export class TabPanelDashboardLayoutRegion
    extends RegionWithChildren<ITabPanelProperties>
// tslint:disable-next-line:one-line
{
    public static GetMetadata() {
        const metadata: RegionWithChildren.ParentMetadata<ITabPanelProperties> = super.GetMetadata();
        metadata.name = "Tab Panel";
        metadata.iconText = "tab";
        metadata.description = "Arrange children in a set of tabs";
        metadata.remarks = `
Tab heads are customizable using the Titlebar properties on each child. The
active tab is preserved as "Foreground Index," and will be saved with the rest
of the dashboard.

> #### Note
>
> There is an active bug with tab heads, where right clicks on them will
> actually operate on the parent. To reliably change a property on the child,
> right-click _inside_ the child.`;
        metadata.addMetadata("ForegroundIndex", {
            prettyName: "Tab Index",
            type: Types.Number,
            documentation: "The index of the currently selected tab",
            default: 0,
        });
        return metadata;
    }

    typeName = LayoutTypes.TabPanelDashboardLayoutRegion;
    public readonly content: TabPanel;

    constructor(owner: LayoutManager, uuid?: string) {
        super(owner, uuid);
        this.addClass("maven_tabpanel");
        this.addClass("m-hide-child-titlebars");
        this.content = new TabPanel({
            tabsMovable: true,
            renderer: new TabPanelDashboardLayoutRegion.TabRenderer()
        });
        this.content.currentChanged.connect(this.handleCurrentChanged, this);
        this.content.tabBar.tabMoved.connect(this.handleTabMoved, this);
        this.content.tabBar.tabDetachRequested.connect(this.handleTabDetached, this);
        this.content.tabBar.addClass("p-DockPanel-tabBar"); // hack to make it play nice with JupyterLab
        this.content.stackedPanel.addClass("maven_tabpanel_panel");
        this.layout.addWidget(this.content);
        this.installContentTap();
    }

    dispose() {
        if (this.isDisposed) return;
        // this will dispose of the children
        this.content.currentChanged.disconnect(this.handleCurrentChanged, this);
        this.content.tabBar.tabMoved.disconnect(this.handleTabMoved, this);
        this.content.tabBar.tabDetachRequested.disconnect(this.handleTabDetached, this);
        this.content.dispose();
        super.dispose();
    }

    public layoutChildren() {
        // bail out if no children
        if (this.widgets.length === 0) {
            // hide the tab panel when empty, since it looks a little odd
            this.content.hide();
            return;
        }
        this.content.show();
        let part = this.content.currentWidget as DashboardLayoutRegion | null;
        if (part == null || !part.getLayoutProperty("showRegion")) {
            // return the first visible widget
            const firstVisisble = this.widgets.find(i => i.getLayoutProperty("showRegion"));
            if (firstVisisble == null) {
                // there are no visible widgets
                this.content.hide();
                return;
            }
            this.content.currentWidget = firstVisisble;
            part = firstVisisble;
        }
        // get the size of the stacked panel so that the widget has correct size
        const {width, height} = this.content.stackedPanel.node.getBoundingClientRect();
        part.calculatedSize = {width, height};
        MessageLoop.sendMessage(part, Widget.Msg.FitRequest);
        // Hide the other children
        for (const child of this.widgets) {
            if (child === part) continue;
            if (child.isHidden) continue;
            child.hide();
        }
        // update the tab bar in case any properties changed
        MessageLoop.sendMessage(this.content.tabBar, Widget.Msg.UpdateRequest);
    }

    public updateFromProperties() {
        const foregroundIndex = this.getLayoutProperty("ForegroundIndex");
        if (this.content.currentIndex !== foregroundIndex && this.widgets.length > 0) {
            this.content.currentIndex = foregroundIndex;
            this.content.currentWidget!.activate();
        }
        // Force-fit the stacked panel
        MessageLoop.sendMessage(this.content.stackedPanel, Widget.Msg.FitRequest);
        super.updateFromProperties();
    }

    protected onChildRegionRemoved(region: DashboardLayoutRegion) {
        if (!region.isDisposed) {
            region.show();
        }
    }

    private handleCurrentChanged(
        _sender: TabPanel,
        {currentIndex, currentWidget, previousWidget}: TabPanel.ICurrentChangedArgs
    ) {
        // Workaround for a Phosphor tabpanel bug.
        // cf. phosphorjs/phosphor#368
        if (previousWidget && !this.widgets.includes(previousWidget as DashboardLayoutRegion)) {
            previousWidget.show();
        }
        // focus the active region
        if (this.getLayoutProperty("ForegroundIndex") === currentIndex
            && (currentWidget as DashboardLayoutRegion).isFocused) {
            // nothing to do
            return;
        }
        if (currentWidget == null) {
            if (this.content.widgets.length > 0) {
                this.content.currentIndex = 0;
            }
            return;
        }
        this.widgets[currentIndex].focus();
        this.setLayoutProperty("ForegroundIndex", currentIndex);
    }

    private handleTabMoved(
        _sender: TabBar<Widget>,
        {toIndex}: TabBar.ITabMovedArgs<Widget>
    ) {
        // this will trigger a setStale, fulfulling the need to notify the
        // root about the changed ordering
        this.setLayoutProperty("ForegroundIndex", toIndex);
    }

    private handleTabDetached(
        _sender: TabBar<Widget>,
        {clientX, clientY, title}: TabBar.ITabDetachRequestedArgs<Widget>
    ) {
        const region = title.owner as DashboardLayoutRegion;
        region.startDrag(clientX, clientY);
    }
}

export namespace TabPanelDashboardLayoutRegion {
    export class TabRenderer extends TabBar.Renderer {
        public createTabStyle({title, zIndex}: TabBar.IRenderData<DashboardLayoutRegion>) {
            const color = title.owner.getLayoutProperty("captionColor").color;
            const backgroundColor = title.owner.getLayoutProperty("captionBackground").color;
            return {
                color: color === "transparent" ? null : color ,
                backgroundColor: backgroundColor === "transparent" ? null : backgroundColor,
                zIndex: "" + zIndex,
            };
        }

        public renderLabel({title}: TabBar.IRenderData<DashboardLayoutRegion>) {
            const caption = title.owner.getLayoutProperty("caption") || "New Tab";
            return h.div({ className: "p-TabBar-tabLabel" }, caption);
        }

        public renderTab(args: TabBar.IRenderData<DashboardLayoutRegion>) {
            const showRegion = args.title.owner.getLayoutProperty("showRegion");
            if (!showRegion) {
                return h.div({
                    className: "p-TabBar-tab",
                    style: {"display": "none"},
                });
            }
            return super.renderTab(args);
        }
    }
}
