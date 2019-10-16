#Building
This is how you build the grammar and webpack the parser.

1. run `java -jar antlr4.jar -Dlanguage=JavaScript -visitor MqlLexer.g4 MqlParser.g4`
2. run `webpack`