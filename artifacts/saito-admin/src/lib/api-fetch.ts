export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const csrfToken = typeof document !== 'undefined' 
    ? document.cookie.match(/saito_csrf=([^;]+)/)?.[1] 
    : null;
  
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }
  
  return fetch(url, {
    ...options,
    credentials: 'include',
    headers,
  });
}
