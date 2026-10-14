// Prueba de las migraciones contra un Postgres real en memoria (PGlite). No toca ninguna base real.
// Uso (sin agregar dependencias al proyecto):
//   npm i --no-save @electric-sql/pglite
//   node supabase/tests/migracion-0015.mjs
// Simula auth.uid()/auth.role(), los roles authenticated/anon y los privilegios por defecto de Supabase.
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
const dir = fileURLToPath(new URL('..', import.meta.url))

/** Motor vacío con los esquemas, roles y funciones mínimas que Supabase da por hechos. */
export async function nuevoMotor() {
  const db = new PGlite()
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth; create schema storage; create schema net; create publication supabase_realtime;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on sequences to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
    create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
    create table net.http_log (id serial primary key, url text, body jsonb);
    create function net.http_post(url text, headers jsonb default '{}', body jsonb default '{}') returns bigint language sql as $$ insert into net.http_log (url, body) values (url, body) returning id::bigint $$;
    grant usage on schema auth, storage, net to anon, authenticated;
    grant execute on all functions in schema auth to anon, authenticated;
  `)
  return db
}

/** Lee un .sql quitando las extensiones (PGlite no las trae; Supabase sí). */
export function leerSql(archivo) {
  return fs.readFileSync(archivo, 'utf8').replace(/create extension if not exists [^;]*;/gi, '')
}

export async function crearBase({ hasta = 14, incluir0015 = false } = {}) {
  const db = await nuevoMotor()
  const aplicar = async (f) => {
    const sql = fs.readFileSync(f, 'utf8').replace(/create extension if not exists [^;]*;/gi, '')
    try { await db.exec(sql) } catch (e) { console.error('FALLÓ', f, '\n', e.message); throw e }
  }
  await aplicar(`${dir}/schema.sql`)
  const migs = fs.readdirSync(`${dir}/migrations`).filter((n) => /^\d{4}_/.test(n)).sort()
  for (const m of migs) {
    const n = Number(m.slice(0, 4))
    if (n > hasta && !(incluir0015 && n === 15)) continue
    await aplicar(`${dir}/migrations/${m}`)
  }
  return db
}

if (process.argv[1].endsWith('setup.mjs')) {
  const db = await crearBase({ hasta: 14 })
  console.log('base 0001-0014 OK')
  const r = await db.query(`select count(*) from pg_proc where proname='elegir_candidata'`)
  console.log(r.rows)
}
