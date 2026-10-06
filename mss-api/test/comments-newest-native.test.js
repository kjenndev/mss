import test from 'node:test';
import assert from 'node:assert/strict';
import knex from 'knex';
import express from 'express';
import fs from 'node:fs';
import vm from 'node:vm';
import { harness,response } from './harness.js';
const database=process.env.MSS_REGISTRATION_TEST_DB;
test('newest chronology uses stable exact timestamp/id cursor, preserves legacy pagination', {skip:!database},async()=>{
 assert.match(database,/^mss_registration_test_[a-z0-9_]+$/);
 const db=knex({client:'pg',connection:{host:'/var/run/postgresql',user:'postgres',database}});
 try{
 await db.migrate.latest({directory:new URL('../migrations',import.meta.url).pathname});
 const [artist]=await db('artists').insert({name:'Synthetic'}).returning('*');
 const [other]=await db('artists').insert({name:'Other'}).returning('*');
 const [event]=await db('events').insert({title:'Synthetic',date:'2030-01-01'}).returning('*');
 const rows=await db('comments').insert(['2026-02-01 00:00:00.000001+00','2025-01-01','2026-02-01 00:00:00.000002+00','2026-02-01 00:00:00.000002+00',null].map(created_at=>({artist_id:artist.id,author_name:'Historical',content:'Synthetic',created_at}))).returning('*');
 await db('comments').insert({artist_id:other.id,content:'Other',author_name:'Other'});
 const [eventRoot]=await db('comments').insert({event_id:event.id,content:'Event',author_name:'Event'}).returning('*');
 const h=await harness({getDb:async()=>db});
 const get=async q=>{const res=response();await h.route('get','/api/comments').handlers[0]({query:{artist_id:String(artist.id),...q}},res);return res;};
 let page=await get({order:'newest',limit:'2'});
 assert.deepEqual(Array.from(page.body.comments,c=>c.id),[rows[3].id,rows[2].id]);assert.equal(typeof page.body.next_cursor,'string');
 const cursor=page.body.next_cursor;
 await db('comments').where({id:rows[2].id}).del();
 await db('comments').insert({artist_id:artist.id,content:'Later',author_name:'Account',created_at:'2027-01-01'});
 page=await get({order:'newest',limit:'2',before:cursor});
 assert.deepEqual(Array.from(page.body.comments,c=>c.id),[rows[0].id,rows[1].id]);
 page=await get({order:'newest',limit:'1',before:page.body.next_cursor});assert.deepEqual(Array.from(page.body.comments,c=>c.id),[rows[4].id]);assert.equal(page.body.has_more,false);
 page=await get({after_id:'0',limit:'2'});assert.deepEqual(Array.from(page.body.comments,c=>c.id),[rows[0].id,rows[1].id]);assert.equal(page.body.next_cursor,rows[1].id);
 for(const q of [{order:'newest',after_id:'0'},{order:'newest',offset:'0'},{before:cursor},{order:'newest',before:'oops'},{order:'wrong'},{order:'newest',before:JSON.stringify({id:1,date:'2026-02-31T00:00:00.000000Z'})},{order:'newest',before:JSON.stringify({id:1,date:'not a date'})}])assert.equal((await get(q)).code,400);
 const [reply]=await db('comments').insert({event_id:event.id,content:'Reply',author_name:'Historical',parent_id:eventRoot.id,created_at:'2020-01-01'}).returning('*');
 const eventPage=await get({artist_id:undefined,event_id:String(event.id),order:'newest',limit:'1'});
 assert.equal(eventPage.body.comments[0].content,'Event');
 const eventOlder=await get({artist_id:undefined,event_id:String(event.id),order:'newest',before:eventPage.body.next_cursor});
 assert.deepEqual(Array.from(eventOlder.body.comments,c=>c.id),[reply.id]);
 const nullRows=await db('comments').insert([1,2].map(()=>({artist_id:artist.id,content:'Unknown date',author_name:'Historical',created_at:null}))).returning('*');
 page=await get({order:'newest',before:JSON.stringify({date:null,id:nullRows[1].id}),limit:'1'});
 assert.deepEqual(Array.from(page.body.comments,c=>c.id),[nullRows[0].id]);assert.equal(page.body.has_more,true);
 page=await get({order:'newest',before:page.body.next_cursor});assert.deepEqual(Array.from(page.body.comments,c=>c.id),[rows[4].id]);
 }finally{await db.destroy();}
});

