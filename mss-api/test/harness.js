import { featuredUrls, featuredDto, prepareFeatured } from '../home-featured.js';
import { createRegistrationRouter } from '../registration.js';
import { youtubeMetadata, parseYouTubeUrl, youtubeVideoDto, YOUTUBE_LINK_LIMIT } from '../youtube.js';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const root = new URL('../', import.meta.url);
export async function harness(extra = {}) {
 const routes=[]; const app={middleware:[],use(...args){this.middleware.push(args)}};
 for(const method of ['get','post','put','delete']) app[method]=(url,...handlers)=>routes.push({method,url,handlers});
 const express=()=>app; express.json=express.static=()=>()=>{};
 const multer=()=>({single:()=> (req,res,next)=>next()}); multer.diskStorage=multer.memoryStorage=x=>x;
 let source=fs.readFileSync(new URL('index.js',root),'utf8').replace(/^import .*;\r?\n/gm,'').replace('fileURLToPath(import.meta.url)',"'/tmp/mss-test/index.js'");
 source=source.slice(0,source.indexOf('const server = app.listen'));
 const context={featuredUrls,featuredDto,prepareFeatured,youtubeMetadata,parseYouTubeUrl,youtubeVideoDto,YOUTUBE_LINK_LIMIT,createRegistrationRouter,getDb:async()=>{throw Error('Unexpected database access')},hashPassword:async()=>{throw Error('Unexpected password hash')},verifyPassword:async()=>false,URL,express,multer,cors:()=>()=>{},path,fs:{existsSync:()=>true},process:{env:{}},initializeDB:async()=>{},console, ...extra};
 await vm.runInNewContext('(async()=>{'+source+'})()',context);
 return {route:(m,u)=>routes.find(r=>r.method===m&&r.url===u),app};
}
export function response(){return {code:200,status(n){this.code=n;return this},json(v){this.body=v;return this}};}
