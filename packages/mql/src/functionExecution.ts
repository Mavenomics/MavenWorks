import { FunctionInfo } from "./FunctionDecorators";
import { CancelToken } from "@mavenomics/coreutils";

export interface IFunctionEvaluatorContext {
    //evaluator: IFunctionEvaluator;
    cancelToken: CancelToken<FunctionEvaluatorResults>;
    /**
     * Returns an object describing the user making the function evaluation request.
     * @returns {!IUserAuthInfo}
     */
    user: IUserAuthInfo;
    userContext: any; //Caller user defined context

    FindFunctionInfo(name: string): Promise<FunctionInfo>;
    GetAllFunctions(): Promise<{ [id: string]: any }>;

    //Runs a function in a child context.
    evaluate(name: string, options: { [id: string]: any }): Promise<any>;

    setGlobal(name: string, value: any): void;

    getGlobal(name: string): any;

    getGlobalKeys(): string[];

    setLocal(name: string, value: any): void;

    getLocal(name: string): any;
}

export interface IUserAuthInfo {
    isLoggedIn: boolean;
    email: string;

    getAuthToken(provider: string): { [index: string]: string };
}

export interface IFunctionEvaluator {
    cancelToken: CancelToken<FunctionEvaluatorResults>;

    evaluate(functionName: string, options: { [id: string]: any }): Promise<FunctionEvaluatorResults>;
    cancel(): void;
}

export class FunctionEvaluation {
    constructor(
        public cancelToken: CancelToken<FunctionEvaluatorResults>,
        public result: Promise<FunctionEvaluatorResults>) {
    }
}

export class FunctionEvaluatorResults {
    constructor(
        public data: any,
        public isCanceled: boolean = false,
        public globalChanges: any = null,
        public timing: any = null,
        public stdout: string = "",
        public stderr: string = ""
    ) { }

    copyWithNewData(newData: any) {
        return new FunctionEvaluatorResults(
            newData,
            this.isCanceled,
            this.globalChanges,
            this.timing,
            this.stdout,
            this.stderr
        );
    }
}
