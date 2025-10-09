import React from 'react'
import ReactDOM from 'react-dom/client'
import AppRouter from './Router.jsx'
import './index.css'
import ProtectedDashboard from './components/ProtectedDashboard'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ProtectedDashboard>
      <AppRouter />
    </ProtectedDashboard>
  </React.StrictMode>,
)
