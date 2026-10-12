const isProductionVercel = process.env.VERCEL_ENV === "production";
const apiUrl = process.env.VITE_API_URL?.trim();

if (!apiUrl) {
  console.warn(
    "\n⚠️ NOTICE: 'VITE_API_URL' environment variable is not configured on Vercel.\n" +
    "The frontend UI will build successfully, but connecting to your backend API will require:\n\n" +
    "How to Connect Backend in 2 Minutes:\n" +
    "1. Open your project in the Vercel Dashboard.\n" +
    "2. Go to: Settings > Environment Variables.\n" +
    "3. Add: Key = 'VITE_API_URL', Value = 'https://your-pos-api.onrender.com/api' (or your backend URL ending in /api).\n" +
    "4. Click Save and Redeploy.\n\n" +
    "Note: Vercel hosts the frontend client application (PWA/UI). Your persistent backend service\n" +
    "(WebSockets, Cron, PostgreSQL) runs on Render, Railway, Fly.io, or Docker.\n"
  );
  process.exit(0);
}

try {
  const url = new URL(apiUrl);
  if (isProductionVercel && url.protocol !== "https:") {
    console.warn("⚠️ Warning: VITE_API_URL should use HTTPS for production deployments.");
  }
  if (!url.pathname.replace(/\/+$/, "").endsWith("/api")) {
    console.warn("⚠️ Warning: VITE_API_URL should typically include the '/api' route prefix (e.g. https://your-api.onrender.com/api).");
  }
} catch {
  console.warn("⚠️ Warning: VITE_API_URL does not appear to be a valid absolute URL.");
}

process.exit(0);
