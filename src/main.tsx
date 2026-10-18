import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './context/AuthContext.tsx'
import AvisoEntornoPruebas, { ES_ENTORNO_PRUEBAS } from './components/AvisoEntornoPruebas.tsx'

if (ES_ENTORNO_PRUEBAS) document.title = `[PRUEBAS] ${document.title}`

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Instalar como PWA es una mejora, no algo crítico: si falla, la app
      // sigue funcionando normal desde el navegador.
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AvisoEntornoPruebas />
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
