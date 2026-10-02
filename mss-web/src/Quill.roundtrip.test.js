import { it, expect } from 'vitest';
import Quill from 'quill';
import { sanitizeRichText } from './sanitize';

it.each([
  ['header', 1], ['header', 2], ['header', 3], ['bold', true],
  ['italic', true], ['underline', true], ['strike', true], ['blockquote', true],
  ['list', 'ordered'], ['list', 'bullet'], ['code-block', 'plain'],
  ['link', 'https://example.org/music'],
])('real Quill preserves toolbar %s=%s through sanitized HTML', (format, value) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  try {
    const editor = new Quill(host);
    const block = ['header', 'blockquote', 'list', 'code-block'].includes(format);
    editor.setContents(block
      ? [{ insert: 'Music' }, { insert: '\n', attributes: { [format]: value } }]
      : [{ insert: 'Music', attributes: { [format]: value } }, { insert: '\n' }]);
    const clean = sanitizeRichText(editor.root.innerHTML);
    const delta = editor.clipboard.convert({ html: clean });
    expect(delta.ops.some(op => op.attributes?.[format] === value)).toBe(true);
    expect(sanitizeRichText(clean)).toBe(clean);
  } finally { host.remove(); }
});

it('Quill metadata cannot carry active HTML or arbitrary attributes', () => {
  const clean = sanitizeRichText(`<div class="ql-code-block-container evil" style="position:fixed" onclick="bad()"><div class="ql-code-block" data-language="plain" data-evil="x">safe</div></div><ol><li data-list="bullet" onmouseover="bad()">list</li><li data-list="evil">invalid</li></ol><p data-list="bullet" class="evil">text</p><a href="javascript:alert(1)">bad</a><img src="x" onerror="bad()"><iframe src="https://evil.test"></iframe><svg onload="bad()"></svg><script>bad()</script>`);
  const host = document.createElement('div'); host.innerHTML = clean;
  expect(host.querySelector('script,iframe,svg,[style],[onclick],[onmouseover],[onerror],[data-evil],[href^="javascript:"],.evil')).toBeNull();
  expect(host.querySelector('li[data-list="bullet"]')).not.toBeNull();
  expect(host.querySelector('p[data-list],li[data-list="evil"]')).toBeNull();
  expect(host.querySelector('.ql-code-block[data-language="plain"]')).not.toBeNull();
});
