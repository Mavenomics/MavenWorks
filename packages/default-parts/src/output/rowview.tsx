import { Types } from "@mavenomics/coreutils";
import { ReactPart, OptionsBag } from "@mavenomics/parts";
import { Table } from "@mavenomics/table";
import * as React from "react";

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
            const val = row.getValue(col);
            if (val == null) continue;
            cols.push(<tr id={col}>
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
