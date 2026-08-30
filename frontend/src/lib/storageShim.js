// O protótipo (app/App.jsx) foi escrito para um ambiente de chat que
// injetava window.storage. Fora dali, este shim dá a mesma API sobre o
// localStorage para o app rodar de verdade em dev/preview.
//
// NÃO é a persistência de produção — essa é o Postgres/Supabase
// (database/DATABASE.md). A migração aba-por-aba é a issue #10.

const PREFIX = "rota-pirapemas:";

function makeStorage() {
  return {
    async get(key) {
      try {
        const raw = localStorage.getItem(PREFIX + key);
        return raw == null ? null : { key, value: raw };
      } catch {
        return null;
      }
    },
    async set(key, value) {
      try {
        localStorage.setItem(PREFIX + key, value);
        return { key, value };
      } catch (e) {
        console.warn("[storageShim] set falhou:", e);
        return null;
      }
    },
    async delete(key) {
      try {
        localStorage.removeItem(PREFIX + key);
      } catch {
        /* noop */
      }
    },
  };
}

if (typeof window !== "undefined" && !window.storage) {
  window.storage = makeStorage();
}

export {};
