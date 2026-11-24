const API_BASE = 'https://sealed-matt-desired-wesley.trycloudflare.com';

async function readError(response) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const error = new Error(
    payload?.message || `요청에 실패했어요. (${response.status})`
  );
  error.status = response.status;
  error.code = payload?.code;
  return error;
}

export async function getCurrentUser() {
  const response = await fetch(`${API_BASE}/api/me`, {
    credentials: 'include',
  });

  if (response.status === 401) return null;
  if (!response.ok) throw await readError(response);

  return response.json();
}

export function startGoogleLogin() {
  window.location.href =
    `${API_BASE}/oauth2/authorization/google`;
}

export async function signOut() {
  const csrfResponse = await fetch(`${API_BASE}/api/csrf`, {
    credentials: 'include',
  });
  if (!csrfResponse.ok) throw await readError(csrfResponse);

  const csrf = await csrfResponse.json();
  const response = await fetch(`${API_BASE}/api/logout`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      [csrf.headerName || 'X-XSRF-TOKEN']: csrf.token,
    },
  });

  if (!response.ok && response.status !== 204) {
    throw await readError(response);
  }
}