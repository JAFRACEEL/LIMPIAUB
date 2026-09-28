// Respaldo cuando la app está abierta: un pitido corto con Web Audio, sin
// necesidad de cargar ningún archivo de audio.
export function reproducirSonidoAlerta() {
  try {
    const AudioContextCtor =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor) return
    const contexto = new AudioContextCtor()
    const oscilador = contexto.createOscillator()
    const ganancia = contexto.createGain()
    oscilador.type = 'sine'
    oscilador.frequency.value = 880
    ganancia.gain.setValueAtTime(0.15, contexto.currentTime)
    ganancia.gain.exponentialRampToValueAtTime(0.001, contexto.currentTime + 0.5)
    oscilador.connect(ganancia)
    ganancia.connect(contexto.destination)
    oscilador.start()
    oscilador.stop(contexto.currentTime + 0.5)
    oscilador.onended = () => contexto.close()
  } catch {
    // Sin soporte de Web Audio en este navegador: no es crítico, el toast y
    // la vibración siguen funcionando igual.
  }
}
