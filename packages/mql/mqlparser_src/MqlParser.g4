//Note: When adding Keywords, update 'src/Maven/Mql/Identifier.cs' - RegEx s_IsKeywordMatcher expression.
//Note: Syntax highlighting file: 'src/Maven/SharedInterfaces/Resources/MQLSyntax.xshd'
//Note: MQL unit tests located 'src/Maven/Mql/MQL test cases' and 'src/Maven/Mql/MqlUnitTest.cs'
//Note: Manual antlr grammar files compiling steps:

//For using antlr4 see: https://theantlrguy.atlassian.net/wiki/display/ANTLR4/Getting+Started+with+ANTLR+v4#GettingStartedwithANTLRv4-WINDOWS
//Once antlr4 is in your PATH. Simply run compile.bat (make sure the working directory is the grammar folder)
//Compile.bat contains the relevant antlr4 generate commands.
//The generated cs files will be placed into the Generated folder.


parser grammar MqlParser;

options {
	language = CSharp;
    tokenVocab = MqlLexer;
}


//---------------------------------------------------------------------------------------------
// Mql      
//---------------------------------------------------------------------------------------------

mql_query :
		imports+=import_statement*
		defs+=query_sets_defs_regions*
		select=select_statement
		EOF
    ;
set_statement_list :
	sets+=set_statement* EOF
	;
definition_list :
	defs+=query_sets_defs*
	EOF
	;
literal_table
	: rows+=literal_table_row+ EOF
	;
literal_table_column
    : literal=mql_literal SEMI
    ;
literal_table_row
    : columns+=literal_table_column+ SEMI
    ;
    
function_definition
    : FUN OPEN_PAREN ( param+=at_identifier ( COMMA param+=at_identifier )* )? CLOSE_PAREN
		imports+=import_statement*
		defs+=query_sets_defs*
		body=expression
		EOF
    ;
    
    
    
    
non_at_param_set_statement_list :
		sets+=non_at_param_set_statement* EOF
	;
non_at_param_set_statement :
		SET id=non_function_non_at_identifier EQ body=expression
	;
    
query_sets_defs_regions 
    : (setDef=query_sets_defs | hash=hash_statement)
    ;
query_sets_defs
    : set=set_statement | def=def_statement
    ;
    
set_statement
	: SET name=at_identifier EQ body=expression
	;
def_statement
    : DEF name=at_identifier OPEN_PAREN ( param+=at_identifier ( COMMA param+=at_identifier )* )? CLOSE_PAREN EQ body=expression
	;

 import_statement :
		 IMPORT id=normal_identifier
	 ;

hash_statement :
	  (end=endregion_statement | start=region_statement)
 ;
	
region_statement :
	 HASH REGION (id=normal_identifier)
 ;

 endregion_statement :
	 HASH ENDREGION
 ;
	
select_statement :
    SELECT
     ( distinct=DISTINCT)?
     ( top=TOP topNum=NUM_INT)?
     ( selectStar=ASTERISK | columns=select_list)
    FROM from=expression (preserveGrouping=PRESERVE GROUPING)?
     ( where=where_clause )?
     ( group=group_clause )?
     ( having=having_clause )?
     ( order=order_clause )?
    ;

select_list
    : regionOrColumn+=region_or_displayed_column ( COMMA regionOrColumn+=region_or_displayed_column )*
    ;
where_clause
    : WHERE where=expression
    ;

group_clause
    : GROUP BY list=expression_list (rollup=WITH ROLLUP (noLeaves=NO LEAVES)?)?
	;
having_clause
    : HAVING expr=expression
    ;

order_clause 
    : ORDER BY defs+=sorted_def ( COMMA defs+=sorted_def )*
    ;

sorted_def
    : ( expr=expression sort=(ASC | DESC)?  )
	; 
    
region_or_displayed_column :
	hash1+=hash_statement*
	column=displayed_column
	hash2+=hash_statement*
	;
    
displayed_column :
		( expr=expression ( AS id=non_function_non_at_identifier )? ( form=format )?  ( NOTE note=mql_literal )? )
	; 
    
format : 
	FORMAT ( OPEN_CURLY assignment_list_semicolon_separated CLOSE_CURLY )
	;
	
assignment_list_semicolon_separated :
		assignment ( SEMI assignment )*
	;
	
assignment_list_comma_separated :
		assignment ( COMMA assignment )*
	;
	
assignment :
		id=non_function_non_at_identifier ASSIGNMENT expr=expression
	;
    

