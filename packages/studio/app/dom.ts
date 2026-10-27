/**
 * @ember/studio/app/dom — tiny DOM helper layer.
 *
 * Owner: this file owns element construction and the reusable panel chrome (headers, rows,
 * number/text fields, selects, buttons). Keeping it in one place is what lets the panels
 * stay short enough to read.
 */

import { Theme } from "@ember/core";

type Child = Node | string | null | undefined | false;

export interface ElementOptions {
  className?: string;
  title?: string;
  text?: string;
  style?: Partial<CSSStyleDeclaration>;
  dataset?: Record<string, string>;
  on?: Partial<Record<keyof HTMLElementEventMap, (event: never) => void>>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.title) node.title = options.title;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.style) Object.assign(node.style, options.style);
  if (options.dataset) {
    for (const [key, value] of Object.entries(options.dataset)) node.dataset[key] = value;
  }
  if (options.on) {
    for (const [event, handler] of Object.entries(options.on)) {
      node.addEventListener(event, handler as EventListener);
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

export function button(
  label: string,
  onClick: () => void,
  options: { title?: string; kind?: "primary" | "ghost" | "danger"; disabled?: boolean } = {},
): HTMLButtonElement {
  const node = el("button", {
    text: label,
    title: options.title,
    className: `btn ${options.kind ?? "ghost"}`,
    on: { click: () => onClick() },
  });
  if (options.disabled) node.disabled = true;
  return node;
}

export function panel(title: string, extras: Child[] = [], className = ""): {
  root: HTMLElement;
  body: HTMLElement;
  header: HTMLElement;
  setStatus(text: string): void;
} {
  const status = el("span", { className: "panel-status" });
  const header = el("div", { className: "panel-header" }, [
    el("span", { className: "panel-title", text: title }),
    ...extras,
    status,
  ]);
  const body = el("div", { className: "panel-body" });
  const root = el("section", { className: `panel ${className}`.trim() }, [header, body]);
  return {
    root,
    body,
    header,
    setStatus: (text: string) => {
      status.textContent = text;
    },
  };
}

export function row(label: string, control: Node, options: { hint?: string } = {}): HTMLElement {
  return el("label", { className: "row", title: options.hint }, [
    el("span", { className: "row-label", text: label }),
    control,
  ]);
}

export function numberField(
  value: number,
  onChange: (value: number) => void,
  options: { step?: number; min?: number; max?: number } = {},
): HTMLInputElement {
  const input = el("input", { className: "field" });
  input.type = "number";
  input.value = String(round(value));
  input.step = String(options.step ?? 1);
  if (options.min !== undefined) input.min = String(options.min);
  if (options.max !== undefined) input.max = String(options.max);
  input.addEventListener("change", () => {
    const parsed = Number.parseFloat(input.value);
    onChange(Number.isFinite(parsed) ? parsed : value);
  });
  return input;
}

export function textField(
  value: string,
  onChange: (value: string) => void,
  options: { placeholder?: string } = {},
): HTMLInputElement {
  const input = el("input", { className: "field" });
  input.type = "text";
  input.value = value;
  if (options.placeholder) input.placeholder = options.placeholder;
  input.addEventListener("change", () => onChange(input.value));
  return input;
}

export function checkbox(value: boolean, onChange: (value: boolean) => void): HTMLInputElement {
  const input = el("input", { className: "check" });
  input.type = "checkbox";
  input.checked = value;
  input.addEventListener("change", () => onChange(input.checked));
  return input;
}

export function select<T extends string>(
  value: T,
  options: readonly T[],
  onChange: (value: T) => void,
): HTMLSelectElement {
  const node = el("select", { className: "field" });
  for (const option of options) {
    const item = el("option", { text: option });
    item.value = option;
    if (option === value) item.selected = true;
    node.append(item);
  }
  node.addEventListener("change", () => onChange(node.value as T));
  return node;
}

export function colorField(value: string, onChange: (value: string) => void): HTMLInputElement {
  const input = el("input", { className: "field color" });
  input.type = "color";
  input.value = cssHex(value);
  input.addEventListener("change", () => onChange(input.value));
  return input;
}

/** Converts `rgb()/rgba()` (which the engine allows) to the `#rrggbb` a colour input wants. */
export function cssHex(value: string): string {
  const text = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(text)) return text;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(text);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  const fn = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(text);
  if (fn) {
    const hex = [fn[1], fn[2], fn[3]]
      .map((channel) => Math.round(Number.parseFloat(channel)).toString(16).padStart(2, "0"))
      .join("");
    return `#${hex}`;
  }
  return Theme.highlight;
}

export function jsonArea(
  value: unknown,
  onCommit: (parsed: unknown) => void,
): HTMLTextAreaElement {
  const area = el("textarea", { className: "field json" });
  area.value = JSON.stringify(value ?? {}, null, 2);
  area.spellcheck = false;
  area.addEventListener("change", () => {
    try {
      onCommit(JSON.parse(area.value));
      area.style.borderColor = "";
    } catch {
      area.style.borderColor = Theme.danger;
    }
  });
  return area;
}

export function round(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}
