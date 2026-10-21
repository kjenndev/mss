import test from 'node:test';
import assert from 'node:assert/strict';
import { artistCommentMessage } from '../artist-comment-email.js';

test('artist comment email matches the MSS transactional design and escapes every dynamic HTML value', () => {
  const message = artistCommentMessage({
    artist: { id: 9, name: `DJ <Night> & "Day"` },
    comment: { author_name: `A <script>alert('x')</script> & B`, content: `Nice <img src=x onerror="bad"> & 'loud'` },
    origin: 'https://example.com',
  });

  assert.equal(message.subject, 'New comment on DJ <Night> & "Day"');
  assert.equal(message.reply_to, 'support@midnightsoundsyndicate.com');
  assert.match(message.html, /background-color:#111111/);
  assert.match(message.html, /#90caf9/);
  assert.match(message.html, /font-family:Arial,Helvetica,sans-serif/);
  assert.match(message.html, /role="presentation"/);
  assert.match(message.html, /DJ &lt;Night&gt; &amp; &quot;Day&quot;/);
  assert.match(message.html, /A &lt;script&gt;alert\(&#39;x&#39;\)&lt;\/script&gt; &amp; B/);
  assert.match(message.html, /Nice &lt;img src=x onerror=&quot;bad&quot;&gt; &amp; &#39;loud&#39;/);
  assert.doesNotMatch(message.html, /<script|<img/i);
  assert.equal((message.html.match(/>View artist profile<\/a>/g) || []).length, 1, 'one action button');
  assert.match(message.html, /href="https:\/\/example\.com\/artists\/9"/);
  assert.match(message.html, /word-break:break-all/);
  assert.match(message.text, /New comment on DJ <Night> & "Day"/);
  assert.match(message.text, /A <script>alert\('x'\)<\/script> & B/);
  assert.match(message.text, /Nice <img src=x onerror="bad"> & 'loud'/);
  assert.match(message.text, /https:\/\/example\.com\/artists\/9/);
});

test('artist comment email rejects an unsafe configured origin', () => {
  assert.throws(() => artistCommentMessage({
    artist: { id: 1, name: 'Artist' },
    comment: { author_name: 'Person', content: 'Hello' },
    origin: 'javascript:alert(1)',
  }), /Invalid artist comment URL/);
});
