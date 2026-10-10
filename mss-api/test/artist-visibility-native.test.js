import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import knex from 'knex';
import {setTimeout as delay} from 'node:timers/promises';
import {harness} from './harness.js';
import {createMediaLibrary} from '../media-library.js';
const database=process.env.MSS_REGISTRATION_TEST_DB;
test('artist visibility migration and real PostgreSQL HTTP permissions', {skip:!database,timeout:60000},async t=>{
 assert.match(database,/^mss_registration_test_[a-z0-9_]+$/);
 const db=knex({client:'pg',connection:{host:'/var/run/postgresql',user:'postgres',database},pool:{min:0,max:10}});
 let server;
 try{
  const directory=new URL('../migrations',import.meta.url).pathname;
  for(const name of fs.readdirSync(directory).filter(n=>n.endsWith('.js')&&n!=='20261008000000_artist_visibility.js').sort())await db.migrate.up({directory,name});
  const users=await db('users').insert(['admin','artist','other','member','blocked'].map(username=>({username,role:username==='admin'?'admin':username==='member'?'user':'artist',is_disabled:username==='blocked'?1:0,password:'fixture'}))).returning('*');
  for(const u of users)await db('sessions').insert({token:u.username,user_id:u.id,expires_at:new Date(Date.now()+3600000)});
  await db('sessions').insert({token:'expired',user_id:users[0].id,expires_at:new Date(0)});
  const artists=await db('artists').insert([{name:'Enabled',user_id:users[1].id,mixcloud:'shared',channel_name:'enabled'},{name:'Hidden',user_id:users[1].id,mixcloud:'shared',channel_name:'hidden',profile_picture:'/uploads/hidden.webp'},{name:'Member-owned',user_id:users[3].id}]).returning('*');
  const [event]=await db('events').insert({title:'Event',creator_id:users[0].id}).returning('*');
  await db('event_artists').insert(artists.map(a=>({event_id:event.id,artist_id:a.id})));
  await db('artist_images').insert(artists.map(a=>({artist_id:a.id,filename:`fixture-${a.id}.webp`})));
  await db('event_images').insert({event_id:event.id,artist_id:artists[1].id,filename:'event.webp'});
  await db('comments').insert({event_id:event.id,user_id:users[1].id,content:'Historic comment',author_name:'Historic name',author_artist_id:artists[1].id,author_artist_name:'Historic name'});
  const preserved={};for(const table of ['users','sessions','artists','event_artists','artist_images','event_images','comments'])preserved[table]=await db(table);
  await db.migrate.latest({directory});
  await t.test('additive migration preserves every preexisting fixture column and defaults false',async()=>{
   for(const [table,rows] of Object.entries(preserved)){let actual=await db(table);if(table==='artists'){assert.ok(actual.every(a=>a.is_disabled===false));actual=actual.map(({is_disabled,...a})=>a);}assert.deepEqual(actual,rows);}
  });
  let providerCalls=0;
  const library=createMediaLibrary({env:{},fetchImpl:async()=>{providerCalls++;return new Response(JSON.stringify({data:[{key:'/shared/mix/',name:'Shared mix',created_time:'2026-01-01'}]}));}});
  const h=await harness({getDb:async()=>db,getMediaLibrary:library.get,getActiveStreams:async()=>artists.slice(0,2).map(a=>({artistId:a.id,artistName:a.name})),youtubeMetadata:{configured:()=>false}});
  const app=express();app.use(express.json());
  const routes=[['get','/api/artists'],['get','/api/artists/:id'],['get','/api/artists/:id/manage'],['get','/api/artists/:id/images'],['get','/api/artists/:id/events'],['get','/api/artists/:id/youtube-videos'],['get','/api/users/me/artists'],['get','/api/images'],['get','/api/events'],['get','/api/events/:id'],['get','/api/streams'],['get','/api/feed'],['get','/api/media-library'],['get','/api/comments'],['post','/api/comments'],['put','/api/artists/:id'],['put','/api/artists/:id/visibility']];
  for(const [method,path] of routes)app[method](path,...h.route(method,path).handlers);
  app.use(h.app.middleware.flat().find(f=>typeof f==='function'&&f.length===4));
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const call=async(path,token,method='GET',body)=>{const res=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});return {status:res.status,headers:res.headers,body:await res.json()};};
  const hidden=artists[1].id,owned=artists[2].id;
  await t.test('admin-only reversible flag preserves associations and cannot be mass assigned',async()=>{
   for(const token of [undefined,'member','artist','other'])assert.equal((await call(`/artists/${hidden}/visibility`,token,'PUT',{is_disabled:true})).status,token?403:401);
   for(const body of [{is_disabled:1},{is_disabled:'true'},{is_disabled:true,name:'forged'},{}])assert.equal((await call(`/artists/${hidden}/visibility`,'admin','PUT',body)).status,400);
   for(const token of ['artist','admin'])assert.equal((await call(`/artists/${hidden}`,token,'PUT',{is_disabled:true})).status,400);
   for(const id of [hidden,owned])assert.equal((await call(`/artists/${id}/visibility`,'admin','PUT',{is_disabled:true})).status,200);
   assert.deepEqual(await db('event_artists'),preserved.event_artists);assert.deepEqual(await db('artist_images'),preserved.artist_images);
  });
  await t.test('public, regular, expired, revoked and disabled accounts cannot bypass any direct read',async()=>{
   for(const token of [undefined,'member','expired','revoked','blocked']){
    const directory=await call('/artists',token);assert.deepEqual(directory.body.artists.map(a=>a.id),[artists[0].id]);assert.equal(directory.headers.get('cache-control'),'private, no-store');assert.match(directory.headers.get('vary'),/Authorization/);
    for(const suffix of ['','/images','/events','/youtube-videos'])assert.equal((await call(`/artists/${hidden}${suffix}`,token)).status,404);
    for(const path of [`/comments?artist_id=${hidden}`,`/media-library?artistId=${hidden}`])assert.equal((await call(path,token)).status,404);
   }
   assert.equal((await call(`/artists/${owned}/manage`,'member')).status,404);
   assert.equal((await call(`/artists/${owned}`,'member','PUT',{name:'Bypass'})).status,404);
   assert.deepEqual((await call('/users/me/artists','member')).body.artists,[]);
   assert.equal((await call('/comments','member','POST',{artist_id:hidden,content:'Bypass'})).status,404);
  });
  await t.test('all artists and admins see disabled profiles regardless of ownership',async()=>{
   for(const token of ['artist','other','admin']){
    assert.equal((await call('/artists',token)).body.artists.length,3);
    assert.equal((await call(`/artists/${hidden}`,token)).body.artist.is_disabled,true);
    for(const suffix of ['/images','/events','/youtube-videos'])assert.equal((await call(`/artists/${hidden}${suffix}`,token)).status,200);
   }
  });
  await t.test('aggregates hide profile references but retain enabled media and historic authored comments',async()=>{
   assert.deepEqual((await call('/images')).body.images.map(i=>i.artist_id),[artists[0].id]);
   assert.deepEqual((await call('/events')).body.events[0].artists.map(a=>a.id),[artists[0].id]);
   const details=(await call(`/events/${event.id}`)).body.event;assert.equal(details.images.length,1);assert.equal(details.images[0].artist_id,null);assert.equal(details.images[0].artist_name,null);
   assert.deepEqual((await call('/streams')).body.streams.map(a=>a.artistId),[artists[0].id]);
   assert.ok((await call('/feed')).body.feed.every(a=>a.artistId===artists[0].id));
   const comments=(await call(`/comments?event_id=${event.id}`)).body.comments;assert.equal(comments[0].author_name,'Historic name');assert.equal(comments[0].author_artist_name,'Historic name');assert.equal(comments[0].author_artist_id,null);assert.equal(comments[0].author_artist_profile_picture,null);
   assert.equal((await call(`/comments?event_id=${event.id}`,'other')).body.comments[0].author_artist_profile_picture,'/uploads/hidden.webp');
   const full=(await call('/media-library','admin')).body;const pub=(await call('/media-library')).body;assert.equal(pub.total,1);assert.equal(pub.items[0].artistId,artists[0].id);assert.equal(pub.sources.length,1);assert.notEqual(pub.cache.version,full.cache.version);assert.equal(providerCalls,2);
  });
  await t.test('revocation or demotion while waiting for the user lock denies visibility writes',async()=>{
   for(const revoke of [true,false]){
    const barrier=await db.transaction();let pending;
    try{
     await barrier('users').where({id:users[0].id}).forUpdate().first();
     if(revoke)await barrier('sessions').where({token:'admin'}).del();else await barrier('users').where({id:users[0].id}).update({role:'artist'});
     pending=call(`/artists/${hidden}/visibility`,'admin','PUT',{is_disabled:false});
     let observed=false;for(let i=0;i<300;i++){const waits=await db('pg_stat_activity').select('query').whereRaw('datname=current_database()').where({wait_event_type:'Lock'});if(waits.some(w=>/select.*users.*for update/i.test(w.query))){observed=true;break;}await delay(10);}
     assert.ok(observed,'observed actual PostgreSQL user lock wait');await barrier.commit();assert.equal((await pending).status,revoke?401:403);assert.equal((await db('artists').where({id:hidden}).first()).is_disabled,true);
    }finally{if(!barrier.isCompleted())await barrier.rollback();if(pending)await pending;}
    if(revoke)await db('sessions').insert({token:'admin',user_id:users[0].id,expires_at:new Date(Date.now()+3600000)});else await db('users').where({id:users[0].id}).update({role:'admin'});
   }
  });
  await t.test('re-enabling restores public discovery without recreating records',async()=>{
   assert.equal((await call(`/artists/${hidden}/visibility`,'admin','PUT',{is_disabled:false})).status,200);assert.equal((await call(`/artists/${hidden}`)).status,200);assert.equal((await call('/artists')).body.artists.length,2);assert.deepEqual(await db('artist_images'),preserved.artist_images);assert.deepEqual(await db('comments'),preserved.comments);
  });
 }finally{if(server)await new Promise(r=>server.close(r));await db.destroy();}
});
