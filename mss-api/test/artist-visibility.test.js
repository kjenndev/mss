import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, response } from './harness.js';
import { memoryDb } from './memory-db.js';
const artists=[{id:1,name:'Visible',is_disabled:false},{id:2,name:'Disabled',is_disabled:true}];
async function setup(role) {
 const db=memoryDb({artists, users:role?[{id:8,username:'Viewer',role,is_disabled:false}]:[],sessions:role?[{token:'valid',user_id:8,expires_at:'2099-01-01'}]:[]});
 const h=await harness({getDb:async()=>db});
 return {db,async get(url,params={}) {const res=response();res.set=()=>res;res.vary=()=>res;await h.route('get',url).handlers.at(-1)({params,headers:role?{authorization:'Bearer valid'}:{},query:{}},res,e=>{throw e});return res;}};
}
test('guests and regular users cannot discover or directly read disabled profiles',async()=>{
 for(const role of [null,'user']) {const h=await setup(role);const all=await h.get('/api/artists');assert.deepEqual(Array.from(all.body.artists,a=>a.id),[1]);assert.equal((await h.get('/api/artists/:id',{id:'2'})).code,404);}
});
test('every authenticated artist and admin can read disabled profiles',async()=>{
 for(const role of ['artist','admin']) {const h=await setup(role);assert.equal((await h.get('/api/artists')).body.artists.length,2);assert.equal((await h.get('/api/artists/:id',{id:'2'})).body.artist.is_disabled,true);}
});

test('admin visibility mutation is reversible, strict and cannot be mass assigned',async()=>{
 const db=memoryDb({artists,users:[{id:8,role:'admin'}],sessions:[{token:'valid',user_id:8,expires_at:'2099-01-01'}]});
 const h=await harness({getDb:async()=>db});
 const route=h.route('put','/api/artists/:id/visibility');assert.ok(route);
 async function put(role,body,url='/api/artists/:id/visibility') {
  db.state().users[0].role=role;
  const req={params:{id:'2'},headers:{authorization:'Bearer valid'},body};const res=response();
  for(const handler of h.route('put',url).handlers){let next=false;await handler(req,res,e=>{if(e)throw e;next=true;});if(!next)break;}
  return res;
 }
 assert.equal((await put('artist',{is_disabled:false})).code,403);
 assert.equal((await put('admin',{is_disabled:0})).code,400);
 assert.equal((await put('admin',{is_disabled:false})).body.artist.is_disabled,false);
 assert.equal((await put('admin',{is_disabled:true})).body.artist.is_disabled,true);
 assert.equal((await put('artist',{is_disabled:false},'/api/artists/:id')).code,403);
 assert.equal((await put('admin',{is_disabled:false},'/api/artists/:id')).code,400);
 assert.equal(db.state().artists[1].is_disabled,true);
});
test('library audiences share discovery but filter original associations before dedupe',async()=>{
 const {createMediaLibrary}=await import('../media-library.js');let calls=0;
 const library=createMediaLibrary({env:{},fetchImpl:async()=>{calls++;return new Response(JSON.stringify({data:[{key:'/shared/mix/',name:'Mix',created_time:'2026-01-01'}]}));}});
 const catalog=[{id:1,name:'Enabled',mixcloud:'shared'},{id:2,name:'Disabled',mixcloud:'shared'}];
 const privileged=await library.get(catalog,{allowedArtistIds:[1,2]});
 const publicPage=await library.get(catalog,{allowedArtistIds:[1]});
 assert.equal(publicPage.items[0].artistId,1);assert.equal(publicPage.sources.length,1);
 assert.notEqual(publicPage.cache.version,privileged.cache.version);assert.equal(calls,2);
 const again=await library.get(catalog,{allowedArtistIds:[1,2]});assert.equal(again.sources.length,2);assert.equal(calls,2);
});

test('saved YouTube associations and source metadata cannot leak from the privileged cache',async()=>{
 const {createMediaLibrary}=await import('../media-library.js');const library=createMediaLibrary({env:{},fetchImpl:()=>{throw new Error('No provider calls expected');}});
 const catalog=[{id:1,name:'Enabled'},{id:2,name:'Hidden'}];
 const videos=[{id:'youtube:shared',artistId:1,title:'Shared',createdAt:'2026-01-01'},{id:'youtube:shared',artistId:2,title:'Shared',createdAt:'2026-01-01'},{id:'youtube:hidden',artistId:2,title:'Hidden',createdAt:'2026-01-02'}];
 const full=await library.get(catalog,{videos,allowedArtistIds:[1,2]});assert.equal(full.total,2);
 const pub=await library.get(catalog,{videos,allowedArtistIds:[1],limit:1});assert.equal(pub.total,1);assert.equal(pub.items[0].artistId,1);assert.equal(pub.nextOffset,null);assert.equal(JSON.stringify(pub).includes('Hidden'),false);
});
