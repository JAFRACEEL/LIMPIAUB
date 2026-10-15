// PRUEBA DEL PARCHE supabase/hotfix/fn_enviar_push_cerrar_api.sql y sus comprobaciones, en Postgres en memoria (PGlite).
// ESTADO: SIMULACIÓN. No se ha ejecutado en ningún proyecto Supabase ni en LIMPIA. Pendiente de validar en limpia-test.
// A diferencia de otras pruebas, aquí las funciones internas pertenecen a un rol NO superusuario (`dueno`, con BYPASSRLS, como `postgres`
// en Supabase), para que el permiso del dueño y la ejecución SECURITY DEFINER se comporten como en la realidad.
// Uso:  npm i --no-save @electric-sql/pglite  &&  node supabase/tests/hotfix-fn-enviar-push.mjs
import { crearBase } from './arnes.mjs'
import fs from 'node:fs'

let fallos = 0, pasos = 0
const ok = (cond, msg) => { pasos++; if (!cond) { fallos++; console.log('  ✗', msg) } else console.log('  ✓', msg) }
const h = (n) => fs.readFileSync(new URL(`../hotfix/${n}`, import.meta.url), 'utf8')
const PARCHE = h('fn_enviar_push_cerrar_api.sql'), ANTES = h('fn_enviar_push_verificar_antes.sql')
const DESPUES = h('fn_enviar_push_verificar_despues.sql'), RECUPERAR = h('fn_enviar_push_recuperar_envio.sql')

const U = (n) => `00000000-0000-0000-0000-00000000000${n}`
const C1 = U(1), W1 = U(3)
const dia = (n) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10)

async function escenario() {
  const db = await crearBase({ hasta: 14 })
  await db.exec(`
    create role dueno nologin bypassrls; create role otro nologin bypassrls;
    grant usage, create on schema public to dueno, otro; grant usage on schema auth, net to dueno, otro;
    grant all on all tables in schema public to dueno, otro; grant all on all tables in schema net to dueno, otro;
    grant all on all sequences in schema net to dueno, otro;
    grant execute on all functions in schema public, auth, net to dueno, otro;
    insert into auth.users (id, email) values ('${C1}','c@x.pe'),('${W1}','w@x.pe');
    insert into perfiles (id, rol, nombre, telefono, zona, direccion) values ('${C1}','cliente','Cliente','911111111','Iquitos','x'),('${W1}','trabajador','Pro','922222221','Iquitos','x');
    insert into trabajadores (id, numero_documento, zonas, servicios, tarifa_hora, kit_propio, verificado, disponible_ahora, ultima_actividad)
      values ('${W1}','10000001',array['Iquitos'],array['Limpieza básica del hogar'],25,true,true,true,now());
    update app_config set push_function_url = 'http://captura.test/push', push_function_secret = 'secreto-sintetico' where id = true;
  `)
  // El dueño de fn_enviar_push y de los fn_push_* pasa a ser `dueno` (no superusuario)
  const fns = (await db.query(`select p.oid::regprocedure::text f from pg_proc p where p.pronamespace='public'::regnamespace and (p.proname='fn_enviar_push' or p.proname like 'fn_push_%')`)).rows
  for (const { f } of fns) await db.exec(`alter function ${f} owner to dueno`)
  // `otro` solo recibe permisos sobre fn_enviar_push cuando el escenario lo indica (su acceso no viene de anon/authenticated)
  await db.exec(`revoke execute on function fn_enviar_push(uuid[], text, text, text) from otro`)
  return db
}
const como = async (db, uid, fn, role = 'authenticated') => {
  await db.exec(`select set_config('request.jwt.claim.sub','${uid ?? ''}',false), set_config('request.jwt.claim.role','${role}',false)`)
  await db.exec(`set role ${role}`)
  try { return await fn() } finally { await db.exec('reset role'); await db.exec(`select set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claim.role','',false)`) }
}
const intenta = async (fn) => { try { return { ok: true, v: await fn() } } catch (e) { return { ok: false, e: String(e.message) } } }
const envios = async (db) => Number((await db.query(`select count(*)::int n from net.http_log`)).rows[0].n)
const pedidoDirecto = (db, f) => como(db, C1, () => db.query(`insert into reservas (cliente_id, trabajador_id, servicio, fecha, hora, horas, direccion, zona, tarifa_hora, modo, ventana_cierra_en)
  values ('${C1}','${W1}','Limpieza básica del hogar','${f}','09:00',2,'Jr. X','Iquitos',25,'directo', now() + interval '15 minutes') returning id`))
