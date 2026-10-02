import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, response } from './harness.js';
import { memoryDb } from './memory-db.js';
const admin={id:9,role:'admin'};
test('user creation reconciles owned list and rejects primary-only grants',async()=>{
 for(const [body,code] of [[{artist_id:1},400],[{artist_id:1,ownedArtistIds:[]},400],[{artist_id:1,ownedArtistIds:[1]},201]]){
 const db=memoryDb({users:[{id:1,artist_id:1}],artists:[{id:1,user_id:1}]});const h=await harness({getDb:async()=>db,hashPassword:async()=> 'hash'});
 const r=await invoke(h,'post','/api/users',{user:admin,body:{username:'new',password:'long password here',...body}});assert.equal(r.code,code);
 if(code===201){assert.equal(db.state().artists[0].user_id,2);assert.equal(db.state().users[0].artist_id,null);assert.equal(r.body.user.artist_id,1);}else assert.equal(db.state().users.length,1);
 }
});
test('owned lists never include an unrelated legacy primary selector',async()=>{
 const db=memoryDb({users:[{id:2,artist_id:1}],artists:[{id:1,user_id:1}]});const h=await harness({getDb:async()=>db});
 const r=await invoke(h,'get','/api/users',{user:admin});assert.equal(r.body.users[0].ownedArtists.length,0);
});
async function invoke(h,method,url,req){const res=response();await h.route(method,url).handlers.at(-1)(req,res,e=>{throw e});return res;}
test('primary selector cannot transfer ownership or grant access',async()=>{
 const db=memoryDb({users:[{id:1,artist_id:1},{id:2,artist_id:null}],artists:[{id:1,user_id:1}]});const h=await harness({getDb:async()=>db});
 const res=await invoke(h,'put','/api/users/:id',{params:{id:2},user:admin,body:{artist_id:1}});
 assert.equal(res.code,400);assert.equal(db.state().users[1].artist_id,null);
 const denied=response();let granted=false;await h.route('put','/api/artists/:id').handlers[1]({params:{id:1},user:{id:2,artist_id:1,role:'artist'}},denied,()=>granted=true);assert.equal(granted,false);assert.equal(denied.code,403);
});

test('pending owner edit reads current channel and rejects transferred ownership',async()=>{
 for(const transfer of [false,true]){
 const db=memoryDb({artists:[{id:1,user_id:transfer?3:2,name:'A',channel_name:'admin-new'}]});const h=await harness({getDb:async()=>db});
 const r=await invoke(h,'put','/api/artists/:id',{params:{id:1},user:{id:2,role:'artist'},artist:{id:1,user_id:2,channel_name:'old'},body:{description:'edit'}});
 assert.equal(r.code,transfer?403:200);assert.equal(db.state().artists[0].channel_name,'admin-new');
 }
});

test('event participant authorization ignores unrelated primary selector',async()=>{
 const db=memoryDb({events:[{id:1,creator_id:9}],artists:[{id:1,user_id:3}],event_artists:[{event_id:1,artist_id:1}]});const h=await harness({getDb:async()=>db});const r=response();let allowed=false;
 await h.route('post','/api/events/:id/images').handlers[1]({params:{id:1},user:{id:2,role:'artist',artist_id:1}},r,()=>allowed=true);
 assert.equal(allowed,false);assert.equal(r.code,403);
});
test('mutation rechecks expired session and demoted admin after initial middleware',async()=>{
 for(const expired of [true,false]){
 const db=memoryDb({users:[{id:9,role:'user'}],sessions:[{token:'t',user_id:9,expires_at:expired?'2000-01-01':'2099-01-01'}],system_settings:[{key:'x',value:'old'}]});const h=await harness({getDb:async()=>db});
 const r=await invoke(h,'put','/api/settings/:key',{params:{key:'x'},headers:{authorization:'Bearer t'},token:'t',user:admin,body:{value:'new'}});
 assert.equal(r.code,expired?401:403);assert.equal(db.state().system_settings[0].value,'old');
 }
});

