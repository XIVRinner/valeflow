import {
  Program, Node, Expression,
  Project,
  ChoiceOptionNode,
  StepResult, FunctionHook, RuntimeContext,
} from "../types.js";
import { tokenize } from "../lexer/index.js";
import { parseExpressionTokens } from "../parser/index.js";
import { isProject, wrapSingleProgram, resolveLabel } from "../project/index.js";

// ─────────────────────────────────────────────────────────────
// Execution frame – a list of nodes with a read cursor
// ─────────────────────────────────────────────────────────────

interface Frame {
  nodes: Node[];
  index: number;
}

// ─────────────────────────────────────────────────────────────
// Engine
// ─────────────────────────────────────────────────────────────

export class Engine {
  private readonly project: Project;

  /** Currently executing file (used for local goto resolution). */
  private currentFile: string;

  /** Execution frame stack. */
  private stack: Frame[] = [];

  /**
   * Global variable store — shared across all files.
   * Populated from `globalDeclarations` on the first `next()` call.
   */
  private globals: Map<string, unknown> = new Map();

  /**
   * Local variable store — file/session-local state.
   * `declare` (non-global) and `set` write here by default.
   */
  private state: Map<string, unknown> = new Map();

  private hooks: Map<string, FunctionHook> = new Map();

  /** Becomes true after `initGlobals()` runs — prevents double-evaluation. */
  private initialized = false;

  /**
   * Non-null while waiting for the caller to invoke `choose()`.
   * `next()` returns the same choice step until resolved.
   */
  private pendingChoice: {
    result: { type: "choice"; options: Array<{ label: string; index: number }> };
    bodies: Node[][];
  } | null = null;

  // ──────────────────────────────────────────────────────────

  constructor(input: Program | Project) {
    this.project = isProject(input) ? input : wrapSingleProgram(input);
    this.currentFile = this.project.entryFile;

    const entryFile = this.project.files[this.currentFile];
    if (!entryFile) {
      throw new Error(
        `Engine: entry file "${this.currentFile}" not found in project`
      );
    }

    this.stack.push({ nodes: entryFile.ast.body, index: 0 });
  }

  // ── public API ──────────────────────────────────────────

  /**
   * Register a callable function hook.
   *
   * Usage:
   *   engine.registerFunction("Actor", (_ctx, name) => ({ name }))
   *   engine.registerFunction("log",   (_ctx, msg)  => console.log(msg))
   */
  registerFunction(name: string, fn: FunctionHook): this {
    this.hooks.set(name, fn);
    return this;
  }

  /**
   * Resolve a pending choice. Must be called after `next()` returns a
   * `{ type: "choice" }` result before calling `next()` again.
   *
   * @param index  Zero-based index into the presented options array.
   */
  choose(index: number): void {
    if (!this.pendingChoice) {
      throw new Error("Engine.choose(): no pending choice to resolve");
    }
    const bodies = this.pendingChoice.bodies;
    if (index < 0 || index >= bodies.length) {
      throw new Error(
        `Engine.choose(): index ${index} is out of range (0-${bodies.length - 1})`
      );
    }
    const body = bodies[index];
    this.pendingChoice = null;
    this.stack.push({ nodes: body, index: 0 });
  }

  /**
   * Advance execution by one visible beat.
   * Returns `{ type: "say" | "narration" | "choice" | "end" }`.
   * Silent nodes (declare, set, if, goto, call, block) are consumed internally.
   *
   * If a `choice` result is returned, call `choose(index)` before calling
   * `next()` again — until then `next()` continues to return the same choice.
   *
   * Global declarations are evaluated lazily on the first call, so all
   * `registerFunction` calls must happen before the first `next()`.
   */
  next(): StepResult {
    if (!this.initialized) {
      this.initGlobals();
      this.initialized = true;
    }

    // Block until the caller resolves the pending choice
    if (this.pendingChoice) return this.pendingChoice.result;

    while (true) {
      if (this.stack.length === 0) return { type: "end" };

      const frame = this.stack[this.stack.length - 1];

      if (frame.index >= frame.nodes.length) {
        this.stack.pop();
        continue;
      }

      const node = frame.nodes[frame.index++];
      const result = this.exec(node);
      if (result !== null) return result;
    }
  }

