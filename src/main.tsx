import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// Automatically register service worker for PWA with error catch
try {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    registerSW({ immediate: true });
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
