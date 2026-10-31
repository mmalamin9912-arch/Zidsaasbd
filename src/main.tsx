import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { SplashLoader } from './components/SplashLoader.tsx';
import { LanguageProvider } from './lib/i18n.tsx';
import { ToastProvider } from './components/ToastProvider.tsx';
import { CartProvider } from './components/CartProvider.tsx';
import './index.css';
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      {/* ToastProvider wraps the whole tree so any view (and the standalone
          `toast` helper) can raise a notification from anywhere. */}
      <ToastProvider>
        {/* CartProvider exposes the shared multi-vendor marketplace basket via
            React Context, persisted to localStorage so it survives navigation
            and reloads. */}
        <CartProvider>
          <SplashLoader />
          <App />
        </CartProvider>
      </ToastProvider>
    </LanguageProvider>
  </StrictMode>,
);
