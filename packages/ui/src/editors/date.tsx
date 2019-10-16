import * as React from "react";
import * as moment from "moment";
import Calendar from "rc-calendar";
import * as Picker from "rc-calendar/lib/Picker";
import { ITypeEditorProps, TypeEditorHost } from "../editorfactory/interfaces";

export const DateEditor: React.FunctionComponent<ITypeEditorProps<Date | null>> = ({
    value, onValueChanged
}) => {
    const fixedValue = moment(value || new Date());
    return (
    <TypeEditorHost.Context.Consumer>
        {(ctx) => (<Picker
            value={ fixedValue }
            getCalendarContainer={ () => ctx.portalHostNode || document.body }
            calendar={
                <Calendar showOk
                    onChange={ (value) => {
                        if (value == null) {
                            onValueChanged.call(void 0, null);
                            return;
                        } else {
                            const date = new Date(value.format());
                            onValueChanged.call(void 0, date);
                        }
                    }}/>
            }>
                {({value}: {value: moment.Moment}) => <input readOnly
                    value={value && value.format("MM/DD/YYYY")}
                    placeholder="mm/dd/yyyy" />
                }
            </Picker>
        )}
    </TypeEditorHost.Context.Consumer>);
};
