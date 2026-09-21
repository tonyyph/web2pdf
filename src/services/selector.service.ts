/**
 * "Select elements to remove" mode.
 *
 * Renders a highlight overlay plus a small toolbar inside the page. All
 * listeners, overlay nodes and injected styles are torn down by `exit()`,
 * which is also wired to page unload, so nothing outlives the session.
 */

import { OVERLAY_ATTR } from './prepare.service';

const STYLE_ID = 'web2pdf-selector-style';
const ROOT_ID = 'web2pdf-selector-root';

export interface SelectionCallbacks {
  onChange: (selectors: string[]) => void;
  onExit: () => void;
}

interface SelectorSession {
  root: HTMLDivElement;
  style: HTMLStyleElement;
  highlight: HTMLDivElement;
  toolbar: HTMLDivElement;
  counter: HTMLSpanElement;
  selected: Map<string, HTMLElement>;
  dispose: Array<() => void>;
}

let active: SelectorSession | null = null;

/** Only these characters are emitted into a generated selector. */
const SAFE_IDENT = /^[A-Za-z_][\w-]*$/;

function escapeIdent(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/[^\w-]/g, '\\$&');
}

/**
 * Build a stable, unique CSS selector for an element.
 * Prefers an id, then a class path, then structural `:nth-of-type` steps.
 */
export function buildSelector(element: Element, root: Document | Element = document): string {
  if (element.id && SAFE_IDENT.test(element.id)) {
    const candidate = `#${escapeIdent(element.id)}`;
    if (root.querySelectorAll(candidate).length === 1) return candidate;
  }

  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 8) {
    const tag = current.tagName.toLowerCase();
    if (tag === 'html' || tag === 'body') {
      parts.unshift(tag);
      break;
    }

    let part = tag;

    if (current.id && SAFE_IDENT.test(current.id)) {
      part = `${tag}#${escapeIdent(current.id)}`;
      parts.unshift(part);
      break;
    }

    const classes = [...current.classList]
      .filter((name) => SAFE_IDENT.test(name))
      .slice(0, 2)
      .map((name) => `.${escapeIdent(name)}`)
      .join('');
    if (classes) part += classes;

    const parent: Element | null = current.parentElement;
    if (parent) {
      const siblings = [...parent.children].filter((child) => child.tagName === current!.tagName);
      if (siblings.length > 1) {
        part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      }
    }

    parts.unshift(part);
    current = parent;
  }

  return parts.join(' > ');
}

function injectStyles(): HTMLStyleElement {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.setAttribute(OVERLAY_ATTR, 'style');
  style.textContent = `
    #${ROOT_ID} { all: initial; }
    #${ROOT_ID} .w2p-highlight {
      position: fixed; pointer-events: none; z-index: 2147483646;
      border: 2px solid #6366f1; background: rgba(99, 102, 241, 0.18);
      border-radius: 4px; transition: all 90ms ease-out; display: none;
    }
    #${ROOT_ID} .w2p-marked {
      outline: 2px dashed #ef4444 !important;
      outline-offset: 2px !important;
      opacity: 0.4 !important;
    }
    #${ROOT_ID} .w2p-toolbar {
      position: fixed; z-index: 2147483647; left: 50%; bottom: 24px;
      transform: translateX(-50%); display: flex; align-items: center; gap: 8px;
      padding: 10px 12px; border-radius: 12px;
      background: #111827; color: #f9fafb; box-shadow: 0 10px 30px rgba(0,0,0,0.35);
      font: 500 13px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    #${ROOT_ID} .w2p-toolbar button {
      font: inherit; cursor: pointer; border: 1px solid rgba(255,255,255,0.18);
      background: rgba(255,255,255,0.08); color: inherit;
      padding: 6px 10px; border-radius: 8px;
    }
    #${ROOT_ID} .w2p-toolbar button:hover { background: rgba(255,255,255,0.18); }
    #${ROOT_ID} .w2p-toolbar button.w2p-primary { background: #6366f1; border-color: #6366f1; }
    #${ROOT_ID} .w2p-count { opacity: 0.85; }
  `;
  document.documentElement.appendChild(style);
  return style;
}

function markElement(element: HTMLElement): void {
  element.classList.add('w2p-marked');
}

function unmarkElement(element: HTMLElement): void {
  element.classList.remove('w2p-marked');
}

