import { Component, Input, OnChanges } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { compile, serializeTree, SerializedProgram, SerializedNode } from 'flowscript';

@Component({
  selector: 'app-tree-viewer',
  imports: [NgTemplateOutlet],
  template: `
    <div class="tree-wrap">
      @if (error) {
        <div class="tree-error">⚠ {{ error }}</div>
      } @else if (tree) {
        <!-- Declarations -->
        @if (tree.declarations.length > 0) {
          <div class="section-heading">Declarations</div>
          @for (d of tree.declarations; track d.name) {
            <div class="row row-declare">
              <span class="tag tag-declare">declare{{ d.global ? ' global' : '' }}</span>
              <span class="var-name">{{ d.name }}</span>
              <span class="equals">=</span>
              <span class="val">{{ d.value }}</span>
            </div>
          }
        }

        <!-- Chapters -->
        @for (ch of tree.chapters; track ch.name) {
          <details class="chapter" open>
            <summary class="chapter-head">
              <span class="tag tag-chapter">chapter</span>
              <span class="chapter-name">{{ ch.name }}</span>
              <span class="node-count">({{ ch.nodes.length }} node{{ ch.nodes.length !== 1 ? 's' : '' }})</span>
            </summary>
            <div class="chapter-body">
              <ng-container
                *ngTemplateOutlet="nodeList; context: { $implicit: ch.nodes }"
              ></ng-container>
            </div>
          </details>
        }

        <!-- Raw JSON toggle -->
        <details class="json-block">
          <summary class="json-toggle">&#123;&#125; Raw JSON</summary>
          <pre class="json-pre">{{ rawJson }}</pre>
        </details>
      }
    </div>

    <!-- Recursive node list — uses ng-template since Angular doesn't support recursion otherwise -->
    <ng-template #nodeList let-nodes>
      @for (n of nodes; track $index) {
        @switch (n.type) {
          @case ('say') {
            <div class="row row-say">
              <span class="tag tag-say">say</span>
              <span class="actor">{{ n.actor }}</span>
              <span class="text-val">"{{ n.text }}"</span>
            </div>
          }
          @case ('narration') {
            <div class="row row-narration">
              <span class="tag tag-narration">narration</span>
              <span class="text-val">"{{ n.text }}"</span>
            </div>
          }
          @case ('goto') {
            <div class="row row-goto">
              <span class="tag tag-goto">goto</span>
              <span class="target">{{ n.target }}</span>
            </div>
          }
          @case ('set') {
            <div class="row row-set">
              <span class="tag tag-set">set</span>
              <span class="var-name">{{ n.name }}</span>
              <span class="equals">=</span>
              <span class="val">{{ n.value }}</span>
            </div>
          }
          @case ('call') {
            <div class="row row-call">
              <span class="tag tag-call">call</span>
              <span class="fn-name">{{ n.name }}({{ n.args.join(', ') }})</span>
            </div>
          }
          @case ('declare') {
            <div class="row row-declare">
              <span class="tag tag-declare">declare</span>
              <span class="var-name">{{ n.name }}</span>
              <span class="equals">=</span>
              <span class="val">{{ n.value }}</span>
            </div>
          }
          @case ('if') {
            <details class="nested-block" open>
              <summary class="nested-head">
                <span class="tag tag-if">if</span>
                <span class="node-count">({{ n.branches.length }} branch{{ n.branches.length !== 1 ? 'es' : '' }})</span>
              </summary>
              <div class="nested-body">
                @for (b of n.branches; track $index) {
                  <div class="branch">
                    <div class="branch-cond">
                      <span class="tag tag-cond">{{ b.condition ?? 'else' }}</span>
                    </div>
                    <div class="branch-nodes">
                      <ng-container
                        *ngTemplateOutlet="nodeList; context: { $implicit: b.nodes }"
                      ></ng-container>
                    </div>
                  </div>
                }
              </div>
            </details>
          }
          @case ('choice') {
            <details class="nested-block" open>
              <summary class="nested-head">
                <span class="tag tag-choice">choice</span>
                <span class="node-count">({{ n.options.length }} option{{ n.options.length !== 1 ? 's' : '' }})</span>
              </summary>
              <div class="nested-body">
                @for (o of n.options; track $index) {
                  <div class="branch">
                    <div class="branch-cond">
                      <span class="tag tag-option">→ "{{ o.label }}"</span>
                    </div>
                    <div class="branch-nodes">
                      <ng-container
                        *ngTemplateOutlet="nodeList; context: { $implicit: o.nodes }"
                      ></ng-container>
                    </div>
                  </div>
                }
              </div>
            </details>
          }
        }
      }
    </ng-template>
  `,
  styles: [`
    :host { display: block; height: 100%; }

    .tree-wrap {
      height: 100%;
      overflow-y: auto;
      padding: .75rem 1rem;
      display: flex;
      flex-direction: column;
      gap: .35rem;
      font-size: .78rem;
    }

    .tree-error {
      color: #f87171;
      padding: 1rem;
      font-size: .85rem;
    }

    /* ── Section heading ──────────────────── */

    .section-heading {
      font-size: .65rem;
      font-weight: 700;
      letter-spacing: .1em;
      text-transform: uppercase;
      color: var(--text-muted);
      margin-top: .5rem;
      margin-bottom: .2rem;
    }

    /* ── Tags ─────────────────────────────── */

    .tag {
      display: inline-block;
      padding: .1rem .42rem;
      border-radius: 4px;
      font-size: .68rem;
      font-weight: 700;
      letter-spacing: .04em;
      text-transform: uppercase;
      flex-shrink: 0;
      font-family: monospace;
    }

    .tag-chapter  { background: #1e3a5f; color: #7ecfff; }
    .tag-say      { background: #1a3a26; color: #6ee7b7; }
    .tag-narration{ background: #2a2a1a; color: #c9a84c; }
    .tag-goto     { background: #2a1a2a; color: #c57fd6; }
    .tag-set      { background: #2a2015; color: #e09050; }
    .tag-call     { background: #152030; color: #6bbde4; }
    .tag-declare  { background: #1e1e1e; color: #9ca3af; }
    .tag-if       { background: #1e1a2e; color: #a78bfa; }
    .tag-cond     { background: var(--surface2); color: var(--text-muted); font-size: .7rem; padding: .08rem .35rem; }
    .tag-choice   { background: #1a2a1a; color: #86efac; }
    .tag-option   { background: var(--surface2); color: #86efac; font-size: .72rem; padding: .08rem .35rem; white-space: nowrap; }

    /* ── Rows ─────────────────────────────── */

    .row {
      display: flex;
      align-items: baseline;
      gap: .45rem;
      padding: .2rem .3rem;
      border-radius: 4px;
    }

    .row:hover { background: var(--surface2); }

    .actor    { font-weight: 700; color: var(--accent); }
    .target   { color: #c57fd6; font-weight: 600; }
    .fn-name  { color: #6bbde4; font-family: monospace; }
    .var-name { color: #e09050; }
    .val      { color: var(--text-code); font-family: monospace; }
    .equals   { color: var(--text-muted); }
    .text-val { color: var(--text); }

    /* ── Nested blocks (if, choice) ───────── */

    .nested-block, .chapter {
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
    }

    .nested-head, .chapter-head {
      cursor: pointer;
      padding: .3rem .6rem;
      background: var(--surface2);
      display: flex;
      align-items: center;
      gap: .45rem;
      list-style: none;
      user-select: none;
    }

    .nested-head:hover, .chapter-head:hover {
      background: var(--surface);
    }

    .chapter-name {
      font-weight: 700;
      color: #7ecfff;
    }

    .node-count {
      font-size: .68rem;
      color: var(--text-muted);
    }

    .nested-body, .chapter-body {
      padding: .4rem .5rem .4rem 1.2rem;
      display: flex;
      flex-direction: column;
      gap: .25rem;
      border-top: 1px solid var(--border);
    }

    .branch {
      border-left: 2px solid var(--border);
      padding-left: .5rem;
      margin: .15rem 0;
      display: flex;
      flex-direction: column;
      gap: .2rem;
    }

    .branch-cond { margin-bottom: .15rem; }

    .branch-nodes {
      display: flex;
      flex-direction: column;
      gap: .2rem;
    }

    /* ── Raw JSON ─────────────────────────── */

    .json-block {
      margin-top: .5rem;
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
    }

    .json-toggle {
      cursor: pointer;
      padding: .3rem .7rem;
      background: var(--surface2);
      font-size: .7rem;
      font-weight: 700;
      letter-spacing: .07em;
      color: var(--text-muted);
      list-style: none;
      user-select: none;
    }

    .json-toggle:hover { color: var(--text); }

    .json-pre {
      margin: 0;
      padding: .75rem 1rem;
      font-family: monospace;
      font-size: .73rem;
      line-height: 1.55;
      color: var(--text-code);
      overflow-x: auto;
      white-space: pre;
    }
  `],
})
export class TreeViewerComponent implements OnChanges {
  @Input() source = '';

  protected tree: SerializedProgram | null = null;
  protected rawJson = '';
  protected error: string | null = null;

  ngOnChanges(): void {
    try {
      this.error = null;
      const program = compile(this.source);
      this.tree = serializeTree(program);
      this.rawJson = JSON.stringify(this.tree, null, 2);
    } catch (e: any) {
      this.error = e?.message ?? 'Parse error';
      this.tree = null;
      this.rawJson = '';
    }
  }
}
