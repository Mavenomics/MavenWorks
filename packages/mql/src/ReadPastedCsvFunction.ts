import { IFunction } from "./Function";
import { IFunctionEvaluatorContext } from "./functionExecution";
import { TableHelper } from "@mavenomics/table";
import * as Papa from "papaparse";
import { declareFunction, functionArg } from "./FunctionDecorators";
import { Types } from "@mavenomics/coreutils";

@declareFunction("ReadPastedCsvFunction")
@functionArg("TableOutput")
@functionArg("inferTypes", Types.Boolean, true, "Whether to infer types on the " +
    "CSV. Greatly improves performance, but may cause issues with some CSVs")
export class ReadPastedCsvFunction extends IFunction {
    public eval(optionLookup: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let raw = optionLookup["TableOutput"].trim();
        const inferTypes = optionLookup["inferTypes"] == null ? true : optionLookup["inferTypes"];
        try {
            let table = Papa.parse(raw, {header: true, dynamicTyping: true});
            return TableHelper.fromObjectArray(table.data, inferTypes);
        } catch (e) {
            throw EvalError("Could not parse pasted CSV. Is it valid?");
        }
    }
}
