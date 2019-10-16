import { Lexer, Token, Parser } from "antlr4";
import { ParseTreeVisitor } from "antlr4/tree/Tree";

// TODO: We should either have actual types here, or migrate the parser to
// Typescript.

declare class MqlLexer extends Lexer {
    public static EOF = Token.EOF;
    public static HEREDOC_START: number;
    public static SELECT: number;
    public static DISTINCT: number;
    public static TOP: number;
    public static AS: number;
    public static NOTE: number;
    public static FORMAT: number;
    public static IMPORT: number;
    public static SET: number;
    public static DEF: number;
    public static FROM: number;
    public static PRESERVE: number;
    public static GROUPING: number;
    public static WHERE: number;
    public static GROUP: number;
    public static BY: number;
    public static WITH: number;
    public static ROLLUP: number;
    public static NO: number;
    public static LEAVES: number;
    public static HAVING: number;
    public static ORDER: number;
    public static ASC: number;
    public static DESC: number;
    public static REGION: number;
    public static ENDREGION: number;
    public static FUN: number;
    public static TRUE: number;
    public static FALSE: number;
    public static NULL: number;
    public static OR_: number;
    public static AND_: number;
    public static XOR: number;
    public static NOT: number;
    public static NAN: number;
    public static INFINITY: number;
    public static IN: number;
    public static SEMI: number;
    public static DOT: number;
    public static COMMA: number;
    public static ASTERISK: number;
    public static AT_SIGN: number;
    public static HASH: number;
    public static OPEN_PAREN: number;
    public static CLOSE_PAREN: number;
    public static OPEN_BRACK: number;
    public static CLOSE_BRACK: number;
    public static OPEN_CURLY: number;
    public static CLOSE_CURLY: number;
    public static SQUOTE: number;
    public static STRING_VECTOR_START: number;
    public static FLOAT_VECTOR_START: number;
    public static PLUS: number;
    public static MINUS: number;
    public static DIVIDE: number;
    public static MOD: number;
    public static VERTBAR: number;
    public static CONCATINATION: number;
    public static EQ: number;
    public static NOT_EQ: number;
    public static GE: number;
    public static GT: number;
    public static LE: number;
    public static LT_: number;
    public static ASSIGNMENT: number;
    public static BITSHIFT_LEFT: number;
    public static WS: number;
    public static NEWLINE: number;
    public static ML_COMMENT: number;
    public static STRING_LITERAL: number;
    public static NUM_INT: number;
    public static NUM_FLOAT: number;
    public static NORMAL_IDENTIFIER: number;
    public static ESCAPED_IDENTIFIER: number;
    public static AT_IDENTIFIER: number;
    public static HEREDOC_END: number;
    public static HEREDOC_TEXT: number;
    public static HereDocMode: number;

    constructor(inputStream: any) {}
};
exports.MqlLexer = MqlLexer;

declare class MqlParserVisitor extends ParseTreeVisitor {};
exports.MqlParserVisitor = MqlParserVisitor;

