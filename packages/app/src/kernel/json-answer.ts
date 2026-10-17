// The JSON an AI model's answer carries, wherever the model put it: bare, in a ```json fence, or
// after a sentence of its own. Everything from the first `open` to the last `close` is parsed;
// undefined when there is none or it is not JSON.
export function jsonBetween(text: string, open: "[" | "{", close: "]" | "}"): unknown {
  const start = text.indexOf(open);
  const end = text.lastIndexOf(close);
  if (start === -1 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}
