import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createSharingRouter } from '../sharing.js';

test('artist HTML uses portrait, escaped title and trusted canonical origin, not Host or cover', async () => {
 const app = express();
 app.use(createSharingRouter({ origin: 'https://mss.example', loadEntity: async () => ({ id: 7, name: 'DJ <&"', location: 'Chicago', profile_picture: '/uploads/portrait.png', cover_photo: '/uploads/cover.png' }), loadIndex: async () => '<html><head><title>MSS</title></head><body><div id="root"></div></body></html>' }));
 const server = app.listen(0, '127.0.0.1');
 await new Promise(r => server.once('listening', r));
 try {
  const res = await fetch(`http://127.0.0.1:${server.address().port}/artists/7`, { headers: { Host: 'evil.example' } });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /property="og:image" content="https:\/\/mss.example\/uploads\/portrait.png"/);
  assert.match(html, /name="twitter:image" content="https:\/\/mss.example\/uploads\/portrait.png"/);
  assert.match(html, /name="twitter:title" content="DJ &lt;&amp;&quot;"/);
  assert.match(html, /property="og:url" content="https:\/\/mss.example\/artists\/7"/);
  assert.match(html, /DJ &lt;&amp;&quot;/);
  assert.doesNotMatch(html, /cover.png|evil.example/);
 } finally { await new Promise(r => server.close(r)); }
});

