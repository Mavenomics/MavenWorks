/**
 * Created by nick on 2/10/2015.
 */

import * as numeral from "numeral";
import * as helpers from "./helpers";
import { GetSparklineFromCache } from "./tooltips/SparklineRenderer";
import { IGridContext } from "./interfaces";
import { Table } from "@mavenomics/table";

// TODO: typings
function Formatter(formatFunction: any, styleFormatter?: any) {
    formatFunction.styleFormatter = styleFormatter || false;
    return formatFunction;
};

function sanitize(value: string | any): string | any {
    if (typeof value === "string")
        return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return value;
}

// TODO: typings
export const NullFormatter = Formatter(function (columnDef: any) {
    if (columnDef !== undefined && columnDef.nullRule === "Show")
        return '<div style="text-align: right; color: #b6b6b6; font-style: italic;">NULL</div>';
    else
        return "";
});

export const ErrorFormatter = Formatter(() => {
    // Error detail logic is handled in bindErrorDetailHovers
    return `<span class="m-cell-error">*</span>`;
})

// TODO: typings
export const BasicValueFormatter = Formatter(function (row: any, cell: number, value: any, columnDef: any, dataContext: any, data: any) {
    if (value instanceof Table)
        return TableHoverFormatter(row, cell, value, columnDef, dataContext, data);
    else if (!Number.isNaN(Number(value)) && (typeof value === "number" || typeof value === "string"))
        return '<span style="float:right;">' + value + '</span>';
    else if (value == null)
        return NullFormatter(columnDef)
    else if (value instanceof Error)
        return ErrorFormatter();
    else
        return '<span style="position:relative; top:-0.1em">' + value + '</span>';
});

export const PathIndentationFormatter = Formatter(function (row: any, cell: number, value: any, columnDef: any, dataContext: any, data: any) {
    if (value === null) {
        value = "";
    }

    value = sanitize(value);

    var spacer = $('<span>')
        .css({
            display: "inline-block",
            height: "1px",
            width: 15 * dataContext.indent,
            float: "left"
        })
        .attr("depth", dataContext.indent)
        .prop("outerHTML");

    var idx = data.getIdxById(dataContext.id);
    if (data.getItems()[idx + 1] && data.getItems()[idx + 1].indent > data.getItems()[idx].indent) {
        if (dataContext._collapsed)
            return spacer + " <span class='toggle expand'></span>&nbsp;";
        else
            return spacer + " <span class='toggle collapse'></span>&nbsp;";
    }
    else
        return spacer + " <span class='toggle'></span>&nbsp;";
}, true);

export const CheckBoxColumnFormatter = Formatter(function (row: any, cell: number, value: any, columnDef: any, dataContext: any, data: any) {
    var checked = dataContext["col" + columnDef.columnNumber + "_checked"];

    if (checked === true)
        return '<input type="checkbox" class="slick-cell-checkbox" checked="checked"/>';
    else if (checked === "indeterminate")
        //return '<div class="slick-cell-checkbox indeterminate"></div>';
        return '<input type="checkbox" class="slick-cell-checkbox indeterminate"/>';
    else
        return '<input type="checkbox" class="slick-cell-checkbox"/>';
}, true);

export const RadioButtonColumnFormatter = Formatter(function (row: any, cell: number, value: any, columnDef: any, dataContext: any, data: any) {
    var radio = dataContext["_radio"];

    if (radio === true) {
        return '<input type="radio" class="slick-cell-radio" checked="true"/>';
    }
    else if (radio === false) {
        return '<input type="radio" class="slick-cell-radio"/>';
    }
}, true);

export const HeatmapColumnFormatter = Formatter(function (row: any, cell: number, value: any, columnDef: any, dataContext: any, data: any) {
    if (value instanceof Error)
        return ErrorFormatter();
    if (value === null) {
        //return Formatters.NullFormatter(columnDef);
        return;
    }
    value = sanitize(value);

    var bg = columnDef.heatmap.func(value);
    dataContext["cssStyle" + cell] = "background-color: " + bg + ";color:" + helpers.idealTextColor(bg) + ";";
}, true);

