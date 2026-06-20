export function sanitizeReceiptText(text: string): string {
  // Strip trailing parenthetical that contains only latin/english words (legacy mixed names)
  return text.replace(/\s*\([^)]*[a-zA-Z][^)]*\)\s*$/, '').trim();
}
