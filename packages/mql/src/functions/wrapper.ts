import { IFunction } from "../Function";
import { Type, Types } from "@mavenomics/coreutils";
import { functionArg, declareFunction, documentFunction } from "../FunctionDecorators";
import { RegisterFunction } from "../functionFactory";

type IMqlEvalFunction = (this: void, ...args: any[]) => any | Promise<any>;

/**
 * This is a helper method to let you expose a simple function to MQL.
 *
 * This will automatically take care of decorators and factory registration.
 *
 * @export
 * @param evalFn The lambda to execute
 * @param [{ name, returnType, returnDesc, varArgs }={}] Function metadata. Name is required.
 * @param [args=[]] Argument metadata. Name of each arg is required.
 * @param [docs={}] Optional documentation about the function.
 * @returns An IFunction constructor. Usually you don't need to do anything with it.
 */
export function MqlWrapper(
    evalFn: IMqlEvalFunction,
    { name, returnType, returnDesc, varArgs }: {
        name: string
        returnType?: Type,
        returnDesc?: string,
        varArgs?: number
    },
    args: ({ name: string, type?: Type, default?: any, docs?: string})[] = [],
    docs: Parameters<typeof documentFunction>[0] = {}
): typeof IFunction {
    @declareFunction(name, varArgs, returnType, returnDesc)
    @documentFunction(docs)
    // tslint:disable-next-line: class-name
    class generatedMqlClass extends IFunction {
        public eval(opts: any) {
            const unpacked = new Array(args.length);
            for (let i = 0; i < args.length; i++) {
                unpacked[i] = opts[args[i].name];
            }
            return evalFn.apply(void 0, unpacked);
        }
    }
    // process args in reverse order
    const _toProcess = [...args].reverse();
    for (let arg of _toProcess) {
        functionArg(arg.name, arg.type, arg.default, arg.docs)(generatedMqlClass);
    }
    functionArg("row", Types.Row)(generatedMqlClass);
    RegisterFunction(name, generatedMqlClass);
    return generatedMqlClass;
}