import { harness } from './harness.js';
test('API mounts the public HTML renderer outside authentication', async () => {
 const { app } = await harness();
 for (const path of ['/', '/artists/:id', '/events/:id']) {
  assert.ok(app.middleware.some(args => args[0]?.stack?.some(layer => layer.route?.path === path)));
 }
});
for (const [name, origin, path, record, expected, image] of [
 ['event flyer', 'https://mss.example', '/events/9', { id:9, title:'Night', flyer:'/uploads/flyer.png', cover_photo:'/uploads/wrong.png', date:'2026-12-01T20:00:00Z', location:'Hall' }, 200, 'https://mss.example/uploads/flyer.png'],
 ['no flyer', 'https://mss.example', '/events/9', { id:9, title:'Night' }, 200, null],
 ['unsafe source', 'https://mss.example', '/events/9', { id:9, title:'Night', flyer:'javascript:alert(1)' }, 200, null],
 ['missing', 'https://mss.example', '/events/9', null, 404, null],
 ['invalid ID', 'https://mss.example', '/artists/9oops', {}, 404, null],
 ['unconfigured', '', '/events/9', {}, 503, null],
 ['origin path', 'https://mss.example/evil', '/events/9', {}, 503, null],
]) test(name, async () => {
 const app=express();app.use(createSharingRouter({origin,loadEntity:async()=>record,loadIndex:async()=>'<html><head></head><body></body></html>'}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try {
  const response=await fetch(`http://127.0.0.1:${server.address().port}${path}`);
  assert.equal(response.status,expected);const html=await response.text();
  if(image) assert.ok(html.includes(`property="og:image" content="${image}"`));
  else assert.ok(!html.includes('property="og:image"'));
  assert.ok(!html.includes('wrong.png'));
 }finally{await new Promise(r=>server.close(r));}
});

test('disabled artist returns a generic 404 SPA shell without profile metadata',async()=>{
 const app=express();app.use(createSharingRouter({origin:'https://mss.example',loadEntity:async()=>({id:1,name:'Hidden artist',is_disabled:true,profile_picture:'/uploads/private.png'}),loadIndex:async()=>'<html><head><title>MSS</title></head><body><div id="root"></div><script src="/assets/app.js"></script></body></html>'}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{const res=await fetch(`http://127.0.0.1:${server.address().port}/artists/1`);assert.equal(res.status,404);assert.equal(res.headers.get('cache-control'),'private, no-store');const html=await res.text();assert.match(html,/assets\/app.js/);assert.match(html, /name="robots" content="noindex"/);assert.doesNotMatch(html,/Hidden artist|private.png|og:|twitter:/);}finally{await new Promise(r=>server.close(r));}
});

test('homepage initial HTML uses the public MSS JPEG logo without entity lookup or Host inference', async () => {
 const app = express();
 app.use(createSharingRouter({ origin: 'https://mss.example', loadEntity: async () => { throw new Error('No homepage DB lookup'); }, loadIndex: async () => '<html><head><title>mss-web</title></head><body><div id="root"></div><script src="/assets/app.js"></script></body></html>' }));
 const server = app.listen(0, '127.0.0.1');
 await new Promise(r => server.once('listening', r));
 try {
  const res = await fetch(`http://127.0.0.1:${server.address().port}/`, { headers: { Host: 'evil.example', 'User-Agent': 'facebookexternalhit/1.1' } });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /property="og:image" content="https:\/\/mss.example\/msslogo.jpg"/);
  assert.match(html, /name="twitter:image" content="https:\/\/mss.example\/msslogo.jpg"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /rel="canonical" href="https:\/\/mss.example\/"/);
  assert.match(html, /<title>Midnight Sound Syndicate<\/title>/);
  assert.match(html, /assets\/app.js/);
  assert.doesNotMatch(html, /evil.example|mss-web/);
 } finally { await new Promise(r => server.close(r)); }
});

for (const profile of [null, '', 'javascript:alert(1)', '//evil.example/pic.png', 'https://user:pass@images.example/p.png', '/uploads/..', '/uploads/%2e%2e', '/uploads/bad.svg', '/uploads/a%2fb.png']) {
 test(`artist missing/unsafe profile uses logo, never cover/gallery: ${profile}`, async () => {
  const app = express();
  app.use(createSharingRouter({ origin: 'https://mss.example', loadEntity: async () => ({ name: 'Artist', profile_picture: profile, cover_photo: '/uploads/cover.png', gallery: ['/uploads/gallery.png'] }), loadIndex: async () => '<html><head><title>MSS</title></head><body><div id="root"></div></body></html>' }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  try {
   const res = await fetch(`http://127.0.0.1:${server.address().port}/artists/7`);
   assert.equal(res.status, 200); const html = await res.text();
   assert.match(html, /property="og:image" content="https:\/\/mss.example\/msslogo.jpg"/);
   assert.match(html, /name="twitter:image" content="https:\/\/mss.example\/msslogo.jpg"/);
   assert.match(html, /property="og:image:alt" content="Midnight Sound Syndicate logo"/);
   assert.doesNotMatch(html, /cover.png|gallery.png|javascript:|user:pass/);
  } finally { await new Promise(r => server.close(r)); }
 });
}

for (const origin of ['', 'http://mss.example', 'https://mss.example/path', 'https://user:pass@mss.example', 'https://mss.example/?q=1', 'https://mss.example/#hash']) {
 test(`homepage fails closed for invalid public origin: ${origin}`, async () => {
  const app = express();
  app.use(createSharingRouter({ origin, loadEntity: async () => { throw new Error('Unexpected lookup'); }, loadIndex: async () => { throw new Error('Unexpected build read'); } }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  try {
   const response = await fetch(`http://127.0.0.1:${server.address().port}/`, { headers: { Host: 'evil.example' } });
   assert.equal(response.status, 503);
   assert.equal(response.headers.get('cache-control'), 'private, no-store');
   assert.doesNotMatch(await response.text(), /evil.example|og:|twitter:/);
  } finally { await new Promise(r => server.close(r)); }
 });
}
for (const path of ['/', '/artists/7', '/events/9']) {
 for (const build of [null, '<html><body>incomplete</body></html>']) {
  test(`missing or malformed build fails closed for ${path}: ${build}`, async () => {
   const app = express();
   app.use(createSharingRouter({ origin: 'https://mss.example', loadEntity: async () => ({ name: 'Artist', title: 'Event' }), loadIndex: async () => { if (build === null) throw new Error('ENOENT'); return build; } }));
   const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
   try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`);
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /ENOENT|og:|twitter:/);
   } finally { await new Promise(r => server.close(r)); }
  });
 }
}
