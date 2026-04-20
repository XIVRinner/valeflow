import { Injectable, signal } from '@angular/core';
import { compile, Engine, StepResult } from 'flowscript';

export interface DialogueStep {
  kind: 'say' | 'narration' | 'log';
  actor?: string;
  text: string;
}

@Injectable({ providedIn: 'root' })
export class FlowscriptService {
  // Reactive signals consumed by components
  readonly steps   = signal<DialogueStep[]>([]);
  readonly state   = signal<Record<string, unknown>>({});
  readonly done    = signal(false);
  readonly logs    = signal<string[]>([]);

  private engine: Engine | null = null;

  /** Compile + mount a new script, resetting all reactive state. */
  load(source: string): void {
    this.steps.set([]);
    this.logs.set([]);
    this.done.set(false);
    this.state.set({});

    const program = compile(source);
    this.engine = new Engine(program);

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
    if (!this.engine || this.done()) return;

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
    }

    this.refreshState();
  }

  private refreshState(): void {
    if (this.engine) {
      this.state.set({ ...this.engine.getState() });
    }
  }

  /** Reset all reactive state without loading a new script. */
  clear(): void {
    this.steps.set([]);
    this.logs.set([]);
    this.done.set(false);
    this.state.set({});
    this.engine = null;
  }

  private pushLog(msg: string): void {
    this.logs.update(l => [...l, msg]);
  }
}
