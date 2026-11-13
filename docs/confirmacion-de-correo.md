# Confirmación de correo (YAVI, YAVI Profesional, YAVI Admin)

Estado: **implementado en el código, sin publicar**. Con la confirmación activada en Supabase, el alta funciona así.

## Flujo

1. **Crear cuenta** (`/registro`): solo se crea el usuario de acceso en Supabase Auth y se envía el correo. No se escribe nada en `perfiles` ni `trabajadores` y no se sube ningún archivo. Se muestra «Revisa tu correo» con *Reenviar* (espera de 60 s) y *Cambiar correo*.
   - App cliente: el formulario pide nombre, celular, dirección, zona, correo y contraseña. Los datos de contacto viajan en `user_metadata` (nunca el rol).
   - App Profesional: solo correo y contraseña.
2. **El enlace del correo** vuelve a la misma app (`emailRedirectTo` = dominio de la app que lo originó + `/confirmado`) y deja la sesión iniciada. Si el enlace venció o ya se usó, `/confirmado` lo explica y lleva a iniciar sesión.
3. **App cliente, primer ingreso**: si no existe fila en `perfiles`, se crea con `rol = 'cliente'` fijo y solo los datos de contacto validados de `user_metadata`. El rol jamás se lee de `user_metadata`.
4. **App Profesional, tras confirmar**: si no hay fila en `trabajadores`, va a «Completar perfil de profesional» (nombre, celular, dirección, documentos, zonas). **Es el único lugar donde se crea la fila de `trabajadores` y se suben documentos**, ya con sesión. También crea `perfiles` si la cuenta aún no lo tenía; si ya lo tiene (un cliente, o un alta abandonada), solo actualiza lo que cambió, sin enviar `rol`.
5. Mientras se envía, la pantalla no se puede abandonar; si algo falla se muestra el error y se puede **reintentar sin perder lo escrito** (los archivos ya subidos no se vuelven a subir).
6. **Cerrar sesión** está en la barra superior siempre que haya sesión (también sin perfil de profesional) y en la pantalla de alta.
7. **Límites de los datos**: nombre hasta 120 caracteres y dirección hasta 200 (en cliente y en profesional; el nombre de las referencias también). Se validan **antes** de crear la cuenta con la misma regla (`errorContacto`) con la que luego se crea el perfil. La base de datos no impone estos límites (no hay `check`): los fija la app.
8. **Cuenta confirmada sin perfil** (p. ej. datos de registro que no pasan la validación, o falló la creación): la app de clientes muestra «Completa tus datos», rellenado con lo que se pudo leer, para corregir y reintentar, con «Cerrar sesión» a mano. El rol es siempre `cliente`.
9. **Correo ya registrado**: no se crea otra cuenta; se invita a iniciar sesión. Si el correo existe pero no se confirmó, el inicio de sesión lo explica y ofrece *Reenviar correo de confirmación*.

## Qué configurar en Supabase (en este orden)

1. **Authentication → SMTP Settings**: configurar un SMTP propio (el de Supabase solo envía unos pocos correos por hora y no sirve para publicar). Remitente tipo `YAVI <no-responder@tu-dominio>`.
2. **Authentication → URL Configuration → Redirect URLs**: agregar el dominio de **cada** app con `/**` (cliente, profesional, admin y las vistas previas, p. ej. `https://yavi-pruebas.vercel.app/**` y `https://yavi-pro-pruebas.vercel.app/**`). Si un dominio no está en la lista, Supabase manda el enlace al *Site URL* y la persona aterriza en otra app.
3. **Site URL**: el dominio de la app de clientes.
4. **Authentication → Email Templates**: pegar los textos de abajo (*Confirm signup*, *Reset password*, *Change email address*). No cambiar las variables `{{ .ConfirmationURL }}`.
5. **Authentication → Providers → Email**: activar **Confirm email**. (Dejarlo para el final, después de pegar plantillas y SMTP.)
6. Probar con una cuenta de verdad antes de publicar (ver abajo).

## Textos de correo

**Confirm signup** — Asunto: `Confirma tu correo en YAVI`

```html
<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="margin:0 0 12px">¡Bienvenida/o a YAVI!</h2>
  <p>Gracias por crear tu cuenta. Para terminar, confirma tu correo tocando el botón:</p>
  <p style="margin:24px 0"><a href="{{ .ConfirmationURL }}" style="background:#ff8a35;color:#1e293b;font-weight:bold;text-decoration:none;padding:14px 24px;border-radius:12px;display:inline-block">Confirmar mi correo</a></p>
  <p style="font-size:14px;color:#475569">Ábrelo desde el mismo celular donde te registraste. Si el botón no funciona, copia este enlace en tu navegador:<br><span style="word-break:break-all">{{ .ConfirmationURL }}</span></p>
  <p style="font-size:14px;color:#475569">Si tú no creaste esta cuenta, ignora este mensaje.</p>
  <p style="font-size:12px;color:#94a3b8">YAVI · Servicios a tu alcance · Iquitos, Perú</p>
</div>
```

**Reset password** — Asunto: `Crea una nueva contraseña en YAVI`

