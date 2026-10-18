// Simulación (PGlite): aplicar la 0015, revertirla con 0015_rollback.sql y volver a aplicar la 0015.
// Comprueba que el resultado final es idéntico (funciones, permisos, vistas, triggers, políticas, columnas)
// al de aplicar la 0015 una sola vez. Es el camino que se usa en el piloto tras probar la reversa.
// Uso: node supabase/tests/reaplicar-0015.mjs   (requiere npm i --no-save @electric-sql/pglite)
import { crearBase, leerSql } from './arnes.mjs'

const dir = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
let pasos = 0, fallos = 0
const ok = (cond, msg) => { pasos++; if (!cond) { fallos++; console.log('  ✗', msg) } else console.log('  ✓', msg) }

const FOTO = `
  select 'f:' || p.oid::regprocedure::text k, md5(pg_get_functiondef(p.oid)) || '|' || coalesce(p.proacl::text,'') || '|' || p.prosecdef v
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
  union all select 'v:' || c.relname, md5(pg_get_viewdef(c.oid)) || '|' || coalesce(c.relacl::text,'') from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
  union all select 't:' || t.tgrelid::regclass::text || '.' || t.tgname, md5(pg_get_triggerdef(t.oid)) from pg_trigger t join pg_class c on c.oid = t.tgrelid where c.relnamespace = 'public'::regnamespace and not t.tgisinternal
  union all select 'p:' || tablename || '.' || policyname, md5(coalesce(qual,'') || coalesce(with_check,'') || array_to_string(roles, ',') || cmd) from pg_policies where schemaname = 'public'
  union all select 'c:' || table_name || '.' || column_name, data_type || '|' || coalesce(column_default,'') || '|' || is_nullable || '|' || is_generated from information_schema.columns where table_schema = 'public'
  union all select 'a:propuestas_activas', (select propuestas_activas::text from public.app_config limit 1)`
const foto = async (db) => new Map((await db.query(FOTO)).rows.map((r) => [r.k, r.v]))

const una = await crearBase({ hasta: 14, incluir0015: true })
const esperado = await foto(una)

const db = await crearBase({ hasta: 14, incluir0015: true })
await db.exec(leerSql(`${dir}/rollback/0015_rollback.sql`))
let error = null
try { await db.exec(leerSql(`${dir}/migrations/0015_experiencia_cliente.sql`)) } catch (e) { error = e }
ok(!error, 'la 0015 se vuelve a aplicar sobre la base revertida' + (error ? ': ' + error.message : ''))
const final = await foto(db)

const difs = []
for (const [k, v] of esperado) if (final.get(k) !== v) difs.push(`${k}: ${final.has(k) ? 'distinto' : 'falta'}`)
for (const k of final.keys()) if (!esperado.has(k)) difs.push(`${k}: sobra (p. ej. fn_total_compat de la reversa)`)
ok(difs.length === 0, difs.length ? 'diferencias con aplicar la 0015 una vez:\n      ' + difs.join('\n      ') : `idéntico a aplicar la 0015 una vez (${esperado.size} elementos)`)

console.log(`\n${pasos - fallos}/${pasos} OK`)
process.exit(fallos ? 1 : 0)