const llamarPush = (db, rol, ids) => como(db, rol === 'anon' ? null : C1, () => db.query(`select fn_enviar_push($1::uuid[], 'Titulo sintetico', 'Cuerpo sintetico', '/')`, [`{${ids.join(',')}}`]), rol)
const sqlTodo = async (db, sql) => (await db.exec(sql)).map((r) => r.rows)
const permisos = async (db) => new Map((await db.query(`
  select 'fn ' || p.oid::regprocedure::text as k,
         has_function_privilege('anon', p.oid, 'execute') || '/' || has_function_privilege('authenticated', p.oid, 'execute') || '/' ||
         exists(select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x where x.grantee = 0 and x.privilege_type = 'EXECUTE') || '/' ||
         coalesce((select string_agg(pg_get_userbyid(x.grantee), ',' order by 1) from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x where x.grantee <> 0), '') as v
  from pg_proc p where p.pronamespace = 'public'::regnamespace
  union all
  select 'rel ' || c.oid::regclass::text, (select string_agg(pr || has_table_privilege('anon', c.oid, pr)::text || has_table_privilege('authenticated', c.oid, pr)::text, ',' order by pr) from unnest(array['SELECT','INSERT','UPDATE','DELETE']) pr)
  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','v')
  union all select 'pol ' || tablename || '.' || policyname, cmd || md5(coalesce(qual,'') || coalesce(with_check,'')) from pg_policies where schemaname = 'public'`)).rows.map((r) => [r.k, r.v]))
const difP = (a, b) => { const r = []; for (const [k, v] of a) if (b.get(k) !== v) r.push(k); for (const k of b.keys()) if (!a.has(k)) r.push(k + ' (nuevo)'); return r }

