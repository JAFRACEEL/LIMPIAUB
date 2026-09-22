// Traduce los mensajes de error más comunes de Supabase al español.
export function traducirError(error: unknown): string {
  const mensaje = error instanceof Error ? error.message : String(error)

  const mapa: Record<string, string> = {
    'Invalid login credentials': 'Correo o contraseña incorrectos.',
    'User already registered': 'Ya existe una cuenta con ese correo.',
    'Email not confirmed': 'Debes confirmar tu correo antes de iniciar sesión.',
    'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres.',
    'Unable to validate email address: invalid format': 'El correo no tiene un formato válido.',
    'For security purposes, you can only request this after': 'Por seguridad, espera unos segundos antes de reintentar.',
    'duplicate key value violates unique constraint': 'Ese dato ya está registrado.',
    'new row violates row-level security policy': 'No tienes permiso para hacer esta acción.',
    'Failed to fetch': 'No se pudo conectar con el servidor. Revisa tu internet.',
  }

  for (const clave in mapa) {
    if (mensaje.includes(clave)) return mapa[clave]
  }

  return mensaje || 'Ocurrió un error inesperado. Intenta de nuevo.'
}
