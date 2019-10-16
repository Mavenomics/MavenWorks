import { Table, TableHelper } from "@mavenomics/table";
import { Types, Type, Color, Converters } from "@mavenomics/coreutils";

export function idealTextColor(bgColor: string) {
    var nThreshold = 105;
    var components = hex2rgb(bgColor);
    var bgDelta = (components.r * 0.299) + (components.g * 0.587) + (components.b * 0.114);

    return ((255 - bgDelta) < nThreshold) ? "#000000" : "#FFFFFF";
}

export function hex2rgb(color: string) {
    var r = color.substring(1, 3);
    var g = color.substring(3, 5);
    var b = color.substring(5, 7);

    return {
        r: parseInt(r, 16),
        g: parseInt(g, 16),
        b: parseInt(b, 16)
    };
}

// TODO: narrow typing
export function lastSelectionToLinkageExpression(selection: string | any) {
    if (typeof selection === "string")
        try {
            selection = JSON.parse(selection);
        }
        catch (err) {
            return err;
        }

    if (selection.column === "Path")
        selection.column = "GetName()";

    var expression = "(" + selection.column + ") in ( ";

    selection.list.forEach(function (sel: string, i: number, list: any) {
        if (typeof sel === "string") {
            expression += "'" + sel + "'";
        } else {
            expression += sel;
        }

        if (i + 1 < list.length)
            expression += ", ";
    });

    expression += " )";
    return expression;
}

// TODO: narrow typing
export function findCssBySelector(selector: string, cssRuleList: any[] | true): any {
    var i;
    if (cssRuleList !== true && cssRuleList != null) {
        for (i = 0; i < cssRuleList.length; i++)
            if (cssRuleList[i].selectorText === selector)
                return cssRuleList[i].style;
    }
    else {
        var list = [];
        for (i = 0; i < document.styleSheets.length; i++) {
            // TODO: Why did this work?
            var rules = (document.styleSheets[i] as any).rules;
            if (rules) {
                var ret = findCssBySelector(selector, rules);
                if (ret)
                    list.push(ret);
            }
        }

        return list;
    }
}

export function isExpression(expr: string) {
    return expr.match(/[A-z]/i);
}

/* Disabled formatting options:

Option Name                                                 Option Default
Data Table Hovers.Show Single Row Detail Hover              False
Data Table Hovers.Row Detail Formatting Query               ""
Data Table Hovers.TableData Hover Redirection               ""
Data Table Hovers.TableData Open Redirection                ""
Data Table Hovers.Pivoted Sub-Table Columns                 ""
User Defined Values.Type                                    ""
User Defined Values.Allow Nulls                             True
ConditionalFormatting.Condition1.Icon                       ""
ConditionalFormatting.Condition2.Icon                       ""
ConditionalFormatting.Condition3.Icon                       ""
ConditionalFormatting.Condition4.Icon                       ""
ConditionalFormatting.Condition5.Icon                       ""
ConditionalFormatting.Condition6.Icon                       ""
ConditionalFormatting.Condition7.Icon                       ""
ConditionalFormatting.Condition8.Icon                       ""
ConditionalFormatting.Condition9.Icon                       ""
ColumnHeader.Rotation                                       0
ColumnHeader.Suggested Maximum Height                       1000
ColumnHeader.Horizontal Alignment                           Default
ColumnHeader.Vertical Alignment                             Default
Date.FormatString                                           yyyyMMdd
General.Base BackColor                                      White
ColumnHeader.Grouping BackColors                            ""
ColumnHeader.Grouping ForeColors                            ""
User Defined Values.Show Editable Cells                     False
Mini Charts.Bar Charts.Color Bars                           True
Mini Charts.Bar Charts.Horizontal Stacked                   False
Mini Charts.Bar Charts.Show Missing Buckets                 False
Mini Charts.Bar Charts.Transparency (0-255   :              150
Mini Charts.Bar Charts.Minimum % Threshold to Bucket        0
Mini Charts.Bar Charts.Top N Only                           0
User Defined Values.Autocomplete.Enable                     True
User Defined Values.Require Refresh After Commit            True
User Defined Values.Auto Commit                             False
Data Table Hovers.Enable Hover                              True
DataSource.Column Key                                       ""
 */
