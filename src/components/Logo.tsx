/**
 * Marca YAVI. Se usan los archivos oficiales tal cual (public/brand, copia de brand/originales):
 * sin recortar ni deformar; `mix-blend-multiply` solo hace que el blanco del archivo se funda con el fondo.
 */
type Props = {
  variante?: 'icono' | 'completo'
  className?: string
}

export function Logo({ variante = 'completo', className = '' }: Props) {
  const completo = variante === 'completo'
  return (
    <img
      src={completo ? '/brand/yavi-logo.jpg' : '/brand/yavi-icono.jpg'}
      width={completo ? 1536 : 1254}
      height={completo ? 1024 : 1254}
      alt="YAVI — Servicios a tu alcance"
      draggable={false}
      className={`h-auto select-none mix-blend-multiply ${className}`}
    />
  )
}
