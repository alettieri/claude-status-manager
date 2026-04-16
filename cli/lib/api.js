const BASE_URL = process.env.SM_API_URL || "http://localhost:4000";

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  let res;
  try {
    res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
  } catch (err) {
    throw new Error(
      `Cannot connect to Status Manager API at ${BASE_URL}. Is the server running?\n  ${err.message}`
    );
  }

  if (res.status === 204) return null;

  const body = await res.json();

  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return body;
}

const api = {
  get: (path) => request(path),
  post: (path, data) =>
    request(path, { method: "POST", body: JSON.stringify(data) }),
  patch: (path, data) =>
    request(path, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (path) => request(path, { method: "DELETE" }),
};

module.exports = { api };
