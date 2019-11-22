import { MqlResultTable } from "@mavenomics/table";
import { IGridContext } from "../interfaces";

export function DashboardLinkTooltip(
    selector: JQuery,
    _options: any,
    // TODO: column typings
    _columns: any,
    col: any,
    // todo: expose row object
    rowData: MqlResultTable["Result"]["Rows"][number],
    webMavenHost: IGridContext
) {
    var dataContext = {};
    if (rowData !== undefined) {
        let data = rowData.RowData[col.columnDataNumber];
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

            mouseleave: function (event) {
                webMavenHost.CloseHover();
            },
            dblclick: function(event) {
                var bounds = $(selector)[0].getBoundingClientRect() as DOMRect;
                webMavenHost.OpenDashboardPopup(data, bounds.right + 1, bounds.y)
            }
        });
    }
}
