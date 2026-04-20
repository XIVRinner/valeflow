# ValeFlow

<p align="center">
  <img src="docs/valeflow.svg" alt="ValeFlow banner" width="400" />
</p>


A TypeScript-first dialogue scripting engine and DSL for branching narratives. Write stories in a clean, indentation-based syntax; drive them step-by-step from your game, app, or UI.

```
declare hero = Actor("Lyra")
declare gold = 5

chapter START:
    "A strange door stood at the end of the hall."
    hero "I've never seen this door before."
    choice:
        "Try the handle" -> ENTER
        "Walk away"      -> LEAVE

chapter ENTER:
    if gold >= 3:
        hero "I have what it takes."
    else:
        hero "Maybe I'm not ready."
```

---

## Features

- **Indentation-based DSL** — no braces, minimal punctuation
- **Step-based runtime** — `engine.next()` returns one beat at a time; you control the loop
- **Interactive choices** — `choice:` blocks pause execution and surface options to the player; resolved with `engine.choose(index)`
- **Typed AST** — full TypeScript types for every node, expression, and result
- **Pluggable hooks** — register any function (`Actor`, `log`, `playSFX`, …) from host code
- **String interpolation** — `"${hero.name} steps forward."` evaluated against live state
- **Goto / chapters** — named chapters act as labels; `goto` jumps between them
- **Call / Return** — `call` jumps to a chapter as a reusable subroutine and `return` resumes afterward
- **Multi-file projects** — `loadProject()` links multiple `.fsc` files; cross-file `goto file::LABEL`; shared `declare global` variables
- **Improved Expressions** — safer property access, explicit operator semantics, and string-friendly arithmetic
- **Tree serializer** — `serializeTree()` exports the entire dialogue tree as clean JSON
- **Save / Load** — `engine.saveState()` / `engine.loadState()` snapshot and restore full engine state
- **Chapter State Tracking** — detect visited and completed chapters
- **Persistent State** — shared values that survive across playthroughs
- **Zero dependencies** — hand-written lexer, recursive-descent parser, frame-stack runtime
- **Conditional Choices** — branching dialogue with optional conditions  

## 🚧 Future Plans

- **Imports** — split scripts across files with static validation  
- **Events / Hooks** — trigger custom logic from scripts  
- **i18n** — built-in localization support  
- **Skip / Auto Mode** — fast-forward or auto-advance dialogue  

## 🧪 Experimental / Long-Term

- **Live Editing** — modify scripts at runtime with state preservation  
- **Timeline / Async Flow** — delays, sequencing, and timed events  
- **Observability (RxJS)** — reactive streams for engine state and events
- **Image / SFX Support** — built-in handling for media assets
- **Visual Editor** — drag-and-drop interface for building dialogue trees

## Installation

```bash
npm install @rinner/valeflow
```

---

## Quick Start

```ts
import { compile, Engine } from "@rinner/valeflow";

const source = `
declare hero = Actor("Lyra")
declare coins = 5

chapter START:
    hero "Hello, world!"
    if coins > 3:
        "Lyra feels wealthy today."
    else:
        "Lyra counts her coins carefully."
    choice:
        "Continue" -> NEXT
        "Quit"     -> END

chapter NEXT:
    hero "Onwards!"

chapter END:
    "Lyra sheathes her sword."
`;

const engine = new Engine(compile(source));
engine.registerFunction("Actor", (_ctx, name) => ({ name }));
engine.registerFunction("log",   (_ctx, msg)  => console.log("[log]", msg));

function run() {
  const step = engine.next();

  if (step.type === "end") return;

  if (step.type === "say") {
    const actor = step.actor as { name: string };
    console.log(`${actor.name}: ${step.text}`);
    run();
  } else if (step.type === "narration") {
    console.log(`  ${step.text}`);
    run();
  } else if (step.type === "choice") {
    // Present options to the player, then call engine.choose(index)
    console.log("Choose:");
    step.options.forEach(o => console.log(`  [${o.index}] ${o.label}`));
    engine.choose(0); // pick first option
    run();
  }
}

run();
```

---

## Language Reference

### Declarations

```
declare hero  = Actor("Lyra")   # local variable
declare global score = 0        # shared across files
```

### Dialogue

```
"This is narration text."
hero "This is a character line."
hero "My score is ${score}."    # string interpolation
```

### Branching

```
if score >= 10:
    hero "Not bad!"
elseif score >= 5:
    hero "Keep trying."
else:
    hero "Practice more."
```

### Choices

Two equivalent syntaxes are supported:

```
# Shorthand — label and implicit goto
choice:
    "Go to the forest" -> FOREST
    "Visit the shop"   -> SHOP

# Full body — arbitrary nodes per option
choice:
    -> "Go to the forest":
        "The trees close in."
        goto FOREST
    -> "Visit the shop":
        hero "I need supplies."
        goto SHOP
```

