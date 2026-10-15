// Clasifica las diferencias de funciones entre dos entornos a partir de la salida JSON de consultas-huellas-funciones.sql.
// Uso:  node supabase/tests/comparar-huellas.mjs referencia.local.json otro.local.json
//   (cada archivo: array de filas con las columnas de la consulta)
// Regla de oro: SOLO `IGUAL` es equivalencia demostrada. Las categorías de apoyo NO dan una función por equivalente:
//   IGUAL              huella_original, huella_cuerpo y atributos coinciden (texto idéntico).
//   CABECERA_DISTINTA  el cuerpo es idéntico (huella_cuerpo) pero cambian los atributos o la huella original: puede ser la
//                      representación de la cabecera según la versión del motor O un cambio real de atributos; revisar `atributos`.
//   SOLO_FIN_DE_LINEA  coincide únicamente tras quitar \r: diferencia de fin de línea, a CONFIRMAR (un \r dentro de un literal también cambia el texto).
//   SOLO_ESPACIOS      coincide únicamente tras colapsar todos los espacios: NO demostrado; puede ocultar un cambio dentro de un literal.
//   DISTINTA           ninguna coincide: cambio real o no explicado.
//   SOLO_EN_UNO        existe en un solo entorno.
import fs from 'node:fs'

export function clasificar(ref, otro) {
  const clave = (f) => `${f.proname}(${f.argumentos})`
  const mo = new Map(otro.map((f) => [clave(f), f]))
  const res = []
  for (const a of ref) {
    const b = mo.get(clave(a))
    if (!b) { res.push({ funcion: clave(a), categoria: 'SOLO_EN_UNO', detalle: 'solo en la referencia' }); continue }
    mo.delete(clave(a))
    let categoria, detalle = ''
    if (a.huella_cuerpo === b.huella_cuerpo) {
      if (a.atributos === b.atributos && a.huella_original === b.huella_original) categoria = 'IGUAL'
      else { categoria = 'CABECERA_DISTINTA'; detalle = a.atributos === b.atributos ? 'atributos iguales; cambia la representación de la cabecera' : 'cambian los atributos (seguridad, volatilidad, retorno, configuración...)' }
    } else if (a.huella_sin_cr === b.huella_sin_cr) { categoria = 'SOLO_FIN_DE_LINEA'; detalle = 'cuerpo_con_cr: ' + a.cuerpo_con_cr + ' / ' + b.cuerpo_con_cr }
    else if (a.huella_espacios_norm === b.huella_espacios_norm) { categoria = 'SOLO_ESPACIOS'; detalle = 'largo ' + a.largo_cuerpo + ' vs ' + b.largo_cuerpo + ' — NO demostrado, revisar el texto' }
    else { categoria = 'DISTINTA'; detalle = 'largo ' + a.largo_cuerpo + ' vs ' + b.largo_cuerpo }
    res.push({ funcion: clave(a), categoria, detalle })
  }
  for (const k of mo.keys()) res.push({ funcion: k, categoria: 'SOLO_EN_UNO', detalle: 'solo en el otro entorno' })
  return res
}

if (process.argv[1]?.endsWith('comparar-huellas.mjs') && process.argv[2]) {
  const [ref, otro] = [process.argv[2], process.argv[3]].map((f) => JSON.parse(fs.readFileSync(f, 'utf8')))
  const r = clasificar(ref, otro)
  const cuenta = {}
  for (const x of r) cuenta[x.categoria] = (cuenta[x.categoria] ?? 0) + 1
  for (const x of r.filter((y) => y.categoria !== 'IGUAL')) console.log(`${x.categoria.padEnd(18)} ${x.funcion}  ${x.detalle}`)
  console.log('\nResumen:', JSON.stringify(cuenta), '— solo IGUAL es equivalencia demostrada')
  process.exit(r.every((x) => x.categoria === 'IGUAL') ? 0 : 1)
}
