import { Tooltip } from "./Tooltip";
import { SparklineRenderer } from "./SparklineRenderer";
import { IGridContext } from "../interfaces";

export function SparklineTooltip(
    selector: JQuery,
    // TODO: Sparkline options
    options: any,
    // TODO: column typing
    sparklineColumn: any,
    // todo: expose row object
    dataContext: any,
    context: IGridContext
) {
    if (dataContext !== undefined) {


        Tooltip(selector, Object.assign(options, {
            html: function (_$s: any, tooltip: JQuery) {
                SparklineRenderer(
                    tooltip,
                    context,
                    dataContext.rowPath,
                    sparklineColumn.field,
                    dataContext[sparklineColumn.field],
                    { showAxes: true }
                );
                return '<h3 style="text-align:center; padding:0; margin:0;">' + sparklineColumn.name + ' for ' + dataContext.rowName + '</h3>';
            },
            htmlMode: "prepend",
            height: 200
        }), context);
    }
}
