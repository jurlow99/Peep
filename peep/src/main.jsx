import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AdminPage } from './pages/AdminPage.jsx'
import { SignupPage, SigninPage } from './pages/AuthPages.jsx'
import { SetPasswordPage } from './pages/SetPasswordPage.jsx'
import { ThemeProvider } from './ThemeContext.jsx'

// Streamer features disabled — routes redirect to home until ready to re-enable
// To re-enable: restore StreamerSignInPage, ApplyToStreamPage, StreamerDashboard, StreamerProfile routes below

const path = window.location.pathname

// Redirect all disabled streamer routes to home
if (
  path === '/streamer-signin' ||
  path === '/apply-to-stream' ||
  path === '/streamer' ||
  path.startsWith('/stream/')
) {
  window.location.replace('/');
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      {path === '/admin'       ? <AdminPage />     :
       path === '/signup'      ? <SignupPage />    :
       path === '/signin'      ? <SigninPage />    :
       path === '/set-password'? <SetPasswordPage />:
       <App />}
    </ThemeProvider>
  </StrictMode>,
)
