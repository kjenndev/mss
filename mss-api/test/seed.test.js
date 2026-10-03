import test from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../seeds/02_default_admin.js';
import { memoryDb } from './memory-db.js';
import { verifyPassword } from '../db.js';
test('admin seed requires explicit secret and never overwrites existing accounts',async()=>{
 const previous=process.env.MSS_ADMIN_PASSWORD;delete process.env.MSS_ADMIN_PASSWORD;
 try {
  const empty=memoryDb();await assert.rejects(()=>seed(empty),/MSS_ADMIN_PASSWORD/);assert.equal(empty.operations.length,0);
  const existing=memoryDb({users:[{id:1,username:'AdMiN',password:'legacy unchanged',role:'admin'}]});await seed(existing);assert.equal(existing.operations.length,0);
  process.env.MSS_ADMIN_PASSWORD='Aa123';await seed(empty);assert.equal(await verifyPassword(process.env.MSS_ADMIN_PASSWORD,empty.state().users[0].password),true);
 } finally { if(previous===undefined)delete process.env.MSS_ADMIN_PASSWORD;else process.env.MSS_ADMIN_PASSWORD=previous; }
});
