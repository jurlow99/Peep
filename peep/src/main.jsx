import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AdminPage } from './pages/AdminPage.jsx'

const isAdminPath = window.location.pathname === '/admin'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isAdminPath ? <AdminPage /> : <App />}
  </StrictMode>,
)
