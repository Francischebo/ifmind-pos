const isProductionVercel = process.env.VERCEL_ENV === "production";
const apiUrl = process.env.VITE_API_URL?.trim();

if (!apiUrl) {
  if (isProductionVercel) {
    console.error(
      "\n❌ Vercel Production Build Failed: Missing 'VITE_API_URL' environment variable.\n\n" +
      "Explanation:\n" +
      "CFI-POS is a full-stack POS system. Vercel hosts the frontend client application (HTML/React),\n" +
      "while your backend service (Node.js, PostgreSQL, Socket.IO WebSockets, Cron jobs) runs on a\n" +
      "persistent host such as Render, Railway, Fly.io, or a Docker VPS.\n\n" +
      "How to Fix in 2 Minutes:\n" +
      "1. Open your project in the Vercel Dashboard.\n" +
      "2. Go to: Settings > Environment Variables.\n" +
      "3. Add a new variable:\n" +
      "     Key:   VITE_API_URL\n" +
      "     Value: https://your-pos-api.onrender.com/api  (replace with your backend HTTPS URL ending in /api)\n" +
      "4. Click Save and Redeploy.\n"
    );
    process.exit(1);
  } else {
    console.warn(
      "\n⚠️ WARNING: 'VITE_API_URL' is not configured for this Vercel deployment.\n" +
      "The client bundle will build, but API requests will require 'VITE_API_URL' configured in\n" +
      "Vercel Project Settings > Environment Variables (e.g. https://your-backend.onrender.com/api).\n"
    );
    process.exit(0);
  }
}

let url;
try {
  url = new URL(apiUrl);
} catch {
  console.error("VITE_API_URL must be a valid, absolute URL (e.g. https://your-api.onrender.com/api).");
  process.exit(1);
}

if (isProductionVercel && url.protocol !== "https:") {
  console.error("VITE_API_URL must use HTTPS for production Vercel deployments.");
  process.exit(1);
}

if (!url.pathname.replace(/\/+$/, "").endsWith("/api")) {
  console.error("VITE_API_URL must include the '/api' route prefix (e.g. https://your-api.onrender.com/api).");
  process.exit(1);
}