test('flyer replacement frees prior file/quota only after commit and preserves shared references',async()=>{
 for(const shared of [false,true]) for(const fail of [false,true]){
 const db=memoryDb({events:[{id:1,creator_id:2,flyer:'/uploads/old.webp'},...(shared?[{id:2,flyer:'/uploads/old.webp'}]:[])],uploads:[{filename:'old.webp',bytes:4,user_id:2}]},(t,a)=>fail&&t==='events'&&a==='update');
 const files=new Set(['/tmp/mss-test/uploads/old.webp']);let oldRemoved=false;
 const fs={existsSync:()=>true,promises:{mkdir:async()=>{},writeFile:async p=>files.add(p),rename:async(a,b)=>{files.delete(a);files.add(b)},unlink:async p=>{if(p.endsWith('/old.webp')){assert.equal(db.state().events[0].flyer,'/uploads/new.webp');oldRemoved=true;}files.delete(p)}}};
 const h=await harness({getDb:async()=>db,fs,decodeImage:async()=>Buffer.from('safe'),uuidv4:()=> 'new'});const r=response();let error;
 await h.route('post','/api/events/:id/flyer').handlers.at(-1)({params:{id:1},user:{id:2,role:'artist'},event:{id:1,flyer:'/uploads/stale.webp'},file:{buffer:Buffer.from('safe')}},r,e=>error=e);
 if(fail){assert.ok(error);assert.equal(oldRemoved,false);assert.equal(db.state().uploads.length,1);assert.equal(files.size,1);}else{assert.equal(r.code,200);assert.equal(oldRemoved,!shared);assert.equal(db.state().uploads.length,shared?2:1);}
 }
});

test('comment cursor is stable across deletions, starts at zero and rejects offset mixing',async()=>{
 const db=memoryDb({comments:[{id:1,artist_id:1},{id:3,artist_id:1},{id:5,artist_id:1}]});const h=await harness({getDb:async()=>db});
 let r=await invoke(h,'get','/api/comments',{query:{artist_id:'1',limit:'2',after_id:'0'}});
 assert.equal(r.body.next_cursor,3);assert.equal(r.body.next_offset,2);assert.equal(r.body.has_more,true);
 await db('comments').where({id:1}).del();
 r=await invoke(h,'get','/api/comments',{query:{artist_id:'1',limit:'2',after_id:'3'}});
 assert.deepEqual(Array.from(r.body.comments,c=>c.id),[5]);assert.equal(r.body.next_cursor,null);assert.equal(r.body.next_offset,null);
 for(const query of [{after_id:'0',offset:'0'},{after_id:'-1'},{after_id:'1.5'},{after_id:''},{after_id:'no'}]){
 r=await invoke(h,'get','/api/comments',{query:{artist_id:'1',...query}});assert.equal(r.code,400);
 }
});

test('ordinary user role remains supported on create and edit',async()=>{
 const db=memoryDb({users:[{id:1,username:'old',role:'artist'}]});const h=await harness({getDb:async()=>db,hashPassword:async()=> 'hash'});
 let r=await invoke(h,'post','/api/users',{user:admin,body:{username:'new',password:'long password here',role:'user'}});assert.equal(r.code,201);assert.equal(r.body.user.role,'user');
 r=await invoke(h,'put','/api/users/:id',{params:{id:1},user:admin,body:{role:'user'}});assert.equal(r.code,200);assert.equal(r.body.user.role,'user');
});

test('CORS uses configured exact origins and rejects wildcard credential configurations',async()=>{
 let options;await harness({URL,process:{env:{CORS_ORIGINS:'https://mss.example, http://localhost:5174'}},cors:o=>{options=o;return ()=>{}}});
 assert.deepEqual(Array.from(options.origin),['https://mss.example','http://localhost:5174']);assert.equal(options.credentials,true);
 for(const value of ['*','https://*.example','https://example/path','https://example/','null']) await assert.rejects(harness({URL,process:{env:{CORS_ORIGINS:value}}}),/CORS_ORIGINS/);
});

