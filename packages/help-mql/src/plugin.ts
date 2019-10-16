import { Types } from "@mavenomics/coreutils";
import { IPlugin, Application } from "@phosphor/application";
import { IHelpDocProvider } from "@mavenomics/help";
import funcTemplateDoc from "raw-loader!../mql-ref-template.md";
import { template } from "lodash";
import { WorkerWrapper, IMqlFunctionMetadata, WorkerMessage, WorkerResponse } from "@mavenomics/mql-worker";
import { filter, first } from "rxjs/operators";

function isMqlFunction(func: any): func is IMqlFunctionMetadata {
    return func.args.length >= 1 && func.args[0].name === "row";
}

const mqlTemplateGenerator = template(funcTemplateDoc);

function generateSignature(func: IMqlFunctionMetadata) {
    //Mql functions always start with a row arg.
    const args = func.args.slice(1);
    //Todo: Decide on a signature format.
    //Currently mql doesn't support defaults(optional args).
    //When that changes we will want to pick a better signature format.
    const requiredArgs = args;
    const repeatingArgs = args.slice(args.length - func.repeatingArgs);

    const requiredText = requiredArgs.map((a) => a.name + ": " + a.typeName).join(", ");
    const leadingComma = requiredArgs.length > 0 ? ", " : "";
    const repeatingText = repeatingArgs.length > 0 ?
        ` [${leadingComma}${repeatingArgs.map((a) => a.name + ": " + a.typeName).join(", ")}]+` :
        "";
    const returnType = Types.findType(func.returnTypeName) || Types.Any;
    const signature = `${func.name}(${requiredText}${repeatingText}): ${returnType.name}`;
    return mqlTemplateGenerator({
        signature,
        funcName: func.name,
        arguments: args.slice(0, args.length - func.repeatingArgs),
        repeatingArgs,
        returnType: returnType,
        returnDescription: func.returnDescription,
        description: func.description,
        remarks: func.remarks,
        examples: func.examples
    });
}

export const helpMqlPlugin: IPlugin<Application<any>, void> = {
    id: "mavenworks-help-mql-browser-plugin",
    autoStart: true,
    requires: [IHelpDocProvider],
    activate: async (_app, doc: IHelpDocProvider) => {
        //Reference worker functions to ensure they are loaded.
        const worker = new WorkerWrapper();
        const id = "get-functions-req";
        const future = worker.onMessage.pipe(
            filter(msg => msg.type === WorkerResponse.MsgType.GetFunctionsResult && id === id),
            first()
        ).toPromise();
        worker.postMessage({
            id,
            type: WorkerMessage.MsgType.GetFunctionsRequest,
            includeDocs: true
        });
        const response = await future;
        worker.dispose();
        if (response.type !== WorkerResponse.MsgType.GetFunctionsResult) return;
        let funcs = JSON.parse(response.data) as IMqlFunctionMetadata[];
        let mqlFuncs = funcs.filter(isMqlFunction);
        for (let i = 0; i < mqlFuncs.length; i++) {
            const func = mqlFuncs[i];
            doc.addDocument(generateSignature(func));
        }
    }
};