  /**
   * Returns a snapshot of all variables — globals merged with local state.
   * Local state takes precedence on key collision.
   */
  getState(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [k, v] of this.globals) result[k] = v;
    for (const [k, v] of this.state)   result[k] = v;
    return result;
  }

  /** Name of the file currently being executed. */
  getCurrentFile(): string {
    return this.currentFile;
  }

  // ── initialisation ───────────────────────────────────────

  /**
   * Evaluate all global declarations and store in `this.globals`.
   * Called transparently on the first `next()`.
   */
  private initGlobals(): void {
    for (const decl of this.project.globalDeclarations) {
      this.globals.set(decl.name, this.evalExpr(decl.value));
    }
  }

  // ── variable resolution ──────────────────────────────────

  private getVar(name: string): unknown {
    if (this.state.has(name))   return this.state.get(name);
    if (this.globals.has(name)) return this.globals.get(name);
    return null;
  }

  /**
   * Write `value` to the appropriate scope.
   * If the variable already lives in globals, update globals so the change
   * is visible across all files. Otherwise write to local state.
   */
  private setVar(name: string, value: unknown): void {
    if (this.globals.has(name)) {
      this.globals.set(name, value);
    } else {
      this.state.set(name, value);
    }
  }

  private isGlobalVar(name: string): boolean {
    return this.project.globalVarNames.has(name);
  }

  // ── node execution ───────────────────────────────────────

  private exec(node: Node): StepResult | null {
    switch (node.type) {

      case "say": {
        const actor = this.getVar(node.actor);
        return { type: "say", actor, text: this.interpolate(node.text) };
      }

      case "narration":
        return { type: "narration", text: this.interpolate(node.text) };

      case "declare": {
        const isGlobal = node.isGlobal || this.isGlobalVar(node.name);
        // Skip global declarations that were already evaluated in initGlobals()
        if (isGlobal && this.initialized) return null;
        const v = this.evalExpr(node.value);
        if (isGlobal) {
          this.globals.set(node.name, v);
        } else {
          this.state.set(node.name, v);
        }
        return null;
      }

      case "set": {
        const v = this.evalExpr(node.value);
        this.setVar(node.name, v);
        return null;
      }

      case "if": {
        for (const branch of node.branches) {
          const pass =
            branch.condition === null || this.evalExpr(branch.condition);
          if (pass) {
            this.stack.push({ nodes: branch.body, index: 0 });
            break;
          }
        }
        return null;
      }

      case "goto": {
        const ref = resolveLabel(
          this.project,
          this.currentFile,
          node.target,
          node.line
        );
        // Jump: clear the call stack and enter the target chapter
        this.currentFile = ref.file;
        this.stack = [{ nodes: ref.chapter.body, index: 0 }];
        return null;
      }

      case "call": {
        const fn = this.hooks.get(node.name);
        if (fn) {
          const args = node.args.map(a => this.evalExpr(a));
          fn(this.makeContext(), ...args);
        }
        return null;
      }

      case "block":
        // Chapter blocks encountered during sequential top-level execution
        // are pushed inline (not jumped to).
        this.stack.push({ nodes: node.body, index: 0 });
        return null;

      case "choice": {
        const result = {
          type: "choice" as const,
          options: node.options.map((o, i) => ({ label: o.label, index: i })),
        };
        this.pendingChoice = { result, bodies: node.options.map(o => o.body) };
        return result;
      }

      case "js":
        // js: blocks are stubbed — no execution
        return null;

      default:
        return null;
    }
  }

  // ── expression evaluator ─────────────────────────────────

  private evalExpr(expr: Expression): unknown {
    switch (expr.type) {

      case "literal":
        return expr.value;

      case "identifier":
        return this.getVar(expr.name);

      case "binary": {
        // Short-circuit for && and ||
        if (expr.operator === "&&") {
          return this.evalExpr(expr.left) && this.evalExpr(expr.right);
        }
        if (expr.operator === "||") {
          return this.evalExpr(expr.left) || this.evalExpr(expr.right);
        }

        const l = this.evalExpr(expr.left);
        const r = this.evalExpr(expr.right);

        switch (expr.operator) {
          case "+" : return (l as number) +  (r as number);
          case "-" : return (l as number) -  (r as number);
          case "*" : return (l as number) *  (r as number);
          case "/" : return (l as number) /  (r as number);
          case "==": return l === r;
          case "!=": return l !== r;
          case ">" : return (l as number) >  (r as number);
          case "<" : return (l as number) <  (r as number);
          case ">=": return (l as number) >= (r as number);
          case "<=": return (l as number) <= (r as number);
        }
        break;
      }

      case "unary": {
        const v = this.evalExpr(expr.operand);
        if (expr.operator === "!")  return !v;
        if (expr.operator === "-")  return -(v as number);
        break;
      }

      case "call_expr": {
        const fn = this.hooks.get(expr.name);
        if (!fn) return null;
        const args = expr.args.map(a => this.evalExpr(a));
        return fn(this.makeContext(), ...args);
      }

      case "member": {
        const obj = this.evalExpr(expr.object);
        if (obj == null || typeof obj !== "object") return null;
        return (obj as Record<string, unknown>)[expr.property] ?? null;
      }
    }
    return null;
  }

  // ── string interpolation ─────────────────────────────────

  private interpolate(text: string): string {
    if (!text.includes("${")) return text;

    return text.replace(/\$\{([^}]+)\}/g, (_, inner: string) => {
      try {
        const tokens = tokenize(inner.trim());
        const expr   = parseExpressionTokens(tokens);
        const value  = this.evalExpr(expr);
        return value != null ? String(value) : "";
      } catch {
        return "";
      }
    });
  }

  // ── context object passed to hooks ───────────────────────

  private makeContext(): RuntimeContext {
    return {
      getVar: (name) => this.getVar(name),
      setVar: (name, value) => this.setVar(name, value),
    };
  }
}