test('contradictory primary/list edits reject atomically and transfers reconcile selectors',async()=>{
 const db=memoryDb({users:[{id:1,artist_id:1},{id:2,artist_id:null}],artists:[{id:1,user_id:1},{id:2,user_id:2}]});const h=await harness({getDb:async()=>db});
 let r=await invoke(h,'put','/api/users/:id',{params:{id:2},user:admin,body:{artist_id:1,ownedArtistIds:[2]}});assert.equal(r.code,400);assert.equal(db.state().artists[0].user_id,1);
 r=await invoke(h,'put','/api/users/:id',{params:{id:2},user:admin,body:{artist_id:1,ownedArtistIds:[1]}});assert.equal(r.code,200);assert.equal(db.state().users[0].artist_id,null);assert.equal(db.state().artists[0].user_id,2);assert.equal(db.state().artists[1].user_id,null);
 r=await invoke(h,'put','/api/users/:id',{params:{id:2},user:admin,body:{artist_id:null}});assert.equal(r.code,200);assert.equal(db.state().users[1].artist_id,null);assert.equal(db.state().artists[0].user_id,2);
});
test('actual middleware chain revalidates ownership after an interleaved transfer',async()=>{
 const db=memoryDb({users:[{id:2,role:'artist'}],sessions:[{token:'t',user_id:2,expires_at:'2099-01-01'}],artists:[{id:1,user_id:2,channel_name:'old'}]});const h=await harness({getDb:async()=>db});
 const req={params:{id:1},headers:{authorization:'Bearer t'},body:{description:'pending'}};const r=response();const handlers=h.route('put','/api/artists/:id').handlers;
 for(const fn of handlers.slice(0,-1)){let allowed=false;await fn(req,r,e=>{if(e)throw e;allowed=true});assert.equal(allowed,true);}
 await db('artists').where({id:1}).update({user_id:3,channel_name:'new'});
 await handlers.at(-1)(req,r,e=>{throw e});assert.equal(r.code,403);assert.equal(db.state().artists[0].channel_name,'new');assert.equal(db.state().artists[0].description,undefined);assert.ok(db.locks.includes('artists'),'revalidation must lock the authoritative resource');
});

test('overlapping flyer replacements reread current state and reclaim every superseded upload',async()=>{
 const db=memoryDb({events:[{id:1,creator_id:2,flyer:'/uploads/old.webp'}],uploads:[{filename:'old.webp',bytes:4,user_id:2}]});
 // Deterministic model of the shared PostgreSQL advisory transaction lock.
 const transaction=db.transaction;let tail=Promise.resolve();let locks=0;
 db.raw=async sql=>{assert.match(sql,/pg_advisory_xact_lock\(1297306453\)/);locks++;};
 db.transaction=async fn=>{const previous=tail;let release;tail=new Promise(r=>release=r);await previous;try{return await transaction(fn);}finally{release();}};
 const files=new Set(['/tmp/mss-test/uploads/old.webp']);let id=0;
 const fs={existsSync:()=>true,promises:{mkdir:async()=>{},writeFile:async p=>files.add(p),rename:async(a,b)=>{files.delete(a);files.add(b)},unlink:async p=>files.delete(p)}};
 const h=await harness({getDb:async()=>db,fs,decodeImage:async()=>Buffer.from('safe'),uuidv4:()=> `new${++id}`});
 const replies=await Promise.all([1,2].map(()=>invoke(h,'post','/api/events/:id/flyer',{params:{id:1},user:{id:2,role:'artist'},event:{id:1,flyer:'/uploads/old.webp'},file:{buffer:Buffer.from('safe')}})));
 assert.ok(replies.every(r=>r.code===200));assert.equal(db.state().events[0].flyer,'/uploads/new2.webp');assert.equal(db.state().uploads.length,1);assert.equal(db.state().uploads[0].filename,'new2.webp');assert.deepEqual([...files],['/tmp/mss-test/uploads/new2.webp']);assert.equal(locks,4);
});
