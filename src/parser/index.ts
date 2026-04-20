import {
  Token, TokenType,
  Program, Node, Expression,
  IfBranch,
  ChoiceOptionNode,
  LiteralExpression, IdentifierExpression,
  BinaryExpression, UnaryExpression,
  CallExpression, MemberExpression,
} from "../types.js";

// ─────────────────────────────────────────────────────────────
// Public entry points
// ─────────────────────────────────────────────────────────────

/** Parse a full token list into a Program AST. */
export function parse(tokens: Token[]): Program {
  const p = new Parser(tokens);
  return p.parseProgram();
}

/**
 * Parse a single expression from a flat token list.
 * Used by the runtime for string interpolation.
 */
export function parseExpressionTokens(tokens: Token[]): Expression {
  const p = new Parser(tokens);
  return p.expression();
}

// ─────────────────────────────────────────────────────────────
// Parser class
// ─────────────────────────────────────────────────────────────

class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  // ── helpers ──────────────────────────────────────────────

  private peek(): Token {
    return this.tokens[this.pos] ?? { type: TokenType.EOF, value: "", line: 0 };
  }

  private advance(): Token {
    return this.tokens[this.pos++] ?? { type: TokenType.EOF, value: "", line: 0 };
  }

  private check(t: TokenType): boolean {
    return this.peek().type === t;
  }

  private match(...types: TokenType[]): boolean {
    for (const t of types) {
      if (this.check(t)) { this.advance(); return true; }
    }
    return false;
  }

  private expect(t: TokenType): Token {
    if (!this.check(t)) {
      const tok = this.peek();
      throw new Error(
        `Expected ${t} but got ${tok.type} ("${tok.value}") at line ${tok.line}`
      );
    }
    return this.advance();
  }

  private skipNewlines(): void {
    while (this.check(TokenType.NEWLINE)) this.advance();
  }

  // ── expression grammar ───────────────────────────────────
  //   or → and → equality → relational → additive →
  //   multiplicative → unary → primary

  expression(): Expression { return this.or(); }

  private or(): Expression {
    let left = this.and();
    while (this.check(TokenType.OR)) {
      this.advance();
      left = { type: "binary", operator: "||", left, right: this.and() } as BinaryExpression;
    }
    return left;
  }

  private and(): Expression {
    let left = this.equality();
    while (this.check(TokenType.AND)) {
      this.advance();
      left = { type: "binary", operator: "&&", left, right: this.equality() } as BinaryExpression;
    }
    return left;
  }

  private equality(): Expression {
    let left = this.relational();
    while (this.check(TokenType.EQ) || this.check(TokenType.NEQ)) {
      const op = this.advance().value;
      left = { type: "binary", operator: op, left, right: this.relational() } as BinaryExpression;
    }
    return left;
  }

  private relational(): Expression {
    let left = this.additive();
    while (
      this.check(TokenType.GT) || this.check(TokenType.LT) ||
      this.check(TokenType.GTE) || this.check(TokenType.LTE)
    ) {
      const op = this.advance().value;
      left = { type: "binary", operator: op, left, right: this.additive() } as BinaryExpression;
    }
    return left;
  }

  private additive(): Expression {
    let left = this.multiplicative();
    while (this.check(TokenType.PLUS) || this.check(TokenType.MINUS)) {
      const op = this.advance().value;
      left = { type: "binary", operator: op, left, right: this.multiplicative() } as BinaryExpression;
    }
    return left;
  }

  private multiplicative(): Expression {
    let left = this.unary();
    while (this.check(TokenType.STAR) || this.check(TokenType.SLASH)) {
      const op = this.advance().value;
      left = { type: "binary", operator: op, left, right: this.unary() } as BinaryExpression;
    }
    return left;
  }

  private unary(): Expression {
    if (this.check(TokenType.NOT)) {
      this.advance();
      return { type: "unary", operator: "!", operand: this.unary() } as UnaryExpression;
    }
    if (this.check(TokenType.MINUS)) {
      this.advance();
      return { type: "unary", operator: "-", operand: this.unary() } as UnaryExpression;
    }
    return this.primary();
  }

  private primary(): Expression {
    const tok = this.peek();

    if (tok.type === TokenType.NUMBER) {
      this.advance();
      return { type: "literal", value: Number(tok.value) } as LiteralExpression;
    }

    if (tok.type === TokenType.STRING) {
      this.advance();
      return { type: "literal", value: tok.value } as LiteralExpression;
    }

    if (tok.type === TokenType.BOOLEAN) {
      this.advance();
      return { type: "literal", value: tok.value.toLowerCase() === "true" } as LiteralExpression;
    }

    if (tok.type === TokenType.NULL) {
      this.advance();
      return { type: "literal", value: null } as LiteralExpression;
    }

    if (tok.type === TokenType.IDENTIFIER) {
      this.advance();
      let expr: Expression = { type: "identifier", name: tok.value } as IdentifierExpression;

      // function call: name(args...)
      if (this.check(TokenType.LPAREN)) {
        this.advance();
        const args: Expression[] = [];
        if (!this.check(TokenType.RPAREN)) {
          args.push(this.expression());
          while (this.match(TokenType.COMMA)) args.push(this.expression());
        }
        this.expect(TokenType.RPAREN);
        expr = { type: "call_expr", name: tok.value, args } as CallExpression;
      }

      // member access: expr.prop (chainable)
      while (this.check(TokenType.DOT)) {
        this.advance();
        const prop = this.expect(TokenType.IDENTIFIER);
        expr = { type: "member", object: expr, property: prop.value } as MemberExpression;
      }

      return expr;
    }

    if (tok.type === TokenType.LPAREN) {
      this.advance();
      const inner = this.expression();
      this.expect(TokenType.RPAREN);
      return inner;
    }

    throw new Error(
      `Unexpected token ${tok.type} ("${tok.value}") in expression at line ${tok.line}`
    );
  }

  // ── statement parsers ───────────────────────────────────

  parseProgram(): Program {
    const body: Node[] = [];
    while (!this.check(TokenType.EOF)) {
      this.skipNewlines();
      if (this.check(TokenType.EOF)) break;
      const node = this.statement();
      if (node) body.push(node);
    }
    return { type: "program", body };
  }

  /** Parse nodes until DEDENT or EOF (does NOT consume the trailing DEDENT). */
  private body(): Node[] {
    const nodes: Node[] = [];
    while (!this.check(TokenType.DEDENT) && !this.check(TokenType.EOF)) {
      this.skipNewlines();
      if (this.check(TokenType.DEDENT) || this.check(TokenType.EOF)) break;
      const node = this.statement();
      if (node) nodes.push(node);
    }
    return nodes;
  }

  /** Consume INDENT, parse a body, consume DEDENT. */
  private block(): Node[] {
    this.expect(TokenType.INDENT);
    const nodes = this.body();
    if (this.check(TokenType.DEDENT)) this.advance();
    return nodes;
  }

  private statement(): Node | null {
    this.skipNewlines();
    const tok = this.peek();

    switch (tok.type) {
      case TokenType.DECLARE:  return this.parseDeclare();
      case TokenType.CHAPTER:  return this.parseChapter();
      case TokenType.IF:       return this.parseIf();
      case TokenType.GOTO:     return this.parseGoto();
      case TokenType.CALL:     return this.parseCall();
      case TokenType.RETURN:   return this.parseReturn();
      case TokenType.SET:      return this.parseSet();
      case TokenType.CHOICE:   return this.parseChoice();
      case TokenType.JS:       return this.parseJs();
      case TokenType.STRING:   return this.parseNarration();
      case TokenType.IDENTIFIER: return this.parseSayOrSkip();
      default:
        this.advance(); // skip unknown token
        return null;
    }
  }

  // ── individual statement parsers ───────────────────────

  private parseDeclare(): Node {
    const line = this.peek().line;
    this.advance(); // DECLARE

    // Optional `global` modifier: declare global x = ...
    let isGlobal = false;
    if (this.check(TokenType.IDENTIFIER) && this.peek().value === "global") {
      isGlobal = true;
      this.advance(); // consume 'global'
    }

    const name = this.expect(TokenType.IDENTIFIER).value;
    this.expect(TokenType.ASSIGN);
    const value = this.expression();
    if (this.check(TokenType.NEWLINE)) this.advance();
    return { type: "declare", name, value, isGlobal, line };
  }

  private parseChapter(): Node {
    const line = this.peek().line;
    this.advance(); // CHAPTER
    const name = this.expect(TokenType.IDENTIFIER).value;
    this.expect(TokenType.COLON);
    if (this.check(TokenType.NEWLINE)) this.advance();
    const body = this.block();
    return { type: "block", name, body, line };
  }

  private parseIf(): Node {
    const line = this.peek().line;
    this.advance(); // IF
    const cond = this.expression();
    this.expect(TokenType.COLON);
    if (this.check(TokenType.NEWLINE)) this.advance();
    const ifBody = this.block();

    const branches: IfBranch[] = [{ condition: cond, body: ifBody }];

    while (this.check(TokenType.ELSEIF)) {
      this.advance();
      const eic = this.expression();
      this.expect(TokenType.COLON);
      if (this.check(TokenType.NEWLINE)) this.advance();
      branches.push({ condition: eic, body: this.block() });
    }

    if (this.check(TokenType.ELSE)) {
      this.advance();
      if (this.check(TokenType.COLON)) this.advance();
      if (this.check(TokenType.NEWLINE)) this.advance();
      branches.push({ condition: null, body: this.block() });
    }

    return { type: "if", branches, line };
  }

  private parseGoto(): Node {
    const line = this.peek().line;
    this.advance(); // GOTO

    // Collect target: IDENTIFIER (DOT IDENTIFIER)* (COLONCOLON IDENTIFIER)?
    // Supports: "LABEL" or "file.flow::LABEL"
    let target = this.expect(TokenType.IDENTIFIER).value;

    // Collect dotted file extension segments (e.g. shop .flow)
    while (this.check(TokenType.DOT)) {
      this.advance();
      target += "." + this.expect(TokenType.IDENTIFIER).value;
    }

    // Cross-file separator: ::
    if (this.check(TokenType.COLONCOLON)) {
      this.advance();
      target += "::" + this.expect(TokenType.IDENTIFIER).value;
    }

    if (this.check(TokenType.NEWLINE)) this.advance();
    return { type: "goto", target, line };
  }

  private parseCall(): Node {
    const line = this.peek().line;
    this.advance(); // CALL

    // Match `goto` target syntax so subroutine calls can jump by chapter name.
    let name = this.expect(TokenType.IDENTIFIER).value;
    while (this.check(TokenType.DOT)) {
      this.advance();
      name += "." + this.expect(TokenType.IDENTIFIER).value;
    }
    if (this.check(TokenType.COLONCOLON)) {
      this.advance();
      name += "::" + this.expect(TokenType.IDENTIFIER).value;
    }

    const args: Expression[] = [];

    if (this.check(TokenType.LPAREN)) {
      this.advance();
      if (!this.check(TokenType.RPAREN)) {
        args.push(this.expression());
        while (this.match(TokenType.COMMA)) args.push(this.expression());
      }
      this.expect(TokenType.RPAREN);
    }

    if (this.check(TokenType.NEWLINE)) this.advance();
    return { type: "call", name, args, line };
  }

  private parseReturn(): Node {
    const line = this.peek().line;
    this.advance(); // RETURN
    if (this.check(TokenType.NEWLINE)) this.advance();
    return { type: "return", line };
  }

  private parseSet(): Node {
    const line = this.peek().line;
    this.advance(); // SET
    const name = this.expect(TokenType.IDENTIFIER).value;
    this.expect(TokenType.ASSIGN);
    const value = this.expression();
    if (this.check(TokenType.NEWLINE)) this.advance();
    return { type: "set", name, value, line };
  }

  private parseJs(): Node {
    const line = this.peek().line;
    this.advance(); // JS
    this.expect(TokenType.COLON);
    if (this.check(TokenType.NEWLINE)) this.advance();

    // Collect the raw indented block tokens as stub code
    const rawParts: string[] = [];
    if (this.check(TokenType.INDENT)) {
      this.advance();
      let depth = 1;
      while (depth > 0 && !this.check(TokenType.EOF)) {
        const t = this.advance();
        if (t.type === TokenType.INDENT)       depth++;
        else if (t.type === TokenType.DEDENT)  depth--;
        else if (t.type !== TokenType.NEWLINE) rawParts.push(t.value);
      }
    }

    return { type: "js", code: rawParts.join(" "), line };
  }

  private parseChoice(): Node {
    const line = this.peek().line;
    this.advance(); // CHOICE
    this.expect(TokenType.COLON);
    if (this.check(TokenType.NEWLINE)) this.advance();

    const options: ChoiceOptionNode[] = [];

    // Expect an INDENT block; each option is one of:
    //   Full:      -> "label": <block>
    //   Shorthand: "label" -> TARGET   (body is implicitly `goto TARGET`)
    this.expect(TokenType.INDENT);
    while (!this.check(TokenType.DEDENT) && !this.check(TokenType.EOF)) {
      this.skipNewlines();
      if (this.check(TokenType.DEDENT) || this.check(TokenType.EOF)) break;

      if (this.check(TokenType.ARROW)) {
        // ── Full body syntax: -> "label": <block> ─────────────
        this.advance(); // consume ->
        const label = this.expect(TokenType.STRING).value;
        const condition = this.parseChoiceCondition();
        this.expect(TokenType.COLON);
        if (this.check(TokenType.NEWLINE)) this.advance();
        const body = this.block();
        options.push({ label, condition, body });

      } else if (this.check(TokenType.STRING)) {
        // ── Shorthand syntax: "label" -> TARGET ───────────────
        const labelTok = this.advance();       // STRING
        const condition = this.parseChoiceCondition();
        this.expect(TokenType.ARROW);
        // Target may be dotted (file.flow) and/or cross-file (::LABEL)
        let target = this.expect(TokenType.IDENTIFIER).value;
        while (this.check(TokenType.DOT)) {
          this.advance();
          target += "." + this.expect(TokenType.IDENTIFIER).value;
        }
        if (this.check(TokenType.COLONCOLON)) {
          this.advance();
          target += "::" + this.expect(TokenType.IDENTIFIER).value;
        }
        if (this.check(TokenType.NEWLINE)) this.advance();
        const gotoNode: Node = { type: "goto", target, line: labelTok.line };
        options.push({ label: labelTok.value, condition, body: [gotoNode] });

      } else {
        this.advance(); // skip unknown token
      }
    }
    if (this.check(TokenType.DEDENT)) this.advance();

    return { type: "choice", options, line };
  }

  private parseChoiceCondition(): Expression | null {
    if (!this.check(TokenType.IF)) return null;
    this.advance(); // IF
    return this.expression();
  }

  private parseNarration(): Node {
    const line = this.peek().line;
    const text = this.advance().value; // STRING
    if (this.check(TokenType.NEWLINE)) this.advance();
    return { type: "narration", text, line };
  }

  /** IDENTIFIER followed by STRING → say; anything else → skip. */
  private parseSayOrSkip(): Node | null {
    const line = this.peek().line;
    const actor = this.advance().value; // IDENTIFIER

    if (this.check(TokenType.STRING)) {
      const text = this.advance().value;
      if (this.check(TokenType.NEWLINE)) this.advance();
      return { type: "say", actor, text, line };
    }

    // Not a say statement – skip remainder of line
    if (this.check(TokenType.NEWLINE)) this.advance();
    return null;
  }
}
