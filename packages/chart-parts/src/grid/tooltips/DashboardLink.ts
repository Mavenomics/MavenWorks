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
        if (typeof data !== "string" || data.length < 1) {
            //ignore empty cells
            return;
        }

        const [basepath, search] = data.split("?");

        let searchParams = new URLSearchParams(search)
        let width = +searchParams.get("width")!;
        let height = +searchParams.get("height")!;
        searchParams.delete("width");
        searchParams.delete("height");
        let path = "" + basepath + "?" + searchParams;

        selector.off("mouseenter");
        selector.off("mouseleave");

        selector.on({
            mouseenter: function (event) {
                var bounds = $(selector)[0].getBoundingClientRect() as DOMRect;
                webMavenHost.OpenDashboardHover(path, bounds.right + 1, bounds.y, width, height);
            },

            mouseleave: function (event) {
                webMavenHost.CloseHover();
            },
            dblclick: function(event) {
                var bounds = $(selector)[0].getBoundingClientRect() as DOMRect;
                webMavenHost.OpenDashboardPopup(path, bounds.right + 1, bounds.y, width, height)
            }
        });
    }
}
