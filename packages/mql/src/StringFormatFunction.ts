import { IFunction } from "./Function";
import { IFunctionEvaluatorContext } from "./functionExecution";
import { declareFunction, functionArg } from "./FunctionDecorators";
import { Types } from "@mavenomics/coreutils";

@declareFunction("StringFormatFunction", 1, Types.String)
@functionArg("Format", Types.String)
@functionArg("Input")
export class StringFormatFunction extends IFunction {
    static StringFormat(format: string, a: string[]) {
        let s = format;
        let i = a.length;

        while (i--) {
            s = s.replace(new RegExp("\\{" + i + "\\}", "gm"), a[i]);
        }
        return s;
    }

    eval(optionLookup: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let format = optionLookup["Format"];
        let inputArray = optionLookup["Input"];
        return StringFormatFunction.StringFormat(format, inputArray);
    }
}
