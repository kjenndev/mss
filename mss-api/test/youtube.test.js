import test from 'node:test';
import assert from 'node:assert/strict';
import * as youtube from '../youtube.js';

const row = () => ({ id:'abcdefghijk', snippet:{title:'Original set',publishedAt:'2020-01-02T03:00:00+03:00',liveBroadcastContent:'none',thumbnails:{high:{url:'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg'}}},contentDetails:{duration:'PT1H2M3S'},status:{privacyStatus:'public',uploadStatus:'processed',embeddable:true} });
test('official metadata preserves publication instant and enforces fixed bounded request', async () => {
  assert.equal(typeof youtube.createYouTubeMetadata, 'function');
  let calls=0;
  const provider=youtube.createYouTubeMetadata({env:{YOUTUBE_API_KEY:'synthetic'},fetchImpl:async(url,options)=>{
    calls++; assert.equal(new URL(url).origin,'https://www.googleapis.com'); assert.equal(new URL(url).pathname,'/youtube/v3/videos'); assert.equal(new URL(url).searchParams.get('id'),'abcdefghijk'); assert.equal(options.redirect,'error'); assert.ok(options.signal); return Response.json({items:[row()]});
  }});
  const data=await provider.get('https://youtu.be/abcdefghijk');
  assert.equal(data.publishedAt,'2020-01-02T00:00:00.000Z'); assert.equal(data.durationSeconds,3723); assert.equal(data.title,'Original set'); assert.equal(data.videoId,'abcdefghijk'); assert.equal(calls,1);
});
test('missing config, unavailable videos, restrictions and invalid dates never invent metadata', async () => {
  assert.equal(typeof youtube.createYouTubeMetadata, 'function');
  await assert.rejects(youtube.createYouTubeMetadata({env:{},fetchImpl:()=>{throw Error('no network')}}).get('https://youtu.be/abcdefghijk'),e=>e.code==='not_configured' && e.status===503);
  const cases=[{items:[{...row(),snippet:{...row().snippet,publishedAt:'2020-02-30T00:00:00Z'}}]}, {items:[]}, {items:[{...row(),snippet:{...row().snippet,publishedAt:'not-a-date'}}]}, {items:[{...row(),snippet:{...row().snippet,liveBroadcastContent:'upcoming'}}]}, {items:[{...row(),snippet:{...row().snippet,liveBroadcastContent:'live'}}]}, {items:[{...row(),status:{...row().status,privacyStatus:'private'}}]}, {items:[{...row(),status:{...row().status,embeddable:false}}]}];
  for(const body of cases) await assert.rejects(youtube.createYouTubeMetadata({env:{YOUTUBE_API_KEY:'synthetic'},fetchImpl:async()=>Response.json(body)}).get('https://youtu.be/abcdefghijk'), e=>e.status===422);
  for(const response of [new Response('',{status:403}),new Response('',{status:302}),new Response('x'.repeat(262145)),new Response('not json')]) await assert.rejects(youtube.createYouTubeMetadata({env:{YOUTUBE_API_KEY:'synthetic'},fetchImpl:async()=>response}).get('https://youtu.be/abcdefghijk'),e=>e.code==='provider_unavailable');
  await assert.rejects(youtube.createYouTubeMetadata({env:{YOUTUBE_API_KEY:'synthetic'},timeoutMs:10,fetchImpl:()=>new Promise(()=>{})}).get('https://youtu.be/abcdefghijk'),e=>e.code==='provider_unavailable');
});

test('canonical video URLs accept explicit HTTPS videos, not channels or arbitrary hosts', () => {
  assert.equal(typeof youtube.parseYouTubeUrl, 'function');
  for (const url of ['https://youtube.com/watch?v=abcdefghijk&t=20', 'https://youtu.be/abcdefghijk?si=share', 'https://www.youtube.com/shorts/abcdefghijk', 'https://m.youtube.com/live/abcdefghijk', 'https://www.youtube.com/embed/abcdefghijk']) {
    assert.deepEqual(youtube.parseYouTubeUrl(url), { videoId:'abcdefghijk', url:'https://www.youtube.com/watch?v=abcdefghijk' });
  }
  for (const url of ['http://youtu.be/abcdefghijk','https://youtube.com.evil/watch?v=abcdefghijk','https://user@youtube.com/watch?v=abcdefghijk','https://youtube.com:444/watch?v=abcdefghijk','https://youtube.com/@channel','https://youtube.com/watch?v=short','https://youtube.com/watch?v=abcdefghijk&v=12345678901','https://youtu.be/abcdefghijk/extra','javascript:alert(1)',null]) assert.throws(()=>youtube.parseYouTubeUrl(url), /YouTube video URL/);
});
