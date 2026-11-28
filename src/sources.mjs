export const SOURCE_IDS = Object.freeze({
  TACO: "taco",
  TBCA: "tbca",
  LATINFOODS: "latinfoods",
  FDC: "fdc"
});

export const INITIAL_SOURCES = Object.freeze([
  { id: SOURCE_IDS.TBCA, name: "TBCA", url: "https://www.tbca.net.br/base-dados/composicao_alimentos.php", enabled: true, adapter: "tbca", adapterAvailable: true, requirements: "Consulta publica; nenhuma chave necessaria." },
  { id: SOURCE_IDS.LATINFOODS, name: "LATINFOODS", url: "https://www.latinfoodsportal.net/paises/comp_foods_stat_general.php", enabled: false, adapter: null, adapterAvailable: false, requirements: "Formato e requisitos ainda nao verificados." },
  { id: SOURCE_IDS.FDC, name: "FoodData Central - U.S. Department of Agriculture", url: "https://fdc.nal.usda.gov/", enabled: false, adapter: null, adapterAvailable: false, requirements: "Pode exigir chave de API configurada no servidor." }
]);

export const SOURCE_STORAGE_KEY = "rotulamini.sources.v1";
export const ONLINE_STORAGE_KEY = "rotulamini.online.v1";

export function getInitialSourceConfig() {
  return INITIAL_SOURCES.map((source) => ({ ...source }));
}

export function loadSourceConfig(storage = globalThis.localStorage) {
  if (!storage) return { onlineEnabled: true, sources: getInitialSourceConfig() };
  let saved = null;
  try {
    saved = JSON.parse(storage.getItem(SOURCE_STORAGE_KEY));
  } catch {
    saved = null;
  }

  let onlineEnabled = true;
  try {
    const online = JSON.parse(storage.getItem(ONLINE_STORAGE_KEY));
    if (typeof online === "boolean") onlineEnabled = online;
  } catch {
    onlineEnabled = true;
  }

  if (!saved || !Array.isArray(saved)) {
    return { onlineEnabled, sources: getInitialSourceConfig() };
  }
  return {
    onlineEnabled,
    sources: saved.map((source) => ({
      id: String(source.id),
      name: String(source.name),
      url: String(source.url ?? ""),
      enabled: Boolean(source.enabled),
      adapter: source.adapter ?? null,
      adapterAvailable: Boolean(source.adapterAvailable),
      requirements: String(source.requirements ?? "")
    }))
  };
}

export function saveSourceConfig(config, storage = globalThis.localStorage) {
  if (!storage) return;
  storage.setItem(SOURCE_STORAGE_KEY, JSON.stringify(config.sources));
  storage.setItem(ONLINE_STORAGE_KEY, JSON.stringify(Boolean(config.onlineEnabled)));
}

export function addCustomSource(config, { name, url }) {
  const cleanName = String(name ?? "").trim();
  const cleanUrl = String(url ?? "").trim();
  if (!cleanName) throw new Error("Informe o nome da fonte.");
  if (!/^https?:\/\//i.test(cleanUrl)) throw new Error("Informe uma URL HTTP ou HTTPS valida.");
  const id = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  config.sources.push({
    id,
    name: cleanName,
    url: cleanUrl,
    enabled: false,
    adapter: null,
    adapterAvailable: false,
    requirements: "Fonte personalizada sem adaptador. A consulta nao foi implementada."
  });
  saveSourceConfig(config);
  return config;
}

export function removeSource(config, id) {
  config.sources = config.sources.filter((source) => source.id !== id);
  saveSourceConfig(config);
  return config;
}
