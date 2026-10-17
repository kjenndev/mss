import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createStreamManager, issueGrantForCurrentOwner } from '../stream-manager.js';
import { harness, response } from './harness.js';
import { memoryDb } from './memory-db.js';

const keys = crypto.generateKeyPairSync('ed25519');
const env = {
  MSS_STREAM_MANAGER_ENABLED: 'true',
  MSS_STREAM_MANAGER_ISSUER: 'https://mss.example.test',
  MSS_STREAM_MANAGER_AUDIENCE: 'streaming-platform',
  MSS_STREAM_MANAGER_PLATFORM_ORIGIN: 'https://platform.example.test',
  MSS_STREAM_MANAGER_PRIVATE_KEY: keys.privateKey.export({format:'pem',type:'pkcs8'}),
  MSS_STREAM_MANAGER_INTROSPECTION_TOKEN: 'separate-backchannel-secret-with-32-bytes',
  MSS_STREAM_MANAGER_CHANNEL_MAP: JSON.stringify({7:'mapped-channel'}),
};

test('issues a short lived asymmetric channel grant only for an exact owned mapping', () => {
  let now = 1_800_000_000_000;
  const manager = createStreamManager({env, now:()=>now, randomBytes:n=>Buffer.alloc(n, 3)});
  const issued = manager.issueGrant({sessionToken:'session-secret', user:{id:4,role:'admin'}, artist:{id:7,user_id:4,channel_name:'mapped-channel',name:'Artist'}});
  assert.equal(issued.expiresIn, 90);
  assert.equal(issued.platformOrigin, 'https://platform.example.test');
  const [body,signature] = issued.grant.split('.');
  assert.equal(crypto.verify(null, Buffer.from(body), keys.publicKey, Buffer.from(signature,'base64url')), true);
  const claims = JSON.parse(Buffer.from(body,'base64url'));
  assert.deepEqual({iss:claims.iss,aud:claims.aud,purpose:claims.purpose,channel:claims.channel,artistId:claims.artistId,subject:claims.sub}, {
    iss:'https://mss.example.test',aud:'streaming-platform',purpose:'manager',channel:'mapped-channel',artistId:7,subject:'mss-user:4'
  });
  assert.equal(claims.exp-claims.iat,90);
  assert.equal('sessionToken' in claims,false);
  assert.throws(()=>manager.issueGrant({sessionToken:'x',user:{id:4,role:'admin'},artist:{id:8,user_id:4,channel_name:'other'}}),/not configured/i);
  assert.throws(()=>manager.issueGrant({sessionToken:'x',user:{id:4,role:'admin'},artist:{id:7,user_id:9,channel_name:'mapped-channel'}}),/owned/i);
});

test('introspection revalidates current session role ownership channel and mapping', async () => {
  const manager=createStreamManager({env});
  const grant=manager.issueGrant({sessionToken:'active',user:{id:4,role:'artist'},artist:{id:7,user_id:4,channel_name:'mapped-channel',name:'Artist'}}).grant;
  const lookup=async()=>({session:{token:'active',user_id:4,expires_at:'2099-01-01'},user:{id:4,role:'artist',is_disabled:false},artist:{id:7,user_id:4,channel_name:'mapped-channel',name:'Artist',is_disabled:false}});
  assert.deepEqual(await manager.introspect({authorization:'Bearer separate-backchannel-secret-with-32-bytes',grant,lookup}),{active:true,channel:'mapped-channel',artistId:7,displayName:'Artist'});
  assert.deepEqual(await manager.introspect({authorization:'Bearer wrong',grant,lookup}),{active:false});
  assert.deepEqual(await manager.introspect({authorization:'Bearer separate-backchannel-secret-with-32-bytes',grant,lookup:async()=>({...await lookup(),user:{id:4,role:'user'}})}),{active:false});
});

