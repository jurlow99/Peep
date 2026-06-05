import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AdminPage } from './pages/AdminPage.jsx'
import { SignupPage, SigninPage } from './pages/AuthPages.jsx'
import { StreamerSignInPage } from './pages/AuthPages.jsx'
import { SetPasswordPage } from './pages/SetPasswordPage.jsx'
import { StreamerDashboard } from './pages/StreamerDashboard.jsx'
import { ApplyToStreamPage } from './pages/ApplyToStreamPage.jsx'
import { StreamerProfile } from './pages/StreamerProfile.jsx'

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ background: "#0a0a0a", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", color: "#fff", gap: 16, padding: 32 }}>
          <p style={{ color: "#f87171", fontSize: 14, maxWidth: 600, textAlign: "center" }}>Something went wrong: {this.state.error.message}</p>
          <a href="/" style={{ background: "#facc15", border: "none", borderRadius: 8, padding: "10px 24px", color: "#0a0a0a", fontWeight: 700, cursor: "pointer", textDecoration: "none", fontSize: 14 }}>← Go Back</a>
        </div>
      );
    }
    return this.props.children;
  }
}

const path = window.location.pathname

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      {path === '/admin'          ? <AdminPage />          :
       path === '/signup'         ? <SignupPage />         :
       path === '/signin'         ? <SigninPage />         :
       path === '/set-password'   ? <SetPasswordPage />    :
       path === '/streamer-signin'? <StreamerSignInPage /> :
       path === '/apply-to-stream'? <ApplyToStreamPage />  :
       path === '/streamer'       ? <StreamerDashboard />  :
       path.startsWith('/stream/')? <StreamerProfile />    :
       <App />}
    </ErrorBoundary>
  </StrictMode>,
)