//---------------------------------------------------------------------------------------------
//Expressions + Literals       
//---------------------------------------------------------------------------------------------
expression_standalone
    : expression EOF
	;
expression_list :
		(expression ( COMMA expression )* )?;

//left recursion is somewhat slower(especially in JS).
expression
    : 
    /*primaryExpression | unaryOp=NOT left=expression
    | unaryOp=MINUS left=expression
    | left=expression binOp=(ASTERISK | DIVIDE | MOD) right=expression
    | left=expression binOp=(CONCATINATION | PLUS | MINUS) right=expression
    | left=expression binOp=(LT_ | GT | LE | GE) right=expression
    | left=expression binOp=(NOT_EQ | EQ) right=expression
    | left=expression binOp=XOR right=expression
    | left=expression binOp=AND_ right=expression
    | left=expression binOp=OR_ right=expression*/
    //| expression logical_not? IN OPEN_PAREN (expression_list) CLOSE_PAREN
    orExpression;
    
orExpression
    : left=andExpression (binop+=OR_ right+=andExpression)*
    ;
andExpression
    : left=xorExpression (binop+=AND_ right+=xorExpression)*
    ;
xorExpression
    : left=equalityExpression (binop+=XOR right+=equalityExpression)*
    ;
equalityExpression
    : left=relationExpression (binop+=(NOT_EQ | EQ) right+=relationExpression)*
    ;
relationExpression
    : left=additionExpression (binop+=(LT_ | GT | LE | GE) right+=additionExpression)*
    ;
additionExpression
    : left=multiplicativeExpression (binop+=(CONCATINATION | PLUS | MINUS) right+=multiplicativeExpression)*
    ;
multiplicativeExpression
    : left=negationExpression (binop+=(ASTERISK | DIVIDE | MOD) right+=negationExpression)*
    ;
negationExpression
    : unaryop=MINUS left=negationExpression
    | prim=notExpression
    ;
notExpression
    : unaryop=NOT left=negationExpression
    | prim=inExpression
    ;

inExpression
    : inExpr=functionExpression (not=NOT? IN OPEN_PAREN (exprs=expression_list|subQuery=select_statement) CLOSE_PAREN)
    | prim=functionExpression
    ;
    
functionExpression
    : id=identifier (OPEN_PAREN (exprs=expression_list|named=assignment_list_comma_separated) CLOSE_PAREN)
    | primaryExpression
    ;
    
    
primaryExpression
	:	identifier
    |   mql_literal
    |   parenthesisExpression
	;
nullLiteral: NULL;
falseLiteral: FALSE;
trueLiteral: TRUE;
parenthesisExpression
    : OPEN_PAREN expression CLOSE_PAREN
    ;

identifier
	:	( normal_identifier | escaped_identifier | at_identifier )
    ;
non_function_non_at_identifier
	:	( normal_identifier | escaped_identifier )
	;
normal_identifier : NORMAL_IDENTIFIER | contextual_keywords;
contextual_keywords: REGION | ENDREGION; 
//contextual keywords are not needed for these tokens
//@x and [x] are matched before keywords. Meaning @x will be AT_IDENTIFIER and not 2 tokens "AT X"
escaped_identifier : ESCAPED_IDENTIFIER;
at_identifier : AT_IDENTIFIER;

mql_literal:
        ( trueLiteral
        | falseLiteral
        | nullLiteral 
        | float_vector
        | string_vector
		| negative_literal_double
        | literal_double
        | literal_string
        | here_document
        | custom_literal
        )
    ;

literal_string
    : sl=STRING_LITERAL
    ;
negative_literal_double:
    MINUS literal_double
    ;
literal_double
	: NAN | INFINITY | NUM_FLOAT | NUM_INT
	;
    
float_vector
	:	(	FLOAT_VECTOR_START
			(mql_literal)? 
			( COMMA mql_literal)* 
			(( COMMA CLOSE_BRACK ) | ( CLOSE_BRACK ))
		)
	;
	
string_vector
	:	(	STRING_VECTOR_START
			(literal_string)? 
			( COMMA literal_string )* 
			(( COMMA CLOSE_BRACK ) | ( CLOSE_BRACK ))
		)
	;
custom_literal
	: HASH id=normal_identifier text=literal_string
	;
    
here_document 
    :
        start=HEREDOC_START 
            ids=HEREDOC_TEXT*
        end=HEREDOC_END
    ;