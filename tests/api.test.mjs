import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moonstake-test-'));
process.env.MOONSTAKE_DB_PATH = path.join(tempDir, 'db.json');
process.env.PAYMENTS_MODE = 'demo';
const { server } = await import('../src/server.mjs');
const { resetDb } = await import('../src/store.mjs');
resetDb();

let base;
let cookie='';
test.before(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`});
test.after(async()=>{await new Promise(resolve=>server.close(resolve));fs.rmSync(tempDir,{recursive:true,force:true})});

async function req(pathname, options={}){
  const headers={...(options.body?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{}),...(options.headers||{})};
  const res=await fetch(base+pathname,{...options,headers});
  const setCookie=res.headers.get('set-cookie');if(setCookie)cookie=setCookie.split(';')[0];
  return {res,data:await res.json()};
}

test('bootstrap returns map data', async()=>{const {res,data}=await req('/api/bootstrap');assert.equal(res.status,200);assert.ok(data.landmarks.length>=5);assert.ok(data.claims.length>=1)});

test('signup, quote and claim complete end-to-end', async()=>{
  const signup=await req('/api/auth/signup',{method:'POST',body:JSON.stringify({email:'founder@example.test',password:'longpassword',brand:'Test Foundry'})});
  assert.equal(signup.res.status,201);
  const quote=await req('/api/quote',{method:'POST',body:JSON.stringify({sectors:['S-05-05','S-06-05']})});
  assert.equal(quote.data.total,2);
  const claim=await req('/api/claims',{method:'POST',body:JSON.stringify({brand:'Test Foundry',tagline:'Testing on the Moon',url:'example.test',sectors:['S-05-05','S-06-05']})});
  assert.equal(claim.res.status,201);assert.equal(claim.data.payment.status,'succeeded');assert.equal(claim.data.claim.sectors.length,2);
  const mine=await req('/api/my-land');assert.equal(mine.res.status,200);assert.equal(mine.data.claims.length,1);
});