export interface IColumnFormatting {
    "Row Detail.Show Row Detail Button":            boolean;
    "ChangeHighlighting.Enabled":                   boolean;
    "ChangeHighlighting.Style":                     string;
    "ChangeHighlighting.Minimum Change":            number;
    "ConditionalFormatting.Simple":                 string;
    "ConditionalFormatting.Condition1. Condition":  string;
    "ConditionalFormatting.Condition1.ForeColor":   Color;
    "ConditionalFormatting.Condition1.BackColor":   Color;
    "ConditionalFormatting.Condition1.IsBold":      boolean;
    "ConditionalFormatting.Condition1.IsItalic":    boolean;
    "ConditionalFormatting.Condition2. Condition":  string;
    "ConditionalFormatting.Condition2.ForeColor":   Color;
    "ConditionalFormatting.Condition2.BackColor":   Color;
    "ConditionalFormatting.Condition2.IsBold":      boolean;
    "ConditionalFormatting.Condition2.IsItalic":    boolean;
    "ConditionalFormatting.Condition3. Condition":  string;
    "ConditionalFormatting.Condition3.ForeColor":   Color;
    "ConditionalFormatting.Condition3.BackColor":   Color;
    "ConditionalFormatting.Condition3.IsBold":      boolean;
    "ConditionalFormatting.Condition3.IsItalic":    boolean;
    "ConditionalFormatting.Condition4. Condition":  string;
    "ConditionalFormatting.Condition4.ForeColor":   Color;
    "ConditionalFormatting.Condition4.BackColor":   Color;
    "ConditionalFormatting.Condition4.IsBold":      boolean;
    "ConditionalFormatting.Condition4.IsItalic":    boolean;
    "ConditionalFormatting.Condition5. Condition":  string;
    "ConditionalFormatting.Condition5.ForeColor":   Color;
    "ConditionalFormatting.Condition5.BackColor":   Color;
    "ConditionalFormatting.Condition5.IsBold":      boolean;
    "ConditionalFormatting.Condition5.IsItalic":    boolean;
    "ConditionalFormatting.Condition6. Condition":  string;
    "ConditionalFormatting.Condition6.ForeColor":   Color;
    "ConditionalFormatting.Condition6.BackColor":   Color;
    "ConditionalFormatting.Condition6.IsBold":      boolean;
    "ConditionalFormatting.Condition6.IsItalic":    boolean;
    "ConditionalFormatting.Condition7. Condition":  string;
    "ConditionalFormatting.Condition7.ForeColor":   Color;
    "ConditionalFormatting.Condition7.BackColor":   Color;
    "ConditionalFormatting.Condition7.IsBold":      boolean;
    "ConditionalFormatting.Condition7.IsItalic":    boolean;
    "ConditionalFormatting.Condition8. Condition":  string;
    "ConditionalFormatting.Condition8.ForeColor":   Color;
    "ConditionalFormatting.Condition8.BackColor":   Color;
    "ConditionalFormatting.Condition8.IsBold":      boolean;
    "ConditionalFormatting.Condition8.IsItalic":    boolean;
    "ConditionalFormatting.Condition9. Condition":  string;
    "ConditionalFormatting.Condition9.ForeColor":   Color;
    "ConditionalFormatting.Condition9.BackColor":   Color;
    "ConditionalFormatting.Condition9.IsBold":      boolean;
    "ConditionalFormatting.Condition9.IsItalic":    boolean;
    "ColumnHeader.ForeColor":                       Color;
    "ColumnHeader.BackColor":                       Color;
    "Heatmap.Minimum.Value":                        number;
    "Heatmap.Center.Value":                         number;
    "Heatmap.Maximum.Value":                        number;
    "Heatmap.Minimum.Color":                        Color;
    "Heatmap.Center.Color":                         Color;
    "Heatmap.Maximum.Color":                        Color;
    "Heatmap. Enable":                              boolean;
    "General.DisplayStyle":                         string;
    "General.NullRule":                             string;
    "General.ColumnWidthPixels":                    number;
    "Number.FormatString":                          string;
    "ProgressBar.StartColor":                       Color;
    "ProgressBar.EndColor":                         Color;
    "ProgressBar.ShowValue":                        boolean;
    "ProgressBar.Minimum":                          number;
    "ProgressBar.Maximum":                          number;
}


