import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import App from './App.jsx'
import './styles.css'

// PWA (solo en navegador web; dentro del APK no hace falta)
if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}

// Botón "atrás" de Android: retrocede de pantalla o cierra la app desde Inicio
if (Capacitor.isNativePlatform()) {
  CapApp.addListener('backButton', () => {
    const h = window.location.hash
    if (!h || h === '#/' || h === '#') CapApp.exitApp()
    else window.history.back()
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
)