### Navigation

```
goto CHAPTER_NAME           # local chapter
goto other.fsc::CHAPTER     # cross-file (multi-file projects)
```

### State mutation

```
set score = score + 1
set mood  = "happy"
```

### Calling hooks

```
call log("player_moved")
call playSFX("door_open")
```

### Subroutines

```
call INTRO
  hero "I will be back."
return
```

`call` jumps to a chapter label and `return` resumes execution after the call site.

### Chapters / labels

```
chapter START:
    ...

chapter EPILOGUE:
    ...
```

---

## Choices API

```ts
let step = engine.next();

if (step.type === "choice") {
  // step.options: Array<{ label: string; index: number }>
  console.log(step.options); // [{ label: "Go north", index: 0 }, ...]

  // Resolve before calling next() again
  engine.choose(0);
}
```

`next()` returns the same `choice` result until `choose(index)` is called.

Example integration loop:

```ts
function advance() {
  const step = engine.next();

  switch (step.type) {
    case "choice":
      showChoices(step.options);
      engine.choose(0);
      break;
    case "say":
      showDialogue(step.actor, step.text);
      break;
    case "narration":
      showNarration(step.text);
      break;
  }
}
```

---

## Tree Serializer

Export the full AST as structured JSON — useful for authoring tools, analytics, or porting to other engines:

```ts
import { compile, serializeTree } from "@rinner/valeflow";

const tree = serializeTree(compile(source));
console.log(JSON.stringify(tree, null, 2));
```

Output shape:

```json
{
  "declarations": [
    { "name": "hero", "value": "Actor(\"Lyra\")", "global": false }
  ],
  "chapters": [
    {
      "name": "START",
      "nodes": [
        { "type": "say", "actor": "hero", "text": "Hello!" },
        { "type": "choice", "options": [
          { "label": "Continue", "nodes": [{ "type": "goto", "target": "NEXT" }] }
        ]}
      ]
    }
  ]
}
```

---

## Multi-File Projects

```ts
import { loadProject, Engine } from "@rinner/valeflow";

const project = loadProject([
  { filename: "globals.fsc", source: globalsSrc },
  { filename: "intro.fsc",   source: introSrc   },
  { filename: "shop.fsc",    source: shopSrc    },
]);

const engine = new Engine(project);
```

- Files named `globals*` are declaration-only; all their variables are automatically global
- Use `declare global x = …` in any file to promote a single variable to global scope
- Cross-file gotos: `goto shop.fsc::SHOP_MAIN`

---

## Project Structure

```
src/
  types.ts            — All AST node types, expression types, runtime types
  lexer/index.ts      — Tokeniser (source → Token[])
  parser/index.ts     — Recursive-descent parser (Token[] → Program AST)
  runtime/index.ts    — Frame-stack Engine, expression evaluator, choice handling
  project/index.ts    — Multi-file linker (loadProject, resolveLabel)
  serialize/index.ts  — Tree serializer (serializeTree → JSON)
  index.ts            — Public API + compile() convenience function

examples/
  example1.fsc        — Sample ValeFlow source file
  angular-demo/       — Angular 21 showcase app
```

---

## Angular Demo

```bash
cd examples/angular-demo
npm install
node node_modules/@angular/cli/bin/ng.js serve
# → http://localhost:4200
```

The demo includes 12 tabs:

| Tab | What it shows |
|---|---|
| Introduction | Actors, narration, if/else, goto |
| Variables & Interpolation | `declare`, `set`, `${}` |
| Improved Expressions | String concatenation, safe member access, conditional branching |
| if / elseif / else | Full condition chains |
| Function Calls | `call` with registered hooks |
| Goto Loop | Chapter looping with a countdown |
| The Tavern | Multi-chapter hub navigation |
| The Riddle | Branch by variable value |
| ⬡ Choices | Interactive player choices |
| Persistent State | Host-backed values that survive restart |
| ⊞ Tree View | Full AST as a colour-coded collapsible tree |
| ⚗ Playground | Live editor — write and run any ValeFlow script |

---

## API Reference

See [docs/api.md](docs/api.md) for the full API.  
See [docs/language.md](docs/language.md) for the language reference.  
See [docs/architecture.md](docs/architecture.md) for internals.

## Changelog

### 0.2.0

- Added `call` / `return` for subroutines
- Added conditional choices (`choice:` options can use `if <condition>`)
- Added better expression support: string concatenation, safe member access, and explicit operator semantics
- Added engine save/load snapshots via `engine.saveState()` / `engine.loadState()`
- Added persistent state via `EngineOptions.persistent` — a host-owned store for values that survive across playthroughs
- Added chapter state tracking (`visited` / `completed`ú flags on chapter states)
---

## License

MIT