console.log('— S1. Caso normal: llamadores SECURITY DEFINER del mismo dueño (no superusuario)')
{
  const db = await escenario()
  const [A, B, Cc, D, E] = await sqlTodo(db, ANTES)
  ok(A.length === 1 && A[0].firma === 'fn_enviar_push(uuid[],text,text,text)' && A[0].dueno === 'dueno' && A[0].security_definer === true, 'A: una sola sobrecarga, con la firma esperada, dueño `dueno`, SECURITY DEFINER')
  const quien = B.map((r) => r.quien).sort().join(',')
  // La 0013 hizo `revoke ... from public`: PUBLIC no figura en el ACL; el acceso viene de anon y authenticated (como en LIMPIA).
  ok(!/PUBLIC/.test(quien) && /anon/.test(quien) && /authenticated/.test(quien) && /dueno/.test(quien), `B: el ACL tiene anon, authenticated y el dueño; PUBLIC no (como en LIMPIA) (${quien})`)
  ok(Cc[0].anon === true && Cc[0].authenticated === true && Cc[0].dueno === true, 'C: anon y authenticated pueden ejecutarla hoy; el dueño también')
  ok(D.length === 6 && D.every((r) => r.security_definer && r.mismo_dueno_que_fn_enviar_push && r.su_dueno_puede_ejecutarla), `D: ${D.length} llamadores (fn_push_*), todos SECURITY DEFINER, mismo dueño y con permiso`)
  ok(E.length === 6, `E: ${E.length} triggers que los ejecutan`)
  const huellasAntes = D.map((r) => r.llamador + r.huella_cuerpo).sort().join('|')

  const e0 = await envios(db)
  const abuso = await intenta(() => llamarPush(db, 'anon', [W1]))
  ok(abuso.ok && (await envios(db)) === e0 + 1, 'ANTES: un visitante anónimo logra disparar un aviso arbitrario (la exposición que se quiere cerrar)')
  const e1 = await envios(db)
  await pedidoDirecto(db, dia(3))
  ok((await envios(db)) === e1 + 1, 'ANTES: el envío legítimo (cliente crea pedido -> trigger -> aviso) funciona')

  const previo = (await sqlTodo(db, DESPUES))[0]
  ok(previo.some((r) => r.ok === false), 'control negativo: las comprobaciones POSTERIORES detectan que aún está abierto (filas ok=false antes del parche)')
  const perm0 = await permisos(db)

  const ap = await intenta(() => db.exec(PARCHE))
  ok(ap.ok, 'el parche se aplica sin error: ' + (ap.e ?? ''))
  const post = (await sqlTodo(db, DESPUES))[0]
  ok(post.length > 10 && post.every((r) => r.ok === true), `DESPUÉS: las ${post.length} comprobaciones dan ok = true`)
  const [, , , D2] = await sqlTodo(db, ANTES)
  ok(D2.map((r) => r.llamador + r.huella_cuerpo).sort().join('|') === huellasAntes, 'los cuerpos de los llamadores no cambiaron (mismas huellas)')

  const e2 = await envios(db)
  const r1 = await intenta(() => llamarPush(db, 'anon', [W1]))
  const r2 = await intenta(() => llamarPush(db, 'authenticated', [W1]))
  const r3 = await intenta(() => llamarPush(db, 'authenticated', []))
  ok(!r1.ok && /permission denied|permiso denegado/i.test(r1.e), 'DESPUÉS: anon recibe permission denied')
  ok(!r2.ok && /permission denied|permiso denegado/i.test(r2.e), 'DESPUÉS: authenticated recibe permission denied')
  ok(!r3.ok, 'DESPUÉS: tampoco con lista vacía (útil como prueba de API sin efectos)')
  ok((await envios(db)) === e2, 'DESPUÉS: ningún aviso se envió por esas llamadas')

  await pedidoDirecto(db, dia(4))
  const cuerpo = (await db.query(`select body from net.http_log order by id desc limit 1`)).rows[0].body
  ok((await envios(db)) === e2 + 1 && (cuerpo.user_ids ?? []).includes(W1), 'DESPUÉS: el envío legítimo sigue funcionando (trigger SECURITY DEFINER con dueño no superusuario)')

  const cambios = difP(perm0, await permisos(db))
  ok(cambios.length === 1 && /fn_enviar_push/.test(cambios[0]), `solo cambió el permiso de fn_enviar_push (cambios: ${JSON.stringify(cambios)})`)
  const dos = await intenta(() => db.exec(PARCHE))
  ok(dos.ok && difP(await permisos(db), await permisos(db)).length === 0, 'idempotente: segunda ejecución sin error ni cambios')
}

console.log('\n— S2. El dueño de un llamador NO podría ejecutarla tras el parche: el parche aborta y no cambia nada')
{
  const db = await escenario()
  await db.exec(`alter function fn_push_reservas_insert() owner to otro`)   // otro dueño, con acceso solo vía PUBLIC
  const perm0 = await permisos(db)
  const ap = await intenta(() => db.exec(PARCHE))
  ok(!ap.ok && /abortado y revertido/.test(ap.e) && /otro/.test(ap.e), 'el parche aborta con un mensaje claro que nombra al dueño: ' + (ap.e ?? '').split('\n').slice(0, 2).join(' / ').slice(0, 160))
  ok(difP(perm0, await permisos(db)).length === 0, 'no quedó nada a medias (permisos idénticos: la transacción se revirtió)')
  await db.exec(`grant execute on function fn_enviar_push(uuid[], text, text, text) to otro`)   // paso previo documentado
  const ap2 = await intenta(() => db.exec(PARCHE))
  ok(ap2.ok, 'con el permiso explícito al dueño del llamador el parche se aplica: ' + (ap2.e ?? ''))
  const e0 = await envios(db)
  await pedidoDirecto(db, dia(3))
  ok((await envios(db)) === e0 + 1, 'el envío legítimo funciona con el llamador de otro dueño')
  ok(!(await intenta(() => llamarPush(db, 'anon', [W1]))).ok, 'y anon sigue sin poder llamarla')
}

