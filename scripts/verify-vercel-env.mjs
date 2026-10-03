const requiredVariables = [
  "VITE_API_URL",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
];

const missingVariables = requiredVariables.filter(
  (name) => !process.env[name]?.trim(),
);

if (missingVariables.length > 0) {
  console.error(
    `Vercel build is missing required environment variables: ${missingVariables.join(", ")}. ` +
      "Set them in Vercel Project Settings > Environment Variables, then redeploy.",
  );
  process.exit(1);
}

for (const name of ["VITE_API_URL", "VITE_SUPABASE_URL"]) {
  let url;

  try {
    url = new URL(process.env[name]);
  } catch {
    console.error(`${name} must be an absolute HTTPS URL.`);
    process.exit(1);
  }

  if (url.protocol !== "https:") {
    console.error(`${name} must use HTTPS for a production Vercel deployment.`);
    process.exit(1);
  }

  if (name === "VITE_API_URL" && !url.pathname.replace(/\/+$/, "").endsWith("/api")) {
    console.error(`${name} must include the backend API path, for example https://pos-api.example.com/api.`);
    process.exit(1);
  }
}
