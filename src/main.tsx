import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Remove the loading shell once React mounts
const loadingShell = document.getElementById('app-loading');
if (loadingShell) {
  loadingShell.remove();
}

// Global Frontend Error Logging (Temporary Debugging Visibility)
window.onerror = function(message, source, lineno, colno, error) {
  console.error("[Global Error Boundary]", { message, source, lineno, colno, error });
  return false;
};

window.addEventListener('unhandledrejection', function(event) {
  console.error("[Unhandled Promise Rejection]", event.reason);
});


// Register service worker for offline capability
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // The service worker is automatically registered by vite-plugin-pwa
    // This ensures all assets are cached for offline use
    console.log('[PWA] Service worker support detected');
  });
}

createRoot(document.getElementById("root")!).render(<App />);
