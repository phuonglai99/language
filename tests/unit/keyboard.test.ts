import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldIgnorePageShortcut } from '../../src/lib/keyboard';

test('page shortcuts respect controls, focus, handled events and IME', () => {
  const originalElement = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement');
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  class Element {
    constructor(public selector = '', public isContentEditable = false, public parent: Element | null = null) {}
    closest(selectors: string): Element | null {
      return selectors.split(', ').includes(this.selector) ? this : this.parent?.closest(selectors) ?? null;
    }
  }
  const doc = { activeElement: new Element('body') };
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: Element });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
  const event = (target: Element, overrides = {}) => ({
    defaultPrevented: false, isComposing: false, keyCode: 32,
    composedPath: () => [target], ...overrides,
  }) as unknown as KeyboardEvent;
  try {
    const body = new Element('body');
    assert.equal(shouldIgnorePageShortcut(event(body)), false, 'shortcuts work outside controls');
    for (const selector of ['input', 'textarea', 'select', 'button', 'a[href]', '[role="textbox"]', '[role="dialog"]']) {
      assert.equal(shouldIgnorePageShortcut(event(new Element(selector))), true, selector);
    }
    assert.equal(shouldIgnorePageShortcut(event(new Element('span', false, new Element('button')))), true);
    assert.equal(shouldIgnorePageShortcut(event(new Element('div', true))), true);
    assert.equal(shouldIgnorePageShortcut(event(body, { isComposing: true })), true);
    assert.equal(shouldIgnorePageShortcut(event(body, { keyCode: 229 })), true);
    assert.equal(shouldIgnorePageShortcut(event(body, { defaultPrevented: true })), true);
    doc.activeElement = new Element('input');
    assert.equal(shouldIgnorePageShortcut(event(body)), true, 'active search input also protects retargeted events');
  } finally {
    if (originalElement) Object.defineProperty(globalThis, 'HTMLElement', originalElement);
    else Reflect.deleteProperty(globalThis, 'HTMLElement');
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
