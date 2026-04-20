import test from "node:test";
import assert from "node:assert/strict";
import { compile, Engine } from "../dist/index.js";

test("engine handles choice, call/return, state updates, and interpolation", () => {
  const engine = new Engine(compile(`
declare hero = Actor("Lyra")
declare count = 0
declare canTrain = true

chapter START:
    hero "Start."
    choice:
        -> "Train" if canTrain:
            call increment
            "Count is \${count}."
        -> "Quit" if !canTrain:
            "Should not show."
        -> "Quit":
            "Stopping."

chapter increment:
    set count = count + 1
    return
`));

  engine.registerFunction("Actor", (_ctx, name) => ({ name }));

  const first = engine.next();
  assert.deepEqual(first, { type: "say", actor: { name: "Lyra" }, text: "Start." });

  const choice = engine.next();
  assert.equal(choice.type, "choice");
  assert.deepEqual(choice.options, [
    { label: "Train", index: 0 },
    { label: "Quit", index: 1 },
  ]);

  engine.choose(0);

  const second = engine.next();
  assert.deepEqual(second, { type: "narration", text: "Count is 1." });
  assert.deepEqual(engine.getState(), {
    hero: { name: "Lyra" },
    count: 1,
    canTrain: true,
  });

  assert.deepEqual(engine.next(), { type: "end" });
});

test("expression evaluation blocks prototype access and invalid numeric coercion", () => {
  const engine = new Engine(compile(`
declare hero = Actor("Lyra")
declare safeName = hero.name
declare blocked = hero.__proto__
declare invalid = hero.name - 1
declare combined = hero.name + " the Brave"

chapter START:
    hero "Ready."
`));

  engine.registerFunction("Actor", (_ctx, name) => ({ name }));

  assert.deepEqual(engine.next(), { type: "say", actor: { name: "Lyra" }, text: "Ready." });
  assert.deepEqual(engine.getState(), {
    hero: { name: "Lyra" },
    safeName: "Lyra",
    blocked: null,
    invalid: null,
    combined: "Lyra the Brave",
  });
});

test("engine can save and restore full execution state", () => {
  const source = `
declare hero = Actor("Lyra")
declare count = 0

chapter START:
    hero "Start."
    choice:
          "Increment" -> INCREMENT
          "Stop" -> STOP

chapter INCREMENT:
      call increment
      "Count is \${count}."

chapter STOP:
      "Stopped."

chapter increment:
    set count = count + 1
    return
`;

  const engine = new Engine(compile(source), { persistent: { seenIntro: true } });
  engine.registerFunction("Actor", (_ctx, name) => ({ name }));

  assert.deepEqual(engine.next(), { type: "say", actor: { name: "Lyra" }, text: "Start." });

  const choice = engine.next();
  assert.equal(choice.type, "choice");

  const snapshot = engine.saveState();
  assert.deepEqual(snapshot.persistentState, { seenIntro: true });
  const restored = new Engine(compile(source));
  restored.registerFunction("Actor", (_ctx, name) => ({ name }));
  restored.loadState(snapshot);

  assert.deepEqual(restored.next(), choice);

  restored.choose(0);
  assert.deepEqual(restored.next(), { type: "narration", text: "Count is 1." });
  assert.deepEqual(restored.getState(), {
    hero: { name: "Lyra" },
    count: 1,
  });
  assert.deepEqual(restored.getPersistentState(), { seenIntro: true });
});

test("engine tracks visited and completed chapters", () => {
  const engine = new Engine(compile(`
chapter START:
    "Intro."
    goto MID

chapter MID:
    "Middle."

chapter END:
    "Done."
`));

  assert.equal(engine.getCurrentChapter(), null);
  assert.deepEqual(engine.getVisitedChapters(), []);
  assert.deepEqual(engine.getCompletedChapters(), []);

  assert.deepEqual(engine.next(), { type: "narration", text: "Intro." });
  assert.equal(engine.getCurrentChapter(), "__main__::START");
  assert.equal(engine.hasVisitedChapter("START"), true);
  assert.equal(engine.hasCompletedChapter("START"), false);

  assert.deepEqual(engine.next(), { type: "narration", text: "Middle." });
  assert.equal(engine.getCurrentChapter(), "__main__::MID");
  assert.equal(engine.hasVisitedChapter("MID"), true);
  assert.equal(engine.hasCompletedChapter("MID"), false);

  assert.deepEqual(engine.next(), { type: "end" });
  assert.deepEqual(engine.getVisitedChapters(), ["__main__::START", "__main__::MID"]);
  assert.deepEqual(engine.getCompletedChapters(), ["__main__::MID"]);
});

test("persistent state survives new playthroughs when the host reuses the store", () => {
  const sharedPersistent = {};

  const first = new Engine(compile(`
chapter START:
    call persistent("seenIntro", true)
    "First run."
`), { persistent: sharedPersistent });

  assert.deepEqual(first.next(), { type: "narration", text: "First run." });
  assert.deepEqual(first.getPersistentState(), { seenIntro: true });

  const second = new Engine(compile(`
declare seenIntro = persistent("seenIntro")

chapter START:
    "Second run."
`), { persistent: sharedPersistent });

  assert.deepEqual(second.next(), { type: "narration", text: "Second run." });
  assert.deepEqual(second.getState(), { seenIntro: true });
});