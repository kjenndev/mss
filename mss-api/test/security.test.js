import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryDb } from './memory-db.js';
import { hashPassword, verifyPassword } from '../db.js';
import { harness, response } from './harness.js';
test('async route database rejection reaches error middleware',async()=>{
 const h=await harness({getDb:async()=>{throw Error('synthetic failure')}}); let captured;
 await h.route('get','/api/artists').handlers.at(-1)({},response(),e=>{captured=e});
 assert.equal(captured?.message,'synthetic failure');
});
test('artist detail strips secret and unexpected columns',async()=>{
 const h=await harness({getDb:async()=>()=>({where(){return this},first:async()=>({id:1,name:'artist',stream_key:'secret',twitch_stream_key:'secret',future_secret:'secret'})})});
 const res=response(); await h.route('get','/api/artists/:id').handlers.at(-1)({params:{id:1}},res,e=>{throw e});
 assert.deepEqual(Object.keys(res.body.artist).sort(),['id','name']);
});
test('legacy login upgrades verifier, expires session, returns safe user',async()=>{
 const db=memoryDb({users:[{id:1,username:'legacy',password:'5ebe2294ecd0e0f08eab7690d2a6ee69',role:'artist',is_disabled:0}],sessions:[]});
 const h=await harness({getDb:async()=>db,hashPassword,verifyPassword,uuidv4:()=> 'test-token'});
 const res=response(); await h.route('post','/api/auth/login').handlers.at(-1)({body:{username:'legacy',password:'secret'},ip:'test'},res,e=>{throw e});
 assert.equal(res.code,200); assert.equal(res.body.user.password,undefined); assert.match(db.state().users[0].password,/^scrypt\$/);
 assert.ok(new Date(db.state().sessions[0].expires_at)>Date.now());
});
test('expired sessions are rejected',async()=>{
 const db=memoryDb({sessions:[{token:'old',user_id:1,created_at:'2000-01-01',expires_at:'2000-01-02'}],users:[{id:1,role:'artist'}]});
 const h=await harness({getDb:async()=>db});const res=response();let accepted=false;
 await h.route('get','/api/auth/me').handlers[0]({headers:{authorization:'Bearer old'}},res,()=>{accepted=true});
 assert.equal(res.code,401);assert.equal(accepted,false);
});
test('failed event lineup update rolls back fields and associations',async()=>{
 const db=memoryDb({artists:[{id:3}],events:[{id:1,title:'original'}],event_artists:[{event_id:1,artist_id:2}]},(t,a)=>t==='event_artists'&&a==='insert');
 const h=await harness({getDb:async()=>db,console:{log(){},error(){}}}); const res=response();
 await h.route('put','/api/events/:id').handlers.at(-1)({body:{title:'changed',artist_ids:[3]},event:{id:1}},res,e=>{throw e});
 assert.equal(res.code,500);assert.equal(db.state().events[0].title,'original');assert.equal(db.state().event_artists[0].artist_id,2);
});
test('credential changes revoke all old sessions atomically',async()=>{
 for(const url of ['/api/auth/me','/api/users/:id']){
 const db=memoryDb({users:[{id:1,username:'old',role:'admin'}],sessions:[{user_id:1,token:'old'}],artists:[]});
 const h=await harness({getDb:async()=>db,hashPassword,console:{log(){},error(){}}});const res=response();
 await h.route('put',url).handlers.at(-1)({body:{password:'new long password'},user:{id:1,username:'old',role:'admin'},params:{id:1}},res,e=>{throw e});
 assert.equal(res.code,200);assert.equal(db.state().sessions.length,0);
 }
});
test('typed malformed artist and event bodies are rejected before mutation',async()=>{
 for(const [method,url,body] of [['post','/api/artists',{name:{x:1}}],['put','/api/events/:id',{artist_ids:[1,1]}],['put','/api/auth/me',{password:123}],['post','/api/users',{username:'a',password:'four'}]]){
 const db=memoryDb();const h=await harness({getDb:async()=>db});const res=response();
 await h.route(method,url).handlers.at(-1)({body,params:{id:1},user:{role:'admin'}},res,e=>{throw e});
 assert.equal(res.code,400);assert.equal(db.operations.length,0);
 }
});
test('central error boundary hides internal details and maps known client errors',async()=>{
 const h=await harness();const handler=h.app.middleware.flat().find(f=>typeof f==='function'&&f.length===4);
 assert.equal(typeof handler,'function');
 for(const [error,code] of [[Error('secret database details'),500],[Object.assign(Error('secret'),{code:'23503'}),409],[Object.assign(Error('secret'),{type:'entity.parse.failed'}),400]]){
 const res=response();handler(error,{},res,()=>{});assert.equal(res.code,code);assert.equal(JSON.stringify(res.body).includes('secret'),false);
 }
});
test('repeated login attempts are throttled before password work',async()=>{
 const db=memoryDb();const h=await harness({getDb:async()=>db});let res;
 for(let i=0;i<11;i++){res=response();await h.route('post','/api/auth/login').handlers.at(-1)({body:{username:'absent',password:'wrong'},ip:'test-ip'},res,e=>{throw e});}
 assert.equal(res.code,429);
});
test('nonadmin cannot reassign a channel; invalid channel names rejected',async()=>{
 for(const [role,channel_name,code] of [['artist','new-channel',403],['admin','bad/channel',400]]){
 const db=memoryDb({artists:[{id:1,name:'A',channel_name:'original'}]});const h=await harness({getDb:async()=>db});const res=response();
 await h.route('put','/api/artists/:id').handlers.at(-1)({body:{channel_name},artist:db.state().artists[0],user:{role}},res,e=>{throw e});assert.equal(res.code,code);assert.equal(db.state().artists[0].channel_name,'original');
 }
});
test('image deletion clears cover and waits for commit before file removal',async()=>{
 for(const fail of [false,true]){
 const db=memoryDb({artists:[{id:1,cover_photo:'/uploads/one.jpg'}],artist_images:[{id:1,artist_id:1,filename:'one.jpg'}]},(t,a)=>fail&&t==='artists'&&a==='update');let unlinked=0;
 const h=await harness({getDb:async()=>db,fs:{existsSync:()=>true,promises:{unlink:async()=>{unlinked++}}}});const res=response();let error;
 await h.route('delete','/api/artists/:id/images/:imageId').handlers.at(-1)({params:{id:1,imageId:1},artist:db.state().artists[0]},res,e=>{error=e});
 if(fail){assert.ok(error);assert.equal(unlinked,0);assert.equal(db.state().artist_images.length,1);}else{assert.equal(db.state().artists[0].cover_photo,null);assert.equal(unlinked,1);}
 }
});
test('optional event date clears to null and invalid dates are rejected',async()=>{
 for(const [date,code] of [['',200],['not a date',400],[{},400]]){
 const db=memoryDb({events:[{id:1,title:'Event',date:'2026-01-01'}]});const h=await harness({getDb:async()=>db});const res=response();
 await h.route('put','/api/events/:id').handlers.at(-1)({body:{date},event:db.state().events[0]},res,e=>{throw e});assert.equal(res.code,code);if(code===200)assert.equal(db.state().events[0].date,null);
 }
});
test('authenticated comments require exactly one existing target and same-scope parent',async()=>{
 for(const [fields,code] of [[{},400],[{artist_id:1,event_id:1},400],[{artist_id:99},404],[{artist_id:1,parent_id:2},400],[{artist_id:1,parent_id:99},400],[{artist_id:1},201]]){
 const db=memoryDb({users:[{id:7,username:'Member',role:'user'}],sessions:[{token:'comment-token',user_id:7,expires_at:'2099-01-01'}],artists:[{id:1}],comments:[{id:2,artist_id:2,event_id:null}]});const h=await harness({getDb:async()=>db});const res=response();
 await h.route('post','/api/comments').handlers.at(-1)({headers:{authorization:'Bearer comment-token'},token:'comment-token',body:{content:'hello',...fields},ip:'member'},res,e=>{throw e});assert.equal(res.code,code);if(code===201)assert.equal(res.body.comment.user_id,7);
 }
});
test('authenticated comment floods are throttled',async()=>{
 const db=memoryDb({users:[{id:7,username:'Member',role:'user'}],sessions:[{token:'comment-token',user_id:7,expires_at:'2099-01-01'}],artists:[{id:1}]});const h=await harness({getDb:async()=>db});let res;
 for(let i=0;i<21;i++){res=response();await h.route('post','/api/comments').handlers.at(-1)({headers:{authorization:'Bearer comment-token'},token:'comment-token',body:{content:'hello',artist_id:1},ip:'member'},res,e=>{throw e});}assert.equal(res.code,429);
});
test('event upload authorizes object before accepting multipart data',async()=>{
 for(const events of [[],[{id:1,creator_id:2}]]){
 const db=memoryDb({events,event_artists:[]});const h=await harness({getDb:async()=>db});const res=response();let next=false;
 await h.route('post','/api/events/:id/images').handlers[1]({params:{id:1},user:{id:3,artist_id:null,role:'artist'}},res,()=>{next=true});
 assert.equal(next,false);assert.equal(res.code,events.length?403:404);
 }
});
test('upload SQL failure cleans staged files and success publishes randomized raster',async()=>{
 for(const fail of [false,true]){
 const db=memoryDb({users:[{id:1}],artists:[{id:1,user_id:1}],uploads:[]},(t,a)=>{if(fail&&t==='artist_images'&&a==='insert')throw Object.assign(Error('synthetic constraint'),{code:'23503'});return false});let decoded=0;const files=new Set();
 const fakeFs={existsSync:()=>true,promises:{mkdir:async()=>{},writeFile:async p=>files.add(p),rename:async(a,b)=>{files.delete(a);files.add(b)},unlink:async p=>files.delete(p)}};
 const h=await harness({getDb:async()=>db,fs:fakeFs,decodeImage:async()=>{decoded++;return Buffer.from('safe')},uuidv4:()=> 'random-name'});const res=response();let error;
 await h.route('post','/api/artists/:id/upload').handlers.at(-1)({file:{buffer:Buffer.from('input'),filename:'unsafe.html'},user:{id:1},artist:{id:1}},res,e=>{error=e});
 assert.equal(decoded,1);if(fail){assert.ok(error);assert.equal(files.size,0);assert.equal(db.state().uploads.length,0);}else{assert.equal(res.body.filename,'random-name.webp');assert.equal(files.size,1);assert.equal(db.state().uploads.length,1);assert.equal(db.state().artist_images[0].uploader_user_id,1);}
 }
});
test('missing CRUD references reject before writes; removed ownership revokes primary grant',async()=>{
 const db=memoryDb({users:[{id:1,username:'owner',artist_id:2}],artists:[{id:2,user_id:1}]});const h=await harness({getDb:async()=>db});let res=response();
 await h.route('post','/api/events').handlers.at(-1)({body:{title:'Event',artist_ids:[99]},user:{id:1}},res,e=>{throw e});assert.equal(res.code,400);assert.equal(db.operations.length,0);
 res=response();await h.route('put','/api/users/:id').handlers.at(-1)({body:{ownedArtistIds:[]},params:{id:1},user:{id:3}},res,e=>{throw e});assert.equal(db.state().users[0].artist_id,null);assert.equal(db.state().artists[0].user_id,null);
});
test('persistent uploader quota denies before disk write',async()=>{
 const db=memoryDb({uploads:[{user_id:1,bytes:100*1024*1024}]});let writes=0;
 const h=await harness({getDb:async()=>db,decodeImage:async()=>Buffer.from('safe'),uuidv4:()=> 'name',fs:{existsSync:()=>true,promises:{mkdir:async()=>{},writeFile:async()=>{writes++},rename:async()=>{},unlink:async()=>{}}}});const res=response();let error;
 await h.route('post','/api/admin/upload').handlers.at(-1)({file:{buffer:Buffer.from('safe')},user:{id:1}},res,e=>{error=e});assert.equal(error?.status,413);assert.equal(writes,0);
});
test('legacy active uploads are blocked without deleting files',async()=>{
 const h=await harness();const mounted=h.app.middleware.find(args=>args[0]==='/uploads');let reached=false;const res=response();res.set=()=>res;
 mounted[1]({path:'/old.html'},res,()=>{reached=true});assert.equal(reached,false);assert.equal(res.code,404);
});
test('comment pagination keeps arrays and explicit continuation to every record',async()=>{
 const db=memoryDb({comments:Array.from({length:105},(_,i)=>({id:i+1,artist_id:1}))});const h=await harness({getDb:async()=>db});let res=response();
 await h.route('get','/api/comments').handlers.at(-1)({query:{artist_id:'1'}},res,e=>{throw e});assert.equal(res.body.comments.length,100);assert.equal(res.body.has_more,true);assert.equal(res.body.next_offset,100);
 const ids=res.body.comments.map(c=>c.id);res=response();await h.route('get','/api/comments').handlers.at(-1)({query:{artist_id:'1',offset:'100'}},res,e=>{throw e});assert.equal(res.body.has_more,false);assert.equal(new Set([...ids,...res.body.comments.map(c=>c.id)]).size,105);
});
test('successful image deletion releases persistent quota and records upload attribution',async()=>{
 const db=memoryDb({artists:[{id:1}],artist_images:[{id:1,artist_id:1,filename:'one.jpg'}],uploads:[{filename:'one.jpg',bytes:10,user_id:1}]});const h=await harness({getDb:async()=>db,fs:{existsSync:()=>true,promises:{unlink:async()=>{}}}});const res=response();
 await h.route('delete','/api/artists/:id/images/:imageId').handlers.at(-1)({params:{imageId:1},artist:{id:1}},res,e=>{throw e});assert.equal(db.state().uploads.length,0);
});
test('aborted mutation rolls back without running post-commit file deletion',async()=>{
 const db=memoryDb({artists:[{id:1}],artist_images:[{id:1,artist_id:1,filename:'one.jpg'}]});let unlinked=0;const h=await harness({getDb:async()=>db,fs:{existsSync:()=>true,promises:{unlink:async()=>{unlinked++}}}});const res=response();
 await h.route('delete','/api/artists/:id/images/:imageId').handlers.at(-1)({params:{imageId:1},artist:{id:1},aborted:true},res,e=>{throw e});assert.equal(db.state().artist_images.length,1);assert.equal(unlinked,0);assert.equal(res.code,400);
});
test('multipart admission bounds concurrent buffers and releases on close',async()=>{
 const h=await harness();let last,nextCount=0;const listeners=[];
 for(let i=0;i<3;i++){last=response();last.once=(name,fn)=>{if(name==='close')listeners.push(fn)};await h.route('post','/api/admin/upload').handlers[2]({user:{id:1}},last,()=>{nextCount++});}
 assert.equal(last.code,429);assert.equal(nextCount,2);listeners[0]();last=response();last.once=()=>{};await h.route('post','/api/admin/upload').handlers[2]({user:{id:1}},last,()=>{nextCount++});assert.equal(nextCount,3);
});
test('direct artist ownership reassignment revokes old primary grants',async()=>{
 const db=memoryDb({artists:[{id:1,name:'A',user_id:1}],users:[{id:1,artist_id:1},{id:2,artist_id:null}]});const h=await harness({getDb:async()=>db});const res=response();
 await h.route('put','/api/artists/:id').handlers.at(-1)({body:{user_id:2},artist:{...db.state().artists[0]},user:{id:3,role:'admin'}},res,e=>{throw e});assert.equal(db.state().users[0].artist_id,null);assert.equal(db.state().artists[0].user_id,2);
});
test('malformed settings batches are rejected before mutation',async()=>{
 for(const body of [{settings:[null]},{settings:[{key:'site_name',value:{bad:true}}]},{settings:[{key:'site_name',value:'a'},{key:'site_name',value:'b'}]}]){
 const db=memoryDb();const h=await harness({getDb:async()=>db});const res=response();await h.route('post','/api/settings/batch').handlers.at(-1)({body},res,e=>{throw e});assert.equal(res.code,400);assert.equal(db.operations.length,0);
 }
});
test('unchanged credentials in profile forms do not revoke sessions',async()=>{
 for(const url of ['/api/auth/me','/api/users/:id']){
 const db=memoryDb({users:[{id:1,username:'same',role:'admin',is_disabled:0}],sessions:[{user_id:1,token:'existing'}],artists:[]});const h=await harness({getDb:async()=>db});const res=response();await h.route('put',url).handlers.at(-1)({params:{id:1},user:{id:1,username:'same',role:'admin'},body:{username:'same',...(url==='/api/users/:id'?{role:'admin',is_disabled:0}:{}),display_name:'New display',password:''}},res,e=>{throw e});assert.equal(res.code,200);assert.equal(db.state().sessions.length,1);
 }
});
test('numeric login password is rejected before DB access',async()=>{
 const h=await harness({getDb:async()=>{throw Error('DB must not run')},hashPassword:()=>{throw Error('hash must not run')}});
 const res=response(); await h.route('post','/api/auth/login').handlers.at(-1)({body:{username:'x',password:123}},res, e=>{throw e});
 assert.equal(res.code,400);
});
