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

function normalizeBase(url) {
  return String(url || "").replace(/\/$/, "");
}

export async function fetchAdminToken(panelBaseUrl, username, password) {
  const base = normalizeBase(panelBaseUrl);
  const body = new URLSearchParams();
  body.set("username", username);
  body.set("password", password);

  const response = await fetch(`${base}/api/admin/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });
  if (!response.ok) {
    throw new Error(`Panel auth failed with ${response.status}`);
  }
  const payload = await response.json().catch(() => ({}));
  if (!payload?.access_token) {
    throw new Error("Panel auth token not found");
  }
  return payload.access_token;
}

async function panelFetch(panelBaseUrl, accessToken, pathname, options = {}) {
  const base = normalizeBase(panelBaseUrl);
  const response = await fetch(`${base}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    throw new Error(`Panel request ${pathname} failed with ${response.status}`);
  }
  return response;
}

export async function getUserTemplates(panelBaseUrl, accessToken) {
  const response = await panelFetch(panelBaseUrl, accessToken, "/api/user_templates");
  return response.json().catch(() => []);
}

export async function getUsersSimple(panelBaseUrl, accessToken) {
  const response = await panelFetch(panelBaseUrl, accessToken, "/api/users/simple?all=true");
  return response.json().catch(() => ({}));
}

export async function createUserFromTemplate(panelBaseUrl, accessToken, { templateId, username, note }) {
  const response = await panelFetch(panelBaseUrl, accessToken, "/api/user/from_template", {
    method: "POST",
    body: JSON.stringify({
      user_template_id: Number(templateId),
      username,
      note: note || null
    })
  });
  return response.json().catch(() => ({}));
}

export async function deletePanelUser(panelBaseUrl, accessToken, username) {
  const response = await fetch(`${normalizeBase(panelBaseUrl)}/api/user/${encodeURIComponent(username)}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Delete panel user failed with ${response.status}`);
  }
}
