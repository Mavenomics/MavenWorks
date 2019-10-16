import { ErrorListener } from "antlr4/error";
import { Recognizer, Token } from "antlr4";

export class ThrowErrorListener extends ErrorListener {
    public static INSTANCE = new ThrowErrorListener();

    public syntaxError(
        _recognizer: Recognizer,
        _offendingSymbol: Token,
        line: number,
        column: number,
        msg: string,
        _e: any
    ) {
        throw new Error("line " + line + ":" + column + " " + msg);
    }
}
