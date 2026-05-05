const HTML_ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const escapeHtml = (raw: string): string =>
  raw.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);

const isBlank = (value: unknown): boolean =>
  value === undefined || value === null || value === "" || value === false;

const conditionalBlockRe = (key: string): RegExp =>
  new RegExp(`\\{\\{\\?${key}\\}\\}([\\s\\S]*?)\\{\\{\\/${key}\\}\\}`, "g");

export type TemplateData = Readonly<Record<string, string | number | null | undefined>>;

export const renderTemplate = (template: string, data: TemplateData): string => {
  let out = template;

  // Pass 1: conditional blocks. Iterate keys present in the template until none remain.
  const seenKeys = new Set<string>();
  for (const match of template.matchAll(/\{\{\?(\w+)\}\}/g)) {
    const key = match[1];
    if (key !== undefined) seenKeys.add(key);
  }
  for (const key of seenKeys) {
    const include = !isBlank(data[key]);
    out = out.replace(conditionalBlockRe(key), include ? "$1" : "");
  }

  // Pass 2: variable substitution. Missing -> empty string. Always HTML-escape.
  out = out.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = data[key];
    if (value === undefined || value === null) return "";
    return escapeHtml(String(value));
  });

  return out;
};
