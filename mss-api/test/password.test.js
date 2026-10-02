import test from 'node:test';
import assert from 'node:assert/strict';
import * as passwords from '../db.js';
import crypto from 'node:crypto';
test('legacy MD5 validates only the actual original password',async()=>{
 const md5=crypto.createHash('md5').update('old short secret').digest('hex');
 assert.equal(await passwords.verifyPassword('old short secret',md5),true);
 assert.equal(await passwords.verifyPassword(md5,md5),false);
});
test('new password verifiers are salted strong hashes and validate without truncation',async()=>{
 const secret='x'.repeat(100); const a=await passwords.hashPassword(secret), b=await passwords.hashPassword(secret);
 assert.notEqual(a,b); assert.match(a,/^scrypt\$/);
 assert.equal(await passwords.verifyPassword(secret,a),true);
 assert.equal(await passwords.verifyPassword(secret+'x',a),false);
 assert.equal(await passwords.verifyPassword('wrong',a),false);
});
