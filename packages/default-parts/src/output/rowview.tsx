import { Types } from "@mavenomics/coreutils";
import { ReactPart, OptionsBag } from "@mavenomics/parts";
import { Table } from "@mavenomics/table";
import * as React from "react";

function sanitize(input: unknown) {
    if (input == null) {
        return input === null ? "null" : "undefined";
    }
    switch (typeof input) {
        case "string":
            return input;
        case "number":
        case "bigint":
            return input.toLocaleString();
        case "boolean":
            return input ? "True" : "False";
        case "object":
            if (input instanceof Table) {
                return input.length + " row table";
            }
            try {
                return JSON.stringify(input, null, "  ");
            } catch (e) {
                return "" + input;
            }
        default:
            return "" + input;
    }
}

export class RowViewPart extends ReactPart {
    public static GetMetadata() {
        const metadata = super.GetMetadata();

        metadata.description = "Display a single row from a table";

        metadata.remarks = "This part will _only_ display the first row of the " +
        "given table.";

        metadata.addOption("Table", Types.Table, new Table());

        return metadata;
    }

    protected renderReact(bag: OptionsBag) {
        const table = bag.get("Table");
        if (!(table instanceof Table)) {
            return <div />;
        }
        const row = table.rows[0];
        const cols: React.ReactElement[] = [];

        for (const col of table.columnNames) {
            const val = sanitize(row.getValue(col));
            cols.push(<tr id={col} key={col}>
                <td>{col}</td>
                <td>{val}</td>
            </tr>);
        }
        return (<table>
            <thead>
                <tr>
                    <th>Column</th>
                    <th>Value</th>
                </tr>
            </thead>
            {cols}
        </table>);
    }
}
