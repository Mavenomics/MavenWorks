import * as moment from "moment";
import Calendar from "rc-calendar";
import * as Picker from "rc-calendar/lib/Picker";
import * as React from "react";
import { Types } from "@mavenomics/coreutils";
import { ReactPart, OptionsBag } from "@mavenomics/parts";

export class DatePickerPart extends ReactPart {
    public static GetMetadata() {
        const metadata = super.GetMetadata();

        metadata.description = "Input part with a date editor control";

        metadata.addOption("Value", Types.Date, new Date(), {
            description: "Defaults to the current day."
        });

        return metadata;
    }

    protected renderReact(bag: OptionsBag) {
        const date = bag.get("Value") as any;
        const value = moment(date);
        return (<Picker
            value={ value }
            calendar={
                <Calendar showOk
                    value={ value }
                    onChange={ (value) => {
                        if (value == null) {
                            bag.set("Value", null);
                            return;
                        }
                        const date = new Date(value.format());
                        bag.set("Value", date);
                    }}/>
            }>
                {({value}: {value: moment.Moment}) => <input readOnly
                    value={value && value.format("MM/DD/YYYY")}
                    placeholder="mm/dd/yyyy" />
                }
            </Picker>);
    }
}
