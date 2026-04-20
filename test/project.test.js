import test from "node:test";
import assert from "node:assert/strict";
import { loadProject, Engine } from "../dist/index.js";

test("loadProject links globals and cross-file gotos", () => {
  const project = loadProject([
    {
      filename: "globals.fsc",
      source: `
declare hero = Actor("Lyra")
`,
    },
    {
      filename: "intro.fsc",
      source: `
chapter START:
    hero "Hello from the intro."
    goto shop.fsc::SHOP
`,
    },
    {
      filename: "shop.fsc",
      source: `
chapter SHOP:
    "Welcome, \${hero.name}."
`,
    },
  ]);

  const engine = new Engine(project);
  engine.registerFunction("Actor", (_ctx, name) => ({ name }));

  assert.equal(engine.getCurrentFile(), "intro.fsc");

  assert.deepEqual(engine.next(), {
    type: "say",
    actor: { name: "Lyra" },
    text: "Hello from the intro.",
  });

  assert.deepEqual(engine.next(), {
    type: "narration",
    text: "Welcome, Lyra.",
  });

  assert.deepEqual(engine.next(), { type: "end" });
  assert.equal(engine.getCurrentFile(), "shop.fsc");
});