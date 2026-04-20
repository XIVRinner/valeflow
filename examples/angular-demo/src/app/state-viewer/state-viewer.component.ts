import { Component, inject } from '@angular/core';
import { ValeflowService } from '../valeflow.service';

@Component({
  selector: 'app-state-viewer',
  imports: [],
  template: `
    <div class="state-panel">
      <h3 class="panel-title">Variables</h3>

      <div class="var-list">
        @for (entry of entries(); track entry.key) {
          <div class="var-row">
            <span class="var-name">{{ entry.key }}</span>
            <span class="var-value" [class]="typeClass(entry.value)">
              {{ display(entry.value) }}
            </span>
          </div>
        } @empty {
          <div class="empty">No variables yet.</div>
        }
      </div>

      <h3 class="panel-title chapter-title">Persistent State</h3>
      <div class="var-list">
        @for (entry of persistentEntries(); track entry.key) {
          <div class="var-row">
            <span class="var-name">{{ entry.key }}</span>
            <span class="var-value" [class]="typeClass(entry.value)">
              {{ display(entry.value) }}
            </span>
          </div>
        } @empty {
          <div class="empty">No persistent values yet.</div>
        }
      </div>

      <h3 class="panel-title chapter-title">Chapter State</h3>
      <div class="chapter-block">
        <div class="chapter-row">
          <span class="chapter-label">Current</span>
          <span class="chapter-value">{{ chapterCurrent() }}</span>
        </div>
        <div class="chapter-list">
          <div class="chapter-list-title">Visited</div>
          @for (chapter of svc.chapters().visited; track chapter) {
            <div class="chapter-pill">{{ chapter }}</div>
          } @empty {
            <div class="empty-inline">None yet.</div>
          }
        </div>
        <div class="chapter-list">
          <div class="chapter-list-title">Completed</div>
          @for (chapter of svc.chapters().completed; track chapter) {
            <div class="chapter-pill chapter-pill-complete">{{ chapter }}</div>
          } @empty {
            <div class="empty-inline">None yet.</div>
          }
        </div>
      </div>

      @if (svc.logs().length > 0) {
        <h3 class="panel-title log-title">Call Log</h3>
        <div class="log-list">
          @for (msg of svc.logs(); track $index) {
            <div class="log-entry">{{ msg }}</div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .state-panel {
      padding: .75rem 1rem;
      height: 100%;
      overflow-y: auto;
    }

    .panel-title {
      font-size: .65rem;
      font-weight: 700;
      letter-spacing: .1em;
      text-transform: uppercase;
      color: var(--text-muted);
      margin: 0 0 .5rem;
    }

    .log-title {
      margin-top: 1.25rem;
    }

    .chapter-title {
      margin-top: 1.25rem;
    }

    .var-list {
      display: flex;
      flex-direction: column;
      gap: .3rem;
    }

    .var-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: .5rem;
      background: var(--surface2);
      border-radius: 5px;
      padding: .3rem .6rem;
      font-size: .82rem;
    }

    .var-name {
      color: var(--text-muted);
      font-family: monospace;
      font-size: .8rem;
    }

    .var-value {
      font-family: monospace;
      font-weight: 600;
    }

    .type-string  { color: #7ec8a0; }
    .type-number  { color: #7ab4e8; }
    .type-boolean { color: #e8b97a; }
    .type-object  { color: #c97adb; }
    .type-null    { color: var(--text-muted); opacity: .5; }

    .log-list {
      display: flex;
      flex-direction: column;
      gap: .2rem;
    }

    .log-entry {
      font-family: monospace;
      font-size: .75rem;
      color: var(--accent-dim);
      background: var(--surface2);
      border-radius: 4px;
      padding: .25rem .5rem;
    }

    .empty {
      font-size: .8rem;
      color: var(--text-muted);
      opacity: .4;
      padding: .5rem;
    }

    .chapter-block {
      display: flex;
      flex-direction: column;
      gap: .5rem;
    }

    .chapter-row {
      display: flex;
      justify-content: space-between;
      gap: .5rem;
      background: var(--surface2);
      border-radius: 5px;
      padding: .3rem .6rem;
      font-size: .8rem;
    }

    .chapter-label {
      color: var(--text-muted);
      font-family: monospace;
    }

    .chapter-value {
      font-family: monospace;
      font-weight: 600;
      color: var(--accent);
      text-align: right;
      word-break: break-all;
    }

    .chapter-list {
      display: flex;
      flex-wrap: wrap;
      gap: .35rem;
      align-items: center;
      background: var(--surface2);
      border-radius: 5px;
      padding: .35rem .5rem;
    }

    .chapter-list-title {
      width: 100%;
      font-size: .68rem;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: var(--text-muted);
      opacity: .8;
      margin-bottom: .1rem;
    }

    .chapter-pill {
      font-family: monospace;
      font-size: .72rem;
      background: rgba(126, 200, 160, .12);
      color: #7ec8a0;
      border: 1px solid rgba(126, 200, 160, .18);
      border-radius: 999px;
      padding: .15rem .45rem;
    }

    .chapter-pill-complete {
      background: rgba(122, 180, 232, .12);
      color: #7ab4e8;
      border-color: rgba(122, 180, 232, .2);
    }

    .empty-inline {
      font-size: .76rem;
      color: var(--text-muted);
      opacity: .45;
      padding: .1rem 0;
    }
  `],
})
export class StateViewerComponent {
  protected readonly svc = inject(ValeflowService);

  entries() {
    return Object.entries(this.svc.state()).map(([key, value]) => ({ key, value }));
  }

  persistentEntries() {
    return Object.entries(this.svc.persistent()).map(([key, value]) => ({ key, value }));
  }

  chapterCurrent(): string {
    return this.svc.chapters().current ?? 'None';
  }

  display(value: unknown): string {
    if (value === null) return 'null';
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      return obj['name'] ? `Actor("${obj['name']}")` : JSON.stringify(value);
    }
    if (typeof value === 'string') return `"${value}"`;
    return String(value);
  }

  typeClass(value: unknown): string {
    if (value === null) return 'type-null';
    if (typeof value === 'string')  return 'type-string';
    if (typeof value === 'number')  return 'type-number';
    if (typeof value === 'boolean') return 'type-boolean';
    return 'type-object';
  }
}
