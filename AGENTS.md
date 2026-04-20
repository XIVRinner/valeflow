# ValeFlow Workspace Instructions

## General Rules
- Keep changes small, focused, and consistent with the existing codebase.
- Prefer root-cause fixes over surface-level patches.
- Use `apply_patch` for manual edits.
- Validate changes with the narrowest useful test or build command.
- Do not revert unrelated user changes.
- Preserve the current style and avoid unnecessary refactors.

## Documentation Rules
- Update all docs when behavior changes, including `README.md` and the reference docs.
- Keep examples in sync across docs so they describe the same feature set.

## Demo Rules
- Add new demo use cases when a feature is introduced.
- Expand the current demo scripts and tabs to showcase the feature in practice.
- Prefer concrete, runnable `.fsc` examples over prose-only mentions.
