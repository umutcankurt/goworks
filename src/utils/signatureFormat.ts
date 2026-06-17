/**
 * Pure helpers for the signature editor's formatting toolbar.
 *
 * The editor stays a plain `<textarea>` (full WYSIWYG would break the
 * table + inline-CSS + token structure). Formatting buttons simply wrap the
 * current selection with an inline HTML tag — `applyWrap` computes the new
 * text and where the caret/selection should land afterwards, so the React
 * component only deals with the DOM side-effects.
 */

export interface WrapResult {
  /** The new textarea value after wrapping. */
  value: string;
  /** Caret/selection start to restore after the change. */
  selectionStart: number;
  /** Caret/selection end to restore after the change. */
  selectionEnd: number;
}

/**
 * Wraps the `[start, end)` slice of `value` with `before`/`after`.
 *
 * - With a real selection: the selection is wrapped and the caret is placed
 *   right after the wrapped block.
 * - With no selection but a `placeholder`: the placeholder is inserted between
 *   the tags and returned as the new selection, so the user can type over it.
 * - With no selection and no placeholder: empty tags are inserted and the caret
 *   is placed between them.
 */
export function applyWrap(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string,
  placeholder = '',
): WrapResult {
  const hadSelection = end > start;
  const inner = hadSelection ? value.substring(start, end) : placeholder;
  const wrapped = `${before}${inner}${after}`;
  const newValue = value.substring(0, start) + wrapped + value.substring(end);

  let selectionStart: number;
  let selectionEnd: number;
  if (hadSelection) {
    selectionStart = selectionEnd = start + wrapped.length;
  } else if (placeholder) {
    selectionStart = start + before.length;
    selectionEnd = start + before.length + placeholder.length;
  } else {
    selectionStart = selectionEnd = start + before.length;
  }

  return { value: newValue, selectionStart, selectionEnd };
}
