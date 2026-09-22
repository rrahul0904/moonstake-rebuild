import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const dir=new URL('../supabase/migrations/',import.meta.url);
const files=fs.readdirSync(dir).filter(name=>name.endsWith('.sql')).sort();

test('migration chain is ordered and has unique numeric prefixes',()=>{
  assert.ok(files.length>=10);
  const prefixes=files.map(name=>name.slice(0,4));
  assert.equal(new Set(prefixes).size,prefixes.length);
  assert.deepEqual([...files].sort(),files);
});

test('PostgreSQL dollar-quote delimiters are balanced and never collapsed to a single dollar',()=>{
  for(const name of files){
    const sql=fs.readFileSync(new URL(name,dir),'utf8');
    assert.doesNotMatch(sql,/\bas \$\s*$/mi,`${name} contains collapsed AS $ delimiter`);
    assert.doesNotMatch(sql,/\bend \$;\s*$/mi,`${name} contains collapsed END $ delimiter`);
    assert.doesNotMatch(sql,/\bdo \$\s*$/mi,`${name} contains collapsed DO $ delimiter`);
    const pairs=(sql.match(/\$\$/g)||[]).length;
    assert.equal(pairs%2,0,`${name} has an unbalanced $$ delimiter count`);
  }
});

test('body-aware migration removes Moon-only coordinate uniqueness',()=>{
  const sql=fs.readFileSync(new URL('0009_body_aware_registry.sql',dir),'utf8');
  assert.match(sql,/drop constraint if exists mld_lots_x_y_key/i);
  assert.match(sql,/unique\s*\(body_id\s*,\s*x\s*,\s*y\s*\)/i);
  assert.match(sql,/registry_lot_id_matches_body/i);
});

test('Connect reconciliation migration records reversals and extends payout status safely',()=>{
  const sql=fs.readFileSync(new URL('0010_stripe_connect_reconciliation.sql',dir),'utf8');
  assert.match(sql,/stripe_transfer_reversal_id/);
  assert.match(sql,/payout_status in \('not_applicable','pending','paid','failed','reversed'\)/);
  assert.match(sql,/mld_record_transfer_reversal/);
});
