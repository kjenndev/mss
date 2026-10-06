import test from 'node:test';
import assert from 'node:assert/strict';
import knex from 'knex';
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
