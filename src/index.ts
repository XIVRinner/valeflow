/**
 * ValeFlow – dialogue engine public API
 *
 * Quick start:
 *
 *   import { compile, Engine } from "@rinner/valeflow";
 *
 *   const program = compile(source);
 *   const engine  = new Engine(program);
 *
 *   engine.registerFunction("Actor", (ctx, name) => ({ name }));
 *   engine.registerFunction("log",   (ctx, msg)  => console.log("[log]", msg));
 *
 *   let step = engine.next();
 *   while (step.type !== "end") {
 *     if (step.type === "say") {
 *       const actor = step.actor as { name: string } | null;
 *       console.log(`${actor?.name ?? "???"}: ${step.text}`);
 *     } else if (step.type === "narration") {
 *       console.log(`  ${step.text}`);
 *     }
 *     step = engine.next();
 *   }
 */

// ── Lexer ─────────────────────────────────────────────────
export { tokenize }                     from "./lexer/index.js";

// ── Parser ────────────────────────────────────────────────
export { parse, parseExpressionTokens } from "./parser/index.js";

// ── Project loader ────────────────────────────────────────
export { loadProject, resolveLabel }    from "./project/index.js";
export type { LoadInput }               from "./project/index.js";

// ── Runtime ───────────────────────────────────────────────
export { Engine }                       from "./runtime/index.js";

// ── Serializer ────────────────────────────────────────────
export { serializeTree }                from "./serialize/index.js";
export type {
  SerializedProgram,
  SerializedChapter,
  SerializedNode,
  SerializedDecl,
  SerializedSay,
  SerializedNarration,
  SerializedIf,
  SerializedChoice,
  SerializedGoto,
  SerializedCall,
  SerializedReturn,
  SerializedSet,
}                                       from "./serialize/index.js";

// ── Value exports from types (enums etc.) ─────────────────
export { TokenType }                    from "./types.js";

// ── Type-only exports ─────────────────────────────────────
export type {
  Token,
  Expression,
  LiteralExpression,
  IdentifierExpression,
  BinaryExpression,
  UnaryExpression,
  CallExpression,
  MemberExpression,
  Node,
  Program,
  DeclarationNode,
  SayNode,
  NarrationNode,
  IfNode,
  IfBranch,
  GotoNode,
  CallNode,
  ReturnNode,
  SetNode,
  ChoiceNode,
  ChoiceOptionNode,
  BlockNode,
  JsNode,
  LabelRef,
  ScriptFile,
  Project,
  StepResult,
  FunctionHook,
  RuntimeContext,
  EngineOptions,
  EngineSnapshot,
  EngineFrameSnapshot,
  EngineCallFrameSnapshot,
  EngineChoiceSnapshot,
  EngineChapterStateSnapshot,
} from "./types.js";

// ── Convenience facade ────────────────────────────────────

import { tokenize as _tokenize } from "./lexer/index.js";
import { parse    as _parse    } from "./parser/index.js";
import type { Program }           from "./types.js";

/**
 * Tokenise + parse a ValeFlow source string in one call.
 *
 * @param source  Raw .fsc source text
 * @returns       Parsed Program AST
 */
export function compile(source: string): Program {
  return _parse(_tokenize(source));
}