test('grant registry performs one exact session lookup and revokes all grants on restart', async () => {
  const manager=createStreamManager({env});
  const grant=manager.issueGrant({sessionToken:'active',user:{id:4,role:'artist'},artist:{id:7,user_id:4,channel_name:'mapped-channel',name:'Artist'}}).grant;
  const lookups=[];
  const lookup=async(_claims,sessionToken)=>{lookups.push(sessionToken);return {session:{token:sessionToken,user_id:4,expires_at:'2099-01-01'},user:{id:4,role:'artist',is_disabled:false},artist:{id:7,user_id:4,channel_name:'mapped-channel',name:'Artist',is_disabled:false}}};
  assert.equal((await manager.introspect({authorization:'Bearer separate-backchannel-secret-with-32-bytes',grant,lookup})).active,true);
  assert.deepEqual(lookups,['active']);
  assert.deepEqual(await createStreamManager({env}).introspect({authorization:'Bearer separate-backchannel-secret-with-32-bytes',grant,lookup}),{active:false});
  assert.deepEqual(lookups,['active']);
});

test('grant registry denies issuance at capacity after purging only expired entries', () => {
  let now=1_800_000_000_000;
  const manager=createStreamManager({env,now:()=>now,registryCapacity:1});
  const input={sessionToken:'one',user:{id:4,role:'artist'},artist:{id:7,user_id:4,channel_name:'mapped-channel',name:'Artist'}};
  manager.issueGrant(input);
  assert.throws(()=>manager.issueGrant({...input,sessionToken:'two'}),/capacity/i);
  now+=91_000;
  assert.doesNotThrow(()=>manager.issueGrant({...input,sessionToken:'two'}));
});

test('invalid or partial configuration stays disabled and exposes no secret detail', () => {
  const manager=createStreamManager({env:{MSS_STREAM_MANAGER_ENABLED:'true'}});
  assert.deepEqual(manager.publicConfig(),{enabled:false,reason:'not_configured'});
  assert.throws(()=>manager.issueGrant({}),/not configured/i);
});

test('grant signing re-reads and locks current user session and exact owned artist in one transaction',async()=>{
 const calls=[];const rows={sessions:{token:'active',user_id:4,expires_at:'2099-01-01'},users:{id:4,role:'admin',is_disabled:false},artists:{id:7,user_id:4,channel_name:'mapped-channel',is_disabled:false}};
 const trx=table=>{const query={where(value){calls.push(['where',table,value]);return this},forUpdate(){calls.push(['lock',table]);return this},first(){return rows[table]}};return query};trx.raw=async sql=>calls.push(['raw',sql]);
 const db={transaction:fn=>fn(trx)};const manager=createStreamManager({env,now:()=>1_800_000_000_000});
 const result=await issueGrantForCurrentOwner({db,manager,sessionToken:'active',artistId:7,now:()=>1_800_000_000_000});
 assert.equal(typeof result.grant,'string');assert.deepEqual(calls.filter(item=>item[0]==='lock').map(item=>item[1]),['users','sessions','artists']);
 rows.users.role='user';await assert.rejects(()=>issueGrantForCurrentOwner({db,manager,sessionToken:'active',artistId:7}),/authorized/i);
});

test('HTTP grant route uses only the current locked owner and introspection route is no-store', async()=>{
  const db=memoryDb({users:[{id:4,role:'admin',is_disabled:false}],sessions:[{token:'active',user_id:4,expires_at:'2099-01-01'}],artists:[{id:7,user_id:4,channel_name:'mapped-channel',name:'Artist'}]});
  const h=await harness({getDb:async()=>db,process:{env}}); let res=response();res.set=()=>res;res.vary=()=>res;
  const run=async(route,req,res)=>{let index=0;const next=async error=>{if(error)throw error;const handler=route.handlers[index++];if(handler)await handler(req,res,next)};await next()};
  await run(h.route('post','/api/stream-manager/artists/:id/grant'),{params:{id:'7'},headers:{authorization:'Bearer active'},body:{}},res);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(res.code,200,JSON.stringify(res.body));assert.equal(typeof res.body.grant,'string');
  const grant=res.body.grant;res=response();res.set=()=>res;
  await run(h.route('post','/api/stream-manager/introspect'),{headers:{authorization:`Bearer ${env.MSS_STREAM_MANAGER_INTROSPECTION_TOKEN}`},body:{grant}},res);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(res.body.active,true);assert.equal(res.body.displayName,'Artist');
});