// Exercise the actual authenticated/atomic POST handlers over HTTP, never index startup.
test('mixed newest GET and real POST retain same-millisecond microseconds', {skip:!database}, async t => {
 assert.match(database,/^mss_registration_test_[a-z0-9_]+$/);
 const db=knex({client:'pg',connection:{host:'/var/run/postgresql',user:'postgres',database}});
 let server;
 try {
  await db.migrate.latest({directory:new URL('../migrations',import.meta.url).pathname});
  const [user]=await db('users').insert({username:'Precision account',password:'unused',role:'artist',profile_picture:'/uploads/synthetic-account.webp'}).returning('*');
  const [artist]=await db('artists').insert({name:'Precision artist',user_id:user.id,profile_picture:'/uploads/synthetic-artist.webp'}).returning('*');
  const token='synthetic-precision-session';
  await db('sessions').insert({token,user_id:user.id,expires_at:'2099-01-01'});
  const olderDate='2026-01-01T00:00:00.123100Z', newerDate='2026-01-01T00:00:00.123900Z';
  const [older]=await db('comments').insert({artist_id:artist.id,content:'Older',author_name:'Historical',created_at:olderDate}).returning('*');
  // A deterministic DB default still exercises the real insert and pg Date conversion.
  await db.raw("ALTER TABLE comments ALTER COLUMN created_at SET DEFAULT '2026-01-01T00:00:00.123900Z'::timestamptz");
  const h=await harness({getDb:async()=>db}); const app=express();app.use(express.json());
  for(const method of ['get','post'])app[method]('/api/comments',...h.route(method,'/api/comments').handlers);
  app.use(h.app.middleware.flat().find(f=>typeof f==='function'&&f.length===4));
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  const get=async()=>{const r=await fetch(`${base}/api/comments?artist_id=${artist.id}&order=newest`);assert.equal(r.status,200);return r.json();};
  const loaded=await get();assert.equal(loaded.comments[0].created_at,olderDate);
  const result=await fetch(`${base}/api/comments`,{method:'POST',headers:{authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({artist_id:artist.id,content:'Newer'})});
  assert.equal(result.status,201);const {comment}=await result.json();
  const stored=await db('comments').where({id:comment.id}).select(db.raw(`to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as exact`)).first();
  assert.equal(stored.exact,newerDate);
  // Run the shipped comparator, not a test-only approximation of its precision rules.
  const source=fs.readFileSync(new URL('../../mss-web/src/components/Comments/CommentSection.jsx',import.meta.url),'utf8');
  const comparator=source.slice(source.indexOf('function newestFirst('),source.indexOf('export default function'));
  const compare=vm.runInNewContext(comparator+';newestFirst');
  assert.deepEqual([...loaded.comments,comment].sort(compare).map(c=>c.id),[comment.id,older.id]);
  assert.equal(comment.created_at,stored.exact);
  const refreshed=await get();assert.equal(refreshed.comments[0].created_at,comment.created_at);
  assert.equal(comment.user_id,user.id);assert.equal(comment.author_name,artist.name);
  assert.equal(comment.author_artist_name,artist.name);assert.equal(comment.author_artist_id,artist.id);
  assert.equal(comment.author_profile_picture,user.profile_picture);assert.equal(comment.author_artist_profile_picture,artist.profile_picture);
  assert.ok(!('chronology' in comment)&&!('password' in comment)&&!('exact' in comment));
 } finally {
  if(server){const port=server.address().port;await new Promise(r=>server.close(r));await assert.rejects(fetch(`http://127.0.0.1:${port}`,{signal:AbortSignal.timeout(1000)}));t.diagnostic('Disposable HTTP port closed');}
  await db.destroy();
 }
});
