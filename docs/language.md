# ValeFlow Language Reference

ValeFlow is an indentation-based dialogue scripting language. Structure is expressed through indentation — no braces, no `end` keywords.

---

## Comments

Lines beginning with `#` are ignored by the lexer.

```
# This is a comment
declare x = 10  # inline comments are also fine
```

---

## Declarations

Declare a global variable and assign its initial value.

```
declare <name> = <expression>
```

```
declare hero    = Actor("Lyra")
declare coins   = 5
declare alive   = true
declare mood    = "neutral"
declare nothing = null
```

- Variables declared at the top level are available throughout the entire script.
- Declarations are executed once, in source order, before the first chapter runs.
- The right-hand side is a full [expression](#expressions), not just a literal.

---

## Assignment

Change the value of an existing variable.

```
set <name> = <expression>
```

```
set coins = coins + 10
set mood  = "happy"
set alive = false
```

`set` can appear anywhere a statement is valid — inside chapters, `if` branches, etc.

---

## Chapters

Chapters are named blocks that serve as execution labels.

```
chapter <NAME>:
    statement
    statement
    ...
```

```
chapter INTRO:
    "The story begins."
    hero "Where am I?"

chapter HUB:
    hero "What should I do next?"
```

- Chapter names are `UPPER_CASE` by convention (but any valid identifier works).
- Execution begins at the **first chapter defined**, or at the top-level body before any chapter.
- Chapters are pre-registered at parse time, so `goto` can jump forward *or* backward.

The runtime also tracks chapter lifecycle information. Host code can query which chapters were visited or completed, and inspect the currently active chapter through the engine API.

---

## Dialogue (Say)

A character speaks a line.

```
<actorVariable> "<text>"
```

```
hero "I didn't expect to find you here."
villain "Did you really think you could escape?"
```

- `actorVariable` must be an identifier that holds a value (typically the object returned by `Actor(…)`).
- The text may contain [interpolation](#string-interpolation).
- This produces a `{ type: "say", actor, text }` step from `engine.next()`.

---

## Narration

Narration (no speaker).

```
"<text>"
```

```
"The room fell silent."
"Dust motes drifted in the afternoon light."
```

- Produces a `{ type: "narration", text }` step from `engine.next()`.
- Text may contain [interpolation](#string-interpolation).

---

## String Interpolation

Any string — dialogue or narration — may embed expressions using `${…}`.

```
"${hero.name} has ${coins} coins left."
hero "I've taken ${steps + 1} steps so far."
```

- The expression inside `${…}` is evaluated in the current variable state.
- Member access (`hero.name`) reads only own data properties; prototype and constructor lookups are blocked.
- Arithmetic is type-aware: numeric operators require numbers, while `+` also concatenates strings.
- Invalid or unsafe expression operations resolve to `null`, which renders as an empty interpolation result.

---

## If / ElseIf / Else

Conditional branching. Only the first truthy branch executes.

```
if <condition>:
    ...
elseif <condition>:
    ...
else:
    ...
```

```
if mood == "happy":
    hero "What a beautiful day!"
elseif mood == "sad":
    hero "I feel down today."
else:
    hero "I feel okay, I suppose."
```

- `elseif` and `else` are optional.
- Conditions are full [expressions](#expressions).
- Bodies are indented and may contain any statement, including nested `if`.

---

## Choices

Interactive branching. Each option can jump directly to a chapter or run a full indented body before continuing.

Shorthand options are the most compact form:

```
choice:
    "Go to the forest" -> FOREST
    "Visit the shop"   -> SHOP
```

Full-body options let you run any nodes before leaving the choice branch:

```
choice:
    -> "Train" if gold >= 3:
        hero "We should prepare first."
        goto TRAINING
    -> "Rest":
        "You decide to wait until morning."
```

- `choice:` pauses execution until the host resolves the selection with `engine.choose(index)`.
- Add `if <condition>` after a choice label to show it only when the condition is truthy.
- `choice` bodies can contain any valid statement.
- Choice labels are returned to the host as visible options, in source order.

---

## Goto

Jump execution to a named chapter. The execution stack is cleared and replaced with the target chapter's body.

```
goto <CHAPTER_NAME>
```

```
chapter LOOP:
    hero "Going around again."
    goto LOOP
```

> `goto` is safe to use for infinite dialogue loops — the runtime is not recursive.

---

## Call

Invoke a registered host function.

```
call <functionName>(<arg1>, <arg2>, ...)
```

```
call log("entered hub area")
call playSFX("door_open")
call setFlag("metQueen", true)
```

- Arguments are [expressions](#expressions).
- If the named function is not registered, the `call` is silently ignored.
- Register functions with `engine.registerFunction(name, fn)`.
- `call` is a **statement** — its return value is discarded. Use a [call expression](#call-expression) inside a `declare` or `set` to capture a return value.

ValeFlow also exposes a built-in `persistent(...)` helper for host-backed data that should survive across playthroughs. It is separate from ordinary variables and is intended for shell-level state such as unlocks, seen flags, or profile data.

```
declare seenIntro = persistent("seenIntro")
call persistent("seenIntro", true)
```

- `persistent(key)` reads a persistent value.
- `persistent(key, value)` stores a value and returns it.
- The host decides where the persistent store lives and can reuse it across new engine instances.

Example with a reusable subroutine:

```
chapter START:
    call INTRO
    "Back in the main scene."

chapter INTRO:
    hero "I will be right back."
    return
```

---

## JS Block (stub)

Inline JavaScript blocks are parsed but **not executed** in the current runtime.

```
js:
    console.log("this is stubbed")
```

This keyword is reserved for a future execution mode.

---

## Expressions

Expressions are used in `declare`, `set`, `if` conditions, `call` arguments, and string interpolation.

### Literals

| Syntax | Type | Example |
|---|---|---|
| `"text"` | string | `"hello"` |
| `42`, `3.14` | number | `100` |
| `true` / `false` | boolean | `true` |
| `null` | null | `null` |

### Identifiers

A bare name looks up the variable in the current state.

```
coins
hero
alive
```

### Member Access

Access a property on an object value.

```
hero.name
actor1.name
```

Chains are supported: `a.b.c`

- Only own properties are readable; prototype-chain lookups such as `constructor` and `__proto__` are blocked.

### Call Expression

Call a registered hook and use its return value.

```
declare hero = Actor("Lyra")
set token = generateToken("admin")
```

This is distinct from the `call` *statement* — here the return value is captured.

### Arithmetic

| Operator | Meaning |
|---|---|
| `+` | addition |
| `-` | subtraction |
| `*` | multiplication |
| `/` | division |

```
set coins = coins + 10
set half  = total / 2
```

- `+` concatenates if either side is a string.
- `-`, `*`, and `/` require finite numbers.
- Invalid arithmetic yields `null` rather than relying on JavaScript coercion.

### Comparison

| Operator | Meaning |
|---|---|
| `==` | strict equality |
| `!=` | strict inequality |
| `>`  | greater than |
| `<`  | less than |
| `>=` | greater than or equal |
| `<=` | less than or equal |

```
if coins >= 10:
if mood != "sad":
```

### Logical

| Operator | Meaning |
|---|---|
| `&&` | logical AND (short-circuits) |
| `\|\|` | logical OR (short-circuits) |
| `!`  | logical NOT (unary prefix) |

```
if alive && coins > 0:
if !hasKey:
```

### Operator Precedence (high → low)

1. `!`, unary `-`
2. `*`, `/`
3. `+`, `-`
4. `>`, `<`, `>=`, `<=`
5. `==`, `!=`
6. `&&`
7. `||`

---

## Complete Example

```valeflow
declare hero   = Actor("Lyra")
declare guard  = Actor("Guard")
declare hasKey = false
declare gold   = 12

chapter GATE:
    guard "Halt! You shall not pass without a key."
    if hasKey:
        guard "Ah, you have the key. You may proceed."
        goto INSIDE
    elseif gold >= 10:
        hero  "How about I pay the toll?"
        guard "...Fine. Ten gold."
        set gold   = gold - 10
        set hasKey = true
        goto GATE
    else:
        hero "I have nothing to offer."
        guard "Then be gone!"
        "The gate remains shut."

chapter INSIDE:
    "Lyra steps through the gate into the city."
    hero "Finally, I made it. Gold remaining: ${gold}"
    call log("player_entered_city")
```
