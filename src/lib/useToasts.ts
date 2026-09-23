import { useCallback, useState } from 'react'

interface Toast {
  id: number
  mensaje: string
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const agregar = useCallback((mensaje: string) => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, mensaje }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000)
  }, [])

  return { toasts, agregar }
}
