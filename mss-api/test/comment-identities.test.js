import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, response } from './harness.js';
import { memoryDb } from './memory-db.js';
const fixture = (role='artist') => memoryDb({users:[{id:7,username:'Account',role}],sessions:[{token:'valid',user_id:7,expires_at:'2099-01-01'}],artists:[{id:1,name:'First',user_id:7},{id:2,name:'Second',user_id:7},{id:3,name:'Unrelated',user_id:8}],events:[{id:1}],comments:[]});
async function invoke(db, method, url, body={}) {
 const h=await harness({getDb:async()=>db}); const req={body,headers:{authorization:'Bearer valid'},ip:'identities'};const res=response();
 for(const handler of h.route(method,url).handlers){let next=false;await handler(req,res,e=>{if(e)throw e;next=true;});if(!next)break;}return res;
}
test('artist posts using selected genuine association and stores provenance',async()=>{
 const db=fixture();const res=await invoke(db,'post','/api/comments',{content:'Hello',event_id:1,author_artist_id:2});
 assert.equal(res.code,201);assert.equal(res.body.comment.author_name,'Second');assert.equal(res.body.comment.author_artist_id,2);assert.equal(res.body.comment.author_artist_name,'Second');assert.equal(res.body.comment.user_id,7);
});

test('only genuine associations are offered, and user role never offers artists',async()=>{
 for(const role of ['user','artist','admin']){
  const res=await invoke(fixture(role),'get','/api/comments/identities');
  assert.equal(res.code,200);assert.equal(JSON.stringify(res.body.identities),JSON.stringify(role==='user'?[]:[{id:1,name:'First'},{id:2,name:'Second'}]));
 }
});
test('strict comment schema rejects arbitrary identity and unsafe IDs',async()=>{
 for(const extra of [{author_name:'Forged'},{user_id:8},{username:'Forged'},{author_artist_id:'1e0'},{author_artist_id:true},{author_artist_id:9007199254740992},{author_artist_id:0}]){
  const db=fixture();const res=await invoke(db,'post','/api/comments',{content:'Hello',artist_id:1,...extra});assert.equal(res.code,400);assert.equal(db.state().comments.length,0);
 }
});
test('all roles default correctly on artist/event/reply targets and reject unrelated identity',async()=>{
 for(const role of ['user','artist','admin'])for(const count of [0,1,2])for(const target of [{artist_id:2},{event_id:1}]){
  const db=fixture(role);db.state().artists.forEach(a=>{if(a.id>count)a.user_id=8;});
  const first=await invoke(db,'post','/api/comments',{content:'Hello',...target});assert.equal(first.code,201);
  const expected=role==='user'||count===0?'Account':count===2&&target.artist_id?'Second':'First';
  assert.equal(first.body.comment.author_name,expected);
  const reply=await invoke(db,'post','/api/comments',{content:'Reply',...target,parent_id:first.body.comment.id});assert.equal(reply.code,201);assert.equal(reply.body.comment.author_name,expected);
  assert.equal((await invoke(db,'post','/api/comments',{content:'Forged',...target,author_artist_id:3})).code,403);
 }
});
test('association and role revoked while awaiting mutation lock cannot impersonate',async()=>{
 for(const kind of ['association','role','session']){
  const db=fixture();db.raw=async()=>{if(kind==='association')db.state().artists[1].user_id=8;if(kind==='role')db.state().users[0].role='user';if(kind==='session')db.state().sessions=[];};
  const res=await invoke(db,'post','/api/comments',{content:'Hello',event_id:1,author_artist_id:2});assert.equal(res.code,kind==='session'?401:403);assert.equal(db.state().comments.length,0);
 }
});