export function isSelectionActive(): boolean {
  return active !== null;
}

export function getSelectedSelectors(): string[] {
  return active ? [...active.selected.keys()] : [];
}

export function enterSelectionMode(
  callbacks: SelectionCallbacks,
  initialSelectors: readonly string[] = [],
): void {
  if (active) return;

  const style = injectStyles();

  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.setAttribute(OVERLAY_ATTR, 'root');

  const highlight = document.createElement('div');
  highlight.className = 'w2p-highlight';

  const toolbar = document.createElement('div');
  toolbar.className = 'w2p-toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Web2PDF element selection');

  const counter = document.createElement('span');
  counter.className = 'w2p-count';

  const undoButton = createButton('Undo last');
  const resetButton = createButton('Reset');
  const doneButton = createButton('Done', true);

  toolbar.append(counter, undoButton, resetButton, doneButton);
  root.append(highlight, toolbar);
  document.documentElement.appendChild(root);

  const selected = new Map<string, HTMLElement>();
  for (const selector of initialSelectors) {
    try {
      const element = document.querySelector<HTMLElement>(selector);
      if (element) {
        selected.set(selector, element);
        markElement(element);
      }
    } catch {
      // A stale selector from a previous page state: ignore it.
    }
  }

  const session: SelectorSession = {
    root,
    style,
    highlight,
    toolbar,
    counter,
    selected,
    dispose: [],
  };
  active = session;

  const updateCounter = (): void => {
    const count = session.selected.size;
    counter.textContent = count === 1 ? '1 element selected' : `${count} elements selected`;
    callbacks.onChange([...session.selected.keys()]);
  };

  const isOwnUi = (target: EventTarget | null): boolean =>
    target instanceof Element && (target.closest(`#${ROOT_ID}`) !== null || target.id === ROOT_ID);

  const onPointerMove = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || isOwnUi(target)) {
      highlight.style.display = 'none';
      return;
    }
    const rect = target.getBoundingClientRect();
    highlight.style.display = 'block';
    highlight.style.top = `${rect.top}px`;
    highlight.style.left = `${rect.left}px`;
    highlight.style.width = `${rect.width}px`;
    highlight.style.height = `${rect.height}px`;
  };

  const onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || isOwnUi(target)) return;
    if (target === document.body || target === document.documentElement) return;

    event.preventDefault();
    event.stopPropagation();

    const selector = buildSelector(target);
    if (selector === '') return;

    if (session.selected.has(selector)) {
      unmarkElement(target);
      session.selected.delete(selector);
    } else {
      markElement(target);
      session.selected.set(selector, target);
    }
    updateCounter();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      exitSelectionMode();
      callbacks.onExit();
    }
  };

  const undo = (): void => {
    const keys = [...session.selected.keys()];
    const last = keys[keys.length - 1];
    if (last === undefined) return;
    const element = session.selected.get(last);
    if (element) unmarkElement(element);
    session.selected.delete(last);
    updateCounter();
  };

  const reset = (): void => {
    for (const element of session.selected.values()) unmarkElement(element);
    session.selected.clear();
    updateCounter();
  };

  const done = (): void => {
    exitSelectionMode();
    callbacks.onExit();
  };

  document.addEventListener('mousemove', onPointerMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('pagehide', done, { once: true });
  undoButton.addEventListener('click', undo);
  resetButton.addEventListener('click', reset);
  doneButton.addEventListener('click', done);

  session.dispose.push(
    () => document.removeEventListener('mousemove', onPointerMove, true),
    () => document.removeEventListener('click', onClick, true),
    () => document.removeEventListener('keydown', onKeyDown, true),
    () => window.removeEventListener('pagehide', done),
    () => undoButton.removeEventListener('click', undo),
    () => resetButton.removeEventListener('click', reset),
    () => doneButton.removeEventListener('click', done),
  );

  updateCounter();
}

export function exitSelectionMode(): void {
  const session = active;
  if (!session) return;
  active = null;

  for (const dispose of session.dispose) dispose();
  for (const element of session.selected.values()) unmarkElement(element);

  session.root.remove();
  session.style.remove();
  document.getElementById(STYLE_ID)?.remove();
  document.getElementById(ROOT_ID)?.remove();
}

function createButton(label: string, primary = false): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  if (primary) button.classList.add('w2p-primary');
  return button;
}
