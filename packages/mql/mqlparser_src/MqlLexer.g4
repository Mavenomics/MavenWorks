lexer grammar MqlLexer;

options {
	language = CSharp;
}

@members
{
    var HeredocIdentifier;
}

HEREDOC_START
    :   '<<' NORMAL_IDENTIFIER NEWLINE
        -> pushMode(HereDocMode)
    ;

//Mql Keywords
SELECT: S E L E C T;
DISTINCT: D I S T I N C T;
TOP: T O P;
AS: A S;
NOTE: N O T E;
FORMAT: F O R M A T;
IMPORT: I M P O R T;
SET: S E T;
DEF: D E F;
FROM: F R O M;
PRESERVE: P R E S E R V E;
GROUPING: G R O U P I N G;
WHERE: W H E R E;
GROUP: G R O U P;
BY: B Y;
WITH: W I T H;
ROLLUP: R O L L U P;
NO: N O;
LEAVES: L E A V E S;
HAVING: H A V I N G;
ORDER: O R D E R;
ASC: A S C;
DESC: D E S C;
REGION: R E G I O N;
ENDREGION: E N D R E G I O N;
FUN: F U N;
    
//Expression Keywords
TRUE: T R U E;
FALSE: F A L S E;
NULL: N U L L;
OR_ : O R;
AND_ : A N D;
XOR : X O R;
NOT : N O T;
NAN				:	N A N;
INFINITY		:	I N F I N I T Y;

IN : I N;
SEMI : ';';

DOT : '.' ;
COMMA : ',' ;
ASTERISK : '*' ;
AT_SIGN : '@' ;
HASH : '#' ;

OPEN_PAREN : '(' ;
CLOSE_PAREN : ')' ;
OPEN_BRACK : '[' ;
CLOSE_BRACK : ']' ;
OPEN_CURLY : '{';
CLOSE_CURLY : '}';

SQUOTE : '\'';

STRING_VECTOR_START : 's[';
FLOAT_VECTOR_START : 'f[';

PLUS : '+' ;
MINUS : '-' ;
DIVIDE : '/' ;
MOD : '%';

VERTBAR : '|' ;
CONCATINATION : '||';

EQ : '=' ;

NOT_EQ : '!=' ;

GE				:	'>='	;
GT				:	'>'		;
LE				:	'<='	;
LT_				:	'<'		;

ASSIGNMENT : ':=';

BITSHIFT_LEFT : '<<' ;


WS
	:	[ \t]+
		-> channel(HIDDEN)
	;

NEWLINE
	:	'\r'? '\n'
		-> channel(HIDDEN)
	;

// Taken right from antlr-2.7.1/examples/java/java/java.g ...
// multiple-line comments
ML_COMMENT
	:	'/*' .*? '*/' -> skip
	;

STRING_LITERAL
	:	SQUOTE (('\'' '\'') |  ~('\'') )* SQUOTE
	;

	
fragment
DIGITS
:	[0-9]+
;
NUM_INT
    : DIGITS
    ;
NUM_FLOAT 
	: DIGITS DOT DIGITS? EXPONENTPART?
    | DOT DIGITS EXPONENTPART?
    | DIGITS EXPONENTPART
    ;
fragment
EXPONENTPART
    :   EXPONENTINDICATOR SIGNEDINTEGER
    ;
fragment
EXPONENTINDICATOR
    :   E
    ;
fragment
SIGNEDINTEGER
    :   SIGN? DIGITS
    ;
fragment
SIGN
    : (PLUS|MINUS)
    ;
fragment
FLOATTYPESUFFIX
    : (F | D)
    ;
    
    
    
NORMAL_IDENTIFIER : 
		 [a-zA-Z] [a-zA-Z0-9_$#.]*
	;
	
ESCAPED_IDENTIFIER : 
		 '[' (~(']'|'\n'|'\r'))* ']'
	;
	
AT_IDENTIFIER :
		'@' NORMAL_IDENTIFIER
	;

fragment A:('a'|'A');
fragment B:('b'|'B');
fragment C:('c'|'C');
fragment D:('d'|'D');
fragment E:('e'|'E');
fragment F:('f'|'F');
fragment G:('g'|'G');
fragment H:('h'|'H');
fragment I:('i'|'I');
fragment J:('j'|'J');
fragment K:('k'|'K');
fragment L:('l'|'L');
fragment M:('m'|'M');
fragment N:('n'|'N');
fragment O:('o'|'O');
fragment P:('p'|'P');
fragment Q:('q'|'Q');
fragment R:('r'|'R');
fragment S:('s'|'S');
fragment T:('t'|'T');
fragment U:('u'|'U');
fragment V:('v'|'V');
fragment W:('w'|'W');
fragment X:('x'|'X');
fragment Y:('y'|'Y');
fragment Z:('z'|'Z');

    
// Copied/Modified from http://stackoverflow.com/a/27321119/442078
// Modified to match NEWLINE
// Also fixed empty lines not being matched
mode HereDocMode;

    HEREDOC_END
        :   
            {this._input.LA(-1) === 10}?
            NORMAL_IDENTIFIER
            {this.CheckHeredocEnd(this._input.LA(-1), this.text)}?
            NEWLINE
            -> popMode
        ;
    HEREDOC_TEXT
        :   ~[\r\n]* NEWLINE
        ;