import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import knex from 'knex';
import { harness } from './harness.js';
import { parseYouTubeUrl } from '../youtube.js';
const database = process.env.MSS_REGISTRATION_TEST_DB;
test('curated homepage persistence, input and locked admin authorization', {skip:!database, timeout:60000}, async t => {
 assert.match(database, /^mss_registration_test_[a-z0-9_]+$/);
 const db = knex({client:'pg', connection:{host:'/var/run/postgresql',user:'postgres',database},pool:{min:0,max:10}});
 let server, beforeFetch, failure, calls=0;
 try {
  const directory=new URL('../migrations',import.meta.url).pathname;
  for(const name of fs.readdirSync(directory).filter(name=>name.endsWith('.js') && name!=='20261005000000_home_featured_videos.js').sort())await db.migrate.up({directory,name});
  const users=await db('users').insert([{username:'admin',role:'admin',password:'fixture'},{username:'artist',role:'artist',password:'fixture'},{username:'member',role:'user',password:'fixture'}]).returning('*');
  for(const user of users) await db('sessions').insert({token:user.username,user_id:user.id,expires_at:new Date(Date.now()+3600000)});
  await db('system_settings').insert({key:'fixture_preserved',value:'Unchanged'});
  const originalSessions=await db('sessions').orderBy('token'),originalSettings=await db('system_settings').orderBy('key');
  await db.migrate.latest({directory});
  assert.deepEqual(await db('users').orderBy('id'),users);assert.deepEqual(await db('sessions').orderBy('token'),originalSessions);assert.deepEqual(await db('system_settings').orderBy('key'),originalSettings);
  const provider={configured:()=>true,get:async url=>{
   calls++;assert.equal((await db('pg_locks').where({locktype:'advisory',granted:true})).length,0,'no network under mutation lock');
   await beforeFetch?.(); if(failure)throw failure;
   return {...parseYouTubeUrl(url),title:'Fixture '+parseYouTubeUrl(url).videoId,publishedAt:'2020-01-02T00:00:00.000Z',durationSeconds:123,artworkUrl:'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg'};
  }};
  const h=await harness({getDb:async()=>db,youtubeMetadata:provider});
  const app=express();app.use(express.json());
  const base='/api/home-featured-videos';
  for(const [method,path] of [['get',base],['post',base+'/preview'],['put',base]]) {const route=h.route(method,path);assert.ok(route,`missing ${method} ${path}`);app[method](path,...route.handlers);}
  app.use(h.app.middleware.flat().find(f=>typeof f==='function'&&f.length===4));
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const call=async(method,path=base,token,body)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});return {status:r.status,body:await r.json()};};
  const a='https://youtu.be/abcdefghijk',b='https://youtu.be/lmnopqrstuv';
  await t.test('manual order persists across reads; preview never saves; existing snapshots need no provider',async()=>{
   assert.deepEqual((await call('GET')).body.videos,[]);
   assert.equal((await call('POST',base+'/preview','admin',{url:a})).status,200);
   assert.deepEqual((await call('GET')).body.videos,[]);
   assert.equal((await call('PUT',base,'admin',{urls:[b,a]})).status,200);
   let saved=(await call('GET')).body.videos;
   assert.deepEqual(saved.map(v=>v.videoId),['lmnopqrstuv','abcdefghijk']);
   assert.equal(saved[0].createdAt,'2020-01-02T00:00:00.000Z');assert.equal(saved[0].durationSeconds,123);
   const count=calls;assert.equal((await call('PUT',base,'admin',{urls:[a,b]})).status,200);assert.equal(calls,count);
   assert.deepEqual((await call('GET')).body.videos.map(v=>v.videoId),['abcdefghijk','lmnopqrstuv']);
  });
  await t.test('admin-only and strict input; denied requests leave exact persisted order unchanged',async()=>{
   const original=await db('home_featured_videos').orderBy('position');
   for(const token of [null,'artist','member']) for(const [method,path,body] of [['PUT',base,{urls:[a]}],['POST',base+'/preview',{url:a}]]) assert.equal((await call(method,path,token,body)).status,token?403:401);
   for(const body of [{urls:[a,a]},{urls:['https://evil.test/video']},{urls:[a],title:'forged'},{urls:'bad'},{urls:Array(101).fill(a)}]) assert.equal((await call('PUT',base,'admin',body)).status,400);
   assert.deepEqual(await db('home_featured_videos').orderBy('position'),original);
  });
  await t.test('provider failure rolls back entire save, revoked admin after fetch cannot commit',async()=>{
   const original=await db('home_featured_videos').orderBy('position');
   failure=Object.assign(Error('Fixture unavailable'),{status:503});
   assert.equal((await call('PUT',base,'admin',{urls:['https://youtu.be/12345678901']})).status,503);failure=null;
   beforeFetch=async()=>{await db('sessions').where({token:'admin'}).del();};
   assert.equal((await call('PUT',base,'admin',{urls:['https://youtu.be/12345678901']})).status,401);beforeFetch=null;
   assert.deepEqual(await db('home_featured_videos').orderBy('position'),original);
   await db('sessions').insert({token:'admin',user_id:users[0].id,expires_at:new Date(Date.now()+3600000)});
  });
  await t.test('session revoked while save waits for the user lock cannot authorize removal',async()=>{
   const original=await db('home_featured_videos').orderBy('position');
   const barrier=await db.transaction();let pending;
   try {
    await barrier('users').where({id:users[0].id}).forUpdate().first();
    await barrier('sessions').where({token:'admin'}).del();
    pending=call('PUT',base,'admin',{urls:[]});
    let observed=false;
    for(let i=0;i<300;i++){const locks=await db('pg_stat_activity').select('query').whereRaw('datname=current_database()').where({wait_event_type:'Lock'});if(locks.some(r=>/select.*users.*for update/i.test(r.query))){observed=true;break;}await delay(10);}
    assert.ok(observed,'observed user lock wait');await barrier.commit();assert.equal((await pending).status,401);
    assert.deepEqual(await db('home_featured_videos').orderBy('position'),original);
   }finally{if(!barrier.isCompleted())await barrier.rollback();if(pending)await pending;}
   await db('sessions').insert({token:'admin',user_id:users[0].id,expires_at:new Date(Date.now()+3600000)});
  });
  await t.test('admin demotion during metadata fetch denies commit',async()=>{
   const original=await db('home_featured_videos').orderBy('position');
   beforeFetch=async()=>{await db('users').where({id:users[0].id}).update({role:'artist'});};
   assert.equal((await call('PUT',base,'admin',{urls:['https://youtu.be/12345678901']})).status,403);beforeFetch=null;
   assert.deepEqual(await db('home_featured_videos').orderBy('position'),original);await db('users').where({id:users[0].id}).update({role:'admin'});
  });
  await t.test('empty saved collection is explicit removal and does not change artist catalog',async()=>{
   assert.equal((await call('PUT',base,'admin',{urls:[]})).status,200);
   assert.deepEqual((await call('GET')).body.videos,[]);
   assert.deepEqual(await db('artist_youtube_videos'),[]);
  });
 } finally {if(server)await new Promise(r=>server.close(r));await db.destroy();}
});
