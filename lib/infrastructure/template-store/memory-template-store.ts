import { Maybe } from "true-myth";
import type { TemplateStorePort } from "@/lib/application/ports";

export const createMemoryTemplateStore = (): TemplateStorePort => {
  const store = new Map<string, string>();
  return Object.freeze<TemplateStorePort>({
    put: async (slug, html) => {
      store.set(slug, html);
    },
    get: async (slug) => {
      const value = store.get(slug);
      return value === undefined ? Maybe.nothing<string>() : Maybe.just(value);
    },
  });
};
