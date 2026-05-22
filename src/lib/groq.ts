const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

export async function groqChat(
  system: string,
  user: string,
  options?: { maxTokens?: number; temperature?: number }
): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return '';

  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 600,
    }),
  });

  if (!res.ok) return '';
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

export function parseJsonFromText<T>(text: string): T | null {
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}
