/** Uklanja tipičan Markdown šum iz LLM izlaza da ostane čist pravni tekst. */
export function sanitizeLegalPlainText(text: string): string {
  let s = text.replace(/\r\n/g, "\n");

  s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
  s = s.replace(/\*([^*\n]+)\*/g, "$1");
  s = s.replace(/^#{1,6}\s+/gm, "");
  s = s.replace(/^\s*[-*+]\s+/gm, "– ");

  return s.trim();
}
