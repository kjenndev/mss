import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import knex from 'knex';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {harness, response} from './harness.js';
import {createRegistrationRouter} from '../registration.js';
const database=process.env.MSS_REGISTRATION_TEST_DB;
const migration='20261003010000_case_insensitive_usernames.js';
test('native auth policy, indexes and races', {skip:!database}, async t=>{
 assert.match(database,/^mss_registration_test_[a-z0-9_]+$/);
 const db=knex({client:'pg',connection:{host:'/var/run/postgresql',user:'postgres',database}});
 let server;
 try{
 const directory=new URL('../migrations',import.meta.url).pathname;
 await db.migrate.latest({directory});
 await db('users').del();await db('pending_registrations').del();await db('registration_rate_limits').del();
 const source=(await fs.readFile(new URL('../db.js',import.meta.url),'utf8')).split('const derive =')[1].split('export async function initializeDB')[0].replaceAll('export ','');
 const passwords=vm.runInNewContext('const derive ='+source+';({hashPassword,verifyPassword})',{crypto,Buffer});
 const app=express();app.use(express.json());
 const h=await harness({getDb:async()=>db,...passwords,uuidv4:()=>crypto.randomUUID()});
 for(const [method,path] of [['post','/api/auth/login'],['post','/api/users'],['put','/api/users/:id'],['put','/api/auth/me']])app[method](path,...h.route(method,path).handlers);
 const env={EMAIL_SETTINGS_ENCRYPTION_KEY:crypto.randomBytes(32).toString('base64'),NODE_ENV:'test',EMAIL_VERIFIED_SENDER_DOMAIN:'example.com'};
 const mails=[];
 app.use(createRegistrationRouter({getDb:async()=>db,...passwords,env,sendMail:async m=>mails.push(m),limits:{ip:1000,account:1000,global:1000}}));
 app.use(h.app.middleware.flat().find(f=>typeof f==='function'&&f.length===4));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const call=async(path,body,token,method='POST')=>{const r=await fetch(`http://127.0.0.1:${server.address().port}`+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});return {status:r.status,body:await r.json()}};
 const [admin]=await db('users').insert({username:'PolicyAdmin',password:await passwords.hashPassword('Aa123'),role:'admin'}).returning('*');
 const session=async id=>{const token=crypto.randomUUID();await db('sessions').insert({token,user_id:id,expires_at:new Date(Date.now()+3600000)});return token};
 const adminToken=await session(admin.id);
 await t.test('login ignores username case only and preserves capitalization',async()=>{
 assert.equal((await call('/api/auth/login',{username:'POLICYADMIN',password:'aa123'})).status,401);
 const r=await call('/api/auth/login',{username:'pOLICYaDMIN',password:'Aa123'});assert.equal(r.status,200);assert.equal(r.body.user.username,'PolicyAdmin');
 const [legacy]=await db('users').insert({username:'LegacyShort',password:crypto.createHash('md5').update('Ab').digest('hex'),role:'artist'}).returning('*');
 assert.equal((await call('/api/auth/login',{username:'LEGACYSHORT',password:'Ab'})).status,200);
 assert.match((await db('users').where({id:legacy.id}).first()).password,/^scrypt\$/);
 });
 await t.test('PostgreSQL-equivalent Unicode aliases share ten password attempts across IPs',async()=>{
 const aliases=['IIIIIIIIII','İİİİİİİİİİ'];
 assert.notEqual(aliases[0].toLowerCase(),aliases[1].toLowerCase());
 const normalization=await db.raw('SELECT lower(?) = lower(?) AS same',aliases);
 assert.equal(normalization.rows[0].same,true,'disposable PostgreSQL must reproduce the Unicode alias mismatch');
 const [user]=await db('users').insert({username:aliases[0],password:await passwords.hashPassword('Aa123')}).returning('*');
 let verifications=0;
 const isolated=await harness({getDb:async()=>db,...passwords,verifyPassword:async(...args)=>{verifications++;return passwords.verifyPassword(...args)},uuidv4:()=>crypto.randomUUID()});
 const login=isolated.route('post','/api/auth/login').handlers.at(-1);
 for(let i=0;i<12;i++){
 const res=response();
 await login({body:{username:aliases[i%2],password:i===0||i>=10?'Aa123':'wrong'},ip:'unicode-ip-'+i},res,error=>{throw error});
 assert.equal(res.code,i===0?200:i<10?401:429,'shared account attempt '+(i+1));
 }
 assert.equal(verifications,10,'blocked aliases never reach password verification');
 assert.equal((await db('sessions').where({user_id:user.id})).length,1);
 assert.equal((await db('users').where({id:user.id}).first()).username,aliases[0]);
 });
 await t.test('all new-password endpoint boundaries use real scrypt',async()=>{
 for(const length of [4,5,1024,1025]){
 const password='A'.repeat(length),ok=[5,1024].includes(length);
 const r=await call('/api/users',{username:'Boundary'+length,password,role:'user'},adminToken);
 assert.equal(r.status,ok?201:400,'create '+length);
 const [user]=await db('users').insert({username:'EditBoundary'+length,password:await passwords.hashPassword('Start'),role:'user'}).returning('*');
 for(const path of ['/api/users/'+user.id,'/api/auth/me']){
 const token=path==='/api/auth/me'?await session(user.id):adminToken;
 assert.equal((await call(path,{password},token,'PUT')).status,ok?200:400,path+' '+length);
 if(ok)assert.equal(await passwords.verifyPassword(password,(await db('users').where({id:user.id}).first()).password),true);
 }
 }
 });
 await t.test('case duplicates across create, admin edit and self rename conflict; case-only own rename works',async()=>{
 assert.equal((await call('/api/users',{username:'POLICYADMIN',password:'Aa123'},adminToken)).status,409);
 const [u]=await db('users').insert({username:'RenameMe',password:await passwords.hashPassword('Aa123')}).returning('*');
 for(const path of ['/api/users/'+u.id,'/api/auth/me'])assert.equal((await call(path,{username:'POLICYADMIN'},path==='/api/auth/me'?await session(u.id):adminToken,'PUT')).status,409);
 assert.equal((await call('/api/auth/me',{username:'RENAMEME'},await session(u.id),'PUT')).status,200);
 assert.equal((await db('users').where({id:u.id}).first()).username,'RENAMEME');
 const results=await Promise.all(['CreateRace','CREATERACE'].map(username=>call('/api/users',{username,password:'Aa123'},adminToken)));
 assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
 const edits=await Promise.all(['EditRaceA','EditRaceB'].map(async username=>(await db('users').insert({username,password:'synthetic'}).returning('*'))[0]));
 const renamed=await Promise.all(edits.map((u,i)=>call('/api/users/'+u.id,{username:i?'EDITRACE':'EditRace'},adminToken,'PUT')));
 assert.deepEqual(renamed.map(r=>r.status).sort(),[200,409]);
 });
 await call('/api/admin/email-settings',{enabled:true,from_email:'accounts@example.com',from_name:'MSS',reply_to:'support@example.com',public_url:'https://example.com',api_key:'re_synthetic'},adminToken,'PUT');
 const completion={password:'Aa123',accept_terms:true,confirm_adult:true,terms_version:'2026-10-03',privacy_version:'2026-10-03',email_alerts_opt_in:false};
 const pending=async(username,email)=>{assert.equal((await call('/api/auth/register',{username,email})).status,202);return new URL(mails.at(-1).url).hash.slice(7)};
 await t.test('registration completion password boundaries and original casing',async()=>{
 for(const length of [4,5,1024,1025]){
 const username='RegistrationBoundary'+length,token=await pending(username,'boundary'+length+'@example.com');
 const r=await call('/api/auth/verify-email',{...completion,token,username,password:'A'.repeat(length)});
 assert.equal(r.status,[5,1024].includes(length)?200:400,'registration '+length);
 if(r.status===200){const u=await db('users').where({username}).first();assert.equal(u.username,username);assert.equal(await passwords.verifyPassword('A'.repeat(length),u.password),true);}
 }
 });
 await t.test('pending casing races admit only one suggestion; activation casing races conflict',async()=>{
 const start=mails.length;
 const r=await Promise.all(['PendingRace','PENDINGRACE'].map((username,i)=>call('/api/auth/register',{username,email:'pendingrace'+i+'@example.com'})));
 assert.deepEqual(r.map(x=>x.status),[202,202]);assert.equal(mails.length,start+1);
 assert.equal((await db('pending_registrations').whereRaw('lower(username) = lower(?)',['PendingRace'])).length,1);
 await Promise.all([0,1].map(i=>pending('ActivationSuggestion'+i,'activation'+i+'@example.com')));
 // Resolve each token by recipient, not delivery order.
 const results=await Promise.all([0,1].map(i=>call('/api/auth/verify-email',{...completion,token:new URL(mails.find(m=>m.email==='activation'+i+'@example.com').url).hash.slice(7),username:i?'ACTIVATIONRACE':'ActivationRace'})));
 assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
 const blocked=await pending('ExistingSuggestion','existing@example.com');
 assert.equal((await call('/api/auth/verify-email',{...completion,token:blocked,username:'POLICYADMIN'})).status,409);
 const n=mails.length;assert.equal((await call('/api/auth/register',{username:'POLICYADMIN',email:'nosend@example.com'})).status,202);assert.equal(mails.length,n);
 });
 await t.test('self renames and activation versus admin writes race without duplicate accounts',async()=>{
 const users=await Promise.all([0,1].map(async i=>(await db('users').insert({username:'SelfRace'+i,password:'synthetic'}).returning('*'))[0]));
 const sessions=await Promise.all(users.map(u=>session(u.id)));
 const r=await Promise.all(users.map((u,i)=>call('/api/auth/me',{username:i?'SELFCLAIM':'SelfClaim'},sessions[i],'PUT')));
 assert.deepEqual(r.map(x=>x.status).sort(),[200,409]);
 assert.equal((await db('users').whereRaw('lower(username) = lower(?)',['SelfClaim'])).length,1);
 const token=await pending('CrossSuggestion','crossrace@example.com');
 const cross=await Promise.all([
 call('/api/users',{username:'CrossClaim',password:'Aa123'},adminToken),
 call('/api/auth/verify-email',{...completion,token,username:'CROSSCLAIM'})
 ]);
 assert.equal(cross.filter(x=>x.status===409).length,1);
 assert.equal(cross.filter(x=>x.status===200||x.status===201).length,1);
 assert.equal((await db('users').whereRaw('lower(username) = lower(?)',['CrossClaim'])).length,1);
 });
 await t.test('database indexes reject concurrent case variants without HTTP locks',async()=>{
 for(const table of ['users','pending_registrations']){
 const rows=['IndexRace','INDEXRACE'].map((username,i)=>table==='users'?{username,password:'synthetic'}:{id:crypto.randomUUID(),username,email:'index'+i+'@example.com',expires_at:new Date(Date.now()+3600000)});
 const r=await Promise.allSettled(rows.map(row=>db(table).insert(row)));
 assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(r.find(x=>x.status==='rejected').reason.code,'23505');
 }
 });
 await t.test('additive migration fails closed on user and pending legacy collisions without data changes',async()=>{
 await db.migrate.down({directory,name:migration});
 for(const table of ['users','pending_registrations']){
 const rows=['Collision','COLLISION'].map((username,i)=>table==='users'?{username,password:crypto.createHash('md5').update('original').digest('hex')}:{id:crypto.randomUUID(),username,email:'collision'+i+'@example.com',expires_at:new Date(Date.now()+3600000)});
 await db(table).insert(rows);
 const before=await db(table).orderBy('id');
 await assert.rejects(()=>db.migrate.up({directory,name:migration}),error=>error.code==='23505');
 assert.equal((await db('pg_indexes').whereIn('indexname',['users_username_lower_unique','pending_registrations_username_lower_unique'])).length,0,'failed migration rolls back both indexes');
 assert.deepEqual(await db(table).orderBy('id'),before);
 if(table==='users')assert.equal((await call('/api/auth/login',{username:'collision',password:'original'})).status,401);
 await db(table).whereIn('username',['Collision','COLLISION']).del();
 }
 await db.migrate.up({directory,name:migration});
 });
 }finally{if(server)await new Promise(r=>server.close(r));await db.destroy()}
});
