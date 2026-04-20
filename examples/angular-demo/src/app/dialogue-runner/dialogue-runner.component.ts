import { Component, inject, input } from '@angular/core';
import { FlowscriptService } from '../flowscript.service';

@Component({
  selector: 'app-dialogue-runner',
  imports: [],
  template: `
    <div class="runner">
      <div class="history" #history>
        @for (step of svc.steps(); track $index) {
          @if (step.kind === 'say') {
            <div class="bubble-row">
              <span class="actor-tag">{{ step.actor }}</span>
              <div class="bubble say">{{ step.text }}</div>
            </div>
          } @else {
            <div class="narration">
              <span class="narration-icon">✦</span>
              {{ step.text }}
            </div>
          }
        }

        @if (svc.done()) {
          <div class="end-marker">— end of script —</div>
        }

        @if (svc.steps().length === 0 && !svc.done() && !svc.choice()) {
          <div class="placeholder">Press <strong>Next</strong> to start the dialogue.</div>
        }
      </div>

      <!-- Choice buttons (shown instead of Next when waiting for a pick) -->
      @if (svc.choice(); as options) {
        <div class="choice-panel">
          <div class="choice-label">Choose a path:</div>
          @for (opt of options; track opt.index) {
            <button class="btn-choice" (click)="svc.choose(opt.index)">
              → {{ opt.label }}
            </button>
          }
        </div>
      } @else {
        <div class="controls">
          <button
            class="btn-next"
            (click)="svc.step()"
            [disabled]="svc.done()"
          >
            {{ svc.done() ? 'Done' : 'Next ▶' }}
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .runner {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .history {
      flex: 1;
      overflow-y: auto;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: .75rem;
    }

    .bubble-row {
      display: flex;
      flex-direction: column;
      gap: .2rem;
    }

    .actor-tag {
      font-size: .7rem;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: var(--accent);
      padding-left: .25rem;
    }

    .bubble {
      background: var(--surface2);
      border-left: 3px solid var(--accent);
      border-radius: 0 8px 8px 8px;
      padding: .6rem .85rem;
      max-width: 80%;
      line-height: 1.5;
      animation: fade-in .2s ease;
    }

    .narration {
      display: flex;
      align-items: baseline;
      gap: .5rem;
      color: var(--text-muted);
      font-style: italic;
      font-size: .9rem;
      padding: .2rem .5rem;
      animation: fade-in .2s ease;
    }

    .narration-icon {
      font-style: normal;
      font-size: .7rem;
      color: var(--accent-dim);
      flex-shrink: 0;
    }

    .end-marker {
      text-align: center;
      color: var(--text-muted);
      font-size: .8rem;
      padding: .5rem;
      opacity: .6;
      border-top: 1px solid var(--border);
    }

    .placeholder {
      text-align: center;
      color: var(--text-muted);
      opacity: .5;
      padding: 2rem;
      font-size: .9rem;
    }

    .controls {
      padding: .75rem 1rem;
      display: flex;
      justify-content: flex-end;
      border-top: 1px solid var(--border);
    }

    .btn-next {
      background: var(--accent);
      color: #000;
      border: none;
      border-radius: 6px;
      padding: .5rem 1.5rem;
      font-weight: 700;
      font-size: .95rem;
      cursor: pointer;
      transition: opacity .15s;
    }

    .btn-next:disabled {
      opacity: .35;
      cursor: default;
    }

    .btn-next:not(:disabled):hover {
      opacity: .85;
    }

    /* ── Choice panel ─────────────────────────── */

    .choice-panel {
      padding: .75rem 1rem;
      border-top: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      gap: .4rem;
    }

    .choice-label {
      font-size: .7rem;
      font-weight: 700;
      letter-spacing: .1em;
      text-transform: uppercase;
      color: var(--text-muted);
      margin-bottom: .2rem;
    }

    .btn-choice {
      background: var(--surface2);
      border: 1px solid var(--border);
      color: var(--text);
      border-radius: 6px;
      padding: .5rem .85rem;
      font-size: .88rem;
      text-align: left;
      cursor: pointer;
      transition: border-color .15s, background .15s;
      animation: fade-in .15s ease;
    }

    .btn-choice:hover {
      border-color: var(--accent);
      background: var(--surface);
      color: var(--accent);
    }

    @keyframes fade-in {
      from { opacity: 0; transform: translateY(4px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `],
})
export class DialogueRunnerComponent {
  protected readonly svc = inject(FlowscriptService);
}
