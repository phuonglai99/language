/** Page shortcuts must not steal keyboard events from focused controls or IME. */
export function shouldIgnorePageShortcut(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return true;
  const selector = 'input, textarea, select, button, a[href], [role="button"], [role="textbox"], [role="combobox"], [role="slider"], [role="dialog"], dialog';
  const ownsKeyboard = (target: EventTarget | null) => target instanceof HTMLElement
    && (target.isContentEditable || target.closest(selector) !== null);
  return event.composedPath().some(ownsKeyboard) || ownsKeyboard(document.activeElement);
}
