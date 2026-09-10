import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { quitarRuedaDeLosNumeros } from './lib/rueda.js'

// Antes de pintar nada: la rueda del ratón no puede cambiar cantidades de
// mercancía sola. Se registra una sola vez, en la raíz, para que valga también
// en los campos que alguien escriba mañana.
quitarRuedaDeLosNumeros()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)