import test from "node:test";
import assert from "node:assert/strict";
import { compile } from "../dist/index.js";

test("compile parses declarations, chapters, and choice branches", () => {
  const program = compile(`
declare hero = Actor("Lyra")

chapter START:
    hero "Hello, \${hero.name}!"
    choice:
        "Stay" -> END

chapter END:
    "Goodbye."
`);

  assert.equal(program.type, "program");
  assert.equal(program.body.length, 3);
  assert.deepEqual(program.body.map((node) => node.type), ["declare", "block", "block"]);

  const startChapter = program.body[1];
  assert.equal(startChapter.type, "block");
  assert.equal(startChapter.name, "START");
  assert.deepEqual(startChapter.body.map((node) => node.type), ["say", "choice"]);

  const choiceNode = startChapter.body[1];
  assert.equal(choiceNode.type, "choice");
  assert.equal(choiceNode.options.length, 1);
  assert.equal(choiceNode.options[0].label, "Stay");
  assert.equal(choiceNode.options[0].body[0].type, "goto");
  assert.equal(choiceNode.options[0].body[0].target, "END");
});