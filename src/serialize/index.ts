import { Program, Node, Expression, IfBranch } from "../types.js";

// ─────────────────────────────────────────────────────────────
// Public output types
// ─────────────────────────────────────────────────────────────

export interface SerializedProgram {
  chapters: SerializedChapter[];
  /** Top-level (pre-chapter) declarations */
  declarations: SerializedDecl[];
}

export interface SerializedChapter {
  name: string;
  nodes: SerializedNode[];
}

export interface SerializedDecl {
  name: string;
  value: string;
  global: boolean;
}

export type SerializedNode =
  | SerializedSay
  | SerializedNarration
  | SerializedIf
  | SerializedChoice
  | SerializedGoto
  | SerializedCall
  | SerializedReturn
  | SerializedSet
  | SerializedDecl & { type: "declare" };

export interface SerializedSay       { type: "say";      actor: string; text: string }
export interface SerializedNarration { type: "narration"; text: string }
export interface SerializedGoto      { type: "goto";     target: string }
export interface SerializedCall      { type: "call";     name: string; args: string[] }
export interface SerializedReturn    { type: "return" }
export interface SerializedSet       { type: "set";      name: string; value: string }
export interface SerializedIf {
  type: "if";
  branches: Array<{ condition: string | null; nodes: SerializedNode[] }>;
}
export interface SerializedChoice {
  type: "choice";
  options: Array<{ label: string; condition: string | null; nodes: SerializedNode[] }>;
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Walk a compiled `Program` AST and return a clean, JSON-serializable
 * representation of the full dialogue tree.
 *
 * Suitable for export to authoring tools, analytics, or porting to other
 * dialogue engines.
 *
 * @example
 * ```ts
 * import { compile, serializeTree } from "@rinner/valeflow";
 * const program = compile(source);
 * const tree = serializeTree(program);
 * console.log(JSON.stringify(tree, null, 2));
 * ```
 */
export function serializeTree(program: Program): SerializedProgram {
  const declarations: SerializedDecl[] = [];
  const chapters: SerializedChapter[] = [];

  for (const node of program.body) {
    if (node.type === "declare") {
      declarations.push({
        name: node.name,
        value: exprToString(node.value),
        global: node.isGlobal,
      });
    } else if (node.type === "block") {
      chapters.push({
        name: node.name,
        nodes: serializeNodes(node.body),
      });
    }
    // Top-level if/set/call nodes are unusual but included for completeness
  }

  return { chapters, declarations };
}

// ─────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────

function serializeNodes(nodes: Node[]): SerializedNode[] {
  const out: SerializedNode[] = [];

  for (const node of nodes) {
    switch (node.type) {

      case "say":
        out.push({ type: "say", actor: node.actor, text: node.text });
        break;

      case "narration":
        out.push({ type: "narration", text: node.text });
        break;

      case "if":
        out.push({
          type: "if",
          branches: node.branches.map((b: IfBranch) => ({
            condition: b.condition ? exprToString(b.condition) : null,
            nodes: serializeNodes(b.body),
          })),
        });
        break;

      case "choice":
        out.push({
          type: "choice",
          options: node.options.map(o => ({
            label: o.label,
            condition: o.condition ? exprToString(o.condition) : null,
            nodes: serializeNodes(o.body),
          })),
        });
        break;

      case "goto":
        out.push({ type: "goto", target: node.target });
        break;

      case "call":
        out.push({
          type: "call",
          name: node.name,
          args: node.args.map(exprToString),
        });
        break;

      case "return":
        out.push({ type: "return" });
        break;

      case "set":
        out.push({ type: "set", name: node.name, value: exprToString(node.value) });
        break;

      case "declare":
        out.push({
          type: "declare" as const,
          name: node.name,
          value: exprToString(node.value),
          global: node.isGlobal,
        });
        break;

      case "block":
        // Nested chapter blocks (unusual but possible) — flatten inline
        out.push(...serializeNodes(node.body));
        break;

      // js: nodes deliberately omitted (runtime stubs only)
    }
  }

  return out;
}

/** Convert an Expression AST node back to a human-readable string. */
function exprToString(expr: Expression): string {
  switch (expr.type) {
    case "literal":
      if (expr.value === null)          return "null";
      if (typeof expr.value === "string") return `"${expr.value}"`;
      return String(expr.value);

    case "identifier":
      return expr.name;

    case "binary":
      return `${exprToString(expr.left)} ${expr.operator} ${exprToString(expr.right)}`;

    case "unary":
      return `${expr.operator}${exprToString(expr.operand)}`;

    case "call_expr": {
      const args = expr.args.map(exprToString).join(", ");
      return `${expr.name}(${args})`;
    }

    case "member":
      return `${exprToString(expr.object)}.${expr.property}`;

    default:
      return "?";
  }
}
