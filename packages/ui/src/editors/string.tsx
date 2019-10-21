import * as React from "react";
import { ITypeEditorProps } from "../editorfactory/interfaces";
import * as DropdownList from "react-widgets/lib/DropdownList";
import { UncontrolledInput, useIntermediate } from "../components";

export const StringEditor: React.FunctionComponent<ITypeEditorProps<string>> = ({
    value, onValueChanged, schema
}) => {
    const [val, key, setVal] = useIntermediate(value, onValueChanged);
    if (schema != null) {
        return (<span className="m-rw-inline-hack">
            <DropdownList value={value}
                data={schema["enum"]}
                onChange={(val) => {
                    onValueChanged.call(void 0, val);
                }} />
            </span>
        );
    } else {
        return (<UncontrolledInput key={key}
            className="m-FallbackEditor-String"
            value={val}
            valueChanged={newVal => setVal(newVal)} />
        );
    }
};