```html
<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="margin:0 0 12px">Cambia tu contraseña</h2>
  <p>Recibimos una solicitud para crear una nueva contraseña en tu cuenta de YAVI.</p>
  <p style="margin:24px 0"><a href="{{ .ConfirmationURL }}" style="background:#ff8a35;color:#1e293b;font-weight:bold;text-decoration:none;padding:14px 24px;border-radius:12px;display:inline-block">Crear nueva contraseña</a></p>
  <p style="font-size:14px;color:#475569">Si el botón no funciona, copia este enlace en tu navegador:<br><span style="word-break:break-all">{{ .ConfirmationURL }}</span></p>
  <p style="font-size:14px;color:#475569">Si tú no lo pediste, ignora este mensaje: tu contraseña no cambia.</p>
  <p style="font-size:12px;color:#94a3b8">YAVI · Servicios a tu alcance · Iquitos, Perú</p>
</div>
```

**Change email address** — Asunto: `Confirma tu nuevo correo en YAVI`

```html
<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="margin:0 0 12px">Confirma tu nuevo correo</h2>
  <p>Pediste cambiar el correo de tu cuenta de YAVI de {{ .Email }} a {{ .NewEmail }}.</p>
  <p style="margin:24px 0"><a href="{{ .ConfirmationURL }}" style="background:#ff8a35;color:#1e293b;font-weight:bold;text-decoration:none;padding:14px 24px;border-radius:12px;display:inline-block">Confirmar cambio de correo</a></p>
  <p style="font-size:14px;color:#475569">Si tú no lo pediste, ignora este mensaje.</p>
  <p style="font-size:12px;color:#94a3b8">YAVI · Servicios a tu alcance · Iquitos, Perú</p>
</div>
```

*Magic link*, *Invite user* y *Reauthentication* no se usan en YAVI.

## Qué probar en la vista previa

Con **Confirm email activado** y el SMTP configurado:

1. **Cliente nuevo**: registrarse en la app de clientes → «Revisa tu correo» → intentar entrar *antes* de confirmar (debe decir que falta confirmar y ofrecer reenviar) → abrir el enlace del correo → entra a YAVI con sesión → en Cuenta aparecen sus datos (nombre, celular, dirección, zona).
2. **Reenviar y cambiar correo**: en «Revisa tu correo», *Reenviar* (espera de 60 s) llega un correo; *Cambiar correo* vuelve al formulario con lo escrito.
3. **Profesional nuevo**: registrarse en YAVI Profesional → confirmar → «Completar perfil de profesional» → llenar con documentos → queda «en revisión».
4. **Abandono**: empezar a completar, cerrar la app, volver a entrar → vuelve a «Completar perfil» con nombre, celular y dirección ya guardados.
5. **Error y reintento**: en «Completar perfil», cortar el internet justo antes de enviar → debe mostrar el error y, al reconectar, *Reintentar* sin perder lo escrito.
6. **Cliente que quiere ser profesional**: iniciar sesión en YAVI Profesional con una cuenta de cliente → «Completar perfil» (sin crear otra cuenta).
7. **Correo ya registrado**: intentar registrarse con un correo que ya tiene cuenta → mensaje de «Inicia sesión», sin crear nada.
8. **Cerrar sesión**: visible en la barra con la cuenta equivocada y sin perfil de profesional.
9. **Enlace vencido**: abrir dos veces el mismo enlace → «Este enlace ya no sirve».
10. **Recuperar contraseña**: sigue funcionando (el correo usa el texto nuevo).
11. **Límites**: en el registro de cliente, pegar un nombre de 121 caracteres: el campo no deja pasar de 120 y, si se fuerza, sale el mensaje antes de enviar nada.
12. **Cuenta sin perfil**: (solo si algún caso la deja así) al entrar en la app de clientes aparece «Completa tus datos»; corregir y guardar lleva al inicio.
13. **Avisos de antes (app sin nombre)**: un cliente que tenía avisos activados antes de la 0017 ve **una vez** la pantalla «Activa las notificaciones». Al activar, la suscripción nueva se guarda con `app='cliente'` y se borran las viejas del mismo dispositivo: solo filas de la misma persona con `app IS NULL` y el mismo `user_agent` (nunca una que ya tenga app, aunque coincida); con «Ahora no» no vuelve a salir. Quien nunca activó avisos no ve la pantalla. No se escribe nada en la base para marcar las viejas.

## Pruebas automáticas

- `src/lib/altaCuenta.test.ts` (21): el rol nunca sale de `user_metadata`, metadata inválida no crea nada, enlace de confirmación por dominio de origen, correo ya registrado / sin confirmar, filas de `trabajadores` y `perfiles`.
- `src/lib/altaCuenta.db.test.ts` (5, requiere `npm i --no-save @electric-sql/pglite`): contra la base de las migraciones con la 0016, con las mismas filas que arma la app: correo sin confirmar no puede escribir nada; alta de cliente; alta de profesional con documentos; no se puede verificar a sí mismo ni escribir en la carpeta de otra persona; abandono a mitad y reanudación.
- **No se puede probar sin Supabase real**: que Supabase rechace el inicio de sesión de un correo sin confirmar (lo hace la opción *Confirm email*). Está en la lista de la vista previa.
