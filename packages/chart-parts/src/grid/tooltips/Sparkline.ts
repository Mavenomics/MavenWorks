import { Tooltip } from "./Tooltip";
import { SparklineRenderer } from "./SparklineRenderer";
import { IGridContext } from "../interfaces";
import { MqlResultTable } from "@mavenomics/table";

export function SparklineTooltip(
    selector: JQuery,
    // TODO: Sparkline options
    options: any,
    // TODO: column typing
    sparklineColumn: any,
    // todo: expose row object
    rowData: MqlResultTable["Result"]["Rows"][number],
    context: IGridContext
) {
    // todo: dataContext typing
    let dataContext: any = {};
    if (rowData !== undefined) {
        // HACK figure out why we pass wrong columnNumber when we don't show path.
        let fst = rowData.RowData[sparklineColumn.columnDataNumber - 1];
        let scd = rowData.RowData[sparklineColumn.columnDataNumber];
        let one = fst ? (fst.hasOwnProperty('First') ? fst : scd) : scd;
        var datContext = one;
        if (!datContext) return;
        dataContext[sparklineColumn.field] = datContext;


        Tooltip(selector, Object.assign(options, {
            html: function (_$s: any, tooltip: JQuery) {
                SparklineRenderer(
                    tooltip,
                    context,
                    rowData.Path,
                    sparklineColumn.field,
                    dataContext[sparklineColumn.field],
                    { showAxes: true }
                );
                return '<h3 style="text-align:center; padding:0; margin:0;">' + sparklineColumn.name + ' for ' + rowData.Name + '</h3>';
            },
            htmlMode: "prepend",
            height: 200
        }), context);
    }
}
