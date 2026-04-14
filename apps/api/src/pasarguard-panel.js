export async function tryFetchApiKeyFromPanel(panelBaseUrl, username, password) {
  const base = String(panelBaseUrl || "").replace(/\/$/, "");
  const candidates = [
    { path: "/api/auth/login", tokenPath: ["apiKey"] },
    { path: "/api/login", tokenPath: ["token"] },
    { path: "/auth/login", tokenPath: ["token"] }
  ];

  for (const candidate of candidates) {
    try {
      const response = await fetch(`${base}${candidate.path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      if (!response.ok) {
        continue;
      }
      const payload = await response.json().catch(() => ({}));
      const token = payload?.apiKey || payload?.token || payload?.data?.apiKey || payload?.data?.token || null;
      if (token) {
        return { ok: true, apiKey: token, source: candidate.path };
      }
    } catch (_error) {
      // Continue trying candidates.
    }
  }

  return { ok: false, apiKey: null, source: null };
}