export const NumberFormatter = Formatter(function (row: any, cell: number, value: any, columnDef: any, dataContext: any, data: any) {
    if (value === null) {
        return NullFormatter(columnDef);
    }
    if (value instanceof Error) {
        return ErrorFormatter();
    }

    if (value === Infinity || value === -Infinity) {
        return "";
    }

    if (Number.isNaN(value)) {
        return "";
    }

    value = sanitize(value);

    if (typeof value === "number") {
        // Align numbers to the right
        dataContext["cssStyle" + cell] = dataContext["cssStyle" + cell] || "";

        return '<span style="float:right">' + numeral(value).format(columnDef.numberFormat) + '</span>';
    }
});

export const ConditionalFormatter = Formatter(function (row: any, cell: number, value: any, columnDef: any, dataContext: any, data: any) {
    if (value === null) {
        return;
    }
    if (value instanceof Error) {
        return ErrorFormatter();
    }

    value = sanitize(value);
    dataContext["cssStyle" + cell] = dataContext["cssStyle" + cell] || "";

    // TODO: typings
    columnDef.conditionalFormatters.forEach(function (cf: any) {
        if (cf.compute(dataContext) === true) {
            var opts = cf.getOptions();
            if (opts.BackColor !== "") {
                dataContext["cssStyle" + cell] += "background-color: " + opts.BackColor + ";";
            }

            if (opts.ForeColor !== "") {
                dataContext["cssStyle" + cell] += "color: " + opts.ForeColor + ";";
            }

            if (opts.IsBold) {
                dataContext["cssStyle" + cell] += "font-weight: bold;";
            }

            if (opts.IsItalic) {
                dataContext["cssStyle" + cell] += "font-style: italic;";
            }
        }
    });
}, true);

export const ProgressBarFormatter = Formatter(function (row: any, cell: number, value: any, columnDef: any, dataContext: any, data: any) {
    if (value === null)
        return;
    if (value instanceof Error) {
        return ErrorFormatter();
    }
    value = sanitize(value);

    var percent = columnDef.progressBar.func(value);

    if (percent > 100)
        percent = 100;

    var whiteColor = "#ffffff";

    var rowDepthStyles = $("#row-depth-styles");
    if (rowDepthStyles.length > 0) {
        if (dataContext.indent) {
            whiteColor = rowDepthStyles.prop("sheet").cssRules[dataContext.indent].style.backgroundColor;
        }
    }

    var white = percent < 100 ? ", " + whiteColor + " " + (percent + 1) + "%" : "";

    var pb = columnDef.progressBar;

    var css = [
        "background: linear-gradient(to right, " + pb.startColor + " 0%," + pb.endColor + " " + percent + "%" + white + ")",
    ].join(";") + ";";

    dataContext["cssStyle" + cell] = dataContext["cssStyle" + cell] || "";
    dataContext["cssStyle" + cell] += css;
}, true);

export const RowDetailFormatter = Formatter(function (row: any, cell: number, value: any, columnDef: any, dataContext: any, data: any) {
    // Row detail logic is handled in the function bindRowDetailCell()
    if (value instanceof Error) {
        return ErrorFormatter();
    }
    return '<span class="row-detail row-detail-image"></span>';
});

export const SparklineLoadingFormatter = function (context: IGridContext) {
    const func = Formatter(function (row: any, cell: number, value: any, columnDef: any, dataContext: any, data: any) {
        if (value instanceof Error) {
            return ErrorFormatter();
        }
        if (value) {
            return GetSparklineFromCache(context.grid, context.version, dataContext.rowPath, columnDef.field) || '<i>Loading chart...</i>';
        }
    }, true);
    func.formatName = SparklineLoadingFormatter.formatName;
    return func;
};
//Used for comparisons since SparklineLoadingFormatter is a dynamic function.
SparklineLoadingFormatter.formatName = "SparklineLoadingFormatter";

export const DashboardLinkFormatter = Formatter(function (row: any, cell: number, value: any, columnDef: any, dataContext: any, data: any) {
    //Todo: Dashboard icon
    if (value instanceof Error) {
        return ErrorFormatter();
    }
    if (typeof value === "string" && value.length > 0)
        return '<span class="dashboard-link-image"></span>';
    return '<span></span>';
})


export const TableHoverFormatter = Formatter(function (row: any, cell: number, value: any, columnDef: any, dataContext: any, data: any) {
    // Row detail logic is handled in the function bindRowDetailCell()
    if (value instanceof Error) {
        return ErrorFormatter();
    }
    return `<span class="table-hover table-hover-image">${value.rows.length}</span>`;
});
