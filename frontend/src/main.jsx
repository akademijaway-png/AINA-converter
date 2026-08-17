import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

// Top-level error handler so failures in the preview don't show a blank page
window.addEventListener('error', (e) => {
  console.error('Global error:', e.error || e.message)
})
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled rejection:', e.reason)
})

try {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
} catch (e) {
  console.error('Failed to mount app:', e)
  document.getElementById('root').innerHTML =
    '<div style="padding:20px;color:#fff;font-family:sans-serif;background:#0a0a0f;height:100vh">' +
    '<h2>App failed to start</h2><pre style="color:#f88;white-space:pre-wrap">' +
    (e?.message || e) + '</pre></div>'
}

