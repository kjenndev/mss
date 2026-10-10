import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, response } from './harness.js';
import { memoryDb } from './memory-db.js';
test('public comment avatars batch public artist profiles and preserve historic snapshots', async () => {
 const rows = [
  {id:1,user_id:7,author_name:'Historic Artist',author_artist_id:2,author_artist_name:'Historic Artist'},
  {id:2,user_id:7,author_name:'Historic Artist',author_artist_id:2,author_artist_name:'Historic Artist'},
  {id:3,user_id:7,author_name:'Deleted Artist',author_artist_id:null,author_artist_name:'Deleted Artist'},
  {id:4,user_id:7,author_name:'Legacy'},
  {id:5,user_id:7,author_name:'No Photo',author_artist_id:3,author_artist_name:'No Photo'},
  {id:6,user_id:null,author_name:'Anonymous'},
 ].map(r=>({...r,event_id:1,content:'Comment',private_extra:'must not leak'}));
 const base=memoryDb({comments:rows,users:[{id:7,profile_picture:'/uploads/account.webp',password:'secret'}],artists:[{id:2,name:'Renamed',profile_picture:'/uploads/artist.webp',cover_photo:'/uploads/cover.webp',user_id:99},{id:3,name:'No Photo',profile_picture:null}]});
 const queries=[];
 const db=table=>{const q=base(table);const select=q.select;q.select=(...fields)=>{queries.push({table,fields});return select(...fields);};return q;};
 const h=await harness({getDb:async()=>db});const res=response();
 await h.route('get','/api/comments').handlers.at(-1)({query:{event_id:'1'}},res);
 assert.equal(res.code,200);
 assert.deepEqual(Array.from(res.body.comments,c=>c.author_artist_profile_picture),['/uploads/artist.webp','/uploads/artist.webp',null,null,null,null]);
 assert.equal(res.body.comments[0].author_name,'Historic Artist');
 assert.equal(res.body.comments[2].author_artist_name,'Deleted Artist');
 assert.equal(res.body.comments[3].author_profile_picture,'/uploads/account.webp');
 assert.equal(res.body.comments[5].author_profile_picture,null);
 assert.ok(res.body.comments.every(c=>!('private_extra' in c)&&!('password' in c)&&!('cover_photo' in c)));
 assert.deepEqual(queries,[{table:'users',fields:['id','profile_picture']},{table:'artists',fields:['id','profile_picture','is_disabled']}]);
});

test('post resolves artist portrait server-side and rejects client portrait fields', async () => {
 const db=memoryDb({users:[{id:7,username:'Account',role:'artist',profile_picture:'/uploads/account.webp'}],sessions:[{token:'valid',user_id:7,expires_at:'2099-01-01'}],artists:[{id:1,name:'Artist',user_id:7,profile_picture:'/uploads/artist.webp'}],events:[{id:1}],comments:[]});
 const h=await harness({getDb:async()=>db});
 async function post(extra={}) {const res=response();const req={body:{event_id:1,content:'New',...extra},headers:{authorization:'Bearer valid'},ip:'artist-photo'};for(const handler of h.route('post','/api/comments').handlers){let next=false;await handler(req,res,e=>{if(e)throw e;next=true;});if(!next)break;}return res;}
 const saved=await post();assert.equal(saved.code,201);assert.equal(saved.body.comment.author_artist_profile_picture,'/uploads/artist.webp');assert.equal(saved.body.comment.author_profile_picture,'/uploads/account.webp');
 for(const extra of [{author_artist_profile_picture:'/uploads/forged.webp'},{profile_picture:'/uploads/forged.webp'},{author_profile_picture:'/uploads/forged.webp'}])assert.equal((await post(extra)).code,400);
 assert.equal(db.state().comments.length,1);assert.equal(db.state().comments[0].author_artist_profile_picture,undefined);
});
