import { ArraySymbolToken, ColonSymbolToken, CommaSymbolToken, CurlyCloseSymbolToken, CurlyOpenSymbolToken, EnumKeywordToken, EqualSymbolToken, ErrorKeywordToken, ExclamationMarkSymbolToken, FalseKeywordToken, FunctionKeywordToken, GetKeywordToken, GlobalOptionToken, IdentifierToken, ImportKeywordToken, OptionalSymbolToken, ParensCloseSymbolToken, ParensOpenSymbolToken, PrimitiveTypeToken, SpreadSymbolToken, StringLiteralToken, Token, TrueKeywordToken, TypeKeywordToken } from "./token";

export class LexerError extends Error {}

export class Lexer {
    public static PRIMITIVES = [
        "bool", "int", "uint", "float", "string", "date", "datetime", "bytes",
        "money", "cpf", "cnpj", "email", "phone", "cep", "latlng", "url",
        "uuid", "hex", "base64", "safehtml", "xml"
    ];

    private startPos = 0;
    private startLine = 1;
    private startColumn = 1;
    private pos = 0;
    private line = 1;
    private column = 1;

    constructor(private source: string, public filename: string = "-") {

    }

    private currentChar() {
        return this.source[this.pos] || "\0";
    }

    private nextChar() {
        this.column++;
        return this.source[++this.pos] || "\0";
    }

    private peekNextChar() {
        return this.source[this.pos+1] || "\0";
    }

    nextToken(): Token | null {
        this.startPos = this.pos;
        this.startLine = this.line;
        this.startColumn = this.column;

        let token: Token | null = null;

        switch (this.currentChar()) {
            case "\0":
                return null;
            case " ":
            case "\r":
            case "\t":
                this.nextChar();
                return this.nextToken();
            case "\n":
                this.nextChar();
                this.column = 1;
                this.line++;
                return this.nextToken();
            case "/":
                switch (this.nextChar()) {
                    case "/":
                        while (true) {
                            switch (this.nextChar()) {
                                case "\0":
                                    return null;
                                case "\n":
                                    this.nextChar();
                                    this.column = 1;
                                    this.line++;
                                    return this.nextToken();
                            }
                        }
                    case "*":
                        outerWhile: while (true) {
                            switch (this.nextChar()) {
                                case "\0":
                                    break outerWhile;
                                case "\n":
                                    this.column = 0;
                                    this.line++;
                                    break;
                                case "*":
                                    while (this.nextChar() === "*") {}
                                    switch (this.currentChar()) {
                                        case "\0":
                                            break outerWhile;
                                        case "\n":
                                            this.column = 0;
                                            this.line++;
                                            break;
                                        case "/":
                                            this.nextChar();
                                            return this.nextToken();
                                    }
                            }
                        }
                }
                break;
            case "{":
                this.nextChar();
                token = new CurlyOpenSymbolToken;
                break;
            case "}":
                this.nextChar();
                token = new CurlyCloseSymbolToken;
                break;
            case "(":
                this.nextChar();
                token = new ParensOpenSymbolToken;
                break;
            case ")":
                this.nextChar();
                token = new ParensCloseSymbolToken;
                break;
            case "?":
                this.nextChar();
                token = new OptionalSymbolToken;
                break;
            case ":":
                this.nextChar();
                token = new ColonSymbolToken;
                break;
            case "=":
                this.nextChar();
                token = new EqualSymbolToken;
                break;
            case "!":
                this.nextChar();
                token = new ExclamationMarkSymbolToken;
                break;
            case ",":
                this.nextChar();
                token = new CommaSymbolToken;
                break;
            case "[":
                switch (this.nextChar()) {
                    case "]": {
                        this.nextChar();
                        token = new ArraySymbolToken;
                        break;
                    }
                }
                break;
            case ".":
                switch (this.nextChar()) {
                    case ".": {
                        switch (this.nextChar()) {
                            case ".": {
                                this.nextChar();
                                token = new SpreadSymbolToken;
                                break;
                            }
                        }
                    }
                }
                break;
            case "$":
                this.nextChar();
                if (this.currentChar().match(/[a-zA-Z]/)) {
                    while (this.nextChar().match(/[a-zA-Z0-9]/)) {}
                    token = new GlobalOptionToken(this.source.substring(this.startPos + 1, this.pos));
                }
                break;
            case "\"": {
                const chars = [];
                outerLoop: while (true) {
                    switch (this.nextChar()) {
                        case "\0":
                            break outerLoop;
                        case "\\":
                            switch (this.nextChar()) {
                                case "\0":
                                    break outerLoop;
                                case "n":
                                    chars.push("\n");
                                    break;
                                case "t":
                                    chars.push("\t");
                                    break;
                                default:
                                    chars.push(this.currentChar());
                                    break;
                            }
                            break;
                        case "\"":
                            this.nextChar();
                            token = new StringLiteralToken(chars.join(""));
                            break outerLoop;
                        default:
                            chars.push(this.currentChar());
                            break;
                    }
                }
            }
            default: {
                if (this.currentChar().match(/[a-zA-Z]/)) {
                    while (this.nextChar().match(/[a-zA-Z0-9]/)) {}
                    const ident = this.source.substring(this.startPos, this.pos);

                    switch (ident) {
                        case "error":
                            token = new ErrorKeywordToken;
                            break;
                        case "enum":
                            token = new EnumKeywordToken;
                            break;
                        case "type":
                            token = new TypeKeywordToken;
                            break;
                        case "import":
                            token = new ImportKeywordToken;
                            break;
                        case "get":
                            token = new GetKeywordToken;
                            break;
                        case "function":
                            token = new FunctionKeywordToken;
                            break;
                        case "true":
                            token = new TrueKeywordToken;
                            break;
                        case "false":
                            token = new FalseKeywordToken;
                            break;
                        default:
                            if (Lexer.PRIMITIVES.includes(ident)) {
                                token = new PrimitiveTypeToken(ident);
                            } else {
                                token = new IdentifierToken(ident);
                            }
                    }
                }
            }
        }

        if (token !== null) {
            token.filename = this.filename;
            token.line = this.startLine;
            token.column = this.startColumn;
            return token;
        } else {
            if (this.currentChar() === "\0") {
                throw new LexerError(`Unexpected end of file at ${this.filename}`);
            } else {
                throw new LexerError(`Unexpected character ${JSON.stringify(this.currentChar())} at ${this.filename}:${this.line}:${this.column}`);
            }
        }
    }
}
