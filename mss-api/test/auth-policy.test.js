import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { harness, response } from './harness.js';
import { memoryDb } from './memory-db.js';
test('new passwords accept 5 through 1024 and reject 4 and 1025 on every account endpoint', async () => {
 for(const [method,url] of [['post','/api/users'],['put','/api/users/:id'],['put','/api/auth/me']]) for(const length of [4,5,1024,1025]){
 const user={id:1,username:'Original',role:'admin'},db=memoryDb({users:[user],sessions:[]});
 const h=await harness({getDb:async()=>db,hashPassword:async p=>'hashed:'+p}),res=response();
 await h.route(method,url).handlers.at(-1)({body:{username:'Choice',password:'A'.repeat(length)},user,params:{id:1}},res,e=>{throw e});
 assert.equal(res.code,[4,1025].includes(length)?400:method==='post'?201:200,`${url} length ${length}`);
 }
});
test('mixed-case login preserves username; ambiguous legacy names fail closed; rate buckets ignore case',async()=>{
 for(const ambiguous of [false,true]){
 const db=memoryDb({users:[{id:1,username:'MiXeD',password:'Aa123',role:'user'},...(ambiguous?[{id:2,username:'mixed',password:'Aa123'}]:[])],sessions:[]});
 const h=await harness({getDb:async()=>db,verifyPassword:async(p,h)=>p===h,uuidv4:()=>crypto.randomUUID()});
 for(const [password,expected] of [['aa123',401],['Aa123',ambiguous?401:200]]){
 const res=response();await h.route('post','/api/auth/login').handlers.at(-1)({body:{username:'mIxEd',password},ip:'test'},res,e=>{throw e});
 assert.equal(res.code,expected);if(expected===200)assert.equal(res.body.user.username,'MiXeD');
 }
 for(let i=0;i<9;i++){const res=response();await h.route('post','/api/auth/login').handlers.at(-1)({body:{username:i%2?'MIXED':'mixed',password:'bad'},ip:'ip'+i},res,e=>{throw e});if(i===8)assert.equal(res.code,429);}
 assert.equal(db.state().users[0].username,'MiXeD');if(ambiguous)assert.equal(db.state().sessions.length,0);
 }
});

test('nonexistent and ambiguous logins never verify passwords or create sessions',async()=>{
 for(const users of [[],[{id:1,username:'Collision',password:'Aa123'},{id:2,username:'COLLISION',password:'Aa123'}]]){
 const db=memoryDb({users,sessions:[]});let verifications=0;
 const h=await harness({getDb:async()=>db,verifyPassword:async()=>{verifications++;return true}});
 for(let i=0;i<11;i++){
 const res=response();await h.route('post','/api/auth/login').handlers.at(-1)({body:{username:i%2?'COLLISION':'collision',password:'Aa123'},ip:'missing-ip'+i},res,e=>{throw e});
 assert.equal(res.code,i<10?401:429);
 }
 assert.equal(verifications,0);assert.equal(db.state().sessions.length,0);
 }
});
test('IP and global login admission reject before any database transaction',async()=>{
 for(const [limit,ip] of [[30,()=> 'one-ip'],[300,i=>'ip-'+i]]){
 let transactions=0;const db=memoryDb({users:[],sessions:[]});const transaction=db.transaction;
 db.transaction=async(...args)=>{transactions++;return transaction(...args)};
 const h=await harness({getDb:async()=>db,verifyPassword:async()=>{throw Error('must not verify')}});
 for(let i=0;i<=limit;i++){
 const res=response();await h.route('post','/api/auth/login').handlers.at(-1)({body:{username:'missing-'+i,password:'Aa123'},ip:ip(i)},res,e=>{throw e});
 assert.equal(res.code,i<limit?401:429);
 }
 assert.equal(transactions,limit);
 }
});
