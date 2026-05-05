export function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element introuvable: #${id}`);
  return el;
}

export function $opt(id: string): HTMLElement | null {
  return document.getElementById(id);
}

export function $input(id: string): HTMLInputElement {
  const el = $(id);
  if (!(el instanceof HTMLInputElement)) {
    throw new Error(`#${id} n'est pas un <input>`);
  }
  return el;
}

export function $button(id: string): HTMLButtonElement {
  const el = $(id);
  if (!(el instanceof HTMLButtonElement)) {
    throw new Error(`#${id} n'est pas un <button>`);
  }
  return el;
}

