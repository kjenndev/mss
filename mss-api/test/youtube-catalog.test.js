import test from 'node:test';
import assert from 'node:assert/strict';
import { createMediaLibrary } from '../media-library.js';
const v=(id,artistId,createdAt)=>({id:`youtube:${id}`,provider:'youtube',artistId,title:id,createdAt,metadataFetchedAt:'2026-01-01T00:00:00Z'});
test('YouTube merges before pagination, excludes invalid dates, scopes shared IDs and versions catalog without corrupting timestamps',async()=>{
 const library=createMediaLibrary({env:{},fetchImpl:async()=>Response.json({data:[{key:'/artist/audio/',name:'audio',created_time:'2020-01-02T00:00:00Z'}]})});
 const artists=[{id:1,name:'One',mixcloud:'artist'},{id:2,name:'Two'}];
 const videos=[v('abcdefghijk',1,'2020-01-02T02:00:00+01:00'),v('abcdefghijk',2,'2020-01-02T02:00:00+01:00'),v('12345678901',1,'2019-01-01T00:00:00Z'),v('invaliddate',1,'invalid')];
 const all=await library.get(artists,{videos,limit:1});
 assert.equal(all.total,3);assert.equal(all.items[0].id,'youtube:abcdefghijk');assert.equal(all.nextOffset,1);
 assert.ok(Number.isFinite(Date.parse(all.cache.fetchedAt)),'fetchedAt remains ISO date');assert.equal(typeof all.cache.version,'string');assert.match(all.cache.version,/^[a-f0-9]{64}$/);
 const page=await library.get(artists,{videos,offset:1,limit:1});assert.equal(page.items[0].title,'audio');
 for(const artistId of [1,2]){const scope=await library.get(artists,{videos,artistId});assert.equal(scope.items[0].artistId,artistId);assert.equal(scope.total,artistId===1?3:1);}
 const removed=await library.get(artists,{videos:[]});assert.notEqual(removed.cache.version,all.cache.version);assert.equal(removed.total,1);
});
