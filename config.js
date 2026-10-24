/**
 * Mayavi Frontend API Configuration
 * 
 * Instructions:
 * - Option A (Recommended - Netlify Proxy):
 *   Leave API_BASE_URL as "" (empty string). Configure `_redirects` or `netlify.toml`
 *   to proxy `/api/*` to your deployed FastAPI backend. This keeps all requests
 *   same-origin, avoids CORS issues, and supports secure session cookies seamlessly.
 * 
 * - Option B (Direct Backend Domain):
 *   Set API_BASE_URL to your deployed FastAPI backend URL, e.g.:
 *   API_BASE_URL: "https://your-backend-api.onrender.com"
 * 
 * - Local Development:
 *   Leave empty to automatically connect to http://127.0.0.1:8000 when running locally.
 */
window.__MAYAVI_CONFIG__ = window.__MAYAVI_CONFIG__ || {
  API_BASE_URL: ""
};
