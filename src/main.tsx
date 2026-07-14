// Must stay the first import: it swaps window.ipcRenderer for the demo bridge
// before src/services/api.ts captures it at module scope. No-op unless VITE_DEMO=1.
import './demo/install'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './i18n'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Use contextBridge
window.ipcRenderer.on('main-process-message', (_event: any, message: string) => {
  console.log(message)
})
