import * as React from "react";
import { ITypeEditorProps } from "../editorfactory/interfaces";
import * as DropdownList from "react-widgets/lib/DropdownList";

export const Checkbox: React.FunctionComponent<ITypeEditorProps<boolean>> = ({
    value, onValueChanged
}) => {
    return (<span className="m-rw-inline-hack">
        <DropdownList value={!!value ? "True" : "False"}
            data={["True", "False"]}
            onChange={(val) => {
                onValueChanged.call(void 0, val === "True");
            }} />
        </span>
    );
};
