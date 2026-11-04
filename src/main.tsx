import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import './utils/safeStorage';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// An open tab can request a lazy chunk removed by a newer deployment.
window.addEventListener('vite:preloadError', (event) => {
  if (!navigator.onLine) return;
  const retryKey = 'sso_asset_reload_at';
  try {
    const now = Date.now();
    if (now - Number(sessionStorage.getItem(retryKey)) < 60_000) return;
    sessionStorage.setItem(retryKey, String(now));
  } catch {
    return;
  }
  event.preventDefault();
  window.location.reload();
});

// Automatically register service worker for PWA with error catch
try {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    registerSW({
      immediate: true,
      onRegisteredSW(_url, registration) {
        if (!registration) return;
        const checkForUpdate = () => {
          if (document.visibilityState === 'visible' && navigator.onLine) {
            void registration.update().catch(() => {});
          }
        };
        document.addEventListener('visibilitychange', checkForUpdate);
        window.addEventListener('online', checkForUpdate);
        window.addEventListener('pageshow', checkForUpdate);
      },
    });
  }
} catch (err) {
  console.warn('PWA service worker registration skipped:', err);
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}
