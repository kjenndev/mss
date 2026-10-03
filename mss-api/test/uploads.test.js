import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import sharp from 'sharp';
test('upload decoding accepts bounded raster data only and strips original active bytes',async()=>{
 const url=new URL('../uploads.js',import.meta.url);assert.ok(fs.existsSync(url),'image validation module must exist');
 const {decodeImage}=await import(url);
 for(const bytes of [Buffer.from('<html><script>alert(1)</script>'),Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>'),Buffer.alloc(5*1024*1024+1)]) await assert.rejects(()=>decodeImage(bytes));
 const png=await sharp({create:{width:2,height:2,channels:3,background:'red'}}).png().toBuffer();
 const clean=await decodeImage(Buffer.concat([png,Buffer.from('<script>bad</script>')]));
 assert.equal((await sharp(clean).metadata()).format,'webp');assert.equal(clean.includes(Buffer.from('<script>')),false);
});

test('animated PNG is rejected rather than silently reduced to its first frame', async () => {
 const {decodeImage}=await import('../uploads.js');
 const apng=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACGFjVEwAAAACAAAAAPONk3AAAAAaZmNUTAAAAAAAAAABAAAAAQAAAAAAAAAAAAEACgAAWn8w0AAAAA1JREFUeJxj+M/A8B8ABQAB/4mZPR0AAAAaZmNUTAAAAAEAAAABAAAAAQAAAAAAAAAAAAEACgAAwQzaBAAAABFmZEFUAAAAAnicY2D4z/AfAAQBAf9i5+mcAAAAAElFTkSuQmCC', 'base64');
 assert.equal((await sharp(apng).metadata()).format, 'png');
 await assert.rejects(() => decodeImage(apng), error => error.status === 415);
});
