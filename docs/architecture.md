# ValeFlow — Architecture & Internals

This document describes how source text becomes an executing dialogue. It covers the three pipeline stages (lexer → parser → runtime) and explains the key design decisions.

---

## Pipeline Overview

```
Source text (.fsc)
      │
      ▼
┌─────────────┐
│   Lexer     │  src/lexer/index.ts
│  tokenize() │
└──────┬──────┘
       │  Token[]
       ▼
┌─────────────┐
│   Parser    │  src/parser/index.ts
│   parse()   │
└──────┬──────┘
       │  Program (AST)
       ▼
┌─────────────┐
│   Engine    │  src/runtime/index.ts
│   next()    │
└──────┬──────┘
       │  StepResult  (one per call)
       ▼
   Host application
```

---

## Stage 1 — Lexer (`src/lexer/index.ts`)

### Responsibility

Convert raw source text into a flat `Token[]` list. Every token carries its `type`, raw `value`, and source `line` number.

### Indentation handling

ValeFlow is indentation-significant (like Python). The lexer maintains an **indent stack** — a stack of column numbers representing currently open indent levels.

- When a line's leading whitespace is **deeper** than the top of the stack, an `INDENT` token is emitted and the new depth is pushed.
- When it is **shallower**, one or more `DEDENT` tokens are emitted (one per closed level) and matching depths are popped.
- Equal depth emits neither.

This means the parser never has to count spaces — it only sees `INDENT` / `DEDENT` boundary tokens.

```
chapter START:          →  CHAPTER IDENTIFIER COLON NEWLINE
    hero "Hello"        →  INDENT IDENTIFIER STRING NEWLINE
                        →  (implicit DEDENT at EOF)
```

### Two-character operators

The lexer checks 2-character sequences (`==`, `!=`, `>=`, `<=`, `&&`, `||`, `->`) before falling through to single-character symbols to avoid ambiguity.

### Keywords

A static `KEYWORDS` map converts identifiers to their keyword token type at lex time, so the parser never needs string comparisons on identifier values.

---

## Stage 2 — Parser (`src/parser/index.ts`)

### Approach

Hand-written **recursive-descent** parser. Each grammar rule is a method; sub-rules are mutual-recursive method calls. No parser generator is used.

### Grammar (informal)

```
program     → statement* EOF
statement   → declare | chapter | if | goto | call | set | js | narration | say
declare     → DECLARE IDENTIFIER ASSIGN expression NEWLINE
chapter     → CHAPTER IDENTIFIER COLON NEWLINE block
if          → IF expression COLON NEWLINE block (ELSEIF expression COLON NEWLINE block)* (ELSE COLON? NEWLINE block)?
goto        → GOTO IDENTIFIER NEWLINE
call        → CALL IDENTIFIER LPAREN arglist RPAREN NEWLINE
set         → SET IDENTIFIER ASSIGN expression NEWLINE
narration   → STRING NEWLINE
say         → IDENTIFIER STRING NEWLINE
js          → JS COLON NEWLINE block
block       → INDENT statement* DEDENT
arglist     → (expression (COMMA expression)*)?
```

### Expression grammar (precedence, low → high)

```
expression → or
or         → and (|| and)*
and        → equality (&& equality)*
equality   → relational ((== | !=) relational)*
relational → additive ((> | < | >= | <=) additive)*
additive   → multiplicative ((+ | -) multiplicative)*
multiplicative → unary ((* | /) unary)*
unary      → (! | -) unary | primary
primary    → NUMBER | STRING | BOOLEAN | NULL
           | IDENTIFIER (LPAREN arglist RPAREN)? (.IDENTIFIER)*
           | LPAREN expression RPAREN
```

Expressions are fully recursive with correct operator precedence built into the call chain — no explicit precedence tables or Pratt parsing needed for this operator set.

### Block parsing

The `block()` helper:
1. Expects and consumes an `INDENT` token.
2. Calls `body()`, which reads statements until `DEDENT` or `EOF`.
3. Consumes the `DEDENT`.

This cleanly separates structural indentation from statement parsing.

### Error reporting

Every node carries a `line` number copied from the triggering token. Parse errors throw with the line number:

```
Expected COLON but got IDENTIFIER ("hello") at line 12
```

---

## Stage 3 — Runtime (`src/runtime/index.ts`)

### Frame stack

The engine maintains a **frame stack** — an array of `{ nodes: Node[], index: number, chapterKey: string | null }` objects.

- `nodes` is the list of AST nodes to execute at this level.
- `index` is the read cursor into that list.
- `chapterKey` is the canonical `file::CHAPTER` identifier for chapter frames; nested control-flow frames keep it `null`.

When a block body is entered (chapter, `if` branch), a new frame is pushed. When a frame is exhausted, it is popped and execution resumes in the parent frame.

```
Initial state (after compile):
  stack = [{ nodes: program.body, index: 0, chapterKey: null }]

After entering chapter START:
  stack = [{ nodes: chapter.body, index: 0, chapterKey: "__main__::START" }]

After entering if branch:
  stack = [{ nodes: chapter.body, index: 2, chapterKey: "__main__::START" },
           { nodes: ifBranch.body, index: 0, chapterKey: null }]
```

### `next()` loop

`next()` is a `while(true)` loop:

1. If the stack is empty → return `{ type: "end" }`.
2. Peek the top frame. If exhausted → pop and continue.
3. Take the next node from the frame; call `exec(node)`.
4. If `exec` returns a non-null `StepResult` → return it to the caller.
5. Otherwise (silent node) → loop again.

