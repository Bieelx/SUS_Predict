import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './mobile.css'
import LegalPage, { LEGAL_PAGES } from './pages/Legal.jsx'

const legalPath = window.location.pathname.replace(/\/$/, '')

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <>{LEGAL_PAGES[legalPath] ? <LegalPage path={legalPath} /> : <App />}</>
  </React.StrictMode>
)
