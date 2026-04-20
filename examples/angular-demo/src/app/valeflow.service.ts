import { Injectable, signal } from '@angular/core';
import { compile, Engine, StepResult } from '@rinner/valeflow';

export interface DialogueStep {
  kind: 'say' | 'narration' | 'log';
  actor?: string;
  text: string;
}

export interface ChoiceOption {
  label: string;
  index: number;
}

export interface ChapterState {
  current: string | null;
  visited: string[];
  completed: string[];
}

const PERSISTENT_STORAGE_KEY = 'valeflow-demo:persistent';

@Injectable({ providedIn: 'root' })
export class ValeflowService {
  // Reactive signals consumed by components
  readonly steps   = signal<DialogueStep[]>([]);
  readonly state   = signal<Record<string, unknown>>({});
  readonly chapters = signal<ChapterState>({ current: null, visited: [], completed: [] });
  readonly persistent = signal<Record<string, unknown>>({});
  readonly done    = signal(false);
  readonly logs    = signal<string[]>([]);
  /** Non-null while the engine is waiting for a choice to be resolved. */
  readonly choice  = signal<ChoiceOption[] | null>(null);

  private engine: Engine | null = null;

  /** Compile + mount a new script, resetting all reactive state. */
  load(source: string): void {
    this.steps.set([]);
    this.logs.set([]);
    this.done.set(false);
    this.state.set({});
    this.chapters.set({ current: null, visited: [], completed: [] });
    this.choice.set(null);

    const program = compile(source);
    this.engine = new Engine(program, { persistent: this.loadPersistent() });

    // Register all built-in hooks
    this.engine.registerFunction('Actor', (_ctx, name) => ({ name }));
    this.engine.registerFunction('log', (_ctx, msg) => this.pushLog(String(msg)));
    this.engine.registerFunction('announce', (_ctx, event) => this.pushLog(`[event] ${event}`));
    this.engine.registerFunction('setTitle', (_ctx, title) => this.pushLog(`[title] ${title}`));

    // Materialise declared variables by stepping through initial silent nodes
    this.refreshState();
  }

  /** Advance one beat. */
  step(): void {
    if (!this.engine || this.done() || this.choice()) return;

    const result: StepResult = this.engine.next();

    if (result.type === 'end') {
      this.done.set(true);
      this.refreshState();
      return;
    }

    if (result.type === 'say') {
      const actor = result.actor as { name: string } | null;
      this.steps.update(s => [
        ...s,
        { kind: 'say', actor: actor?.name ?? '???', text: result.text },
      ]);
    } else if (result.type === 'narration') {
      this.steps.update(s => [
        ...s,
        { kind: 'narration', text: result.text },
      ]);
    } else if (result.type === 'choice') {
      this.choice.set(result.options);
    }

    this.refreshState();
  }

  /** Resolve a pending choice and immediately continue to the next beat. */
  choose(index: number): void {
    if (!this.engine || !this.choice()) return;
    this.engine.choose(index);
    this.choice.set(null);
    this.step();
  }

  private refreshState(): void {
    if (this.engine) {
      this.state.set({ ...this.engine.getState() });
      this.chapters.set({ ...this.engine.getChapterState() });
      this.persistent.set({ ...this.engine.getPersistentState() });
      this.savePersistent();
    }
  }

  /** Reset all reactive state without loading a new script. */
  clear(): void {
    this.steps.set([]);
    this.logs.set([]);
    this.done.set(false);
    this.state.set({});
    this.chapters.set({ current: null, visited: [], completed: [] });
    this.choice.set(null);
    this.engine = null;
  }

  private loadPersistent(): Record<string, unknown> {
    try {
      const raw = localStorage.getItem(PERSISTENT_STORAGE_KEY);
      return raw ? JSON.parse(raw) as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }

  private savePersistent(): void {
    try {
      localStorage.setItem(PERSISTENT_STORAGE_KEY, JSON.stringify(this.persistent()));
    } catch {
      // Ignore storage errors in demo mode.
    }
  }

  private pushLog(msg: string): void {
    this.logs.update(l => [...l, msg]);
  }
}
