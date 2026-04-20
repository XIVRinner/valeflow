# ValeFlow API Reference

---

## `compile(source: string): Program`

Tokenises and parses a ValeFlow source string in one call. This is the primary entry point for embedding scripts.

```ts
import { compile } from "@rinner/valeflow";

const program = compile(`
  declare hero = Actor("Lyra")
  chapter START:
      hero "Hello!"
`);
```

---

## `tokenize(source: string): Token[]`

Converts raw source text into a flat list of tokens. You rarely need this directly — use `compile()` instead.

```ts
import { tokenize } from "@rinner/valeflow";

const tokens = tokenize(`declare x = 42`);
// [{ type: "DECLARE", value: "declare", line: 1 }, ...]
```

---

## `parse(tokens: Token[]): Program`

Converts a token list produced by `tokenize()` into a typed AST.

```ts
import { tokenize, parse } from "@rinner/valeflow";

const program = parse(tokenize(source));
```

---

## `parseExpressionTokens(tokens: Token[]): Expression`

Parse a single expression from a token list. Used internally for string interpolation; exposed for advanced use cases.

---

## `class Engine`

The runtime that executes a parsed `Program`.

### Constructor

```ts
new Engine(program: Program, options?: EngineOptions)
```

Accepts the `Program` AST returned by `compile()` or `parse()`. Prepares the execution stack and pre-indexes all chapters for `goto` resolution.

`options.persistent` can be either a plain object or a `Map<string, unknown>`. It gives the outer shell a host-owned store for values that should survive across playthroughs.

---

### `engine.registerFunction(name, fn): this`

Register a hook callable from ValeFlow via `call name(…)` or via a call expression `name(…)`.

```ts
engine.registerFunction("Actor", (ctx, name) => ({ name }));
engine.registerFunction("log",   (ctx, msg)  => console.log(msg));
engine.registerFunction("setFlag", (ctx, key, val) => {
  ctx.setVar(String(key), val);
});
```

**Signature of `fn`:**

```ts
type FunctionHook = (ctx: RuntimeContext, ...args: unknown[]) => unknown;
```

`ctx` gives the hook read/write access to the engine's variable state:

```ts
interface RuntimeContext {
  getVar(name: string): unknown;
  setVar(name: string, value: unknown): void;
}
```

Returns `this` for chaining:

```ts
engine
  .registerFunction("Actor", (_ctx, name) => ({ name }))
  .registerFunction("log", (_ctx, msg) => console.log(msg));
```

---

### `engine.next(): StepResult`

Advance execution by one **visible** beat. Silent nodes (`declare`, `set`, `if`, `goto`, `call`, `block`) are processed internally without returning.

```ts
type StepResult =
  | { type: "say";       actor: unknown; text: string }
  | { type: "narration"; text: string }
  | { type: "choice";    options: { label: string; index: number }[] }
  | { type: "end" };
```

**`say`** — a character spoke a line.

```ts
const step = engine.next();
if (step.type === "say") {
  const actor = step.actor as { name: string };
  console.log(`${actor.name}: ${step.text}`);
}
```

**`narration`** — unattributed narration text.

```ts
if (step.type === "narration") {
  console.log(`  ${step.text}`);
}
```

**`choice`** — the engine is waiting for a player decision.

```ts
if (step.type === "choice") {
  console.log(step.options);
  engine.choose(0);
}
```

**`end`** — execution has finished (stack is empty). Calling `next()` after `end` continues to return `end`.

---

### `engine.getState(): Record<string, unknown>`

Returns a shallow snapshot of all current variable values.

```ts
const state = engine.getState();
console.log(state.coins); // 12
console.log(state.hero);  // { name: "Lyra" }
```

---

### Persistent state

The runtime has a host-visible persistent store for data that should survive across playthroughs. It is separate from per-run state and is available through both direct engine methods and the `persistent(...)` runtime call.

```ts
engine.getPersistentState();
engine.setPersistentState({ seenIntro: true });
engine.clearPersistentState();
```

Inside ValeFlow scripts:

