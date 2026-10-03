import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, response } from './harness.js';
import { memoryDb } from './memory-db.js';
const fixture = () => memoryDb({users:[{id:7,username:'StoredName',display_name:'Not the username',role:'user'},{id:8,username:'Other',role:'user'}],sessions:[{token:'valid',user_id:7,expires_at:'2099-01-01'}],artists:[{id:1}],events:[{id:1}],comments:[]});
async function invoke(h, body, token) {
 const req={body,headers:token?{authorization:`Bearer ${token}`}:{},ip:'comment-test'};const res=response();
 for(const handler of h.route('post','/api/comments').handlers){let next=false;await handler(req,res,e=>{if(e)throw e;next=true;});if(!next)break;}return res;
}
test('anonymous and invalid sessions cannot create comments',async()=>{
 for(const token of [undefined,'invalid']){const db=fixture();const h=await harness({getDb:async()=>db});const res=await invoke(h,{content:'hello',artist_id:1,author_name:'Forged'},token);assert.equal(res.code,401);assert.equal(db.state().comments.length,0);}
});

test('authenticated artist and event comments and replies use the database username, never supplied identity',async()=>{
 for(const target of [{artist_id:1},{event_id:1}]){const db=fixture();const h=await harness({getDb:async()=>db});
 const first=await invoke(h,{content:'First',...target},'valid');assert.equal(first.code,201);assert.equal(first.body.comment.user_id,7);assert.equal(first.body.comment.author_name,'StoredName');
 const reply=await invoke(h,{content:'Reply',...target,parent_id:first.body.comment.id,author_name:'Spoof',user_id:8},'valid');assert.equal(reply.code,201);assert.equal(reply.body.comment.user_id,7);assert.equal(reply.body.comment.author_name,'StoredName');assert.equal(reply.body.comment.parent_id,first.body.comment.id);
 }
});

test('expired, disabled and deleted accounts cannot post',async()=>{
 for(const variant of ['expired','disabled','deleted']){const db=fixture();if(variant==='expired')db.state().sessions[0].expires_at='2000-01-01';if(variant==='disabled')db.state().users[0].is_disabled=true;if(variant==='deleted')db.state().users=[];const h=await harness({getDb:async()=>db});const res=await invoke(h,{content:'hello',event_id:1},'valid');assert.equal(res.code,variant==='disabled'?403:401);assert.equal(db.state().comments.length,0);}
});
test('session revoked while waiting for the mutation lock is revalidated',async()=>{
 const db=fixture();db.raw=async()=>{db.state().sessions=[];};const h=await harness({getDb:async()=>db});const res=await invoke(h,{content:'hello',artist_id:1},'valid');assert.equal(res.code,401);assert.equal(db.state().comments.length,0);
});
test('session revoked while waiting for the user row lock cannot authorize a comment',async()=>{
 const db=fixture();const wrapped=table=>{const q=db(table);if(table==='users'){const lock=q.forUpdate;q.forUpdate=()=>{db.state().sessions=[];return lock();};}return q;};Object.assign(wrapped,db);wrapped.transaction=fn=>db.transaction(()=>fn(wrapped));
 const h=await harness({getDb:async()=>wrapped});const res=await invoke(h,{content:'hello',artist_id:1},'valid');assert.equal(res.code,401);assert.equal(db.state().comments.length,0);
});
