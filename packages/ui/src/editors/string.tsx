import * as React from "react";
import { ITypeEditorProps } from "../editorfactory/interfaces";
import * as DropdownList from "react-widgets/lib/DropdownList";

export const StringEditor: React.FunctionComponent<ITypeEditorProps<string>> = ({
    value, onValueChanged, schema
}) => {
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
        return (<input type="text"
            className="m-FallbackEditor-String"
            value={value}
            onChange={(ev) => onValueChanged(ev.currentTarget.value)}
            autoCorrect="off"
            spellCheck={false}
            autoCapitalize={"off"} />);
    }
};
