const API_BASE = import.meta.env.VITE_API_URL;
let csrfPromise;
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
async function getCsrf() {
  csrfPromise ||= fetch(`${API_BASE}/api/csrf`, { credentials: 'include' }).then(async response => {
    if (!response.ok) throw await readError(response); return response.json();
  }).catch(error => { csrfPromise = null; throw error; });
  return csrfPromise;
}
async function api(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase(); const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) { const csrf = await getCsrf(); headers.set(csrf.headerName || 'X-XSRF-TOKEN', csrf.token); }
  const response = await fetch(`${API_BASE}${path}`, { ...options, method, headers, credentials: 'include' });
  if (!response.ok) throw await readError(response); if (response.status === 204) return null;
  return (response.headers.get('content-type') || '').includes('application/json') ? response.json() : response;
}
export function request(path, options) { return api(path, options); }
export async function getCurrentUser() { try { return await api('/api/me'); } catch (error) { if (error.status === 401) return null; throw error; } }
export function startGoogleLogin() { window.location.href = `${API_BASE}/oauth2/authorization/google`; }
export async function signOut() { await api('/api/logout', { method: 'POST' }); }
export async function getFolders() { return api('/api/folders'); }
export async function createFolder(name) { return api('/api/folders', { method: 'POST', body: JSON.stringify({ name }) }); }
export async function updateFolder(id, changes) { return api(`/api/folders/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(changes) }); }
export async function removeFolder(id) { return api(`/api/folders/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
export async function getDocuments(params = {}) { const query = new URLSearchParams({ page: '0', size: '100', sort: 'updatedAt', direction: 'desc', ...params }); return api(`/api/documents?${query}`); }
export async function getDocument(id) { return api(`/api/documents/${encodeURIComponent(id)}`); }
export async function createDocument(payload) { return api('/api/documents', { method: 'POST', body: JSON.stringify(payload) }); }
export async function updateDocument(id, payload) { return api(`/api/documents/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) }); }
export async function moveDocument(id, folderId) { return api(`/api/documents/${encodeURIComponent(id)}/folder`, { method: 'PATCH', body: JSON.stringify({ folderId }) }); }
export async function deleteDocument(id) { return api(`/api/documents/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
export async function getSettings() { return api('/api/settings'); }
export async function updateSettings(settings) { return api('/api/settings', { method: 'PUT', body: JSON.stringify(settings) }); }
export async function getFonts() { return api('/api/fonts'); }
export async function getShares(documentId) { return api(`/api/documents/${encodeURIComponent(documentId)}/shares`); }
export async function createShare(documentId, payload) { return api(`/api/documents/${encodeURIComponent(documentId)}/shares`, { method: 'POST', body: JSON.stringify(payload) }); }
export async function updateShare(shareId, payload) { return api(`/api/shares/${encodeURIComponent(shareId)}`, { method: 'PATCH', body: JSON.stringify(payload) }); }
export async function deleteShare(shareId) { return api(`/api/shares/${encodeURIComponent(shareId)}`, { method: 'DELETE' }); }
export async function getPublicShare(token) { return api(`/api/public/shares/${encodeURIComponent(token)}`); }
export async function verifyPublicShare(token, password) { return api(`/api/public/shares/${encodeURIComponent(token)}/verify`, { method: 'POST', body: JSON.stringify({ password }) }); }
export async function downloadDocumentPdf(id, options) {
  const csrf = await getCsrf(); const response = await fetch(`${API_BASE}/api/documents/${encodeURIComponent(id)}/pdf`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', [csrf.headerName || 'X-XSRF-TOKEN']: csrf.token }, body: JSON.stringify(options) });
  if (!response.ok) throw await readError(response); return response.blob();
}
