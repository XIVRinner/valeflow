# FlowScript

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
- **Multi-file projects** — `loadProject()` links multiple `.fsc` files; cross-file `goto file::LABEL`; shared `declare global` variables
- **Tree serializer** — `serializeTree()` exports the entire dialogue tree as clean JSON
- **Zero dependencies** — hand-written lexer, recursive-descent parser, frame-stack runtime

---

## Installation

```bash
npm install flowscript
```

---

## Quick Start

```ts
import { compile, Engine } from "flowscript";

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

---

## Tree Serializer

Export the full AST as structured JSON — useful for authoring tools, analytics, or porting to other engines:

```ts
import { compile, serializeTree } from "flowscript";

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
import { loadProject, Engine } from "flowscript";

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
  example1.fsc        — Sample FlowScript source file
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

The demo includes 8 tabs:

| Tab | What it shows |
|---|---|
| Introduction | Actors, narration, if/else, goto |
| Variables & Interpolation | `declare`, `set`, `${}` |
| if / elseif / else | Full condition chains |
| Function Calls | `call` with registered hooks |
| Goto Loop | Chapter looping with a countdown |
| The Tavern | Multi-chapter hub navigation |
| The Riddle | Branch by variable value |
| ⬡ Choices | Interactive player choices |
| ⊞ Tree View | Full AST as a colour-coded collapsible tree |
| ⚗ Playground | Live editor — write and run any FlowScript |

---

## API Reference

See [docs/api.md](docs/api.md) for the full API.  
See [docs/language.md](docs/language.md) for the language reference.  
See [docs/architecture.md](docs/architecture.md) for internals.

---

## License

MIT
