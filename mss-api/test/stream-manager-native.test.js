import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import knexFactory from 'knex';
import {createStreamManager,issueGrantForCurrentOwner} from '../stream-manager.js';

const url=process.env.MSS_STREAM_MANAGER_TEST_URL;
const databaseName=(()=>{try{return new URL(url).pathname.slice(1)}catch{return ''}})();
const enabled=Boolean(url && /^mss_stream_manager_test_[a-z0-9_]+$/.test(databaseName));
const db=enabled?knexFactory({client:'pg',connection:url,pool:{min:0,max:4}}):null;
const keys=crypto.generateKeyPairSync('ed25519');
const env={MSS_STREAM_MANAGER_ENABLED:'true',MSS_STREAM_MANAGER_ISSUER:'https://mss.test',MSS_STREAM_MANAGER_AUDIENCE:'platform-test',MSS_STREAM_MANAGER_PLATFORM_ORIGIN:'https://platform.test',MSS_STREAM_MANAGER_PRIVATE_KEY:keys.privateKey.export({format:'pem',type:'pkcs8'}),MSS_STREAM_MANAGER_INTROSPECTION_TOKEN:'fixture-only-backchannel-token-32-bytes',MSS_STREAM_MANAGER_CHANNEL_MAP:JSON.stringify({7:'mapped'})};
const manager=createStreamManager({env});

async function seed(){
 await db.schema.dropTableIfExists('artists');await db.schema.dropTableIfExists('sessions');await db.schema.dropTableIfExists('users');
 await db.schema.createTable('users',t=>{t.integer('id').primary();t.string('role');t.boolean('is_disabled')});
 await db.schema.createTable('sessions',t=>{t.string('token').primary();t.integer('user_id');t.timestamp('expires_at')});
 await db.schema.createTable('artists',t=>{t.integer('id').primary();t.integer('user_id');t.string('channel_name');t.string('name');t.boolean('is_disabled')});
 await db('users').insert({id:4,role:'admin',is_disabled:false});await db('sessions').insert({token:'active',user_id:4,expires_at:new Date(Date.now()+60000)});await db('artists').insert({id:7,user_id:4,channel_name:'mapped',name:'Artist',is_disabled:false});
}

test('native transaction denies every concurrent current-authority loss before signing',{skip:!enabled},async()=>{
 for(const mutate of [
  trx=>trx('sessions').where({token:'active'}).del(),
  trx=>trx('users').where({id:4}).update({role:'user'}),
  trx=>trx('users').where({id:4}).update({is_disabled:true}),
  trx=>trx('artists').where({id:7}).update({user_id:9}),
  trx=>trx('artists').where({id:7}).update({channel_name:'changed'}),
  trx=>trx('artists').where({id:7}).update({is_disabled:true}),
 ]){
  await seed();let release;const held=new Promise(resolve=>{release=resolve});let locked,holderPid;
  const changed=db.transaction(async trx=>{await trx.raw('SELECT pg_advisory_xact_lock(1297306453)');holderPid=Number((await trx.raw('SELECT pg_backend_pid() AS pid')).rows[0].pid);locked=true;await mutate(trx);await held});
  while(!locked)await new Promise(resolve=>setImmediate(resolve));
  const issuing=issueGrantForCurrentOwner({db,manager,sessionToken:'active',artistId:7});
  let waiter=false;
  for(let attempt=0;attempt<200&&!waiter;attempt++){
   const rows=await db.raw("SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND pid<>? AND state='active' AND wait_event_type='Lock' AND query LIKE '%pg_advisory_xact_lock%'",[holderPid]);
   waiter=rows.rows.length===1;if(!waiter)await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.equal(waiter,true,'issuance transaction must be observed waiting on the held advisory lock before release');
  release();await changed;
  await assert.rejects(issuing);
 }
 await seed();const issued=await issueGrantForCurrentOwner({db,manager,sessionToken:'active',artistId:7});assert.equal(typeof issued.grant,'string');
});

test.after(async()=>{if(db)await db.destroy()});
