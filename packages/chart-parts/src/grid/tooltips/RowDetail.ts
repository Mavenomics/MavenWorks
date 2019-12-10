import { Tooltip } from "./Tooltip";
// TODO: Dependency weirdness
import * as Formatters from "../Formatters";
import { SparklineRenderer } from "./SparklineRenderer";
import { IGridContext } from "../interfaces";

export function RowDetailTooltip(
    selector: JQuery,
    options: any,
    columns: any,
    // todo: expose row object
    dataContext: any,
    context: IGridContext
) {
    var table = $('<table>')
        .css({
            borderCollapse: "collapse",
            border: "none",
            width: "100%",
            padding: 2,
            marginTop: 5
        });

    let height = 24;

    // TODO: typing
    columns.forEach(function (col: any, cell: number) {
        if (cell > context.pathColumn) {
            let tr = $('<tr>')
                .css({
                    borderTop: "1px dashed lightgray"
                });

            tr.append($('<td>')
                .text([...col.columnGroups, col.name].join("."))
                .css({
                    width: "50%",
                    fontSize: "13px",
                    padding: 3,
                    "white-space": "normal"
                }));

            let td = $('<td>');

            let previewDataContext: any = {};
            let returnValue = "";
            previewDataContext[col.field] = dataContext[col.field];

            // TODO: typing
            col.formatters.forEach(function (formatter: any) {
                if (formatter !== Formatters.CheckBoxColumnFormatter &&
                    formatter !== Formatters.RadioButtonColumnFormatter &&
                    formatter !== Formatters.RowDetailFormatter &&
                    formatter !== Formatters.TableHoverFormatter &&
                    formatter.formatName !== Formatters.SparklineLoadingFormatter.formatName) {

                    returnValue += formatter(-1, cell, dataContext[col.field], col, previewDataContext) || "";
                }
            });

            td.attr("style", previewDataContext["cssStyle" + cell] || "")
                .css({
                    width: "50%",
                    fontSize: "13px",
                    borderLeft: "1px dashed lightgray",
                    borderRight: "none !important",
                    padding: 3
                });

            if (col.formatters.findIndex((e: any) => e.formatName === Formatters.SparklineLoadingFormatter.formatName) !== -1) {
                if (previewDataContext[col.field]) {
                    returnValue = "";
                    tr.height(40);
                    td.height(40);
                    td.width(195);
                    //Pass "RowDetail" as the column name which causes SparklineRenderer to use a separate cache key.
                    //This is needed since RowDetail and cell sparklines are different sizes.
                    SparklineRenderer(td, context, dataContext.rowPath, "RowDetail", previewDataContext[col.field], { showAxes: false });
                    height += 50;
                }
            } else {
                height += 24;
            }

            td.append(returnValue);
            tr.append(td);
            table.append(tr);
        }
    });

    Tooltip(selector, $.extend(options, {
        html: '<h3 style="text-align:center; padding:0; margin:0;">' + dataContext.rowName + '</h3>' + table.prop("outerHTML"),
        height: height,
        width: 400,
    }), context);
}
