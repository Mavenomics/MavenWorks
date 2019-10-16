/**
 * Created by nick on 2/23/2015.
 */

import {
    RowDetailTooltip,
    SparklineTooltip,
    DashboardLinkTooltip,
    SparklineRenderer
} from "./tooltips";
import { IGridContext } from "./interfaces";
import { MqlResultTable } from "@mavenomics/table";

export function AsyncPostRenderers(context: IGridContext, resultTable: MqlResultTable) {
    return {
        // TODO: better typings
        Sparkline: function (cellNode: JQuery, row: any, dataContext: any, colDef: any, showAxes: boolean) {
            SparklineRenderer(cellNode, context, dataContext.rowPath, colDef.field, dataContext[colDef.field], {showAxes});
            SparklineTooltip(cellNode, {
                showAxes
            }, colDef, resultTable.Result.Rows[dataContext.rowNumber], context);
        },

        RowDetail: function (cellNode: JQuery, row: any, dataContext: any, colDef: any) {
            RowDetailTooltip(cellNode, {}, context.grid.getColumns(), resultTable.Result.Rows[dataContext.rowNumber], context);
        },

        DashboardLink: function (cellNode: JQuery, row: any, dataContext: any, colDef: any) {
            DashboardLinkTooltip(cellNode, {}, context.grid.getColumns(), colDef, resultTable.Result.Rows[dataContext.rowNumber], context);
        }
    }
};
