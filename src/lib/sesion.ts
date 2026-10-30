import { supabase } from './supabase'
import { borrarBorrador } from './borrador'

/** Cierra la sesión y borra el borrador del pedido de este dispositivo. */
export async function cerrarSesion() {
  borrarBorrador()
  await supabase.auth.signOut()
}