const columnFormattingMetadata = {
    "Row Detail.Show Row Detail Button":            {default: false, type: Types.Boolean},
    "ChangeHighlighting.Enabled":                   {default: false, type: Types.Boolean},

    "ChangeHighlighting.Style":                     {
                                                        default: "GlobalDefault",
                                                        type: Types.String,
                                                        schema: {
                                                            enum: [
                                                                "GlobalDefault",
                                                                "Background",
                                                                "Arrow"
                                                            ]
                                                        }
                                                    },
    "ChangeHighlighting.Minimum Change":            {default: 0, type: Types.Number},

    //#region Conditional Formatting
    "ConditionalFormatting.Simple":                 {
                                                        default: "None",
                                                        type: Types.String,
                                                        schema: {
                                                            enum: [
                                                                "None",
                                                                "NegRed",
                                                                "NegRedPosGreen"
                                                            ]
                                                        }
                                                    },
    "ConditionalFormatting.Condition1. Condition":  {default: "null", type: Types.String},
    "ConditionalFormatting.Condition1.ForeColor":   {default: new Color("black"), type: Types.Color},
    "ConditionalFormatting.Condition1.BackColor":   {default: new Color("white"), type: Types.Color},
    "ConditionalFormatting.Condition1.IsBold":      {default: false, type: Types.Boolean},
    "ConditionalFormatting.Condition1.IsItalic":    {default: false, type: Types.Boolean},
    "ConditionalFormatting.Condition2. Condition":  {default: "null", type: Types.String},
    "ConditionalFormatting.Condition2.ForeColor":   {default: new Color("black"), type: Types.Color},
    "ConditionalFormatting.Condition2.BackColor":   {default: new Color("white"), type: Types.Color},
    "ConditionalFormatting.Condition2.IsBold":      {default: false, type: Types.Boolean},
    "ConditionalFormatting.Condition2.IsItalic":    {default: false, type: Types.Boolean},
    "ConditionalFormatting.Condition3. Condition":  {default: "null", type: Types.String},
    "ConditionalFormatting.Condition3.ForeColor":   {default: new Color("black"), type: Types.Color},
    "ConditionalFormatting.Condition3.BackColor":   {default: new Color("white"), type: Types.Color},
    "ConditionalFormatting.Condition3.IsBold":      {default: false, type: Types.Boolean},
    "ConditionalFormatting.Condition3.IsItalic":    {default: false, type: Types.Boolean},
    "ConditionalFormatting.Condition4. Condition":  {default: "null", type: Types.String},
    "ConditionalFormatting.Condition4.ForeColor":   {default: new Color("black"), type: Types.Color},
    "ConditionalFormatting.Condition4.BackColor":   {default: new Color("white"), type: Types.Color},
    "ConditionalFormatting.Condition4.IsBold":      {default: false, type: Types.Boolean},
    "ConditionalFormatting.Condition4.IsItalic":    {default: false, type: Types.Boolean},
    "ConditionalFormatting.Condition5. Condition":  {default: "null", type: Types.String},
    "ConditionalFormatting.Condition5.ForeColor":   {default: new Color("black"), type: Types.Color},
    "ConditionalFormatting.Condition5.BackColor":   {default: new Color("white"), type: Types.Color},
    "ConditionalFormatting.Condition5.IsBold":      {default: false, type: Types.Boolean},
    "ConditionalFormatting.Condition5.IsItalic":    {default: false, type: Types.Boolean},
    "ConditionalFormatting.Condition6. Condition":  {default: "null", type: Types.String},
    "ConditionalFormatting.Condition6.ForeColor":   {default: new Color("black"), type: Types.Color},
    "ConditionalFormatting.Condition6.BackColor":   {default: new Color("white"), type: Types.Color},
    "ConditionalFormatting.Condition6.IsBold":      {default: false, type: Types.Boolean},
    "ConditionalFormatting.Condition6.IsItalic":    {default: false, type: Types.Boolean},
    "ConditionalFormatting.Condition7. Condition":  {default: "null", type: Types.String},
    "ConditionalFormatting.Condition7.ForeColor":   {default: new Color("black"), type: Types.Color},
    "ConditionalFormatting.Condition7.BackColor":   {default: new Color("white"), type: Types.Color},
    "ConditionalFormatting.Condition7.IsBold":      {default: false, type: Types.Boolean},
    "ConditionalFormatting.Condition7.IsItalic":    {default: false, type: Types.Boolean},
    "ConditionalFormatting.Condition8. Condition":  {default: "null", type: Types.String},
    "ConditionalFormatting.Condition8.ForeColor":   {default: new Color("black"), type: Types.Color},
    "ConditionalFormatting.Condition8.BackColor":   {default: new Color("white"), type: Types.Color},
    "ConditionalFormatting.Condition8.IsBold":      {default: false, type: Types.Boolean},
    "ConditionalFormatting.Condition8.IsItalic":    {default: false, type: Types.Boolean},
    "ConditionalFormatting.Condition9. Condition":  {default: "null", type: Types.String},
    "ConditionalFormatting.Condition9.ForeColor":   {default: new Color("black"), type: Types.Color},
    "ConditionalFormatting.Condition9.BackColor":   {default: new Color("white"), type: Types.Color},
    "ConditionalFormatting.Condition9.IsBold":      {default: false, type: Types.Boolean},
    "ConditionalFormatting.Condition9.IsItalic":    {default: false, type: Types.Boolean},
    //#endregion
    "ColumnHeader.ForeColor":                       {default: new Color("black"), type: Types.Color},
    "ColumnHeader.BackColor":                       {default: new Color("white"), type: Types.Color},
    "Heatmap.Minimum.Value":                        {default: -1, type: Types.Number},
    "Heatmap.Center.Value":                         {default: 0, type: Types.Number},
    "Heatmap.Maximum.Value":                        {default: 1, type: Types.Number},
    "Heatmap.Minimum.Color":                        {default: new Color("red"), type: Types.Color},
    "Heatmap.Center.Color":                         {default: new Color("white"), type: Types.Color},
    "Heatmap.Maximum.Color":                        {default: new Color("blue"), type: Types.Color},
    "Heatmap. Enable":                              {default: false, type: Types.Boolean},

    "General.DisplayStyle":                         {
                                                        default: "Quantity",
                                                        type: Types.String,
                                                        schema: {
                                                            enum: [
                                                                "Quantity",
                                                                "ProgressBar",
                                                                "Sparkline",
                                                                "DashboardLink"
                                                            ]
                                                        }
                                                    },
    "General.NullRule":                             {
                                                        default: "Hide",
                                                        type: Types.String,
                                                        schema: {
                                                            enum: [
                                                                "Hide",
                                                                "Show"
                                                            ]
                                                        }
                                                    },
    "General.ColumnWidthPixels":                    {default: 59, type: Types.Number},
    "Number.FormatString":                          {default: "", type: Types.String},
    "ProgressBar.StartColor":                       {default: new Color("blue"), type: Types.Color},
    "ProgressBar.EndColor":                         {default: new Color("yellow"), type: Types.Color},
    "ProgressBar.ShowValue":                        {default: true, type: Types.Boolean},
    "ProgressBar.Minimum":                          {default: 0, type: Types.Number},
    "ProgressBar.Maximum":                          {default: 1, type: Types.Number},
} as const;

