import { IFunction } from "./Function";
import { IFunctionEvaluatorContext } from "./functionExecution";
import { declareFunction, functionArg } from "./FunctionDecorators";
import { Types } from "@mavenomics/coreutils";
import { TableHelper } from "@mavenomics/table";

@declareFunction("LatticeFunction", 0, Types.Table)
@functionArg("Lattice Definition", Types.String, "x = 1 to 10 step 1, y = 1 to 10 step 1")
export class LatticeFunction extends IFunction {
    static parseLatticeText(text: string): ILatticeGeneratorVariables {
        let match = text.match(/^\s*([a-zA-Z0-9_$#]+) = ([0-9.-]+) to ([0-9.-]+) step ([0-9.-]+)\s*$/);
        if (!match || match.length !== 5) {
            throw new Error("LatticeWidget: Invalid variable string. It should " +
                "be in the format 'x = 1 to 10 step 1, y = 1 to 10 step 1'.");
        }
        let start = Number(match[2]);
        let end = Number(match[3]);
        let step = Number(match[4]);
        return {
            name: match[1].trim(),
            start: start,
            end: end,
            step: step,
            count: Math.floor((end - start + step) / step)
        };
    }

    public eval(optionLookup: { [id: string]: any; }, context: IFunctionEvaluatorContext): any {
        let latticeText = optionLookup["Lattice Definition"];
        let latticeVars = latticeText.split(",").map(LatticeFunction.parseLatticeText);

        let columns = latticeVars.map((l: ILatticeGeneratorVariables) => l.name);
        let rowCount = latticeVars.map((l: ILatticeGeneratorVariables) => l.count)
            .reduce((a: number, b: number) => a * b);

        //Create an empty jagged 2d array
        let rows: number[][] = [];
        for (let i = 0; i < rowCount; i++) {
            rows.push(columns.map((c: string) => 0));
        }

        let multiplier = 1;
        for (let latticeVarIndex = 0; latticeVarIndex < latticeVars.length; latticeVarIndex++) {
            let cur = latticeVars[latticeVarIndex];
            let howManyTimes = rowCount / (multiplier * cur.count);

            let rowIdx = 0;
            for (let repeatIndex = 0; repeatIndex < howManyTimes; repeatIndex++) {
                for (let latticeItemIndex = 0; latticeItemIndex < cur.count; latticeItemIndex++) {
                    for (let i = 0; i < multiplier; i++) {
                        rows[rowIdx++][latticeVarIndex] = cur.start + cur.step * latticeItemIndex;
                    }
                }
            }

            multiplier *= cur.count;
        }
        return TableHelper.fromMatrixObject(rows, columns);
    }
}

export interface ILatticeGeneratorVariables {
    name: string;
    start: Number;
    end: Number;
    step: Number;
    count: number;
}
