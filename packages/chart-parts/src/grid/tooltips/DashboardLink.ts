import { IGridContext } from "../interfaces";

export function DashboardLinkTooltip(
    selector: JQuery,
    _options: any,
    // TODO: column typings
    _columns: any,
    col: any,
    // todo: expose row object
    rowData: any,
    webMavenHost: IGridContext
) {
    if (rowData !== undefined) {
        let data = rowData;
        if (data == null) {
            //ignore empty cells
            return;
        }

        selector.off("mouseenter");
        selector.off("mouseleave");

        selector.on({
            mouseenter: function (event) {
                var bounds = $(selector)[0].getBoundingClientRect() as DOMRect;
                webMavenHost.OpenDashboardHover(data, bounds.right + 1, bounds.y);
            },
            click: (event) => {
                if (!event.ctrlKey) return;
                var bounds = $(selector)[0].getBoundingClientRect() as DOMRect;
                webMavenHost.OpenDashboardPopup(data, bounds.right + 1, bounds.y, !!event.ctrlKey);
            },
            mouseleave: function (event) {
                webMavenHost.CloseHover();
            },
            dblclick: function(event) {
                var bounds = $(selector)[0].getBoundingClientRect() as DOMRect;
                webMavenHost.OpenDashboardPopup(data, bounds.right + 1, bounds.y);
            }
        });
    }
}
