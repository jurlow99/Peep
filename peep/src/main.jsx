import DeleteAccountPage from "./pages/DeleteAccountPage";
import ProviderPortal from './pages/ProviderPortal.jsx'
/* eslint-disable react-refresh/only-export-components -- entry module:
   it exports nothing, so it is never a fast-refresh boundary. */
import { Component, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { QueryProvider } from './providers/QueryProvider.jsx'
import { SignupPage, SigninPage } from './pages/AuthPages.jsx'
import { SetPasswordPage } from './pages/SetPasswordPage.jsx'
import { StreamerDashboard } from './pages/StreamerDashboard.jsx'
import { StreamerProfile } from './pages/StreamerProfile.jsx'
import { SupportPage } from './pages/SupportPage.jsx'
import { EnvBadge, DevSplash } from './components/EnvBadge.jsx'

// The CMS behind AdminPage is ~9.6k lines and only admins ever open it, so it
// loads on demand instead of riding along in every viewer's bundle.
// AdminPage is a named export, so unwrap it into the default lazy() expects.
const AdminPage = lazy(() =>
  import('./pages/AdminPage.jsx').then(m => ({ default: m.AdminPage })))

// Matches the app's background so the swap reads as a beat, not a white flash.
const adminFallback = <div style={{ background: '#0a0a0a', minHeight: '100vh' }} />

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
const host = window.location.hostname
const isLocal = host === 'localhost' || host === '127.0.0.1'

// Admin: production = admin.watchpeep.tv subdomain only; local dev = /admin path
// (localhost can't be the subdomain). Public watchpeep.tv/admin leads to the site.
const isAdminHost = host === 'admin.watchpeep.tv' || (isLocal && path === '/admin')

// Distinguish browser tabs by environment: peep / local peep / admin / local admin
// Browser-tab distinguisher: prod = "peep" / "admin", local = "local" / "local admin"
document.title = isAdminHost
  ? (isLocal ? 'local admin' : 'admin')
  : (isLocal ? 'local' : 'peep')

// Legacy streamer-only routes → redirect to unified flow
if (path === '/streamer-signin' || path === '/apply-to-stream' || path === '/create-channel') {
  window.location.replace('/signin?redirect=/streamer');
}

// Note: React.StrictMode intentionally left OFF — it double-renders every
// component in dev, which made typing/dragging laggy on this large app. It has
// no effect on the production build, so this only changes local dev speed.
createRoot(document.getElementById('root')).render(
    <ErrorBoundary>
      <DevSplash />
      <EnvBadge />
      {path.replace(/\/+$/, '') === '/deliveries' ? <ProviderPortal /> : isAdminHost              ? <Suspense fallback={adminFallback}><AdminPage /></Suspense> :
       path === '/signup'         ? <SignupPage />        :
       path === '/account/delete' ? <DeleteAccountPage /> :
       path === '/signin'         ? <SigninPage />        :
       path === '/set-password'   ? <SetPasswordPage />   :
       path === '/support'        ? <SupportPage />       :
       path === '/streamer'       ? <StreamerDashboard /> :
       path.startsWith('/stream/')? <StreamerProfile />   :
       <BrowserRouter>
         <QueryProvider>
           <App />
         </QueryProvider>
       </BrowserRouter>}
    </ErrorBoundary>,
)
