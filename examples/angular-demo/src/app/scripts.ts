// ─────────────────────────────────────────────────────────────
// Built-in example FlowScript scripts for the demo
// ─────────────────────────────────────────────────────────────

export interface DemoScript {
  id: string;
  title: string;
  description: string;
  source: string;
}

export const DEMO_SCRIPTS: DemoScript[] = [
  {
    id: "intro",
    title: "Introduction",
    description: "Actors, narration, if/else branching, and goto loops.",
    source: `
declare actor1 = Actor("Adam")
declare actor2 = Actor("Eve")
declare hasKey = false

chapter START:
    "It was a quiet morning in Grayvale."
    actor1 "I have nothing to do today."
    if hasKey:
        actor1 "Wait... I already have the key?"
    else:
        actor1 "Maybe I should explore."
    call log("Player entered exploration mindset")
    goto ENCOUNTER

chapter ENCOUNTER:
    actor2 "Hello there, traveler."
    actor1 "Oh! Hi, Eve. I was just looking for something to do."
    actor2 "Then follow me."
    "The two adventurers set off together."
`.trim(),
  },
  {
    id: "counter",
    title: "Variables & Interpolation",
    description: "declare / set, arithmetic, and string interpolation.",
    source: `
declare hero = Actor("Lyra")
declare steps = 0
declare goal = 3

chapter START:
    hero "Time to train!"
    set steps = steps + 1
    hero "That's step \${steps}."
    set steps = steps + 1
    hero "Step \${steps} done."
    set steps = steps + 1
    if steps >= goal:
        "Lyra completes all \${goal} steps. Training finished!"
    else:
        "Something went wrong with the count."
`.trim(),
  },
  {
    id: "branching",
    title: "if / elseif / else",
    description: "Condition chains and nested branching.",
    source: `
declare mood = "curious"
declare hero = Actor("Kira")

chapter START:
    hero "Good morning, world!"
    if mood == "happy":
        hero "What a beautiful day!"
        "Kira smiles warmly at the sunrise."
    elseif mood == "sad":
        hero "I just can't get going today..."
        "Kira sighs heavily."
    elseif mood == "curious":
        hero "I wonder what today will bring."
        "Kira's eyes light up with anticipation."
    else:
        hero "Hmm, not sure how I feel."
    hero "Well — adventure awaits either way!"
`.trim(),
  },
  {
    id: "functions",
    title: "Function Calls",
    description: "call statement with registered engine hooks.",
    source: `
declare narrator = Actor("Narrator")
declare player = Actor("Hero")

chapter START:
    call setTitle("The Grand Hall")
    narrator "The hall falls silent."
    player "I am ready."
    call log("scene: grand_hall")
    call announce("player_ready")
    "The doors open before the hero."
`.trim(),
  },

  // ── New demos ──────────────────────────────────────────────────

  {
    id: 'loop',
    title: 'Goto Loop',
    description: 'goto jumps between chapters — used here to build a countdown loop.',
    source: `
declare voice = Actor("System")
declare n = 5

chapter START:
    voice "Initiating countdown..."
    goto TICK

chapter TICK:
    voice "T-minus \${n}."
    set n = n - 1
    if n > 0:
        goto TICK
    voice "Ignition!"
    "The rocket clears the launchpad."
`.trim(),
  },

  {
    id: 'tavern',
    title: 'The Tavern',
    description: 'Multiple named chapters with goto navigation and gold-based branching.',
    source: `
declare innkeeper = Actor("Rowan")
declare traveler  = Actor("Mira")
declare gold = 5

chapter ENTRANCE:
    "Mira pushes open the heavy tavern door."
    innkeeper "Welcome to the Rusty Flagon, traveler."
    traveler "A room for the night — and news from the road."
    goto BARTER

chapter BARTER:
    innkeeper "Five gold for the room."
    if gold >= 5:
        traveler "Done."
        set gold = gold - 5
        call log("room_rented")
        goto NIGHT
    else:
        traveler "I am a little short, I am afraid."
        innkeeper "The fire is free. Sleep there."

chapter NIGHT:
    "The fire crackles low."
    innkeeper "You look like you have walked far."
    traveler "From Vareth. Three weeks on foot."
    innkeeper "Then sleep. The road will keep."
    "Gold remaining: \${gold}."
`.trim(),
  },

  {
    id: 'riddle',
    title: 'The Riddle',
    description: 'Conditional story across multiple chapters — change answer to see every path.',
    source: `
declare sage = Actor("The Sage")
declare answer = "echo"

chapter START:
    "The sage sits by a lantern in the fog."
    sage "I speak without a mouth."
    sage "I hear without ears."
    sage "I have no body, yet I come alive with wind."
    sage "What am I?"
    if answer == "echo":
        goto CORRECT
    elseif answer == "wind":
        goto CLOSE
    else:
        goto WRONG

chapter CORRECT:
    sage "Correct — I am an echo."
    sage "You carry wisdom with you, traveler."
    call log("riddle: correct")

chapter CLOSE:
    sage "Close... but not quite right."
    sage "The answer was: echo."
    call log("riddle: close")

chapter WRONG:
    sage "I am afraid that is incorrect."
    sage "The answer was: echo."
    call log("riddle: wrong")
`.trim(),
  },
];

// ── Experiment / Playground ─────────────────────────────────────

export const EXPERIMENT_STARTER = `declare hero = Actor("Hero")
declare count = 0

chapter START:
    hero "Hello, FlowScript!"
    set count = count + 1
    hero "Step \${count} — variables work!"
    set count = count + 1
    "This is narration text."
    if count > 1:
        hero "Branching works too."
    "Edit this script above, then click Run ▶"`.trim();

export const EXPERIMENT_SCRIPT: DemoScript = {
  id: 'experiment',
  title: '⚗ Playground',
  description: 'Write and run your own FlowScript. Edit the source on the left and click Run.',
  source: EXPERIMENT_STARTER,
};
