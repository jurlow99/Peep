import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AdminPage } from './pages/AdminPage.jsx'
import { SignupPage, SigninPage } from './pages/AuthPages.jsx'
import { ApplyToStreamPage } from './pages/ApplyToStreamPage.jsx'

const path = window.location.pathname

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {path === '/admin'          ? <AdminPage />          :
     path === '/signup'         ? <SignupPage />         :
     path === '/signin'         ? <SigninPage />         :
     path === '/apply-to-stream'? <ApplyToStreamPage />  :
     <App />}
  </StrictMode>,
)