declare class MqlParser extends Parser {
    public static EOF = Token.EOF;
    public static HEREDOC_START: number;
    public static SELECT: number;
    public static DISTINCT: number;
    public static TOP: number;
    public static AS: number;
    public static NOTE: number;
    public static FORMAT: number;
    public static IMPORT: number;
    public static SET: number;
    public static DEF: number;
    public static FROM: number;
    public static PRESERVE: number;
    public static GROUPING: number;
    public static WHERE: number;
    public static GROUP: number;
    public static BY: number;
    public static WITH: number;
    public static ROLLUP: number;
    public static NO: number;
    public static LEAVES: number;
    public static HAVING: number;
    public static ORDER: number;
    public static ASC: number;
    public static DESC: number;
    public static REGION: number;
    public static ENDREGION: number;
    public static FUN: number;
    public static TRUE: number;
    public static FALSE: number;
    public static NULL: number;
    public static OR_: number;
    public static AND_: number;
    public static XOR: number;
    public static NOT: number;
    public static NAN: number;
    public static INFINITY: number;
    public static IN: number;
    public static SEMI: number;
    public static DOT: number;
    public static COMMA: number;
    public static ASTERISK: number;
    public static AT_SIGN: number;
    public static HASH: number;
    public static OPEN_PAREN: number;
    public static CLOSE_PAREN: number;
    public static OPEN_BRACK: number;
    public static CLOSE_BRACK: number;
    public static OPEN_CURLY: number;
    public static CLOSE_CURLY: number;
    public static SQUOTE: number;
    public static STRING_VECTOR_START: number;
    public static FLOAT_VECTOR_START: number;
    public static PLUS: number;
    public static MINUS: number;
    public static DIVIDE: number;
    public static MOD: number;
    public static VERTBAR: number;
    public static CONCATINATION: number;
    public static EQ: number;
    public static NOT_EQ: number;
    public static GE: number;
    public static GT: number;
    public static LE: number;
    public static LT_: number;
    public static ASSIGNMENT: number;
    public static BITSHIFT_LEFT: number;
    public static WS: number;
    public static NEWLINE: number;
    public static ML_COMMENT: number;
    public static STRING_LITERAL: number;
    public static NUM_INT: number;
    public static NUM_FLOAT: number;
    public static NORMAL_IDENTIFIER: number;
    public static ESCAPED_IDENTIFIER: number;
    public static AT_IDENTIFIER: number;
    public static HEREDOC_END: number;
    public static HEREDOC_TEXT: number;
    public static RULE_mql_query: number;
    public static RULE_set_statement_list: number;
    public static RULE_definition_list: number;
    public static RULE_literal_table: number;
    public static RULE_literal_table_column: number;
    public static RULE_literal_table_row: number;
    public static RULE_function_definition: number;
    public static RULE_non_at_param_set_statement_list: number;
    public static RULE_non_at_param_set_statement: number;
    public static RULE_query_sets_defs_regions: number;
    public static RULE_query_sets_defs: number;
    public static RULE_set_statement: number;
    public static RULE_def_statement: number;
    public static RULE_import_statement: number;
    public static RULE_hash_statement: number;
    public static RULE_region_statement: number;
    public static RULE_endregion_statement: number;
    public static RULE_select_statement: number;
    public static RULE_select_list: number;
    public static RULE_where_clause: number;
    public static RULE_group_clause: number;
    public static RULE_having_clause: number;
    public static RULE_order_clause: number;
    public static RULE_sorted_def: number;
    public static RULE_region_or_displayed_column: number;
    public static RULE_displayed_column: number;
    public static RULE_format: number;
    public static RULE_assignment_list_semicolon_separated: number;
    public static RULE_assignment_list_comma_separated: number;
    public static RULE_assignment: number;
    public static RULE_expression_standalone: number;
    public static RULE_expression_list: number;
    public static RULE_expression: number;
    public static RULE_orExpression: number;
    public static RULE_andExpression: number;
    public static RULE_xorExpression: number;
    public static RULE_equalityExpression: number;
    public static RULE_relationExpression: number;
    public static RULE_additionExpression: number;
    public static RULE_multiplicativeExpression: number;
    public static RULE_negationExpression: number;
    public static RULE_notExpression: number;
    public static RULE_inExpression: number;
    public static RULE_functionExpression: number;
    public static RULE_primaryExpression: number;
    public static RULE_nullLiteral: number;
    public static RULE_falseLiteral: number;
    public static RULE_trueLiteral: number;
    public static RULE_parenthesisExpression: number;
    public static RULE_identifier: number;
    public static RULE_non_function_non_at_identifier: number;
    public static RULE_normal_identifier: number;
    public static RULE_contextual_keywords: number;
    public static RULE_escaped_identifier: number;
    public static RULE_at_identifier: number;
    public static RULE_mql_literal: number;
    public static RULE_literal_string: number;
    public static RULE_negative_literal_double: number;
    public static RULE_literal_double: number;
    public static RULE_float_vector: number;
    public static RULE_string_vector: number;
    public static RULE_custom_literal: number;
    public static RULE_here_document: number;
};
exports.MqlParser = MqlParser;
