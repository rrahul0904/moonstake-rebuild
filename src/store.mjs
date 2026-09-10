import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, '../data');
const dbPath = process.env.MOONSTAKE_DB_PATH || path.join(dataDir, 'db.json');
const seedPath = path.join(dataDir, 'seed.json');

function ensureDb() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  if (!fs.existsSync(dbPath)) fs.copyFileSync(seedPath, dbPath);
}

export function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}

export function writeDb(db) {
  ensureDb();
  const tmp = `${dbPath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, dbPath);
}

export function mutateDb(mutator) {
  const db = readDb();
  const result = mutator(db);
  writeDb(db);
  return result;
}

export function resetDb() {
  fs.copyFileSync(seedPath, dbPath);
}
