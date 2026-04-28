function withApiPrefix(path) {
  const normalized = String(path || "");

  if (!normalized) {
    return "/api";
  }

  if (normalized === "/api" || normalized.startsWith("/api/")) {
    return normalized;
  }

  return normalized.startsWith("/") ? `/api${normalized}` : `/api/${normalized}`;
}

async function parseResponse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data?.detail || data?.message || res.statusText;
    throw new Error(detail || "Request failed");
  }

  return data;
}

async function request(path, init) {
  const response = await fetch(withApiPrefix(path), init);
  return parseResponse(response);
}

export async function apiPost(path, body = {}) {
  return request(path, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
