import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import knex from 'knex';
import { setTimeout as delay } from 'node:timers/promises';
import fs from 'node:fs';
import { harness } from './harness.js';
const database = process.env.MSS_REGISTRATION_TEST_DB;
test('native comment provenance migration and locked authorization', { skip: !database, timeout: 60000 }, async t => {
 assert.match(database,/^mss_registration_test_[a-z0-9_]+$/);
 const db=knex({client:'pg',connection:{host:'/var/run/postgresql',user:'postgres',database},pool:{min:0,max:10}});
 let server;
 try {
  const directory=new URL('../migrations',import.meta.url).pathname;
  for(const name of fs.readdirSync(directory).filter(n=>n.endsWith('.js')&&n!=='20261005010000_comment_artist_identity.js').sort()) await db.migrate.up({directory,name});
  const [user]=await db('users').insert({username:'Account',password:'unused',role:'artist'}).returning('*');
  const [other]=await db('users').insert({username:'Other',password:'unused',role:'user'}).returning('*');
  const [artist]=await db('artists').insert({name:'Historical artist',user_id:user.id}).returning('*');
  const [target]=await db('artists').insert({name:'Discussion',user_id:other.id}).returning('*');
  const token='synthetic-session';
  const session=()=>db('sessions').insert({token,user_id:user.id,expires_at:new Date(Date.now()+3600000)});
  await session();
  const [legacy]=await db('comments').insert({artist_id:target.id,content:'Legacy',author_name:'Original guest'}).returning('*');
  await db.migrate.latest({directory});
  assert.ok(await db.schema.hasColumn('comments','author_artist_id'));
  assert.deepEqual(await db('comments').where({id:legacy.id}).first(),{...legacy,author_artist_id:null,author_artist_name:null});
  const h=await harness({getDb:async()=>db});const app=express();app.use(express.json());
  let client=0;app.use((req,res,next)=>{Object.defineProperty(req,'ip',{value:'synthetic-client-'+client++});next();});
  for(const [method,url] of [['get','/api/comments'],['get','/api/comments/identities'],['post','/api/comments']])app[method](url,...h.route(method,url).handlers);
  app.use(h.app.middleware.flat().find(f=>typeof f==='function'&&f.length===4));
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const call=async(method,url,body)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}${url}`,{method,headers:{authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});return {status:r.status,body:await r.json()};};
  const post=()=>call('POST','/api/comments',{artist_id:target.id,content:'New',author_artist_id:artist.id});
  await t.test('snapshot survives rename transfer deletion; pagination preserves public history',async()=>{
   const result=await post();assert.equal(result.status,201);assert.equal(result.body.comment.author_name,'Historical artist');
   await db('artists').where({id:artist.id}).update({name:'Renamed',user_id:other.id});
   assert.equal((await post()).status,403);
   await db('artists').where({id:artist.id}).del();
   const row=await db('comments').where({id:result.body.comment.id}).first();assert.equal(row.author_artist_id,null);assert.equal(row.author_artist_name,'Historical artist');assert.equal(row.author_name,'Historical artist');
   const page=await call('GET',`/api/comments?artist_id=${target.id}&limit=1`);assert.equal(page.body.comments[0].author_name,'Original guest');assert.equal(page.body.has_more,true);
   assert.equal((await call('GET',`/api/comments?artist_id=${target.id}&after_id=${page.body.next_cursor}`)).body.comments[0].id,row.id);
   assert.deepEqual(await db('comments').where({id:legacy.id}).first(),{...legacy,author_artist_id:null,author_artist_name:null});
   await db('artists').insert(artist);
  });
  await t.test('native artist/admin/user, zero/one/multiple, artist/event/reply contract',async()=>{
   const [event]=await db('events').insert({title:'Synthetic event',date:'2030-01-01',creator_id:user.id}).returning('*');
   const [second]=await db('artists').insert({name:'Second own',user_id:user.id}).returning('*');
   for(const role of ['user','artist','admin'])for(const count of [0,1,2]){
    await db('users').where({id:user.id}).update({role});
    await db('artists').where({id:artist.id}).update({user_id:count?user.id:other.id});
    await db('artists').where({id:second.id}).update({user_id:count===2?user.id:other.id});
    const allowed=await call('GET','/api/comments/identities');assert.equal(allowed.body.identities.length,role==='user'?0:count);
    for(const discussion of [{artist_id:target.id},{event_id:event.id}]){
     const first=await call('POST','/api/comments',{...discussion,content:'Role matrix'});assert.equal(first.status,201);
     assert.equal(first.body.comment.author_name,role==='user'||count===0?'Account':'Historical artist');
     const reply=await call('POST','/api/comments',{...discussion,content:'Reply',parent_id:first.body.comment.id,...(role!=='user'&&count===2?{author_artist_id:second.id}:{})});assert.equal(reply.status,201);
     if(role!=='user'&&count===2)assert.equal(reply.body.comment.author_name,'Second own');
    }
    assert.equal((await call('POST','/api/comments',{artist_id:target.id,content:'Spoof',author_artist_id:target.id})).status,403);
   }
   for(const extra of [{author_name:'Forged'},{user_id:other.id},{author_artist_id:'1e0'},{author_artist_id:9007199254740992}])assert.equal((await call('POST','/api/comments',{artist_id:target.id,content:'Spoof',...extra})).status,400);
  });
  const wait=async pattern=>{for(let i=0;i<500;i++){const rows=await db('pg_stat_activity').select('query').whereRaw('datname=current_database()').where({wait_event_type:'Lock'});if(rows.some(r=>pattern.test(r.query)))return;await delay(10);}assert.fail('Expected lock wait '+pattern);};
  for(const kind of ['association','role','session'])await t.test(`${kind} revoked during advisory lock wait`,async()=>{
   await db('artists').where({id:artist.id}).update({user_id:user.id});await db('users').where({id:user.id}).update({role:'artist'});await db('sessions').where({token}).del();await session();
   const before=await db('comments').count('* as n').first();const blocker=await db.transaction();let pending;
   try {await blocker.raw('SELECT pg_advisory_xact_lock(1297306453)');pending=post();await wait(/pg_advisory_xact_lock/);
    if(kind==='association')await blocker('artists').where({id:artist.id}).update({user_id:other.id});
    if(kind==='role')await blocker('users').where({id:user.id}).update({role:'user'});
    if(kind==='session')await blocker('sessions').where({token}).del();
    await blocker.commit();const result=await pending;assert.equal(result.status,kind==='session'?401:403);assert.deepEqual(await db('comments').count('* as n').first(),before);
   }finally{if(!blocker.isCompleted())await blocker.rollback();if(pending)await pending;}
  });
  await t.test('ownership transfer while waiting on artist row is rechecked by locked query',async()=>{
   await db('users').where({id:user.id}).update({role:'artist'});await db('artists').where({id:artist.id}).update({user_id:user.id});await db('sessions').where({token}).del();await session();
   const blocker=await db.transaction();let pending;
   try {await blocker('artists').where({id:artist.id}).forUpdate().first();pending=post();await wait(/artists.*for update/i);await blocker('artists').where({id:artist.id}).update({user_id:other.id});await blocker.commit();assert.equal((await pending).status,403);}
   finally {if(!blocker.isCompleted())await blocker.rollback();if(pending)await pending;}
  });
  await t.test('session revoked during user-row wait cannot insert',async()=>{
   await db('users').where({id:user.id}).update({role:'artist'});await db('artists').where({id:artist.id}).update({user_id:user.id});await db('sessions').where({token}).del();await session();
   const blocker=await db.transaction();let pending;
   try {await blocker('users').where({id:user.id}).forUpdate().first();await blocker('sessions').where({token}).del();pending=post();await wait(/users.*for update/i);await blocker.commit();assert.equal((await pending).status,401);}
   finally {if(!blocker.isCompleted())await blocker.rollback();if(pending)await pending;}
  });
 }finally{if(server){const port=server.address().port;await new Promise(r=>server.close(r));await assert.rejects(fetch(`http://127.0.0.1:${port}`,{signal:AbortSignal.timeout(1000)}));t.diagnostic('Disposable HTTP port closed');}await db.destroy();}
});
