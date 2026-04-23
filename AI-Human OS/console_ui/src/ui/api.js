export async function apiGet(path) {
  const res = await fetch(path, {
    method: "GET",
    headers: { "Accept": "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data?.detail || data?.message || res.statusText;
    throw new Error(detail || "Request failed");
  }
  return data;
}

export async function apiPost(path, body = {}) {
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data?.detail || data?.message || res.statusText;
    throw new Error(detail || "Request failed");
  }
  return data;
}

export function openLogStream(onEvent) {
  const evt = new EventSource("/api/logs/stream");
  evt.onmessage = message => {
    try {
      onEvent(JSON.parse(message.data));
    } catch {
      // ignore
    }
  };
  evt.onerror = () => {
    // Keep EventSource behavior (it will retry).
  };

  return () => evt.close();
}

