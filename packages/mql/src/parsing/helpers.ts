import { InputStream, CommonTokenStream } from "antlr4";
import { MqlParser } from "../../mqlparser_src";
import { MqlLexerImpl } from "./MqlLexerImpl";
import { MqlTreeParser } from "./MqlTreeParser";
import { ThrowErrorListener } from "./ThrowErrorListener";
import { Query } from "./Query";

function setupParser(text: string) {
    let chars = new InputStream(text);
    let tokens = new CommonTokenStream(new MqlLexerImpl(chars));
    let parser = new MqlParser(tokens);
    let tree = new MqlTreeParser();

    parser.addErrorListener(ThrowErrorListener.INSTANCE);

    return { parser, tree };
}

export function parseQuery(text: string): Query {
    let { parser, tree } = setupParser(text);
    // TODO: Context types?
    let result = (parser as any).mql_query();

    return tree.parseQuery(result);
}

export function parseDefinitions(text: string) {
    let ret = setupParser(text);
    // TODO: Context types?
    let result = (ret.parser as any).set_statement_list();
    let treeParser = ret.tree;

    return treeParser.visit(result);
}
