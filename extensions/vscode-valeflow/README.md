# ValeFlow Language Extension

Local VS Code language support for ValeFlow files.

## Features

- Syntax highlighting for `.fsc` and `.flow`
- Comment support with `#`
- Indentation rules for block syntax
- Handy snippets for chapters and choices

Example script:

```valeflow
declare hero = Actor("Lyra")

chapter START:
    hero "Hello, world!"
    choice:
        "Continue" -> NEXT
        "Quit"     -> END
```

## Try it locally

1. Open this extension folder in VS Code.
2. Press `F5` to launch an Extension Development Host.
3. Open any `.fsc` file to see highlighting.

## Build

Package the extension into a `.vsix` with:

```bash
npm run build
```

That runs `vsce package` through `npx` and includes the file icon theme from `fileicons/`.

## Covered syntax

- `declare` and `declare global`
- `set`, `if`, `elseif`, `else`
- `chapter`, `goto`, `call`, `choice`, `js`
- Strings, interpolation, numbers, booleans, and comments
