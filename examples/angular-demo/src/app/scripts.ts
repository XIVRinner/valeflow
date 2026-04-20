// ─────────────────────────────────────────────────────────────
// Built-in example ValeFlow scripts for the demo.
// Sources now live in /public/demo-scripts as real .fsc files.
// ─────────────────────────────────────────────────────────────

export interface DemoScript {
  id: string;
  title: string;
  description: string;
  source: string;
  assetPath?: string;
}

export const DEMO_SCRIPTS: DemoScript[] = [
  {
    id: 'intro',
    title: 'Introduction',
    description: 'Actors, narration, if/else branching, and goto loops.',
    assetPath: 'demo-scripts/intro.fsc',
    source: '',
  },
  {
    id: 'counter',
    title: 'Variables & Interpolation',
    description: 'declare / set, arithmetic, and string interpolation.',
    assetPath: 'demo-scripts/counter.fsc',
    source: '',
  },
  {
    id: 'expressions',
    title: 'Improved Expressions',
    description: 'String concatenation, safe member access, and a conditional branch.',
    assetPath: 'demo-scripts/expressions.fsc',
    source: '',
  },
  {
    id: 'branching',
    title: 'if / elseif / else',
    description: 'Condition chains and nested branching.',
    assetPath: 'demo-scripts/branching.fsc',
    source: '',
  },
  {
    id: 'functions',
    title: 'Function Calls',
    description: 'call statement with registered engine hooks.',
    assetPath: 'demo-scripts/functions.fsc',
    source: '',
  },
  {
    id: 'subroutines',
    title: 'Subroutines',
    description: 'call a chapter as a reusable subroutine and return to the caller.',
    assetPath: 'demo-scripts/subroutines.fsc',
    source: '',
  },
  {
    id: 'loop',
    title: 'Goto Loop',
    description: 'goto jumps between chapters — used here to build a countdown loop.',
    assetPath: 'demo-scripts/loop.fsc',
    source: '',
  },
  {
    id: 'tavern',
    title: 'The Tavern',
    description: 'Multiple named chapters with goto navigation and gold-based branching.',
    assetPath: 'demo-scripts/tavern.fsc',
    source: '',
  },
  {
    id: 'riddle',
    title: 'The Riddle',
    description: 'Conditional story across multiple chapters — change answer to see every path.',
    assetPath: 'demo-scripts/riddle.fsc',
    source: '',
  },
  {
    id: 'choices',
    title: '⬡ Choices',
    description: 'Interactive branching with the choice: syntax, including a conditional option.',
    assetPath: 'demo-scripts/choices.fsc',
    source: '',
  },
  {
    id: 'persistent',
    title: 'Persistent State',
    description: 'Host-backed values survive restart; the shell remembers what the story wrote.',
    assetPath: 'demo-scripts/persistent.fsc',
    source: '',
  },
  {
    id: 'tree',
    title: '⊞ Tree View',
    description: 'Inspect the full AST as structured JSON. Switch any demo tab then return here.',
    assetPath: 'demo-scripts/tree.fsc',
    source: '',
  },
];

async function loadTextAsset(assetPath: string): Promise<string> {
  const response = await fetch(assetPath);
  if (!response.ok) {
    throw new Error(`Failed to load demo asset: ${assetPath}`);
  }

  return (await response.text()).trim();
}

export function hydrateDemoScripts(scripts: DemoScript[]): Promise<DemoScript[]> {
  return Promise.all(
    scripts.map(async script => {
      if (!script.assetPath) return script;
      return {
        ...script,
        source: await loadTextAsset(script.assetPath),
      };
    }),
  );
}

export function loadExperimentStarter(): Promise<string> {
  return loadTextAsset('demo-scripts/experiment-starter.fsc');
}

export const EXPERIMENT_SCRIPT: DemoScript = {
  id: 'experiment',
  title: '⚗ Playground',
  description: 'Write and run your own ValeFlow script. Edit the source on the left and click Run.',
  source: '',
};
