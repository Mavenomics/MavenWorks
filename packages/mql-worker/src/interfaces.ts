//#region utilities
interface ITrackedMsg {
    id: string;
}

interface ICancelable {
    isCanceled: boolean;
}

interface IHasGlobals {
    serializedGlobals: Record<string, any>;
}

interface IHasResult {
    result: any;
    error?: null;
}

interface IHasError {
    error: any;
    result?: null;
}
//#endregion

export interface IMqlFunctionMetadata {
    name: string;
    args: {
        name: string;
        defaultValue: any;
        typeName: string;
        description?: string;
    }[];
    repeatingArgs: number;
    returnTypeName: string;
    returnDescription?: string;
    description?: string;
    remarks?: string;
    examples?: string[];
}

export interface IParsedQuery {
    sets: string[];
    defs: {
        name: string;
        paramNames: string[];
    }[];
    errors: {
        token: {
            text: string;
            start: number;
            stop: number;
        };
        line: number;
        column: number;
        msg: string;
    }[];
}

export namespace WorkerMessage {
    export const enum MsgType {
        CancelRequest = "cancelRequest",
        RunQueryRequest = "runQuery",
        RunEvalRequest = "runEval",
        KernelEvalResult = "KernelEvalResult",
        FetchResult = "FetchResult",
        StaticCacheCmdResult = "StaticCacheCmdResult",
        ParseQueryRequest = "parseQuery",
        GetFunctionsRequest = "getAvailableFunctions"
    }

    export type IMsg = ICancelRequest
        | IRunQueryRequest
        | IRunEvalRequest
        | IKernelEvalSuccessResult
        | IKernelEvalErrorResult
        | IFetchSuccessResult
        | IFetchErrorResult
        | IStaticCacheResult
        | IParseQueryRequest
        | IGetFunctionsRequest
    ;

    interface ICancelRequest {
        type: MsgType.CancelRequest;
    }

    interface IRunQueryRequest extends ITrackedMsg, IHasGlobals {
        type: MsgType.RunQueryRequest;
        queryText: string;
    }

    interface IRunEvalRequest extends ITrackedMsg, IHasGlobals {
        type: MsgType.RunEvalRequest;
        codeText: string;
    }

    interface IKernelEvalSuccessResult extends ITrackedMsg, IHasResult {
        type: MsgType.KernelEvalResult;
    }

    interface IKernelEvalErrorResult extends ITrackedMsg, IHasError {
        type: MsgType.KernelEvalResult;
    }

    interface IFetchSuccessResult extends ITrackedMsg, IHasResult {
        type: MsgType.FetchResult;
    }

    interface IFetchErrorResult extends ITrackedMsg, IHasError {
        type: MsgType.FetchResult;
    }

    interface IStaticCacheResult extends ITrackedMsg, IHasResult {
        type: MsgType.StaticCacheCmdResult;
        result: StaticCacheMsg.IResult;
    }

    interface IParseQueryRequest extends ITrackedMsg {
        type: MsgType.ParseQueryRequest;
        codeText: string;
    }

    interface IGetFunctionsRequest extends ITrackedMsg {
        type: MsgType.GetFunctionsRequest;
        includeDocs?: boolean;
    }
}

export namespace WorkerResponse {
    export const enum MsgType {
        RunQueryResult = "runQueryResult",
        RunEvalResult = "runEvalResult",
        ParseQueryResult = "parseQueryResult",
        GetFunctionsResult = "getAvailableFunctionsResult",
        KernelEvalRequest = "KernelEvalRequest",
        FetchRequest = "FetchRequest",
        StaticCacheCmd = "StaticCacheCmd"
    }

    export type IMsg = IRunQuerySuccessResult
        | IRunQueryErrorResult
        | IRunEvalSuccessResult
        | IRunEvalErrorResult
        | IParseQueryResult
        | IGetFunctionsResult
        | IKernelEvalRequest
        | IFetchRequest
        | IStaticCacheRequest
    ;

    interface IRunQuerySuccessResult extends ITrackedMsg, ICancelable, IHasResult {
        type: MsgType.RunQueryResult;
    }

    interface IRunQueryErrorResult extends ITrackedMsg, ICancelable, IHasError {
        type: MsgType.RunQueryResult;
    }

    interface IRunEvalSuccessResult extends ITrackedMsg, ICancelable, IHasResult {
        type: "runEvalResult";
    }

    interface IRunEvalErrorResult extends ITrackedMsg, ICancelable, IHasError {
        type: "runEvalResult";
    }

    interface IParseQueryResult extends ITrackedMsg {
        type: MsgType.ParseQueryResult;
        data: string;
    }

    interface IGetFunctionsResult extends ITrackedMsg {
        type: MsgType.GetFunctionsResult;
        data: string;
    }

    interface IKernelEvalRequest extends ITrackedMsg {
        type: MsgType.KernelEvalRequest;
        taskId: any;
        code: string;
        serializedArgs: Record<string, any>;
    }

    interface IFetchRequest extends ITrackedMsg {
        type: MsgType.FetchRequest;
        taskId: any;
        url: string;
    }

    interface IStaticCacheRequest extends ITrackedMsg {
        type: MsgType.StaticCacheCmd;
        taskId: any;
        data: StaticCacheMsg.IRequest;
    }
}

export namespace StaticCacheMsg {
    export type IRequest = IGetRequest
        | IPutRequest
        | IDeleteRequest
        | ILockRequest
        | IUnlockRequest
    ;

    export type IResult = IGetSuccessResult
        | IGetMissResult
        | ISuccessResult
        | ILockResult
        | IUnlockResult
        | IUnknownCmdResult
    ;

    //#region requests
    interface IGetRequest {
        cmd: "GET";
        key: string;
        blocking?: boolean;
        lockId?: number;
    }

    interface IPutRequest {
        cmd: "PUT";
        key: string;
        value: string;
        blocking?: boolean;
        lockId?: number;
    }

    interface IDeleteRequest {
        cmd: "DELETE";
        key: string | "*";
        blocking?: boolean;
        lockId?: number;
    }

    interface ILockRequest {
        cmd: "LOCK";
        key: string;
        isWrite?: boolean;
    }

    interface IUnlockRequest {
        cmd: "UNLOCK";
        key: string;
        lockId: number;
    }
    //#endregion

    //#region results
    interface IGetSuccessResult {
        type: "HIT";
        value: string;
    }

    interface IGetMissResult {
        type: "MISS";
    }

    interface ILockResult {
        type: "LOCK";
        lockId: number;
    }

    interface IUnlockResult {
        type: "UNLOCK";
    }

    // the other message types just send HIT
    interface ISuccessResult {
        type: "HIT";
    }

    interface IUnknownCmdResult {
        type: "UNKNOWN_CMD";
    }
    //#endregion
}
