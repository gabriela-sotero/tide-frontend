import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { GoogleOAuthProvider } from '@react-oauth/google';
import AuthGate from './AuthGate';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
// Try env first; if missing (e.g., local dev without .env), allow a localStorage fallback
const clientId = (
  (process.env.REACT_APP_GOOGLE_CLIENT_ID as string | undefined) ||
  (typeof window !== 'undefined' ? window.localStorage.getItem('REACT_APP_GOOGLE_CLIENT_ID') || undefined : undefined)
) as string | undefined;

if (!clientId) {
  // Helpful console message for developers and CI
  // eslint-disable-next-line no-console
  console.error(
    'Google OAuth client ID is missing. Set REACT_APP_GOOGLE_CLIENT_ID in your .env (local) and in Vercel Environment Variables, then rebuild.'
  );
}

root.render(
  <React.StrictMode>
    {clientId ? (
      <GoogleOAuthProvider clientId={clientId}>
        <AuthGate>
          <App />
        </AuthGate>
      </GoogleOAuthProvider>
    ) : (
      <div style={{ padding: 16, fontFamily: 'sans-serif' }}>
        <h3>Configuration error</h3>
        <p>
          Missing <code>REACT_APP_GOOGLE_CLIENT_ID</code>. Define it in your <code>.env</code> and in Vercel → Project → Settings → Environment
          Variables, then redeploy.
        </p>
        <p>
          For local development, you can also set it temporarily via browser console and reload:
        </p>
        <pre style={{ background:'#f5f5f5', padding: 12, borderRadius: 6 }}>
{`localStorage.setItem('REACT_APP_GOOGLE_CLIENT_ID', 'YOUR_CLIENT_ID'); location.reload();`}
        </pre>
      </div>
    )}
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
