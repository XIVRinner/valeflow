import { Token, TokenType } from "../types.js";

const KEYWORDS: Record<string, TokenType> = Object.create(null);

Object.assign(KEYWORDS, {
  declare : TokenType.DECLARE,
  chapter : TokenType.CHAPTER,
  if      : TokenType.IF,
  elseif  : TokenType.ELSEIF,
  else    : TokenType.ELSE,
  goto    : TokenType.GOTO,
  call    : TokenType.CALL,
  return  : TokenType.RETURN,
  set     : TokenType.SET,
  choice  : TokenType.CHOICE,
  js      : TokenType.JS,
  true    : TokenType.BOOLEAN,
  false   : TokenType.BOOLEAN,
  null    : TokenType.NULL,
});

/**
 * Tokenise a ValeFlow source string into a flat token list.
 * Indentation changes are emitted as INDENT / DEDENT tokens.
 */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const lines = source.split(/\r?\n/);
  const indentStack: number[] = [0];

  const push = (type: TokenType, value: string, line: number) =>
    tokens.push({ type, value, line });

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const raw = lines[i];
    const trimmed = raw.trimEnd();

    // Skip blank lines and comment-only lines
    if (trimmed.trim() === "" || trimmed.trim().startsWith("#")) continue;

    // Measure leading whitespace (spaces; tabs count as 1)
    let indent = 0;
    while (indent < trimmed.length && (trimmed[indent] === " " || trimmed[indent] === "\t")) {
      indent++;
    }

    const top = indentStack[indentStack.length - 1];

    if (indent > top) {
      indentStack.push(indent);
      push(TokenType.INDENT, "", lineNo);
    } else if (indent < top) {
      while (indentStack.length > 1 && indentStack[indentStack.length - 1] > indent) {
        indentStack.pop();
        push(TokenType.DEDENT, "", lineNo);
      }
    }

    tokenizeLine(trimmed.trimStart(), lineNo, tokens);
    push(TokenType.NEWLINE, "", lineNo);
  }

  // Close any remaining open indent levels
  while (indentStack.length > 1) {
    indentStack.pop();
    push(TokenType.DEDENT, "", lines.length);
  }

  push(TokenType.EOF, "", lines.length + 1);
  return tokens;
}

// ──────────────────────────────────────────────────────────────
// Tokenise a single line (already stripped of leading whitespace)
// ──────────────────────────────────────────────────────────────
function tokenizeLine(line: string, lineNo: number, out: Token[]): void {
  let p = 0;

  const push = (type: TokenType, value: string) => out.push({ type, value, line: lineNo });

  while (p < line.length) {
    const ch = line[p];

    // Skip inline whitespace
    if (ch === " " || ch === "\t") { p++; continue; }

    // Line comment
    if (ch === "#") break;

    // String literal  ─  supports \" and \n etc. inside
    if (ch === '"') {
      let str = "";
      p++; // skip opening quote
      while (p < line.length && line[p] !== '"') {
        if (line[p] === "\\") {
          p++;
          switch (line[p]) {
            case "n" : str += "\n"; break;
            case "t" : str += "\t"; break;
            case '"' : str += '"';  break;
            case "\\": str += "\\"; break;
            default  : str += line[p];
          }
        } else {
          str += line[p];
        }
        p++;
      }
      p++; // skip closing quote
      push(TokenType.STRING, str);
      continue;
    }

    // Number literal
    if (ch >= "0" && ch <= "9") {
      let num = "";
      while (p < line.length && ((line[p] >= "0" && line[p] <= "9") || line[p] === ".")) {
        num += line[p++];
      }
      push(TokenType.NUMBER, num);
      continue;
    }

    // Identifier or keyword
    if ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_") {
      let id = "";
      while (p < line.length && /[a-zA-Z0-9_]/.test(line[p])) id += line[p++];
      const kw = KEYWORDS[id.toLowerCase()];
      push(kw ?? TokenType.IDENTIFIER, id);
      continue;
    }

    // Two-character tokens
    const two = line.slice(p, p + 2);
    switch (two) {
      case "::": push(TokenType.COLONCOLON, "::"); p += 2; continue;
      case "==": push(TokenType.EQ,    "=="); p += 2; continue;
      case "!=": push(TokenType.NEQ,   "!="); p += 2; continue;
      case ">=": push(TokenType.GTE,   ">="); p += 2; continue;
      case "<=": push(TokenType.LTE,   "<="); p += 2; continue;
      case "&&": push(TokenType.AND,   "&&"); p += 2; continue;
      case "||": push(TokenType.OR,    "||"); p += 2; continue;
      case "->": push(TokenType.ARROW, "->"); p += 2; continue;
    }

    // Single-character tokens
    switch (ch) {
      case "=": push(TokenType.ASSIGN, "="); break;
      case ":": push(TokenType.COLON,  ":"); break;
      case "(": push(TokenType.LPAREN, "("); break;
      case ")": push(TokenType.RPAREN, ")"); break;
      case ",": push(TokenType.COMMA,  ","); break;
      case ".": push(TokenType.DOT,    "."); break;
      case "+": push(TokenType.PLUS,   "+"); break;
      case "-": push(TokenType.MINUS,  "-"); break;
      case "*": push(TokenType.STAR,   "*"); break;
      case "/": push(TokenType.SLASH,  "/"); break;
      case ">": push(TokenType.GT,     ">"); break;
      case "<": push(TokenType.LT,     "<"); break;
      case "!": push(TokenType.NOT,    "!"); break;
      default:
        throw new Error(`Unexpected character '${ch}' at line ${lineNo}`);
    }
    p++;
  }
}