```ts
declare seenIntro = persistent("seenIntro")
call persistent("seenIntro", true)
```

`persistent(key)` reads a persistent value. `persistent(key, value)` stores a value and returns it.

The constructor also accepts a shared persistent store so the outer shell can keep the same object across new playthroughs.

---

### Chapter tracking

The runtime records chapter visitation and completion using canonical keys in the form `file::CHAPTER`.

```ts
engine.getCurrentChapter();
engine.getVisitedChapters();
engine.getCompletedChapters();
engine.hasVisitedChapter("START");
engine.hasCompletedChapter("shop.fsc::SHOP_MAIN");
engine.getChapterState();
```

`getCurrentChapter()` returns the active chapter, or `null` outside a chapter body.

`getVisitedChapters()` and `getCompletedChapters()` return arrays of canonical chapter keys in the order they were recorded.

`hasVisitedChapter(target)` and `hasCompletedChapter(target)` accept the same chapter target syntax as `goto`, including local labels and `file::LABEL` references.

---

### `engine.saveState(): EngineSnapshot`

Captures the current runtime state, including the active file, execution stack, call stack, chapter tracking state, persistent state, variables, initialization flag, and any pending choice.

```ts
const snapshot = engine.saveState();
```

### `engine.loadState(snapshot: EngineSnapshot): this`

Restores a snapshot previously produced by `engine.saveState()`.

```ts
engine.loadState(snapshot);
```

The snapshot is meant for the same compiled project. If the stored current file does not exist in the target engine's project, loading throws.

---

### `EngineOptions`

```ts
interface EngineOptions {
  persistent?: Record<string, unknown> | Map<string, unknown>;
}
```

Pass this when creating an engine if you want to share persistent data between runs.

### Choice handling

Choices stay pending until the host resolves them with `engine.choose(index)`.

```ts
let step = engine.next();

if (step.type === "choice") {
  renderChoices(step.options);
  engine.choose(step.options[0].index);
  step = engine.next();
}
```

---

## Typical Integration Loop

```ts
import { compile, Engine } from "@rinner/valeflow";

const engine = new Engine(compile(source));

engine
  .registerFunction("Actor", (_ctx, name) => ({ name }))
  .registerFunction("log",   (_ctx, msg)  => console.log(msg));

function advance() {
  const step = engine.next();

  switch (step.type) {
    case "say": {
      const actor = step.actor as { name: string };
      showDialogue(actor.name, step.text);
      break;
    }
    case "narration":
      showNarration(step.text);
      break;
    case "end":
      showEndScreen();
      break;
  }
}

// Call advance() whenever the player taps "Next", presses Space, etc.
```

---

## Type Reference

All types are exported from `"@rinner/valeflow"`.

### `Program`

```ts
interface Program {
  type: "program";
  body: Node[];
}
```

### `Node` (union)

```ts
type Node =
  | DeclarationNode   // declare x = expr
  | SayNode           // actor "text"
  | NarrationNode     // "text"
  | IfNode            // if / elseif / else
  | GotoNode          // goto LABEL
  | CallNode          // call fn(args)
  | SetNode           // set x = expr
  | BlockNode         // chapter NAME:
  | JsNode;           // js: (stub)
```

### `Expression` (union)

```ts
type Expression =
  | LiteralExpression     // 42, "text", true, null
  | IdentifierExpression  // varName
  | BinaryExpression      // left op right
  | UnaryExpression       // ! expr  or  - expr
  | CallExpression        // fn(args)  — inside expression
  | MemberExpression;     // obj.prop
```

### `StepResult`

```ts
type StepResult =
  | { type: "say";       actor: unknown; text: string }
  | { type: "narration"; text: string }
  | { type: "end" };
```

### `FunctionHook`

```ts
type FunctionHook = (ctx: RuntimeContext, ...args: unknown[]) => unknown;
```

### `RuntimeContext`

```ts
interface RuntimeContext {
  getVar(name: string): unknown;
  setVar(name: string, value: unknown): void;
}
```
