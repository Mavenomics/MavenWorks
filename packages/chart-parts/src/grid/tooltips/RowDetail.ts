import { Tooltip } from "./Tooltip";
// TODO: Dependency weirdness
import * as Formatters from "../Formatters";
import { SparklineRenderer } from "./SparklineRenderer";
import { IGridContext } from "../interfaces";
import { MqlResultTable } from "@mavenomics/table";

export function RowDetailTooltip(
    selector: JQuery,
    options: any,
    columns: any,
    // todo: expose row object
    rowData: MqlResultTable["Result"]["Rows"][number],
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
                .text(col.name)
                .css({
                    width: "50%",
                    fontSize: "13px",
                    padding: 3,
                    "white-space": "normal"
                }));

            let td = $('<td>');

            let dataContext: any = {};
            let returnValue = "";
            dataContext[col.field] = rowData.RowData[cell - 1 - context.pathColumn];

            // TODO: typing
            col.formatters.forEach(function (formatter: any) {
                if (formatter !== Formatters.CheckBoxColumnFormatter &&
                    formatter !== Formatters.RadioButtonColumnFormatter &&
                    formatter !== Formatters.RowDetailFormatter &&
                    formatter !== Formatters.TableHoverFormatter &&
                    formatter.formatName !== Formatters.SparklineLoadingFormatter.formatName) {

                    returnValue += formatter(-1, cell, rowData.RowData[cell - 1 - context.pathColumn], col, dataContext) || "";
                }
            });

            td.attr("style", dataContext["cssStyle" + cell] || "")
                .css({
                    width: "50%",
                    fontSize: "13px",
                    borderLeft: "1px dashed lightgray",
                    borderRight: "none !important",
                    padding: 3
                });

            if (col.formatters.findIndex((e: any) => e.formatName === Formatters.SparklineLoadingFormatter.formatName) !== -1) {
                if (dataContext[col.field]) {
                    tr.height(40);
                    td.height(40);
                    td.width(195);
                    //Pass "RowDetail" as the column name which causes SparklineRenderer to use a separate cache key.
                    //This is needed since RowDetail and cell sparklines are different sizes.
                    SparklineRenderer(td, context, rowData.Path, "RowDetail", dataContext[col.field], { showAxes: false });
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
        html: '<h3 style="text-align:center; padding:0; margin:0;">' + rowData.Name + '</h3>' + table.prop("outerHTML"),
        height: height,
        width: 400,
    }), context);
}
