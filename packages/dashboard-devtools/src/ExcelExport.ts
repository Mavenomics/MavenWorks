import * as Excel from "exceljs";
import { Table, TableHelper, Row } from "@mavenomics/table";
import { Color, IterTools } from "@mavenomics/coreutils";
import { scaleLinear, ScaleLinear } from "d3-scale";

function ApplyFormatting(
    cell: Excel.Cell,
    format: Record<string, any>
) {
    if (format["Number.FormatString"]) {
        cell.numFmt = format["Number.FormatString"];
    }
    if (format["ConditionalFormatting.Simple"] && format["ConditionalFormatting.Simple"] !== "None") {
        if (cell.value == null) return;
        if (cell.value < 0) {
            cell.font = {
                size: 8,
                name: "Arial",
                color: { argb: "FFFF0000" }
            };
        }
        if (format["ConditionalFormatting.Simple"] === "NegRedPosGreen" && cell.value > 0) {
            cell.font = {
                size: 8,
                name: "Arial",
                color: { argb: "FF008000" }
            };
        }
    }
}

function SerializeCell(
    data: unknown,
    format: Record<string, any>,
) {
    switch (typeof data) {
        case "undefined":
            if (format["NullRule"] && format["NullRule"] !== "Hide") {
                return "null";
            }
            return "";
        case "number":
            return data;
        default:
            return "" + data;
    }
}

function AddRow(
    row: Row,
    sheet: Excel.Worksheet,
    config: Partial<IExcelExportConfig>,
    formatting: { [col: string]: any },
    rowDepthFn: ScaleLinear<string, string>,
    depth: number = 0
) {
    let pathCell = config.showPath ? ["".padStart(depth * 2) + row.name] : [];
    const rowData = new Array(row._data.length);
    const bgColor = new Color(rowDepthFn(depth));

    for (let c = 0; c < row._data.length; c++) {
        const format = formatting[row.owner.columnNames[c]];
        const cell = row._data[c];
        rowData[c] = SerializeCell(cell, format);
    }

    let sheetRow = sheet.addRow(pathCell.concat(rowData));

    sheetRow.height = 12.75;
    sheetRow.font = {
        size: 8,
        name: "Arial"
    };
    sheetRow.alignment = {
        vertical: "middle"
    };

    for (let c = 0; c < row._data.length; c++) {
        const format = formatting[row.owner.columnNames[c]];
        ApplyFormatting(sheetRow.getCell(c + (config.showPath ? 2 : 1)), format);
    }

    if (config.rowGrouping) {
        sheetRow.outlineLevel = depth;
        sheetRow.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: ColorToHex(bgColor) }
        };
    }


    for (let child of row.children) {
        AddRow(child, sheet, config, formatting, rowDepthFn, depth + 1);
    }
}

function ColorToHex(color: Color) {
    let hex = color.hex;
    if (hex.startsWith("#"))
        hex = hex.substr(1);
    if (hex.length === 8)
        return hex.substr(6, 2) + hex.substr(0, 6);
    return hex;
}

export function ExportToWorkbook(
    table: Table,
    config?: Partial<IExcelExportConfig>,
    formatting?: { [col: string]: any }
) {
    config = config || {};
    formatting = formatting || {};

    let maxDepth = 0;

    for (let irow of IterTools.dfs_iter(table.rows, row => row.children)) {
        if (irow.children.length > 0) continue; // can't be the deepest leaf
        maxDepth = Math.max(maxDepth, irow.level);
    }

    let rowDepthColors = {
        from: "#c3c3c3",
        to: "white"
    };

    // Create the depth function for coloring rows
    let depthColorFunction = scaleLinear<string, string>()
        .domain([-1, maxDepth])
        .range([rowDepthColors.from, rowDepthColors.to]);

    let workbook = new Excel.Workbook();
    let sheet = workbook.addWorksheet("Sheet1", {
        views: [
            // Freeze the columns, and if the path is shown freeze that as well
            {
                state: "frozen",
                xSplit: config.showPath ? 1 : 0,
                ySplit: 1,
                topLeftCell: config.showPath ? "B2" : "A2"
            }
        ]
    });

    let matObj = TableHelper.toMatrixObject(TableHelper.flattenTable(table));

    let pathCol = config.showPath ? ["Path"] : [];
    let columns = pathCol.concat(matObj.Cols);
    const headers = sheet.addRow(columns);

    headers.height = 16.5;
    headers.font = {
        italic: true,
        size: 10,
        name: "Arial"
    };
    headers.alignment = {
        vertical: "middle"
    };

    if (config.showPath) {
        let pathCell = sheet.getCell(1, 1);
        pathCell.font = {
            color: { argb: "FF000000" },
            italic: true,
            size: 10,
            name: "Arial"
        };
        sheet.columns[0].width = 40;
        pathCell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFFFFFF" }
        };
    }

    for (let i = 0; i < matObj.Cols.length; i++) {
        let colName = matObj.Cols[i];
        let format = formatting[colName];
        if (!format)
            continue;

        // A note on column widths:
        // Excel doesn't use pixels for widths, instead opting for a font-
        // and system-dependent approach where widths are specified in terms of
        // the width of a single integer character in the current font. So, a
        // column of width 9 is actually 9 * (width of `0` char in px) pixels
        // wide.
        // This can be approximated by taking 10 units = 85 pixels, yielding
        // 1 px = (1/8.5) units. It's not exact, but it's close enough
        // cf. https://docs.microsoft.com/en-us/office/troubleshoot/excel/determine-column-widths

        if (format["General.ColumnWidthPixels"]) {
            sheet.getColumn(i + (config.showPath ? 2 : 1)).width = format["General.ColumnWidthPixels"] / 8.5;
        }

        let cell = sheet.getCell(1, (config.showPath ? 1 : 0) +  i + 1);
        if (format["ColumnHeader.ForeColor"]) {
            let foreColor = new Color(format["ColumnHeader.ForeColor"] || "white");
            cell.font = {
                color: { argb: ColorToHex(foreColor) },
                italic: true,
                size: 10,
                name: "Arial"
            };
        }
        if (format["ColumnHeader.BackColor"]) {
            let backColor = new Color(format["ColumnHeader.BackColor"] || "black");
            cell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: ColorToHex(backColor) }
            };
        }
    }

    for (let row of table.rows)
        AddRow(row, sheet, config, formatting, depthColorFunction);

    return workbook;
}

export interface IExcelExportConfig {
    showPath: boolean;
    rowGrouping: boolean;
    columnGrouping: boolean;
}