const columnFormattingDefaults =
    (Object.keys(columnFormattingMetadata) as (keyof IColumnFormatting)[])
    .map(i => [i, columnFormattingMetadata[i].default] as const)
    .reduce((acc, i) => {
        acc[i[0]] = (i[1] as any);
        return acc;
    }, {} as Partial<IColumnFormatting>) as IColumnFormatting;

export function getFormattingOption<K extends keyof IColumnFormatting>(
    options: Partial<IColumnFormatting>,
    option: K
): IColumnFormatting[K] {
    if (options && option in options) {
        return options[option] as IColumnFormatting[K];
    }
    return columnFormattingMetadata[option].default as IColumnFormatting[K];
}

export function getFormattingWithDefaults(
    options: Partial<IColumnFormatting>
): IColumnFormatting {
    return Object.assign({}, columnFormattingDefaults, options);
}

export function stripDefaultsFromFormatting(
    options: Partial<IColumnFormatting>
): Partial<IColumnFormatting> {
    const keys = Object.keys(options) as (keyof typeof options)[];
    const newOptions: Partial<IColumnFormatting> = {};
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (options[key] === columnFormattingMetadata[key].default) {
            continue;
        }
        newOptions[key] = options[key] as any;
    }
    return newOptions;
}

// TODO: migrate formatting over to use MavenWorks types
export function getFormattingMetadata() {
    return (Object.keys(columnFormattingMetadata) as (keyof IColumnFormatting)[])
        .map(i => ([i, {
            default: columnFormattingMetadata[i].default,
            type: columnFormattingMetadata[i].type,
            schema: (columnFormattingMetadata[i] as any).schema,
            prettyName: i
        }] as [string, {
            default: string,
            type: Type,
            prettyName: string,
            schema?: {enum: string[]}
        }]));
}

