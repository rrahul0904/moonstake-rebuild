import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/index.mjs';

test('Vercel catch-all adapter maps rewritten path to production health endpoint', async () => {
  const old={...process.env};
  Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',SUPABASE_SECRET_KEY:'sb_secret_test',STRIPE_SECRET_KEY:'rk_test',STRIPE_WEBHOOK_SECRET:'whsec_test',APP_URL:'https://moonstake.example'});
  let status,body;
  const req={method:'GET',url:'/api/index?__path=health',query:{__path:'health'},headers:{host:'moonstake.example','x-forwarded-proto':'https'}};
  const res={headersSent:false,writableEnded:false,writeHead(code){status=code;this.headersSent=true},end(value){body=value;this.writableEnded=true},setHeader(){}};
  try{await handler(req,res);assert.equal(status,200);const parsed=JSON.parse(body);assert.equal(parsed.ok,true);assert.equal(parsed.service,'moonstake')}finally{process.env=old}
});
