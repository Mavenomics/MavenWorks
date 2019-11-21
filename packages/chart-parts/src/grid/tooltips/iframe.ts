import { MqlResultTable } from "@mavenomics/table";
import { IGridContext } from "../interfaces";

export function IFrameHover(
    selector: JQuery,
    _options: any,
    // TODO: column typings
    _columns: any,
    col: any,
    // todo: expose row object
    rowData: MqlResultTable["Result"]["Rows"][number],
    webMavenHost: IGridContext
) {
    if (rowData !== undefined) {
        let data = rowData.RowData[col.columnDataNumber];
        if (typeof data !== "string" || data.length < 1) {
            //ignore empty cells
            return;
        }

        const url = data;

        let width = 800;
        let height = 600;

        selector.off("mouseenter");
        selector.off("mouseleave");
        selector.off("dblclick");

        const iframeHtml = `<iframe src=${url} style="position:absolute;left:0;right:0;top:0;bottom:0;width:100%;height:100%;"></iframe>`;

        selector.on({
            mouseenter: function () {
                var bounds = $(selector)[0].getBoundingClientRect() as DOMRect;
                const hover = iframeHtml;
                webMavenHost.OpenHover(hover, bounds.right + 1, bounds.y, width, height);
            },
            mouseleave: function () {
                webMavenHost.CloseHover();
            },
            dblclick: function() {
                webMavenHost.CloseHover();
                var bounds = $(selector)[0].getBoundingClientRect() as DOMRect;
                const hover = iframeHtml;
                webMavenHost.OpenPopup(hover, bounds.right + 1, bounds.y, width, height);
            }
        });
    }
}