console.log('\n— S3. Contingencia: tras el parche, un llamador pasa a un dueño sin permiso; el script de recuperación lo arregla sin reabrir')
{
  const db = await escenario()
  ok((await intenta(() => db.exec(PARCHE))).ok, 'parche aplicado')
  await db.exec(`alter function fn_push_reservas_insert() owner to otro`)
  const roto = await intenta(() => pedidoDirecto(db, dia(3)))
  ok(!roto.ok && /permission denied|permiso denegado/i.test(roto.e), 'simulado el fallo: crear un pedido da permission denied dentro del trigger')
  const rec = await intenta(() => db.exec(RECUPERAR))
  ok(rec.ok, 'el script de recuperación se ejecuta: ' + (rec.e ?? ''))
  const e0 = await envios(db)
  await pedidoDirecto(db, dia(5))
  ok((await envios(db)) === e0 + 1, 'el envío legítimo se recuperó')
  ok(!(await intenta(() => llamarPush(db, 'anon', [W1]))).ok && !(await intenta(() => llamarPush(db, 'authenticated', [W1]))).ok, 'anon y authenticated siguen SIN acceso (no se reabrió)')
  const post = (await sqlTodo(db, DESPUES))[0]
  ok(post.every((r) => r.ok === true), 'las comprobaciones posteriores vuelven a dar todo ok = true')
}

console.log('\n— S4. Un llamador SECURITY INVOKER: el parche aborta')
{
  const db = await escenario()
  await db.exec(`alter function fn_push_candidaturas_insert() security invoker`)
  const ap = await intenta(() => db.exec(PARCHE))
  ok(!ap.ok && /SECURITY INVOKER/.test(ap.e), 'aborta y lo explica: ' + (ap.e ?? '').split('\n').slice(0, 2).join(' / ').slice(0, 150))
  ok((await intenta(() => llamarPush(db, 'anon', [W1]))).ok, 'sin cambios: sigue abierto (nada se aplicó)')
}

console.log('\n— S5. Sobrecargas: se cierran todas las de public.fn_enviar_push')
{
  const db = await escenario()
  await db.exec(`create function fn_enviar_push(p_texto text) returns void language sql as $$ select 1 $$; alter function fn_enviar_push(text) owner to dueno;`)
  const [A] = await sqlTodo(db, ANTES)
  ok(A.length === 2, 'las comprobaciones previas listan las 2 sobrecargas')
  ok((await intenta(() => db.exec(PARCHE))).ok, 'parche aplicado (sobrecarga con el mismo dueño)')
  const abierta = (await db.query(`select p.oid::regprocedure::text f from pg_proc p where p.proname='fn_enviar_push' and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))`)).rows
  ok(abierta.length === 0, 'ninguna sobrecarga queda ejecutable por anon/authenticated')
  ok((await sqlTodo(db, DESPUES))[0].every((r) => r.ok === true), 'las comprobaciones posteriores dan todo ok = true con 2 sobrecargas')
}

console.log('\n— S5b. Sobrecarga de OTRO dueño: el guardián es conservador y aborta sin cambiar nada')
{
  const db = await escenario()
  await db.exec(`create function fn_enviar_push(p_texto text) returns void language sql as $$ select 1 $$;`)   // dueño: superusuario
  const perm0 = await permisos(db)
  const ap = await intenta(() => db.exec(PARCHE))
  ok(!ap.ok && /abortado y revertido/.test(ap.e), 'aborta: ' + (ap.e ?? '').split('\n').slice(0, 2).join(' / ').slice(0, 170))
  ok(difP(perm0, await permisos(db)).length === 0, 'sin cambios en permisos')
}

console.log(`\n${pasos - fallos}/${pasos} comprobaciones OK  [SIMULACIÓN PGlite: el parche sigue SIN ejecutar en ningún proyecto real]`)
process.exit(fallos ? 1 : 0)
