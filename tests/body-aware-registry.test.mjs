import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { claimStats } from '../src/production-common.mjs';
import { reserveSectors } from '../src/supabase.mjs';

test('body-aware registry migration preserves Moon compatibility and future world identity',()=>{
  const sql=fs.readFileSync(new URL('../supabase/migrations/0009_body_aware_registry.sql',import.meta.url),'utf8');
  assert.match(sql,/add column if not exists body_id text not null default 'moon'/);
  assert.match(sql,/reserve_body_registry_positions/);
  assert.match(sql,/registry_record_primary_sale/);
  assert.match(sql,/registry_sync_body_from_lot_id/);
  assert.match(sql,/if new\.body_id <> 'moon'/);
  assert.match(sql,/registry_body_market_summary/);
  assert.match(sql,/MARS\|MERCURY\|VENUS\|CERES\|PLUTO\|EUROPA\|TITAN/);
});

test('claim stats carries body identity without changing legacy Moon defaults',()=>{
  const stats=claimStats([
    {
      id:'c1',user_id:'u1',body_id:'mars',brand:'Mars Co',tagline:'',url:'',
      amount_cents:100,currency:'USD',created_at:'2026-09-21T00:00:00Z',
      views:2,clicks:1,status:'active',sectors:['MARS-360-180']
    },
    {
      id:'c2',user_id:'u2',brand:'Legacy Moon',tagline:'',url:'',
      amount_cents:100,currency:'USD',created_at:'2026-09-21T00:00:00Z',
      views:0,clicks:0,status:'active',sectors:['S-01-01']
    }
  ]);
  assert.equal(stats.claims[0].bodyId,'mars');
  assert.equal(stats.claims[1].bodyId,'moon');
});

test('canonical future-body reservations use the body-aware RPC',async()=>{
  const oldEnv={...process.env};
  const oldFetch=globalThis.fetch;
  process.env.SUPABASE_URL='https://atlas259-test.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';
  process.env.SUPABASE_SECRET_KEY='sb_secret_test';
  let captured;
  globalThis.fetch=async(url,options)=>{
    captured={url,options,body:JSON.parse(options.body)};
    return new Response(JSON.stringify('reservation-1'),{status:200,headers:{'content-type':'application/json'}});
  };
  try{
    const id=await reserveSectors({
      bodyId:'mars',
      userId:'00000000-0000-0000-0000-000000000001',
      brand:'Mars Co',
      tagline:'',
      url:'https://example.com',
      sectors:['MARS-360-180'],
      pricesCents:[100],
      amountCents:100,
    });
    assert.equal(id,'reservation-1');
    assert.match(captured.url,/\/rest\/v1\/rpc\/reserve_body_registry_positions$/);
    assert.equal(captured.body.p_body_id,'mars');
    assert.deepEqual(captured.body.p_position_ids,['MARS-360-180']);
  } finally {
    process.env=oldEnv;
    globalThis.fetch=oldFetch;
  }
});

test('legacy donor sectors cannot leak into non-Moon reservations',async()=>{
  await assert.rejects(
    ()=>reserveSectors({
      bodyId:'mars',
      userId:'u',
      brand:'Mars Co',
      sectors:['S-01-01'],
      amountCents:100,
    }),
    /Legacy sector reservations are Moon-only/
  );
});
