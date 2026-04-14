function authHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`
  };
}

async function safeFetch(url, options, retries = 2) {
  let attempt = 0;
  let lastError;
  while (attempt <= retries) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`PasarGuard error ${response.status}`);
      }
      return response;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 400));
      attempt += 1;
    }
  }
  throw lastError;
}

export async function getBaseInfo(baseUrl, apiKey) {
  const response = await safeFetch(`${baseUrl}/info`, { headers: authHeaders(apiKey) });
  return response.json().catch(() => ({}));
}

export async function syncUser(baseUrl, apiKey, userPayload) {
  const response = await safeFetch(`${baseUrl}/user/sync`, {
    method: "PUT",
    headers: {
      ...authHeaders(apiKey),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(userPayload)
  });
  return response.text();
}

export async function getUserStats(baseUrl, apiKey, statRequest) {
  const response = await safeFetch(`${baseUrl}/stats`, {
    method: "GET",
    headers: {
      ...authHeaders(apiKey),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(statRequest)
  });
  return response.json().catch(() => ({}));
}