export function serializeFormatting(
    formatting: {[col: string]: Partial<IColumnFormatting>}
) {
    const cols = Object.keys(formatting);
    const serializedCols: any = {};
    for (const col of cols) {
        const props = Object.keys(formatting[col]) as (keyof IColumnFormatting)[];
        const serializedCol: any = {};
        for (const prop of props) {
            const serializedVal = Converters.serialize(
                formatting[col][prop],
                columnFormattingMetadata[prop].type
            );
            serializedCol[prop] = serializedVal && serializedVal["value"];
        }
        serializedCols[col] = serializedCol;
    }
    return JSON.stringify(serializedCols);
}

export function parseFormatting(formatting: string) {
    const serializedCols = JSON.parse(formatting);
    const formattingObj: {[col: string]: Partial<IColumnFormatting>} = {};
    const cols = Object.keys(serializedCols);
    for (const col of cols) {
        const serializedProps = serializedCols[col];
        const propObj: Partial<IColumnFormatting> = {};
        const props = Object.keys(serializedProps) as (keyof IColumnFormatting)[];
        for (const prop of props) {
            if (!(prop in columnFormattingMetadata)) {
                continue; // this is a disabled option, skip it for now.
            }
            try {
                propObj[prop] = Converters.deserialize({
                    typeName: columnFormattingMetadata[prop].type.serializableName,
                    value: serializedProps[prop]
                });
            } catch (err) {
                console.warn(`Failed to deserialize formatting option ${col}[${prop}], skipping`);
                console.warn(err);
                console.warn("Original value", serializedProps[prop]);
                continue;
            }
        }
        formattingObj[col] = propObj
    }
    return formattingObj;
}

// todo: move formatting into it's own interface
export function tableToResultTable(
    table: Table,
    formatting: {[column: string]: typeof columnFormattingMetadata} = {}
) {
    let id = 0;
    let tbl = TableHelper.toMQLResultTable(table);
    for (let i = 0; i < tbl.Columns.length; i++) {
        const col = tbl.Columns[i];
        (col as any).FormattingOptions = formatting[col.Name] || {};
    }
    for (let i = 0; i < tbl.Result.Rows.length; i++) {
        const row = tbl.Result.Rows[i];
        (row as any).JavascriptDomIdentifier = "" + (id++);
    }
    return tbl;
  };