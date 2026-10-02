import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, response } from './harness.js';
import { memoryDb } from './memory-db.js';
import { createMediaLibrary } from '../media-library.js';

test('media-library route queries every artist, leaves feed compatible and rejects invalid pagination', async () => {
  const artists = Array.from({ length: 75 }, (_, i) => ({ id: i+1, name: `Artist ${i}`, soundcloud: 'artist' }));
  const db = memoryDb({ artists });
  const library = createMediaLibrary({ env: {}, fetchImpl: () => { throw Error('no HTTP needed'); } });
  let received;
  const h = await harness({ getDb: async () => db, getMediaLibrary: async (rows, paging) => { received = rows; return library.get(rows, paging); } });
  assert.ok(h.route('get', '/api/feed'));
  const route = h.route('get', '/api/media-library');
  assert.ok(route, 'register a dedicated media-library route');
  const res = response();
  await route.handlers.at(-1)({ query: { limit: '20', offset: '0' } }, res, error => { throw error; });
  assert.equal(received.length, 75);
  assert.equal(res.body.sources.length, 75);
  assert.equal(res.body.complete, false);
  assert.equal(res.body.limit, 20);
  for (const query of [{limit:'201'}, {offset:'-1'}, {limit:'x'}, {limit:['1','2']}, {offset:'1.2'}, {limit:'0'}]) {
    const bad = response();
    await route.handlers.at(-1)({ query }, bad, error => { throw error; });
    assert.equal(bad.code, 400);
  }
});

test('artist scope filters source associations before pagination and reuses the shared cache', async () => {
  const artists = [{id:1,name:'One',mixcloud:'shared'}, {id:2,name:'Two',mixcloud:'shared'}, {id:3,name:'Other',soundcloud:'other',mixcloud:'other'}];
  let calls=0;
  const library=createMediaLibrary({env:{},fetchImpl:async url=>{calls++;return new Response(JSON.stringify({data:url.includes('/other/') ? [{key:'/other/newest/',name:'Unrelated',created_time:'2026-02-01'}] : [
    {key:'/shared/new/',name:'New',created_time:'2026-01-02'},
    {key:'/shared/old/',name:'Old',created_time:'2026-01-01'}
  ]}));}});
  const h=await harness({getDb:async()=>memoryDb({artists}),getMediaLibrary:(rows,options)=>library.get(rows,options)});
  const route=h.route('get','/api/media-library').handlers.at(-1);
  const get=async query=>{const res=response();await route({query},res);return res;};
  const all=await get({});
  assert.equal(all.body.complete,false);
  const fetched=calls;
  for(const id of ['1','2']) {
    const first=await get({artistId:id,limit:'1'});
    assert.equal(first.body.total,2);
    assert.equal(first.body.complete,true);
    assert.equal(first.body.sources.length,1);
    assert.equal(first.body.sources[0].artistId,Number(id));
    assert.equal(first.body.items.length,1);
    assert.equal(first.body.items[0].artistId,Number(id));
    assert.equal(first.body.items[0].title,'New');
    assert.equal(first.body.nextOffset,1);
    const second=await get({artistId:id,limit:'1',offset:'1'});
    assert.equal(second.body.items[0].title,'Old');
    assert.equal(second.body.nextOffset,null);
  }
  const missing=await get({artistId:'999'});
  assert.equal(missing.body.total,0);
  assert.deepEqual(missing.body.sources,[]);
  assert.equal(missing.body.complete,true);
  assert.equal(calls,fetched,'scopes must reuse provider discovery');
});

test('artist scope rejects malformed or nonpositive IDs before reading the catalog', async () => {
  const h=await harness({getDb:async()=>{throw new Error('must not read DB');}});
  for(const artistId of ['', '0', '-1', '1.2', '01', '1x', '9007199254740992', ['1','2'], {}]) {
    const res=response();
    await h.route('get','/api/media-library').handlers.at(-1)({query:{artistId}},res);
    assert.equal(res.code,400);
  }
});
