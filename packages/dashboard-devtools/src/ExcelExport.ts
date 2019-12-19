import * as Excel from "exceljs";
import { Table, Row } from "@mavenomics/table";
import { Color, IterTools } from "@mavenomics/coreutils";
import { scaleLinear, ScaleLinear } from "d3-scale";

function ApplyFormatting(
    cell: Excel.Cell,
    format: Record<string, any>
) {
    if (!format)
        return;
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
            if (format && format["NullRule"] && format["NullRule"] !== "Hide") {
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

function AddHeaders(
    maxColDepth: number,
    colGroups: string[][],
    sheet: Excel.Worksheet,
    config: Partial<IExcelExportConfig>,
    formatting: { [col: string]: any }
) {
    const colDepthColors = [
        // taken from the SlickGrid stylesheet
        new Color("orange"),
        new Color("green"),
    ];

    if (config.showPath) {
        // copy the binding to prevent mutating the original
        colGroups = [...colGroups];
        colGroups.unshift(["Path"]);
    }

    const headerData = [];
    for (let i = 0; i < maxColDepth; i++) {
        const rowData: (string | null)[] = [];
        const isLastRow = i === (maxColDepth - 1);
        for (let r = 0; r < colGroups.length; r++) {
            const group = colGroups[r];
            // make sure the last part of the group appears at the bottom
            if ((group.length - 1) <= i && !isLastRow) {
                rowData[r] = null;
            } else if (isLastRow) {
                rowData[r] = group[group.length - 1];
            } else {
                // sparse arrays
                rowData[r] = group[i];
            }
        }
        headerData.push(rowData);
        const row = sheet.addRow(rowData);
        row.height = 16.5;
        row.font = {
            italic: true,
            size: 10,
            name: "Arial"
        };
        row.alignment = {
            vertical: "bottom"
        };
        // Apply the horizontal merges first
        if (!isLastRow) {
            let lastParent: string | null = null;
            let lastParentIdx: number | null = null;
            function merge(idx: number) {
                if (!config.mergeCells) return;
                if (idx === lastParentIdx) {
                    return; // don't merge same-cells
                }
                // Add one to i since it's all 1-indexed, and lastParentIdx/idx
                // are already 1-indexed
                sheet.mergeCells(1 + i, (lastParentIdx || 1), 1 + i, idx);
            }
            row.eachCell({ includeEmpty: true }, (cell, col) => {
                if (cell.value != null && i < colDepthColors.length) {
                    cell.fill = {
                        type: "pattern",
                        pattern: "solid",
                        fgColor: { argb: ColorToHex(colDepthColors[i]) }
                    };
                    cell.font = {
                        color: { argb: "FFFFFFFF" },
                        italic: true,
                        size: 10,
                        name: "Arial"
                    };
                }
                if (lastParent == null) {
                    lastParent = rowData[col - 1];
                    lastParentIdx = col;
                    return;
                }
                if (lastParent !== rowData[col - 1]) {
                    merge(col - 1);
                    lastParent = rowData[col - 1];
                    lastParentIdx = col;
                    return;
                }
                sheet.getColumn(col).outlineLevel = i + 1;
            });
            if (lastParent != null) {
                // handle the last merge
                merge(rowData.length);
            }
        } else {
            // Apply the vertical merges, then set the values/styles
            for (let col = 0; col < rowData.length; col++) {
                let mergeTo = maxColDepth - 1;
                for (let rowIdx = maxColDepth - 2; rowIdx >= 0; rowIdx--) {
                    if (headerData[rowIdx][col] != null) break;
                    mergeTo = rowIdx;
                }
                if (mergeTo < maxColDepth - 1) {
                    if (!config.mergeCells) return;
                    // a merge needs to happen
                    // add one to everything since it's all 1-indexed
                    sheet.mergeCells(1 + mergeTo, 1 + col, maxColDepth, 1 + col);
                }
                const cell = row.getCell(col + 1);
                cell.value = rowData[col];
                let format = formatting[colGroups[col].join(".")];
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
        }
    }

    if (config.showPath) {
        // set path column width
        sheet.columns[0].width = 40;
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
    config = configWithDefaults(config);
    formatting = formatting || {};

    let maxRowDepth = 0;
    let maxColDepth = 0;

    const colGroups: string[][] = [];

    if (config.columnGrouping) {
        for (const col of table.columnNames) {
            const groups = col.split(".");
            colGroups.push(groups);
            maxColDepth = Math.max(maxColDepth, groups.length);
        }
    } else {
        colGroups.push([...table.columnNames]);
        maxColDepth = 1;
    }

    for (let irow of IterTools.dfs_iter(table.rows, row => row.children)) {
        if (irow.children.length > 0) continue; // can't be the deepest leaf
        maxRowDepth = Math.max(maxRowDepth, irow.level);
    }

    let rowDepthColors = {
        from: "#c3c3c3",
        to: "white"
    };

    // Create the depth function for coloring rows
    let depthColorFunction = scaleLinear<string, string>()
        .domain([-1, maxRowDepth])
        .range([rowDepthColors.from, rowDepthColors.to]);

    let workbook = new Excel.Workbook();
    let sheet = workbook.addWorksheet("Sheet1", {
        views: [
            // Freeze the columns, and if the path is shown freeze that as well
            {
                state: "frozen",
                xSplit: config.showPath ? 1 : 0,
                ySplit: maxColDepth,
                // adjust for the path column _and_ the headers
                topLeftCell: (config.showPath ? "B" : "A") + (1 + maxColDepth)
            }
        ]
    });

    AddHeaders(maxColDepth, colGroups, sheet, config, formatting);

    for (let row of table.rows) {
        AddRow(row, sheet, config, formatting, depthColorFunction);
    }

    // The ExcelJS typings are incomplete, and don't include outlineProperties
    (sheet.properties as Excel.WorksheetProperties & {outlineProperties: object}).outlineProperties = {
        summaryBelow: false,
        summaryRight: false
    };

    return workbook;
}

export interface IExcelExportConfig {
    showPath: boolean;
    rowGrouping: boolean;
    columnGrouping: boolean;
    mergeCells: boolean;
}

const defaults: IExcelExportConfig = {
    showPath: true,
    rowGrouping: true,
    columnGrouping: true,
    mergeCells: false
};

export function configWithDefaults(config?: Partial<IExcelExportConfig>) {
    return {
        ...defaults,
        ...config
    };
}
