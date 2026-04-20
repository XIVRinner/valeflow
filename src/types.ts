// ──────────────────────────────────────────────
// Token types
// ──────────────────────────────────────────────

export enum TokenType {
  // Keywords
  DECLARE = "DECLARE",
  CHAPTER = "CHAPTER",
  IF      = "IF",
  ELSEIF  = "ELSEIF",
  ELSE    = "ELSE",
  GOTO    = "GOTO",
  CALL    = "CALL",
  RETURN  = "RETURN",
  SET     = "SET",
  CHOICE  = "CHOICE",
  JS      = "JS",

  // Literals
  IDENTIFIER = "IDENTIFIER",
  STRING     = "STRING",
  NUMBER     = "NUMBER",
  BOOLEAN    = "BOOLEAN",
  NULL       = "NULL",

  // Symbols
  COLON  = "COLON",
  LPAREN = "LPAREN",
  RPAREN = "RPAREN",
  COMMA  = "COMMA",
  DOT    = "DOT",
  ASSIGN = "ASSIGN",
  ARROW  = "ARROW",

  // Comparison / logical operators
  EQ    = "EQ",     // ==
  NEQ   = "NEQ",    // !=
  GT    = "GT",     // >
  LT    = "LT",     // <
  GTE   = "GTE",    // >=
  LTE   = "LTE",    // <=
  AND   = "AND",    // &&
  OR    = "OR",     // ||
  NOT   = "NOT",    // !

  // Arithmetic operators
  PLUS  = "PLUS",   // +
  MINUS = "MINUS",  // -
  STAR  = "STAR",   // *
  SLASH = "SLASH",  // /

  // Cross-file separator
  COLONCOLON = "COLONCOLON", // ::

  // Indentation / structure
  INDENT  = "INDENT",
  DEDENT  = "DEDENT",
  NEWLINE = "NEWLINE",
  EOF     = "EOF",
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
}

// ──────────────────────────────────────────────
// Expression AST nodes
// ──────────────────────────────────────────────

export type Expression =
  | LiteralExpression
  | IdentifierExpression
  | BinaryExpression
  | UnaryExpression
  | CallExpression
  | MemberExpression;

export interface LiteralExpression {
  type: "literal";
  value: string | number | boolean | null;
}

export interface IdentifierExpression {
  type: "identifier";
  name: string;
}

export interface BinaryExpression {
  type: "binary";
  operator: string;
  left: Expression;
  right: Expression;
}

export interface UnaryExpression {
  type: "unary";
  operator: string;
  operand: Expression;
}

/** Function call used inside an expression, e.g. Actor("Adam") */
export interface CallExpression {
  type: "call_expr";
  name: string;
  args: Expression[];
}

export interface MemberExpression {
  type: "member";
  object: Expression;
  property: string;
}

// ──────────────────────────────────────────────
// Statement AST nodes
// ──────────────────────────────────────────────

export type Node =
  | DeclarationNode
  | SayNode
  | NarrationNode
  | IfNode
  | GotoNode
  | CallNode
  | ReturnNode
  | SetNode
  | ChoiceNode
  | BlockNode
  | JsNode;

export interface DeclarationNode {
  type: "declare";
  name: string;
  value: Expression;
  /** true when `declare global` syntax or declaration lives in a globals file */
  isGlobal: boolean;
  line: number;
}

export interface SayNode {
  type: "say";
  actor: string;
  text: string;
  line: number;
}

export interface NarrationNode {
  type: "narration";
  text: string;
  line: number;
}

export interface IfBranch {
  condition: Expression | null; // null → else
  body: Node[];
}

export interface IfNode {
  type: "if";
  branches: IfBranch[];
  line: number;
}

export interface GotoNode {
  type: "goto";
  target: string;
  line: number;
}

export interface CallNode {
  type: "call";
  name: string;
  args: Expression[];
  line: number;
}

export interface ReturnNode {
  type: "return";
  line: number;
}

export interface SetNode {
  type: "set";
  name: string;
  value: Expression;
  line: number;
}

export interface BlockNode {
  type: "block";
  name: string;
  body: Node[];
  line: number;
}

export interface ChoiceOptionNode {
  label: string;
  condition: Expression | null;
  body: Node[];
}

export interface ChoiceNode {
  type: "choice";
  options: ChoiceOptionNode[];
  line: number;
}

export interface JsNode {
  type: "js";
  code: string;
  line: number;
}

export interface Program {
  type: "program";
  body: Node[];
}

// ──────────────────────────────────────────────
// Multi-file project types
// ──────────────────────────────────────────────

/** Points to a named chapter inside a specific file. */
export interface LabelRef {
  file: string;
  chapter: BlockNode;
}

/**
 * A single parsed file inside a project.
 * `labels` maps chapter names to their BlockNode for O(1) lookup.
 */
export interface ScriptFile {
  filename: string;
  ast: Program;
  labels: Record<string, BlockNode>;
  declarations: DeclarationNode[];
}

/**
 * A compiled multi-file project ready to be executed by `Engine`.
 * Build with `loadProject()`.
 */
export interface Project {
  type: "project";
  files: Record<string, ScriptFile>;
  /** Maps "filename::CHAPTER" → LabelRef for O(1) cross-file goto resolution. */
  globalLabels: Record<string, LabelRef>;
  /** All declarations that are scoped globally (from globals files or `declare global`). */
  globalDeclarations: DeclarationNode[];
  /** Set of variable names that are globally scoped — used by the runtime. */
  globalVarNames: ReadonlySet<string>;
  /** Filename where execution begins (first non-globals file). */
  entryFile: string;
}

// ──────────────────────────────────────────────
// Runtime types
// ──────────────────────────────────────────────

export type StepResult =
  | { type: "say"; actor: unknown; text: string }
  | { type: "narration"; text: string }
  | { type: "choice"; options: Array<{ label: string; index: number }> }
  | { type: "end" };

export interface EngineFrameSnapshot {
  nodes: Node[];
  index: number;
  chapterKey?: string | null;
}

export interface EngineCallFrameSnapshot {
  file: string;
  stack: EngineFrameSnapshot[];
}

export interface EngineChapterStateSnapshot {
  current: string | null;
  visited: string[];
  completed: string[];
}

export interface EngineChoiceSnapshot {
  result: { type: "choice"; options: Array<{ label: string; index: number }> };
  bodies: Node[][];
}

export interface EngineSnapshot {
  currentFile: string;
  stack: EngineFrameSnapshot[];
  chapterState: EngineChapterStateSnapshot;
  persistentState: Record<string, unknown>;
  callStack: EngineCallFrameSnapshot[];
  globals: Record<string, unknown>;
  state: Record<string, unknown>;
  initialized: boolean;
  pendingChoice: EngineChoiceSnapshot | null;
}

export interface EngineOptions {
  persistent?: Record<string, unknown> | Map<string, unknown>;
}

export interface RuntimeContext {
  getVar: (name: string) => unknown;
  setVar: (name: string, value: unknown) => void;
}

export type FunctionHook = (ctx: RuntimeContext, ...args: unknown[]) => unknown;
