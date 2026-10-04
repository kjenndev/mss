import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import knex from 'knex';
import fs from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { harness } from './harness.js';
import { createMediaLibrary } from '../media-library.js';
import { parseYouTubeUrl, createYouTubeMetadata } from '../youtube.js';
const database=process.env.MSS_REGISTRATION_TEST_DB;
test('YouTube additive migration and actual HTTP artist ownership/catalog mutations', {skip:!database,timeout:60000}, async t=>{
 assert.match(database,/^mss_registration_test_[a-z0-9_]+$/);
 const db=knex({client:'pg',connection:{host:'/var/run/postgresql',user:'postgres',database},pool:{min:0,max:10}});
 let server, providerFailure, beforeFetch;
 try {
  const directory=new URL('../migrations',import.meta.url).pathname;
  for(const name of fs.readdirSync(directory).filter(name=>name.endsWith('.js') && name!=='20261004000000_artist_youtube_videos.js').sort()) await db.migrate.up({directory,name});
  const users=await db('users').insert([{username:'owner',password:'unchanged',role:'artist'},{username:'other',password:'unchanged',role:'artist'},{username:'admin',password:'unchanged',role:'admin'}]).returning('*');
  for(const u of users) await db('sessions').insert({token:u.username,user_id:u.id,expires_at:new Date(Date.now()+3600000)});
  const artists=await db('artists').insert([{name:'One',slug:'one',user_id:users[0].id,youtube:'https://youtube.com/@channel',cover_photo:'/uploads/saved.webp'},{name:'Two',slug:'two',user_id:users[1].id}]).returning('*');
  const original=await db('artists').orderBy('id');
  await db.migrate.latest({directory});
  assert.deepEqual(await db('artists').orderBy('id'),original);
  assert.deepEqual(await db('users').orderBy('id'),users);
  const provider={configured:()=>true,get:async url=>{assert.equal((await db('pg_locks').where({locktype:'advisory',granted:true})).length,0,'network must not hold mutation lock'); await beforeFetch?.(); if(providerFailure) throw providerFailure; return {...parseYouTubeUrl(url),title:'Original video',publishedAt:'2020-01-02T00:00:00.000Z',durationSeconds:123,artworkUrl:'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg'};}};
  const library=createMediaLibrary({env:{},fetchImpl:()=>{throw Error('no external network')}});
  const h=await harness({getDb:async()=>db,youtubeMetadata:provider,getMediaLibrary:library.get});
  const app=express();app.use(express.json());
  for(const [method,url] of [['get','/api/artists/:id/youtube-videos'],['post','/api/artists/:id/youtube-videos'],['delete','/api/artists/:id/youtube-videos/:videoId'],['get','/api/media-library']]) {
   const route=h.route(method,url);assert.ok(route,`missing route ${method} ${url}`);app[method](url,...route.handlers);
  }
  app.use(h.app.middleware.flat().find(f=>typeof f==='function'&&f.length===4));
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const call=async(method,url,token,body)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}${url}`,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});return {status:r.status,body:await r.json()};};
  const base=`/api/artists/${artists[0].id}/youtube-videos`;
  await t.test('guest and other artist cannot write; valid owner adds, duplicates conflict, admin manages',async()=>{
   assert.equal((await call('POST',base,null,{url:'https://youtu.be/abcdefghijk'})).status,401);
   assert.equal((await call('POST',base,'other',{url:'https://youtu.be/abcdefghijk'})).status,403);
   assert.equal((await call('POST',base,'owner',{url:'https://evil.test/x'})).status,400);
   assert.equal((await call('POST',base,'owner',{url:'https://youtu.be/abcdefghijk',publishedAt:'2026-01-01'})).status,400);
   const added=await call('POST',base,'owner',{url:'https://youtu.be/abcdefghijk'});assert.equal(added.status,201,JSON.stringify(added));
   assert.equal((await call('POST',base,'owner',{url:'https://youtube.com/watch?v=abcdefghijk'})).status,409);
   const listed=await call('GET',base);assert.equal(listed.body.videos.length,1);assert.equal(listed.body.videos[0].createdAt,'2020-01-02T00:00:00.000Z');
   assert.equal((await call('POST',`/api/artists/${artists[1].id}/youtube-videos`,'admin',{url:'https://youtu.be/abcdefghijk'})).status,201);
   const all=await call('GET','/api/media-library');assert.equal(all.body.total,1);assert.equal(all.body.items[0].provider,'youtube');
   for(const a of artists){const scoped=await call('GET',`/api/media-library?artistId=${a.id}`);assert.equal(scoped.body.total,1);assert.equal(scoped.body.items[0].artistId,a.id);}
   assert.deepEqual(await db('artists').orderBy('id'),original,'existing artists unchanged');
   assert.equal((await call('DELETE',base+'/abcdefghijk','other')).status,403);
   assert.equal((await call('DELETE',base+'/abcdefghijk','owner')).status,200);
   assert.equal((await call('GET',base)).body.videos.length,0);
  });
  await t.test('provider failures and configuration errors leave no saved records',async()=>{
   for(const error of [Object.assign(new Error('Unavailable'),{status:422,code:'unavailable_video'}),Object.assign(new Error('Setup required'),{status:503,code:'not_configured'}),Object.assign(new Error('Provider failed'),{status:503,code:'provider_unavailable'})]) {providerFailure=error;assert.equal((await call('POST',base,'owner',{url:'https://youtu.be/abcdefghijk'})).status,error.status);assert.equal((await call('GET',base)).body.videos.length,0);}providerFailure=null;
   await assert.rejects(createYouTubeMetadata({env:{}}).get('https://youtu.be/abcdefghijk'),e=>e.code==='not_configured');
  });
  await t.test('revoked session and transferred ownership during provider fetch deny commit',async()=>{
   beforeFetch=async()=>{await db('sessions').where({token:'owner'}).del();};
   assert.equal((await call('POST',base,'owner',{url:'https://youtu.be/abcdefghijk'})).status,401);
   await db('sessions').insert({token:'owner',user_id:users[0].id,expires_at:new Date(Date.now()+3600000)});
   beforeFetch=async()=>{await db('artists').where({id:artists[0].id}).update({user_id:users[1].id});};
   assert.equal((await call('POST',base,'owner',{url:'https://youtu.be/abcdefghijk'})).status,403);
   beforeFetch=null;await db('artists').where({id:artists[0].id}).update({user_id:users[0].id});
   assert.equal((await call('GET',base)).body.videos.length,0);
  });
  await t.test('revocation committed during user lock wait cannot authorize insert',async()=>{
   const barrier=await db.transaction();let pending;
   try {
    await barrier('users').where({id:users[0].id}).forUpdate().first();
    await barrier('sessions').where({token:'owner'}).del();
    pending=call('POST',base,'owner',{url:'https://youtu.be/abcdefghijk'});
    let observed=false;
    for(let i=0;i<300;i++){const locks=await db('pg_stat_activity').select('query','wait_event').whereRaw('datname = current_database()').where({wait_event_type:'Lock'});if(locks.some(r=>/select.*users.*for update/i.test(r.query))){observed=true;break;}await delay(10);}
    assert.ok(observed,'observed users FOR UPDATE wait');
    await barrier.commit();assert.equal((await pending).status,401);
    assert.equal((await call('GET',base)).body.videos.length,0);
   } finally {if(!barrier.isCompleted())await barrier.rollback();if(pending)await pending;}
   await db('sessions').insert({token:'owner',user_id:users[0].id,expires_at:new Date(Date.now()+3600000)});
  });
  await t.test('bounded links and duplicate-safe refresh preserve stored publication date',async()=>{
   const rows=Array.from({length:100},(_,i)=>({artist_id:artists[0].id,video_id:String(i).padStart(11,'0'),title:'Fixture '+i,duration_seconds:60,published_at:'2010-01-01T00:00:00Z'}));
   await db('artist_youtube_videos').insert(rows);
   assert.equal((await call('POST',base,'owner',{url:'https://youtu.be/abcdefghijk'})).status,409);
   assert.equal((await call('GET',base)).body.videos.length,100);
   assert.equal((await call('POST',base,'owner',{url:'https://youtu.be/00000000000',refresh:true})).status,200);
   const refreshed=await db('artist_youtube_videos').where({artist_id:artists[0].id,video_id:'00000000000'}).first();assert.equal(refreshed.published_at.toISOString(),'2020-01-02T00:00:00.000Z');
   await db('artist_youtube_videos').where({artist_id:artists[0].id}).del();
  });
 } finally {if(server)await new Promise(r=>server.close(r));await db.destroy();}
});
