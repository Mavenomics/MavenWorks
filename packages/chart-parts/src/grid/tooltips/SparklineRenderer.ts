import * as d3 from "d3";
import { IGridContext } from "../interfaces";
import { stringify } from "querystring";

type SparklineCacheValue = {
    version: string;
    sparks: Map<any, string>;
}
let sparklineCache = new WeakMap<any, SparklineCacheValue>();

export function GetSparklineFromCache(grid:any, version:string, path:string, column:string) {
    let scv = sparklineCache.get(grid);
    if (!scv)
        return;
    if (scv.version !== version)
        return;
    return scv.sparks.get(path + "||" + column);
}
function UpdateSparklineCache(grid:any, version:string, path:string, column:string, sparkline: string) {
    let scv = sparklineCache.get(grid);
    if (!scv) {
        scv = {version:version, sparks:new Map<String, string>()};
        sparklineCache.set(grid, scv);
    }
    scv.version = version;
    scv.sparks.set(path + "||" + column, sparkline);
}

function ClearOldCache(grid:any, version:string) {
    let scv = sparklineCache.get(grid);
    if (!scv)
        return;

    if (scv.version !== version)
        scv.sparks = new Map<String, string>()
}

/**
 * Render a sparkline into an HTML element, and return it.
 *
 * @export
 *
 * @param el The el to render into, or null to create a new el.
 * @param dataContext The sparkline data
 * @param options Extra options to pass to the renderer
 *
 * @returns A JQuery element with the sparkline rendered inside
 */
export function SparklineRenderer(
    renderEl: JQuery | undefined,
    gridContext: IGridContext,
    path: any,
    columnName: string,
    dataContext: any,
    {showAxes}: SparklineRenderer.IRenderOpts
) {
    ClearOldCache(gridContext.grid, gridContext.version);

    const el = renderEl || $("div");
    if (!showAxes) {
        const cached = GetSparklineFromCache(gridContext.grid, gridContext.version, path, columnName);
        if (cached) {
            el.html(cached);
            return;
        }
    }
    el.empty();
    if (dataContext == null) {
        return el;
    }

    var offsetX = showAxes ? 50 : 0;
    var offsetY = showAxes ? 40 : 5;

    var x = d3.time.scale()
        .range([0, el.width()! - offsetX]);

    var y = d3.scale.linear()
        .range([el.height()! - offsetY, 0]);

    let data: {date: Date, value: number}[] = [];

    if (Array.isArray(dataContext)) {

        for (let i = 0; i < dataContext.length; ++i) {
            data.push({
                date: dataContext[i][0],
                value: dataContext[i][1]
            });
        }
    } else {
        let k = Object.keys(dataContext);

        // the data is an object with 2 arrays which line up in size.
        // enumerate the data by the length of the first key
        for (let i = 0; i < dataContext[k[0]].length; ++i) {
            data.push({
                // this referenced some function named sanitizeSparklineDates,
                // but I can't find any reference to it having existed.
                date: dataContext[k[0]][i] as Date,
                value: dataContext[k[1]][i] as number
            });
        }
    }

    var line = d3.svg.line<{date: Date, value: number}>()
        .x(function (d) { return x(d.date) })
        .y(function (d) { return y(d.value) });

    var svg = d3.select(el[0]).append("svg")
        .attr("style", "width:100%;height:" + el.height() + "px; font-size:10px;font-weight:100;")
        .append("g");

    var graphOffset = 0;

    x.domain(d3.extent(data, function (d) { return d.date }));
    y.domain(d3.extent(data, function (d) { return d.value }));

    if (showAxes === true) {
        if ($(el).find("#d3-css").length === 0)
            $(el).append($('<style type="text/css" id="d3-css">')
                .append(".axis path, .axis line {fill:none; stroke:black; shape-rendering:crispEdges}"));

        var xAxis = d3.svg.axis()
            .scale(x)
            .orient("bottom")
            .tickValues(x.domain())
            .tickFormat(d3.time.format("%b '%y"));

        var yAxis = d3.svg.axis()
            .scale(y)
            .orient("left")
            .tickValues(y.domain())
            .tickSize(6, 0);

        svg.append("g")
            .attr("class", "x axis")
            .attr("transform", "translate(30," + (el.height()! - 35) + ")")
            .call(xAxis);

        svg.append("g")
            .attr("class", "y axis")
            .attr("transform", "translate(30,5)")
            .call(yAxis);

        graphOffset = 31;
    }

    svg.append("path")
        .datum(data)
        .attr("style", "fill:none;stroke:steelblue;stroke-width:1.5px;")
        .attr("transform", "translate(" + graphOffset + ", 0)")
        .attr("d", line);

    if (!showAxes) {
        UpdateSparklineCache(gridContext.grid, gridContext.version, path, columnName, el.html());
    }

    return el;
}

export namespace SparklineRenderer {
    export interface IRenderOpts {
        /** Whether to show the axes with the sparkline */
        showAxes: boolean;
    }
}