import { MqlLexer } from "../../mqlparser_src";

export class MqlLexerImpl extends MqlLexer {
    private _hereDocId = undefined;

    public CheckHeredocEnd() {
        return this._hereDocId === this.text;
    }

    public nextToken() {
        let token = super.nextToken();
        switch (token.type) {
            case MqlLexer.HEREDOC_START:
                this._hereDocId  = token.text.substring(2).trim();
                break;

            case MqlLexer.HEREDOC_END:
                this._hereDocId  = undefined;
                break;

            default:
                break;
        }

        return token;
    }
}
