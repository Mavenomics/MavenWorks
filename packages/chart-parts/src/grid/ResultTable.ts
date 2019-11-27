/**
 * Created by nick on 2/23/2015.
 */

import * as Formatters from "./Formatters";
import * as helpers from "./helpers";
import { AsyncPostRenderers } from "./AsyncPostRenderers";
import { ConditionalFormatting } from "./ConditionalFormatting";
import { MqlResultTable } from "@mavenomics/table";
import { IGridContext } from "./interfaces";
import * as d3 from "d3";
import { Color } from "@mavenomics/coreutils";

export function formatColumns(mavenColumnArray: any[], webMavenHost: IGridContext, resultTable: MqlResultTable) {
    let slickGridFormat = [];

    let pathColumn = {
        id: "path",
        name: "Path",
        field: "path",
        formatters: [Formatters.PathIndentationFormatter],
        width: 200,
        columnNumber: 0,
        sortable: true,
        headerCssClass: "column-header0",
        header: {
            buttons: []
        }
    };

    let rowSelectionColumn = {
        id: "ROWSELECTOR",
        name: "#",
        field: "#",
        behavior: "select",
        width: 40,
        cannotTriggerInsert: true,
        resizable: false,
        selectable: false
    };

    const gridId = "grid-" + webMavenHost.partId;

    $("#" + gridId + "column-styles").remove();
    let columnStyles = $("<style>").attr("type", "text/css")
        .attr("id", gridId + "column-styles");

    let showPathColumn = webMavenHost.get("Show Path Column");
    if (showPathColumn) {
        slickGridFormat.push(pathColumn);
        columnStyles.append("#" + gridId + " .column-header0 {color:black !important; font-style:italic;}");
    }

    mavenColumnArray.forEach(function (e, i) {
        let idx = i + Number(showPathColumn);

        let splitByDot = e.Name.split(".");
        let columnName = splitByDot[splitByDot.length - 1];

        // TODO: better column typing
        let c = {
            id: columnName + idx,
            name: columnName,
            field: "col" + idx,
            // use a set so that we can ensure that formatters are unique
            formatters: new Set<(...args: any[]) => (string | void)>(),
            columnNumber: idx,
            columnDataNumber: i,
            columnGroups: splitByDot.slice(0, splitByDot.length - 1),
            width: 0,
            conditionalFormatters: undefined as undefined | ConditionalFormatting[],
            // todo: Typing for these props
            heatmap: undefined as any,
            progressBar: undefined as any,
            asyncPostRender: undefined as undefined | Function,
            sortable: undefined as undefined | boolean,
            numberFormat: undefined as undefined | string,
            headerCssClass: "",
            nullRule: "hide",
            rerenderOnResize: undefined as undefined | boolean
        };

        // get formatting option by string because it got annoying to type
        function fo<K extends keyof helpers.IColumnFormatting>(o: K){
            return helpers.getFormattingOption(e.FormattingOptions, o);
        }

        // generate a css class for this column
        columnStyles.append("#" + gridId + " .column-header" + idx + " {font-weight:100 !important;");
        var headerCSS = [];
        if (fo("General.ColumnWidthPixels")) {
            c.width = fo("General.ColumnWidthPixels");
        }

        if (fo("ColumnHeader.ForeColor").color !== "black") {
            headerCSS.push("color:" + fo("ColumnHeader.ForeColor").color);
        }
        else
            headerCSS.push("color:black !important");

        if (fo("ColumnHeader.BackColor").color !== "white") {
            headerCSS.push("background:" + fo("ColumnHeader.BackColor").color + " !important");
        }

        if (fo("ConditionalFormatting.Simple") !== "None") {
            c.conditionalFormatters = [];
            switch (fo("ConditionalFormatting.Simple")) {
                case "NegRed":
                    c.conditionalFormatters.push(
                        new ConditionalFormatting("getRowValue('" + c.field + "') < 0", {ForeColor: "red"})
                    );
                    break;

                case "NegRedPosGreen":
                    c.conditionalFormatters.push(
                        new ConditionalFormatting("getRowValue('" + c.field + "') < 0", {ForeColor: "red"}),
                        new ConditionalFormatting("getRowValue('" + c.field + "') > 0", {ForeColor: "green"})
                    );
                    break;
            }
        }

        // conditional formatting option
        function cfopt (n: number, o: string) {
            return fo("ConditionalFormatting.Condition" + n + "." + o as keyof helpers.IColumnFormatting);
        }

        for (let j = 1; j <= 9; ++j) {
            if (cfopt(j, " Condition") !== "null") {
                c.conditionalFormatters = c.conditionalFormatters || [];

                c.conditionalFormatters.push(
                    new ConditionalFormatting(
                        "" + cfopt(j, " Condition"), {
                            BackColor: (cfopt(j, "BackColor") as Color).color,
                            ForeColor: (cfopt(j, "ForeColor") as Color).color,
                            IsBold: cfopt(j, "IsBold"),
                            IsItalic: cfopt(j, "IsItalic")
                        }));
            }
        }

        if (c.conditionalFormatters !== undefined)
            c.formatters.add(Formatters.ConditionalFormatter);

        // NOTE: value formatters should go AFTER style formatters

        if (fo("Heatmap. Enable")) {
            // heatmap formatter
            c.heatmap = {
                maxColor: fo("Heatmap.Maximum.Color").color,
                maxValue: +fo("Heatmap.Maximum.Value"),

                minColor: fo("Heatmap.Minimum.Color").color,
                minValue: +fo("Heatmap.Minimum.Value"),

                midColor: fo("Heatmap.Center.Color").color,
                midValue: +fo("Heatmap.Center.Value")
            };

            c.heatmap.func = d3.scale.linear()
                .clamp(true)
                .domain([c.heatmap.minValue, c.heatmap.midValue, c.heatmap.maxValue])
                .range([c.heatmap.minColor, c.heatmap.midColor, c.heatmap.maxColor]);

            c.formatters.add(Formatters.HeatmapColumnFormatter);
        }

        if (fo("Number.FormatString") !== "") {
            c.numberFormat = fo("Number.FormatString");
            if (c.formatters)
                c.formatters.add(Formatters.NumberFormatter);
        }

        if (fo("General.DisplayStyle") === "ProgressBar") {
            c.progressBar = {
                startColor: fo("ProgressBar.StartColor").color,
                endColor: fo("ProgressBar.EndColor").color,

                minValue: +fo("ProgressBar.Minimum"),
                maxValue: +fo("ProgressBar.Maximum"),

                showValue: fo("ProgressBar.ShowValue")
            };

            c.progressBar.func = d3.scale.linear()
                .clamp(true)
                .domain([c.progressBar.minValue, c.progressBar.maxValue])
                .range([0, 100]);

            c.formatters.add(Formatters.ProgressBarFormatter);

            if (c.progressBar.showValue) {
                c.formatters.add(Formatters.NumberFormatter);
            } else {
                c.formatters.delete(Formatters.NumberFormatter);
            }
        }

        const Renderers = AsyncPostRenderers(webMavenHost, resultTable);

        if (fo("Row Detail.Show Row Detail Button")) {
            c.formatters.add(Formatters.RowDetailFormatter);
            c.asyncPostRender = Renderers.RowDetail;
            c.sortable = false;
        }

        switch (fo("General.DisplayStyle")) {
            case "SparkLine":
                c.asyncPostRender = Renderers.Sparkline;
                c.rerenderOnResize = true;
                c.sortable = false;
                c.formatters.clear();
                c.formatters.add(Formatters.SparklineLoadingFormatter(webMavenHost));
                break;
            case "DashboardLink":
                c.asyncPostRender = Renderers.DashboardLink;
                c.sortable = false;
                c.formatters.clear();
                c.formatters.add(Formatters.DashboardLinkFormatter);
                break;
            case "IFrameLink":
                c.asyncPostRender = Renderers.IFrameLink;
                c.sortable = false;
                c.formatters.clear();
                c.formatters.add(Formatters.IFrameHoverFormatter);
                break;
            default:
                break;
        }

        if (fo("General.NullRule") !== "Hide") {
            c.nullRule = "Show";
        }

        columnStyles.append(headerCSS.join(";") + ";}");
        c.headerCssClass = "column-header" + idx;

        // SlickGrid expects an array
        (c.formatters as any) = [...c.formatters]

        slickGridFormat.push(c);
    });

    if (webMavenHost.get("Checklist. Enabled")) {
        slickGridFormat[webMavenHost.get("Checklist.Column for Checkboxes")]
            .formatters
            .push(Formatters.CheckBoxColumnFormatter);
    }

    if (webMavenHost.get("RadioButtonList. Enabled")) {
        let c: any = slickGridFormat[webMavenHost.get("RadioButtonList.Column for Radio Buttons")];
        if (c) {
            c.formatters.push(Formatters.RadioButtonColumnFormatter);
            c.hasRadio = true;
        }
    }

    if (showPathColumn)
        slickGridFormat[0].formatters.push(Formatters.BasicValueFormatter);

    slickGridFormat.forEach(function (c) {
        if (c.formatters.every((formatter) => formatter.styleFormatter))
            c.formatters.push(Formatters.BasicValueFormatter);
    });

    columnStyles.appendTo("head");
    if (webMavenHost.get("Show Row Selectors"))
        slickGridFormat.unshift(rowSelectionColumn);
    return slickGridFormat;
}
