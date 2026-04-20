import {
  Program, Node, Expression,
  Project,
  ChoiceOptionNode,
  LabelRef,
  StepResult, FunctionHook, RuntimeContext,
  EngineOptions,
  EngineSnapshot,
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
  chapterKey: string | null;
}

interface CallFrame {
  file: string;
  stack: Frame[];
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

  /** Saved continuations for subroutine-style `call` / `return`. */
  private callStack: CallFrame[] = [];

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

  /** Chapters entered at least once, keyed as `file::CHAPTER`. */
  private visitedChapters: Set<string> = new Set();

  /** Chapters that have finished execution at least once. */
  private completedChapters: Set<string> = new Set();

  /** Persistent store shared across playthroughs when provided by the host. */
  private persistent: Map<string, unknown> = new Map();

  /** Original host store, kept in sync if the caller provides one. */
  private persistentBacking: Record<string, unknown> | Map<string, unknown> | null = null;

  constructor(input: Program | Project, options: EngineOptions = {}) {
    this.project = isProject(input) ? input : wrapSingleProgram(input);
    this.currentFile = this.project.entryFile;
    this.persistentBacking = options.persistent ?? null;
    this.persistent = this.clonePersistent(options.persistent);
    this.syncPersistentBacking();

    const entryFile = this.project.files[this.currentFile];
    if (!entryFile) {
      throw new Error(
        `Engine: entry file "${this.currentFile}" not found in project`
      );
    }

    this.stack.push({ nodes: entryFile.ast.body, index: 0, chapterKey: null });
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
    this.stack.push({ nodes: body, index: 0, chapterKey: null });
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

    if (this.pendingChoice) return this.pendingChoice.result;

    while (true) {
      if (this.stack.length === 0) return { type: "end" };

      const frame = this.stack[this.stack.length - 1];

      if (frame.index >= frame.nodes.length) {
        this.markFrameCompleted(frame);
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

  /**
   * Capture the current execution state so it can be restored later.
   */
  saveState(): EngineSnapshot {
    return {
      currentFile: this.currentFile,
      stack: this.cloneFrames(this.stack),
      callStack: this.callStack.map(frame => ({
        file: frame.file,
        stack: this.cloneFrames(frame.stack),
      })),
      globals: this.cloneRecord(this.globals),
      state: this.cloneRecord(this.state),
      initialized: this.initialized,
      pendingChoice: this.pendingChoice ? {
        result: {
          type: "choice",
          options: this.pendingChoice.result.options.map(option => ({ ...option })),
        },
        bodies: this.pendingChoice.bodies.map(body => body.slice()),
      } : null,
      chapterState: this.getChapterState(),
      persistentState: this.getPersistentState(),
    };
  }

  /**
   * Restore a snapshot produced by `saveState()`.
   */
  loadState(snapshot: EngineSnapshot): this {
    if (!this.project.files[snapshot.currentFile]) {
      throw new Error(`Engine.loadState(): unknown file "${snapshot.currentFile}"`);
    }

    this.currentFile = snapshot.currentFile;
    this.stack = this.cloneFrames(snapshot.stack);
    this.callStack = snapshot.callStack.map(frame => ({
      file: frame.file,
      stack: this.cloneFrames(frame.stack),
    }));
    this.globals = this.cloneMap(snapshot.globals);
    this.state = this.cloneMap(snapshot.state);
    this.initialized = snapshot.initialized;
    this.pendingChoice = snapshot.pendingChoice ? {
      result: {
        type: "choice",
        options: snapshot.pendingChoice.result.options.map(option => ({ ...option })),
      },
      bodies: snapshot.pendingChoice.bodies.map(body => body.slice()),
    } : null;
    this.visitedChapters = new Set(snapshot.chapterState.visited);
    this.completedChapters = new Set(snapshot.chapterState.completed);
    this.persistent = this.cloneMap(snapshot.persistentState);
    this.syncPersistentBacking();

    return this;
  }

  /** Name of the file currently being executed. */
  getCurrentFile(): string {
    return this.currentFile;
  }

  /** Returns the active chapter as `file::CHAPTER`, or `null` outside a chapter. */
  getCurrentChapter(): string | null {
    return this.getActiveChapterKey();
  }

  /** Returns the chapters entered so far, in visit order. */
  getVisitedChapters(): string[] {
    return [...this.visitedChapters];
  }

  /** Returns the chapters completed so far, in completion order. */
  getCompletedChapters(): string[] {
    return [...this.completedChapters];
  }

  /** Checks whether a chapter has been visited. */
  hasVisitedChapter(target: string): boolean {
    return this.visitedChapters.has(this.resolveChapterKey(target));
  }

  /** Checks whether a chapter has completed. */
  hasCompletedChapter(target: string): boolean {
    return this.completedChapters.has(this.resolveChapterKey(target));
  }

  /** Snapshot of chapter tracking state for UI and persistence. */
  getChapterState(): { current: string | null; visited: string[]; completed: string[] } {
    return {
      current: this.getCurrentChapter(),
      visited: this.getVisitedChapters(),
      completed: this.getCompletedChapters(),
    };
  }

  /** Returns a shallow snapshot of persistent values. */
  getPersistentState(): Record<string, unknown> {
    return this.cloneRecord(this.persistent);
  }

  /** Replaces the persistent store with the provided values. */
  setPersistentState(values: Record<string, unknown> | Map<string, unknown>): this {
    this.persistent = this.clonePersistent(values);
    this.syncPersistentBacking();
    return this;
  }

  /** Clears all persistent values. */
  clearPersistentState(): this {
    this.persistent.clear();
    this.syncPersistentBacking();
    return this;
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

  private chapterKey(file: string, chapter: string): string {
    return `${file}::${chapter}`;
  }

  private persistentKey(rawKey: unknown): string {
    if (typeof rawKey === "string") return rawKey;
    if (typeof rawKey === "number" || typeof rawKey === "boolean" || rawKey === null) {
      return String(rawKey);
    }

    try {
      const serialized = JSON.stringify(rawKey);
      return serialized === undefined ? String(rawKey) : serialized;
    } catch {
      return String(rawKey);
    }
  }

  private persistentGet(rawKey: unknown): unknown {
    return this.persistent.has(this.persistentKey(rawKey))
      ? this.persistent.get(this.persistentKey(rawKey))
      : null;
  }

  private persistentSet(rawKey: unknown, value: unknown): unknown {
    const key = this.persistentKey(rawKey);
    this.persistent.set(key, value);
    this.syncPersistentBacking();
    return value;
  }

  private clonePersistent(values?: Record<string, unknown> | Map<string, unknown>): Map<string, unknown> {
    if (!values) return new Map();
    return values instanceof Map ? new Map(values) : new Map(Object.entries(values));
  }

  private syncPersistentBacking(): void {
    if (!this.persistentBacking) return;

    if (this.persistentBacking instanceof Map) {
      this.persistentBacking.clear();
      for (const [key, value] of this.persistent) {
        this.persistentBacking.set(key, value);
      }
      return;
    }

    for (const key of Object.keys(this.persistentBacking)) {
      delete this.persistentBacking[key];
    }
    for (const [key, value] of this.persistent) {
      this.persistentBacking[key] = value;
    }
  }

  private resolveChapterKey(target: string): string {
    const ref = resolveLabel(this.project, this.currentFile, target);
    return this.chapterKey(ref.file, ref.chapter.name);
  }

  private enterChapter(ref: LabelRef): void {
    const key = this.chapterKey(ref.file, ref.chapter.name);
    this.visitedChapters.add(key);
    this.stack = [{ nodes: ref.chapter.body, index: 0, chapterKey: key }];
  }

  private getActiveChapterKey(): string | null {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const frame = this.stack[i];
      if (frame.chapterKey) return frame.chapterKey;
    }
    return null;
  }

  private markFrameCompleted(frame: Frame): void {
    if (frame.chapterKey) {
      this.completedChapters.add(frame.chapterKey);
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
          const pass = branch.condition === null || this.evalExpr(branch.condition);
          if (pass) {
            this.stack.push({ nodes: branch.body, index: 0, chapterKey: null });
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
        this.currentFile = ref.file;
        this.enterChapter(ref);
        this.callStack = [];
        return null;
      }

      case "call": {
        if (node.name === "persistent") {
          const args = node.args.map(arg => this.evalExpr(arg));
          this.handlePersistentCall(args);
          return null;
        }

        if (node.args.length === 0) {
          const ref = this.tryResolveLabel(node.name, node.line);
          if (ref) {
            this.callStack.push({
              file: this.currentFile,
              stack: this.cloneFrames(this.stack),
            });
            this.currentFile = ref.file;
            this.enterChapter(ref);
            return null;
          }
        }

        const fn = this.hooks.get(node.name);
        if (fn) {
          const args = node.args.map(a => this.evalExpr(a));
          fn(this.makeContext(), ...args);
        }
        return null;
      }

      case "return": {
        if (this.stack.length > 0) {
          this.markFrameCompleted(this.stack[this.stack.length - 1]);
        }
        const frame = this.callStack.pop();
        if (!frame) {
          this.stack = [];
          return null;
        }
        this.currentFile = frame.file;
        this.stack = frame.stack;
        return null;
      }

      case "block":
        this.visitedChapters.add(this.chapterKey(this.currentFile, node.name));
        this.stack.push({
          nodes: node.body,
          index: 0,
          chapterKey: this.chapterKey(this.currentFile, node.name),
        });
        return null;

      case "choice": {
        const visibleOptions = node.options.filter(option => {
          return option.condition === null || Boolean(this.evalExpr(option.condition));
        });

        if (visibleOptions.length === 0) {
          throw new Error(`Choice at line ${node.line} has no visible options`);
        }

        const result = {
          type: "choice" as const,
          options: visibleOptions.map((o, i) => ({ label: o.label, index: i })),
        };
        this.pendingChoice = { result, bodies: visibleOptions.map(o => o.body) };
        return result;
      }

      case "js":
        return null;

      default:
        return null;
    }
  }

  // ── expression evaluator ─────────────────────────────────

  private isSafePropertyName(property: string): boolean {
    return property !== "__proto__" && property !== "prototype" && property !== "constructor";
  }

  private isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
  }

  private readMember(object: unknown, property: string): unknown {
    if (object == null) return null;
    if (typeof object !== "object" && typeof object !== "function") return null;
    if (!this.isSafePropertyName(property)) return null;
    if (!Object.prototype.hasOwnProperty.call(object, property)) return null;

    const value = (object as Record<string, unknown>)[property];
    return value === undefined ? null : value;
  }

  private applyUnary(operator: string, operand: unknown): unknown {
    switch (operator) {
      case "!":
        return !operand;
      case "-":
        return this.isFiniteNumber(operand) ? -operand : null;
      default:
        return null;
    }
  }

  private applyBinary(operator: string, left: unknown, right: unknown): unknown {
    switch (operator) {
      case "+":
        if (typeof left === "string" || typeof right === "string") {
          return String(left) + String(right);
        }
        if (this.isFiniteNumber(left) && this.isFiniteNumber(right)) {
          return left + right;
        }
        return null;

      case "-":
        return this.isFiniteNumber(left) && this.isFiniteNumber(right) ? left - right : null;

      case "*":
        return this.isFiniteNumber(left) && this.isFiniteNumber(right) ? left * right : null;

      case "/":
        return this.isFiniteNumber(left) && this.isFiniteNumber(right) ? left / right : null;

      case "==":
        return left === right;

      case "!=":
        return left !== right;

      case ">":
        if (this.isFiniteNumber(left) && this.isFiniteNumber(right)) return left > right;
        if (typeof left === "string" && typeof right === "string") return left > right;
        return null;

      case "<":
        if (this.isFiniteNumber(left) && this.isFiniteNumber(right)) return left < right;
        if (typeof left === "string" && typeof right === "string") return left < right;
        return null;

      case ">=":
        if (this.isFiniteNumber(left) && this.isFiniteNumber(right)) return left >= right;
        if (typeof left === "string" && typeof right === "string") return left >= right;
        return null;

      case "<=":
        if (this.isFiniteNumber(left) && this.isFiniteNumber(right)) return left <= right;
        if (typeof left === "string" && typeof right === "string") return left <= right;
        return null;

      default:
        return null;
    }
  }

  private evalExpr(expr: Expression): unknown {
    switch (expr.type) {

      case "literal":
        return expr.value;

      case "identifier":
        return this.getVar(expr.name);

      case "binary": {
        if (expr.operator === "&&") {
          return this.evalExpr(expr.left) && this.evalExpr(expr.right);
        }
        if (expr.operator === "||") {
          return this.evalExpr(expr.left) || this.evalExpr(expr.right);
        }

        return this.applyBinary(
          expr.operator,
          this.evalExpr(expr.left),
          this.evalExpr(expr.right)
        );
      }

      case "unary": {
        return this.applyUnary(expr.operator, this.evalExpr(expr.operand));
      }

      case "call_expr": {
        if (expr.name === "persistent") {
          const args = expr.args.map(a => this.evalExpr(a));
          return this.handlePersistentCall(args);
        }

        const fn = this.hooks.get(expr.name);
        if (!fn) return null;
        const args = expr.args.map(a => this.evalExpr(a));
        return fn(this.makeContext(), ...args);
      }

      case "member": {
        return this.readMember(this.evalExpr(expr.object), expr.property);
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

  private cloneFrames(frames: Array<{ nodes: Node[]; index: number; chapterKey?: string | null }>): Frame[] {
    return frames.map(frame => ({
      nodes: frame.nodes,
      index: frame.index,
      chapterKey: frame.chapterKey ?? null,
    }));
  }

  private cloneMap(values: Record<string, unknown>): Map<string, unknown> {
    return new Map(Object.entries(values));
  }

  private cloneRecord(values: Map<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of values) {
      result[key] = value;
    }
    return result;
  }

  private tryResolveLabel(target: string, line: number): LabelRef | null {
    try {
      return resolveLabel(this.project, this.currentFile, target, line);
    } catch {
      return null;
    }
  }

  private handlePersistentCall(args: unknown[]): unknown {
    if (args.length === 1) {
      return this.persistentGet(args[0]);
    }

    if (args.length >= 2) {
      return this.persistentSet(args[0], args[1]);
    }

    return this.getPersistentState();
  }
}