This means the caller always receives exactly one visible event per `next()` call, with all silent processing absorbed internally.

### Node execution

| Node type | Effect |
|---|---|
| `say` | Resolves the actor variable from state; interpolates the text; returns `StepResult` |
| `narration` | Interpolates the text; returns `StepResult` |
| `declare` | Evaluates expression; writes to state; returns `null` |
| `set` | Evaluates expression; updates state; returns `null` |
| `if` | Evaluates each branch condition in order; pushes first truthy branch body as new frame; returns `null` |
| `goto` | Looks up chapter by name; clears stack; pushes chapter body; returns `null` |
| `call` | Looks up registered hook; evaluates args; invokes hook, or jumps to a chapter when the name resolves as a label; returns `null` |
| `choice` | Returns a choice step to the host and pauses until `engine.choose(index)` is called |
| `return` | Restores the most recent saved call frame; returns `null` |
| `block` | Pushes block's body as a new frame (chapters encountered inline during flow); returns `null` |
| `js` | Ignored (stub); returns `null` |

### Save / load snapshots

`engine.saveState()` captures the mutable runtime state around the immutable AST: current file, execution frames, saved call frames, chapter tracking state, persistent state, variable maps, initialization status, and any pending choice. `engine.loadState(snapshot)` restores that state onto an engine built from the same project.

The engine can also be constructed with a host-owned persistent store via `new Engine(program, { persistent })`. That store is not a dependency of the engine; it is simply a backing map or object the shell can keep across playthroughs.

### Goto semantics

`goto` is a **hard reset** — it clears the entire frame stack and pushes only the target chapter's body. This prevents stack growth in dialogue loops and makes `goto` behave like a true jump rather than a subroutine call.

### Choice flow

When the runtime reaches a choice node, it returns a pending `choice` result and waits for the host to resolve it.

```ts
const step = engine.next();

if (step.type === "choice") {
  showChoices(step.options);
  engine.choose(0);
}
```

The engine keeps returning the same `choice` result until `choose(index)` is called.

### Call / return trace

Subroutine-style `call` saves the current frame stack and jumps into the target chapter. `return` restores the saved stack and resumes after the call site.

```
call INTRO   -> save current frames, enter INTRO
return       -> restore saved frames, continue after call
```

### Expression evaluator

The evaluator is a recursive `evalExpr(expr: Expression): unknown` switch. Key behaviours:

- **Identifiers** look up the variable in the `state` Map. Unknown variables return `null`.
- **`&&` / `||`** short-circuit using JavaScript's own short-circuit semantics.
- **Member access** (`hero.name`) safely returns `null` for missing keys, non-object values, or prototype-chain lookups.
- **Arithmetic** is explicit: numeric operators require finite numbers, while `+` also concatenates strings.
- **Call expressions** (`Actor("Lyra")`) invoke registered hooks and capture the return value.

### String interpolation

Interpolation is handled in `interpolate(text: string): string`. The regex `/\$\{([^}]+)\}/g` extracts each `${…}` region; the inner string is:

1. Tokenised with `tokenize()`.
2. Parsed as a single expression with `parseExpressionTokens()`.
3. Evaluated against the current state.

Errors inside an interpolation expression are caught and silently replaced with an empty string, so a bad interpolation never crashes the engine.

### State

Runtime variables are split into a global map and a local/session map. Global declarations and cross-file globals live in the shared map; ordinary `declare` and `set` operations write to local state unless a variable already exists globally. `engine.getState()` merges both maps for inspection, with local values taking precedence on key collisions.

Persistent state is separate from runtime variables. It is exposed through `engine.getPersistentState()`, `engine.setPersistentState(...)`, and `engine.clearPersistentState()`, and the `persistent(...)` helper in scripts reads and writes the same backing store.

---

## File Map

```
src/
  types.ts
  │  TokenType enum
  │  Token interface
  │  Expression union + subtypes
  │  Node union + subtypes
  │  Program
  │  StepResult, FunctionHook, RuntimeContext
  │
  lexer/index.ts
  │  tokenize(source) → Token[]
  │
  parser/index.ts
  │  parse(tokens) → Program
  │  parseExpressionTokens(tokens) → Expression
  │  class Parser (private)
  │
  runtime/index.ts
  │  class Engine
  │    constructor(program)
  │    registerFunction(name, fn)
  │    next() → StepResult
  │    getState() → Record<string, unknown>
  │    saveState() → EngineSnapshot
  │    loadState(snapshot) → this
  │    (private) exec(node) → StepResult | null
  │    (private) evalExpr(expr) → unknown
  │    (private) interpolate(text) → string
  │
  index.ts
     compile(source) → Program    ← convenience facade
     re-exports: tokenize, parse, parseExpressionTokens, Engine, TokenType, all types
```

---

## Design Principles

**Controlled, not Turing-complete.**  
ValeFlow deliberately excludes while loops, closures, and arbitrary code execution. Behaviour is predictable and auditable from the script source alone.

**The host controls pacing.**  
`engine.next()` returns one beat and blocks. The host application decides when to call it — on a keypress, a timer, a UI button. ValeFlow has no concept of time.

**Silent vs. visible nodes.**  
Only `say` and `narration` produce `StepResult` values. Everything else is silently consumed. This separation keeps the host integration loop simple: just check `step.type`.

**No parser generator.**  
The grammar is small and stable enough that a hand-written recursive-descent parser is easier to read, debug, and extend than generated code.
