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


if ("serviceWorker" in navigator && import.meta.env.PROD) {
  const registerServiceWorker = () => {
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((registration) => {
      console.info("[PWA] Service worker registered", registration.scope);
      void registration.update().catch((error) => {
        console.warn("[PWA] Background service worker update check failed:", error);
      });
    }).catch((error: unknown) => {
      console.error("[PWA] Service worker registration failed:", error);
    });
  };

  if (document.readyState === "complete") {
    registerServiceWorker();
  } else {
    window.addEventListener("load", registerServiceWorker, { once: true });
  }
}

createRoot(document.getElementById("root")!).render(<App />);
