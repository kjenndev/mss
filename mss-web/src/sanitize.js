import DOMPurify from 'dompurify';

export function sanitizeRichText(content) {
  const fragment = DOMPurify.sanitize(content || '', {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'blockquote', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'a', 'pre', 'code', 'span', 'img', 'div'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'data-list', 'data-language'],
    ALLOW_DATA_ATTR: false,
    RETURN_DOM_FRAGMENT: true,
  });
  // Quill 2 uses ol/li[data-list] for BOTH list types and divs for code.
  // Keep only its inert structural metadata, never arbitrary data/classes.
  for (const element of fragment.querySelectorAll('*')) {
    const tag = element.tagName.toLowerCase();
    const allowedClasses = tag === 'div' ? ['ql-code-block', 'ql-code-block-container'] : tag === 'span' ? ['ql-ui'] : [];
    const classes = [...element.classList].filter(value => allowedClasses.includes(value));
    if (classes.length) element.setAttribute('class', classes.join(' '));
    else element.removeAttribute('class');
    if (tag !== 'li' || !['bullet', 'ordered'].includes(element.getAttribute('data-list'))) element.removeAttribute('data-list');
    if (tag !== 'div' || !element.classList.contains('ql-code-block') || !/^[a-zA-Z0-9_-]{1,40}$/.test(element.getAttribute('data-language') || '')) element.removeAttribute('data-language');
    if (tag === 'div' && !classes.length) element.replaceWith(...element.childNodes);
  }
  const wrapper = document.createElement('div');
  wrapper.append(fragment);
  return wrapper.innerHTML;
}
