export function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/saito_csrf=([^;]+)/);
  return match ? match[1] : null;
}

export function getAuthHeaders(): Record<string, string> {
  const token = getCsrfToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['X-CSRF-Token'] = token;
  }
  return headers;
}
