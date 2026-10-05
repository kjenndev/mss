import test from 'node:test';
import assert from 'node:assert/strict';
import { featuredUrls, prepareFeatured, featuredDto } from '../home-featured.js';
import { harness } from './harness.js';
test('save validation rejects malformed URLs, duplicate normalized IDs and forged metadata',()=>{
 for(const body of [null,{},[],{urls:'no'},{urls:['http://youtu.be/abcdefghijk']},{urls:['https://youtu.be/abcdefghijk','https://www.youtube.com/watch?v=abcdefghijk']},{urls:[],title:'forged'}]) assert.throws(()=>featuredUrls(body),{status:400});
 assert.equal(featuredUrls({urls:[]}).length,0);
 assert.equal(featuredUrls({urls:['https://youtu.be/abcdefghijk']})[0].videoId,'abcdefghijk');
});
test('save metadata lookup has five workers and a total deadline without background continuation',async()=>{
 let calls=0;const releases=[];
 const provider={get:()=>{calls++;return new Promise(resolve=>releases.push(resolve));}};
 const parsed=Array.from({length:20},(_,i)=>({videoId:String(i).padStart(11,'0'),url:'https://youtu.be/'+String(i).padStart(11,'0')}));
 await assert.rejects(prepareFeatured(parsed,[],provider,20),{status:503});assert.equal(calls,5);
 for(const release of releases)release({videoId:'abcdefghijk',title:'Fixture',publishedAt:'2020-01-01',durationSeconds:123});
 await new Promise(resolve=>setTimeout(resolve,10));assert.equal(calls,5);
});
test('saved snapshots preserve exact metadata without provider configuration or chronology sorting',async()=>{
 const rows=[{video_id:'abcdefghijk',title:'First',position:1,published_at:'2020-01-01',fetched_at:'2026-01-01',duration_seconds:10},{video_id:'lmnopqrstuv',title:'Older',position:0,published_at:'2010-01-01',fetched_at:'2026-01-01',duration_seconds:20}];
 const prepared=await prepareFeatured(featuredUrls({urls:rows.map(v=>'https://youtu.be/'+v.video_id)}),rows,{get:()=>{throw Error('No network allowed');}});
 assert.deepEqual(prepared.map(v=>[v.video_id,v.position]),[['abcdefghijk',0],['lmnopqrstuv',1]]);assert.equal(featuredDto(prepared[1]).createdAt,'2010-01-01T00:00:00.000Z');
});
test('curated homepage has public reads and separate guarded preview/save routes', async () => {
 const h = await harness();
 for (const [method, path] of [['get', '/api/home-featured-videos'], ['post', '/api/home-featured-videos/preview'], ['put', '/api/home-featured-videos']]) assert.ok(h.route(method, path), `missing ${method} ${path}`);
});
