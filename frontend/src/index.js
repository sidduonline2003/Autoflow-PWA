import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
import reportWebVitals from './reportWebVitals';
import { AuthProvider } from './contexts/AuthContext';

const root = ReactDOM.createRoot(document.getElementById('root'));

// Disable StrictMode in development for better performance
// StrictMode causes double-rendering which slows down initial load
const isDevelopment = process.env.NODE_ENV === 'development';

root.render(
  isDevelopment ? (
    <AuthProvider>
      <App />
    </AuthProvider>
  ) : (
    <React.StrictMode>
      <AuthProvider>
        <App />
      </AuthProvider>
    </React.StrictMode>
  )
);

// Disable service worker in development to avoid caching issues
// Change to register() in production for PWA features
if (isDevelopment) {
  serviceWorkerRegistration.unregister();
} else {
  serviceWorkerRegistration.register();
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
