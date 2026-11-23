export const NUTRIENTS = [
  { key: "energyKcal", label: "Valor energético (kcal)", source: "energia_kcal", vdr: 2000 },
  { key: "carbohydrateG", label: "Carboidratos (g)", source: "carboidrato_g", vdr: 300 },
  { key: "totalSugarsG", label: "Açúcares totais (g)", source: null, vdr: null },
  { key: "addedSugarsG", label: "Açúcares adicionados (g)", source: null, vdr: 50 },
  { key: "proteinG", label: "Proteínas (g)", source: "proteina_g", vdr: 50 },
  { key: "totalFatG", label: "Gorduras totais (g)", source: "lipideos_g", vdr: 65 },
  { key: "saturatedFatG", label: "Gorduras saturadas (g)", source: "saturados_g", vdr: 20 },
  { key: "transFatG", label: "Gorduras trans (g)", source: null, vdr: 2 },
  { key: "fiberG", label: "Fibras alimentares (g)", source: "fibra_g", vdr: 25 },
  { key: "sodiumMg", label: "Sódio (mg)", source: "sodio_mg", vdr: 2000 }
];

const TRANS_FAT_FIELDS = ["c18_1t_g", "c18_2t_g"];

function parseNumeric(value, field, rowNumber) {
  if (typeof value !== "string") {
    throw new Error(`Campo ausente no CSV, linha ${rowNumber}: ${field}`);
  }
  if (value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Valor inválido na linha ${rowNumber}, campo ${field}: ${value}`);
  }
  return parsed;
}

export function parseCsv(text) {
  const input = text.replace(/^\uFEFF/, "");
  const records = [];
  let record = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      record.push(field);
      if (record.some((value) => value !== "")) records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("O arquivo CSV terminou dentro de um campo entre aspas.");
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    if (record.some((value) => value !== "")) records.push(record);
  }
  if (records.length < 2) throw new Error("O arquivo CSV não contém linhas de dados.");

  const headers = records[0];
  if (new Set(headers).size !== headers.length) throw new Error("O CSV contém nomes de coluna duplicados.");
  return records.slice(1).map((cells, index) => {
    if (cells.length !== headers.length) {
      throw new Error(`Quantidade inesperada de colunas na linha ${index + 2} do CSV.`);
    }
    return Object.fromEntries(headers.map((header, column) => [header, cells[column]]));
  });
}

export function buildFoodCatalog(compositionRows, fattyAcidRows) {
  const fattyById = new Map();
  for (const [index, row] of fattyAcidRows.entries()) {
    const id = Number(row.numero_alimento);
    if (!Number.isInteger(id) || id <= 0) throw new Error(`ID inválido no perfil de ácidos graxos, linha ${index + 2}.`);
    if (fattyById.has(id)) throw new Error(`ID duplicado no perfil de ácidos graxos: ${id}.`);
    fattyById.set(id, row);
  }

  const seenIds = new Set();
  return compositionRows.map((row, index) => {
    const id = Number(row.numero_alimento);
    if (!Number.isInteger(id) || id <= 0) throw new Error(`ID inválido na composição TACO, linha ${index + 2}.`);
    if (seenIds.has(id)) throw new Error(`ID duplicado na composição TACO: ${id}.`);
    seenIds.add(id);
    if (!row.descricao?.trim()) throw new Error(`Descrição ausente na composição TACO, linha ${index + 2}.`);
    if (!row.categoria?.trim()) throw new Error(`Categoria ausente na composição TACO, linha ${index + 2}.`);

    const fatty = fattyById.get(id);
    const transValues = fatty ? TRANS_FAT_FIELDS.map((field) => parseNumeric(fatty[field], field, id)) : [null, null];
    const transFatG = transValues.every((value) => value !== null)
      ? transValues.reduce((sum, value) => sum + value, 0)
      : null;
    const nutrients = {
      energyKcal: parseNumeric(row.energia_kcal, "energia_kcal", index + 2),
      carbohydrateG: parseNumeric(row.carboidrato_g, "carboidrato_g", index + 2),
      totalSugarsG: null,
      addedSugarsG: null,
      proteinG: parseNumeric(row.proteina_g, "proteina_g", index + 2),
      totalFatG: parseNumeric(row.lipideos_g, "lipideos_g", index + 2),
      saturatedFatG: fatty ? parseNumeric(fatty.saturados_g, "saturados_g", id) : null,
      transFatG,
      fiberG: parseNumeric(row.fibra_g, "fibra_g", index + 2),
      sodiumMg: parseNumeric(row.sodio_mg, "sodio_mg", index + 2)
    };

    return {
      id,
      description: row.descricao.trim(),
      category: row.categoria?.trim() ?? "",
      nutrients
    };
  });
}

export function calculateNutrition(ingredients, foodById, yieldGrams, servingGrams) {
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    throw new Error("Adicione pelo menos um ingrediente.");
  }
  const normalizedIngredients = ingredients.map(({ foodId, grams }) => {
    const food = foodById.get(Number(foodId));
    const amount = Number(grams);
    if (!food) throw new Error(`Alimento não encontrado (ID ${foodId}).`);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error(`Quantidade inválida para ${food.description}.`);
    return { food, grams: amount };
  });

  const inputWeight = normalizedIngredients.reduce((sum, item) => sum + item.grams, 0);
  const finalYield = yieldGrams === null || yieldGrams === "" ? inputWeight : Number(yieldGrams);
  const portion = Number(servingGrams);
  if (!Number.isFinite(finalYield) || finalYield <= 0) throw new Error("O rendimento final deve ser maior que zero.");
  if (!Number.isFinite(portion) || portion <= 0) throw new Error("A porção deve ser maior que zero.");

  const recipeTotals = Object.fromEntries(NUTRIENTS.map(({ key }) => [key, 0]));
  const missing = new Set();
  for (const { food, grams } of normalizedIngredients) {
    for (const { key } of NUTRIENTS) {
      const value = food.nutrients[key];
      if (value === null || value === undefined) {
        missing.add(key);
      } else if (!missing.has(key)) {
        recipeTotals[key] += value * grams / 100;
      }
    }
  }

  const per100g = {};
  const perServing = {};
  for (const { key } of NUTRIENTS) {
    per100g[key] = missing.has(key) ? null : recipeTotals[key] * 100 / finalYield;
    perServing[key] = per100g[key] === null ? null : per100g[key] * portion / 100;
  }

  return {
    inputWeightGrams: inputWeight,
    yieldGrams: finalYield,
    servingGrams: portion,
    per100g,
    perServing
  };
}
