export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  let csrfToken = typeof document !== 'undefined' 
    ? document.cookie.match(/saito_csrf=([^;]+)/)?.[1] 
    : null;
  
  if (!csrfToken && typeof document !== 'undefined') {
    csrfToken = crypto.randomUUID();
    document.cookie = `saito_csrf=${csrfToken}; path=/; max-age=3600; SameSite=Strict`;
  }
  
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }
  
  return fetch(url, {
    ...options,
    headers,
  });
}
