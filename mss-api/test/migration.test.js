import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('forward-only integrity migration validates constraints without destructive cleanup',async()=>{
 const url=new URL('../migrations/20260930000000_audit_hardening.js',import.meta.url);assert.ok(fs.existsSync(url),'forward migration must exist');
 const migration=await import(url);const calls=[];await migration.up({raw:async sql=>calls.push(sql)});const sql=calls.join('\n');
 for(const marker of ['users_artist_fk','artists_user_fk','event_images_artist_fk','sessions_user_fk','comments_exactly_one_target','comments_parent_artist_fk','comments_parent_event_fk','artists_channel_unique','expires_at','CREATE TABLE uploads'])assert.ok(sql.includes(marker),marker);
 assert.doesNotMatch(sql,/DELETE FROM|DROP COLUMN|TRUNCATE|UPDATE users|UPDATE artists/i);
 assert.equal(migration.config.transaction,true);await assert.rejects(()=>migration.down(),/forward-only/i);
 const error=Error('inconsistent legacy reference');await assert.rejects(()=>migration.up({raw:async()=>{throw error}}),e=>e===error);
});

test('new migration preserves exact-case channel names and fails closed on nonowned primary pointers',async()=>{
 const migration=await import('../migrations/20260930000000_audit_hardening.js');let sql='';await migration.up({raw:async text=>sql+=text});
 assert.match(sql,/artists_channel_unique ON artists\(channel_name\)/);assert.doesNotMatch(sql,/lower\(channel_name\)/);
 assert.match(sql,/a\.user_id IS DISTINCT FROM u\.id/);assert.match(sql,/RAISE EXCEPTION 'Primary artist ownership inconsistency/);
});
