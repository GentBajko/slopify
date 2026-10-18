// The extension's messages on the pages it fills (YouTube Studio and the sites it posts to): a
// column of toasts at the bottom right, each with Close and, for text to paste by hand, Copy.

const panelId = "slopify-studio-panel";

export function toastArea(): HTMLElement {
  let area = document.getElementById(panelId);
  if (area !== null) return area;
  area = document.createElement("div");
  area.id = panelId;
  area.setAttribute("role", "status");
  Object.assign(area.style, {
    position: "fixed",
    right: "16px",
    bottom: "16px",
    zIndex: "2147483647",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    maxWidth: "380px",
    font: "13px/1.4 Roboto, Arial, sans-serif",
  });
  document.body.append(area);
  return area;
}

export function toast(text: string, tone: "ok" | "error" | "info", copy?: string): void {
  const box = document.createElement("div");
  Object.assign(box.style, {
    background: tone === "error" ? "#5c1a1a" : tone === "ok" ? "#1d3b24" : "#282828",
    color: "#fff",
    padding: "10px 12px",
    borderRadius: "8px",
    boxShadow: "0 4px 16px rgba(0,0,0,.4)",
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    alignItems: "flex-start",
  });
  const words = document.createElement("span");
  words.textContent = `Slopify: ${text}`;
  words.style.flex = "1";
  box.append(words);
  if (copy !== undefined) box.append(button("Copy", () => void copyFromClick(copy, box)));
  box.append(button("Close", () => box.remove()));
  toastArea().append(box);
}

// The Copy button: a click lets the page write the clipboard. Should even that be refused,
// the text is shown selected in the message, to copy with the keyboard.
async function copyFromClick(text: string, box: HTMLElement): Promise<void> {
  if (await copyText(text)) {
    toast("Copied.", "ok");
    return;
  }
  if (box.querySelector("textarea") !== null) return;
  const area = document.createElement("textarea");
  area.value = text;
  area.readOnly = true;
  area.rows = 6;
  area.setAttribute("aria-label", "Text to copy");
  Object.assign(area.style, { width: "100%", font: "12px/1.4 monospace" });
  const hint = document.createElement("span");
  hint.textContent =
    "The browser refused the clipboard. The text is selected below: press Ctrl+C (⌘C on a Mac).";
  hint.style.width = "100%";
  box.append(hint, area);
  area.focus();
  area.select();
}

export function button(label: string, run: () => void): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  Object.assign(element.style, {
    background: "transparent",
    color: "#fff",
    border: "1px solid rgba(255,255,255,.5)",
    borderRadius: "4px",
    padding: "2px 8px",
    cursor: "pointer",
  });
  element.addEventListener("click", run);
  return element;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// "the Title field", "the Title field and the Tags field", "a, b and c".
export function listed(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`;
}
