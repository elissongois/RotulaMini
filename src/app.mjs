import { buildFoodCatalog, calculateNutrition, NUTRIENTS, parseCsv } from "./nutrition.mjs";
import { deleteRecipe, importRecipes, listRecipes, listIngredients, saveIngredient, saveRecipe, deleteIngredient } from "./storage.mjs";
import { addCustomSource, loadSourceConfig, removeSource, saveSourceConfig, SOURCE_IDS } from "./sources.mjs";

const elements = Object.fromEntries([
  "app-error", "food-count", "food-options", "recipe-name", "yield-grams", "serving-grams",
  "food-search", "ingredient-grams", "ingredient-unit", "ingredient-correction",
  "add-ingredient", "ingredient-list", "ingredient-total", "saved-recipes",
  "save-recipe", "save-recipe-as", "delete-recipe", "export-recipes", "import-recipes",
  "calculation-warning", "nutrition-rows", "label-recipe-name", "label-serving", "serving-column",
  "print-label", "online-enabled", "source-list", "source-name", "source-url",
  "add-source", "source-search-select", "source-search", "source-search-button",
  "source-search-results", "ingredient-sheet", "table-format",
  "export-label-svg", "export-label-png", "export-label-csv"
].map((id) => [id, document.getElementById(id)]));

const state = {
  foods: [],
  foodById: new Map(),
  ingredients: [],
  recipes: [],
  ingredientsCatalog: [],
  selectedRecipeId: null,
  sourceConfig: loadSourceConfig(),
  onlineResults: [],
  selectedIngredientIndex: null,
  calculation: null
};

const numberFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const percentFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

function showError(message) {
  elements["app-error"].textContent = message;
  elements["app-error"].hidden = false;
}
function clearError() {
  elements["app-error"].hidden = true;
  elements["app-error"].textContent = "";
}
function setNotice(message, severity = "warning") {
  elements["calculation-warning"].textContent = message;
  elements["calculation-warning"].className = `notice notice-${severity}`;
}
function parseInputNumber(input, allowBlank = false) {
  if (allowBlank && input.value.trim() === "") return null;
  if (input.validity.badInput) throw new Error("Informe um numero valido.");
  const value = Number(input.value);
  if (!Number.isFinite(value) || value <= 0) throw new Error("Informe um valor maior que zero.");
  return value;
}
function formatValue(value) {
  return value === null || !Number.isFinite(value) ? "ND" : numberFormat.format(value);
}

function foodKey(food) {
  return `${food.source ?? "taco"}:${food.sourceId ?? food.id}`;
}

function renderSourceConfig() {
  if (!elements["online-enabled"]) return;
  elements["online-enabled"].checked = state.sourceConfig.onlineEnabled;
  const fragment = document.createDocumentFragment();
  for (const source of state.sourceConfig.sources) {
    const row = document.createElement("div");
    row.className = "source-row";
    const text = document.createElement("div");
    text.innerHTML = `<strong>${escapeHtml(source.name)}</strong><small>${escapeHtml(source.url)}</small>`;
    const status = document.createElement("small");
    status.textContent = source.adapterAvailable ? "Adaptador disponivel" : "Sem adaptador disponivel";
    status.className = source.adapterAvailable ? "source-ready" : "source-unavailable";
    const enabled = document.createElement("label");
    enabled.className = "switch-label";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = source.enabled;
    checkbox.addEventListener("change", () => {
      source.enabled = checkbox.checked;
      saveSourceConfig(state.sourceConfig);
      renderSourceConfig();
      renderSourceSearch();
    });
    enabled.append(checkbox, document.createTextNode(" Habilitada"));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-button";
    remove.textContent = "Remover";
    remove.addEventListener("click", () => {
      removeSource(state.sourceConfig, source.id);
      renderSourceConfig();
      renderSourceSearch();
    });
    row.append(text, status, enabled, remove);
    fragment.append(row);
  }
  elements["source-list"].replaceChildren(fragment);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function renderSourceSearch() {
  const available = state.sourceConfig.sources.filter((source) =>
    state.sourceConfig.onlineEnabled && source.enabled && source.adapterAvailable
  );
  if (available.length === 0) {
    elements["source-search-results"].replaceChildren();
  }
}

function renderFoodOptions() {
  const fragment = document.createDocumentFragment();
  for (const food of state.foods) {
    const option = document.createElement("option");
    option.value = food.description;
    fragment.append(option);
  }
  elements["food-options"].replaceChildren(fragment);
  elements["food-count"].textContent = `${state.foods.length} alimentos TACO`;
  elements["add-ingredient"].disabled = false;
}

function renderIngredientSheet() {
  if (!elements["ingredient-sheet"]) return;
  if (state.selectedIngredientIndex === null || !state.ingredients[state.selectedIngredientIndex]) {
    elements["ingredient-sheet"].textContent = "Selecione o nome de um ingrediente para ver sua ficha.";
    elements["ingredient-sheet"].hidden = true;
    return;
  }
  elements["ingredient-sheet"].hidden = false;
  const food = state.ingredients[state.selectedIngredientIndex].food;
  const rows = NUTRIENTS.map((nutrient) =>
    `<tr><th>${escapeHtml(nutrient.label)}</th><td>${formatValue(food.nutrients[nutrient.key])}</td></tr>`
  ).join("");
  elements["ingredient-sheet"].innerHTML = `<button type="button" class="ingredient-sheet-close" aria-label="Fechar ficha">×</button><h3>${escapeHtml(food.description)}</h3><p>${escapeHtml(food.source === "tbca" ? "TBCA" : "TACO")}</p><table>${rows}</table>`;
  elements["ingredient-sheet"].querySelector(".ingredient-sheet-close").addEventListener("click", () => {
    state.selectedIngredientIndex = null;
    renderIngredientSheet();
  });
}

function renderIngredients() {
  const fragment = document.createDocumentFragment();
  if (state.ingredients.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.className = "empty-row";
    cell.textContent = "Adicione os ingredientes para começar.";
    row.append(cell);
    fragment.append(row);
  } else {
    state.ingredients.forEach((ingredient, index) => {
      const row = document.createElement("tr");
      const name = document.createElement("td");
      const nameButton = document.createElement("button");
      nameButton.type = "button";
      nameButton.className = "ingredient-name";
      nameButton.textContent = ingredient.food.description;
      nameButton.addEventListener("click", () => {
        state.selectedIngredientIndex = state.selectedIngredientIndex === index ? null : index;
        renderIngredients();
        renderIngredientSheet();
      });
      name.append(nameButton);
      const quantity = document.createElement("td");
      const input = document.createElement("input");
      input.type = "number";
      input.min = "0.01";
      input.step = "any";
      input.value = ingredient.quantity;
      input.setAttribute("aria-label", `Quantidade de ${ingredient.food.description}`);
      input.addEventListener("input", () => {
        const value = Number(input.value);
        if (Number.isFinite(value) && value > 0) {
          ingredient.quantity = value;
          renderCalculation();
        }
      });
      const unit = document.createElement("select");
      unit.className = "ingredient-unit";
      unit.setAttribute("aria-label", `Unidade de ${ingredient.food.description}`);
      for (const value of ["g", "ml"]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        option.selected = (ingredient.unit ?? "g") === value;
        unit.append(option);
      }
      unit.addEventListener("change", () => {
        ingredient.unit = unit.value;
        renderIngredients();
      });
      quantity.append(input, document.createTextNode(" "), unit);
      const source = document.createElement("td");
      source.textContent = ingredient.food.source === "tbca" ? "TBCA" : "TACO";
      const action = document.createElement("td");
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-button";
      remove.textContent = "Remover";
      remove.addEventListener("click", () => {
        state.ingredients.splice(index, 1);
        state.selectedIngredientIndex = null;
        renderIngredients();
        renderCalculation();
        renderIngredientSheet();
      });
      action.append(remove);
      row.append(name, quantity, source, action);
      fragment.append(row);
    });
  }
  elements["ingredient-list"].replaceChildren(fragment);
  const total = state.ingredients.reduce((sum, ingredient) => sum + ingredient.quantity * ingredient.correctionFactor, 0);
  elements["ingredient-total"].textContent = `${state.ingredients.length} ${state.ingredients.length === 1 ? "item" : "itens"} · ${numberFormat.format(total)} g/ml`;
  renderIngredientSheet();
}

function applyTableFormat() {
  const format = elements["table-format"]?.value ?? "vertical";
  const label = document.getElementById("nutrition-label");
  label.className = `nutrition-label table-format-${format}`;
  const title = label.querySelector("h3");
  const table = label.querySelector("table");
  let linearOutput = label.querySelector(".format-linear-output");
  if (!linearOutput) {
    linearOutput = document.createElement("p");
    linearOutput.className = "format-linear-output";
  }

  const labels = {
    vertical: "INFORMAÇÃO NUTRICIONAL",
    horizontal: "INFORMAÇÃO NUTRICIONAL — MODELO HORIZONTAL",
    "vertical-broken": "INFORMAÇÃO NUTRICIONAL — VERTICAL QUEBRADO",
    "horizontal-broken": "INFORMAÇÃO NUTRICIONAL — HORIZONTAL QUEBRADO",
    linear: "INFORMAÇÃO NUTRICIONAL — MODELO LINEAR",
    aggregate: "INFORMAÇÃO NUTRICIONAL — MODELO AGREGADO"
  };
  title.textContent = labels[format];

  if (format === "linear" && state.calculation) {
    table.hidden = true;
    const items = NUTRIENTS.map((nutrient) => {
      const value = formatValue(state.calculation.perServing[nutrient.key]);
      const daily = nutrient.vdr && state.calculation.perServing[nutrient.key] !== null
        ? `${percentFormat.format(state.calculation.perServing[nutrient.key] * 100 / nutrient.vdr)}% VD`
        : null;
      return `${nutrient.label}: ${value}${daily ? ` (${daily})` : ""}`;
    });
    linearOutput.textContent = `Porção: ${numberFormat.format(state.calculation.servingGrams)} g. ${items.join("; ")}.`;
    if (!linearOutput.parentElement) label.append(linearOutput);
  } else {
    table.hidden = false;
    linearOutput.remove();
  }
}

function renderCalculation() {
  applyTableFormat();
  if (state.ingredients.length === 0) {
    state.calculation = null;
    elements["nutrition-rows"].replaceChildren();
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.className = "label-empty";
    cell.textContent = "A tabela será calculada quando você adicionar ingredientes.";
    row.append(cell);
    elements["nutrition-rows"].append(row);
    elements["label-recipe-name"].textContent = elements["recipe-name"].value.trim() || "Sua receita";
    setNotice("Aguardando ingredientes. Os resultados sao estimativas.");
    return;
  }
  try {
    const calculation = calculateNutrition(
      state.ingredients.map((ingredient) => ({
        source: ingredient.food.source ?? "taco",
        sourceId: ingredient.food.sourceId ?? ingredient.food.id,
        foodId: ingredient.food.sourceId ?? ingredient.food.id,
        grams: ingredient.quantity * ingredient.correctionFactor
      })),
      state.foodById,
      parseInputNumber(elements["yield-grams"], true),
      parseInputNumber(elements["serving-grams"])
    );
    state.calculation = calculation;
    elements["label-recipe-name"].textContent = elements["recipe-name"].value.trim() || "Sua receita";
    elements["label-serving"].textContent = `Porcao: ${numberFormat.format(calculation.servingGrams)} g`;
    elements["serving-column"].textContent = `${numberFormat.format(calculation.servingGrams)} g`;
    const fragment = document.createDocumentFragment();
    for (const nutrient of NUTRIENTS) {
      const row = document.createElement("tr");
      const name = document.createElement("td");
      name.textContent = nutrient.label;
      const per100 = document.createElement("td");
      per100.textContent = formatValue(calculation.per100g[nutrient.key]);
      const serving = document.createElement("td");
      serving.textContent = formatValue(calculation.perServing[nutrient.key]);
      const daily = document.createElement("td");
      const percent = nutrient.vdr && calculation.perServing[nutrient.key] !== null
        ? calculation.perServing[nutrient.key] * 100 / nutrient.vdr
        : null;
      daily.textContent = percent === null ? "—" : percentFormat.format(percent);
      row.append(name, per100, serving, daily);
      fragment.append(row);
    }
    elements["nutrition-rows"].replaceChildren(fragment);
    const hasMissing = NUTRIENTS.some((nutrient) => calculation.per100g[nutrient.key] === null);
    const missingNotice = hasMissing ? " Ha nutrientes sem dado para pelo menos um ingrediente." : "";
    setNotice(`Composicao estimada por 100 g e por porcao.${missingNotice}`);
  } catch (error) {
    setNotice(error.message, "error");
  }
}

function renderSavedRecipes(selectedId = state.selectedRecipeId) {
  state.selectedRecipeId = selectedId;
  const fragment = document.createDocumentFragment();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Selecione uma receita...";
  fragment.append(placeholder);
  for (const recipe of state.recipes) {
    const option = document.createElement("option");
    option.value = recipe.id;
    option.textContent = recipe.name;
    fragment.append(option);
  }
  elements["saved-recipes"].replaceChildren(fragment);
  elements["saved-recipes"].value = selectedId ?? "";
  elements["delete-recipe"].disabled = !selectedId;
  elements["save-recipe-as"].disabled = !selectedId;
}

async function refreshSavedRecipes(selectedId = state.selectedRecipeId) {
  state.recipes = await listRecipes();
  renderSavedRecipes(selectedId);
}

function currentRecipe(id = state.selectedRecipeId) {
  const name = elements["recipe-name"].value.trim();
  if (!name) throw new Error("Informe um nome para a receita.");
  if (state.ingredients.length === 0) throw new Error("Adicione ingredientes antes de salvar.");
  return {
    id: id ?? crypto.randomUUID(),
    name,
    yieldGrams: parseInputNumber(elements["yield-grams"], true),
    servingGrams: parseInputNumber(elements["serving-grams"]),
    ingredients: state.ingredients.map((ingredient) => ({
      foodId: ingredient.food.sourceId ?? ingredient.food.id,
      source: ingredient.food.source ?? "taco",
      grams: ingredient.quantity * ingredient.correctionFactor,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      correctionFactor: ingredient.correctionFactor
    })),
    updatedAt: new Date().toISOString(),
    formatVersion: 2
  };
}

function loadRecipe(recipe) {
  if (![1, 2].includes(recipe.formatVersion) || !Array.isArray(recipe.ingredients)) {
    throw new Error(`A receita "${recipe.name}" tem formato nao suportado.`);
  }
  const ingredients = recipe.ingredients.map((ingredient) => {
    const source = ingredient.source ?? "taco";
    const sourceId = ingredient.foodId ?? ingredient.sourceId;
    const key = source === "taco" ? `taco:${sourceId}` : `${source}:${sourceId}`;
    const food = state.foodById.get(key) ?? state.foodById.get(String(sourceId)) ?? state.foodById.get(Number(sourceId));
    if (!food) throw new Error(`O alimento ${source}:${sourceId} da receita "${recipe.name}" nao esta disponivel.`);
    const quantity = Number(ingredient.quantity ?? ingredient.grams);
    const correctionFactor = Number(ingredient.correctionFactor ?? 1);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error(`Quantidade invalida na receita "${recipe.name}".`);
    return { food, quantity, unit: ingredient.unit ?? "g", grams: quantity, correctionFactor: correctionFactor > 0 ? correctionFactor : 1 };
  });
  state.ingredients = ingredients;
  state.selectedRecipeId = recipe.id;
  elements["recipe-name"].value = recipe.name;
  elements["yield-grams"].value = recipe.yieldGrams ?? "";
  elements["serving-grams"].value = recipe.servingGrams ?? 100;
  renderSavedRecipes(recipe.id);
  renderIngredients();
  renderCalculation();
}

function downloadJson(fileName, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadBlob(fileName, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeSvg(value) {
  return escapeHtml(value).replace(/'/g, "&apos;");
}

function getLabelSvg() {
  const name = elements["label-recipe-name"].textContent || "Sua receita";
  const serving = elements["label-serving"].textContent || "Porção";
  const format = elements["table-format"]?.value ?? "vertical";
  const rowElements = Array.from(elements["nutrition-rows"].querySelectorAll("tr")).filter((row) => row.cells.length === 4);
  const rows = rowElements.map((row) => Array.from(row.cells).map((cell) => cell.textContent.trim()));
  const formatTitle = {
    vertical: "INFORMAÇÃO NUTRICIONAL",
    horizontal: "INFORMAÇÃO NUTRICIONAL — MODELO HORIZONTAL",
    "vertical-broken": "INFORMAÇÃO NUTRICIONAL — VERTICAL QUEBRADO",
    "horizontal-broken": "INFORMAÇÃO NUTRICIONAL — HORIZONTAL QUEBRADO",
    linear: "INFORMAÇÃO NUTRICIONAL — MODELO LINEAR",
    aggregate: "INFORMAÇÃO NUTRICIONAL — MODELO AGREGADO"
  }[format];

  function tableLines(startX, startY, tableWidth, subset) {
    const result = [];
    const firstColumn = startX + 8;
    const baseX = startX + tableWidth - 145;
    const servingX = startX + tableWidth - 82;
    const vdX = startX + tableWidth - 18;
    result.push(
      `<rect x="${startX}" y="${startY}" width="${tableWidth}" height="${subset.length * 24 + 38}" fill="#fff" stroke="#111" stroke-width="2"/>`,
      `<text x="${firstColumn}" y="${startY + 21}" font-family="Arial,sans-serif" font-size="9" font-weight="700">Nutriente</text>`,
      `<text x="${baseX}" y="${startY + 21}" text-anchor="end" font-family="Arial,sans-serif" font-size="9" font-weight="700">100 g</text>`,
      `<text x="${servingX}" y="${startY + 21}" text-anchor="end" font-family="Arial,sans-serif" font-size="9" font-weight="700">Porção</text>`,
      `<text x="${vdX}" y="${startY + 21}" text-anchor="end" font-family="Arial,sans-serif" font-size="9" font-weight="700">%VD*</text>`
    );
    subset.forEach((cells, index) => {
      const y = startY + 43 + index * 24;
      result.push(
        `<text x="${firstColumn}" y="${y}" font-family="Arial,sans-serif" font-size="9">${escapeSvg(cells[0])}</text>`,
        `<text x="${baseX}" y="${y}" text-anchor="end" font-family="Arial,sans-serif" font-size="9">${escapeSvg(cells[1])}</text>`,
        `<text x="${servingX}" y="${y}" text-anchor="end" font-family="Arial,sans-serif" font-size="9">${escapeSvg(cells[2])}</text>`,
        `<text x="${vdX}" y="${y}" text-anchor="end" font-family="Arial,sans-serif" font-size="9">${escapeSvg(cells[3])}</text>`,
        `<line x1="${startX}" y1="${y + 7}" x2="${startX + tableWidth}" y2="${y + 7}" stroke="#777" stroke-width=".5"/>`
      );
    });
    return result;
  }

  const dimensions = {
    vertical: [460, 145 + rows.length * 24],
    horizontal: [720, 370],
    "vertical-broken": [680, 350],
    "horizontal-broken": [560, 520],
    linear: [720, 260],
    aggregate: [560, 145 + rows.length * 24 + 55]
  };
  const [width, height] = dimensions[format];
  const margin = 16;
  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`,
    '<rect width="100%" height="100%" fill="#fff"/>',
    `<text x="${margin}" y="30" font-family="Arial,sans-serif" font-size="16" font-weight="700">${escapeSvg(formatTitle)}</text>`,
    `<text x="${margin}" y="52" font-family="Arial,sans-serif" font-size="12" font-weight="700">${escapeSvg(name)}</text>`,
    `<text x="${margin}" y="68" font-family="Arial,sans-serif" font-size="11">${escapeSvg(serving)}</text>`
  ];

  if (format === "horizontal") {
    lines.push(
      `<rect x="${margin}" y="82" width="190" height="248" fill="#f5f5f5" stroke="#111" stroke-width="2"/>`,
      `<text x="${margin + 12}" y="112" font-family="Arial,sans-serif" font-size="12" font-weight="700">COMPOSIÇÃO</text>`,
      `<text x="${margin + 12}" y="132" font-family="Arial,sans-serif" font-size="10">${escapeSvg(name)}</text>`,
      ...tableLines(220, 82, 484, rows)
    );
  } else if (format === "vertical-broken") {
    const mid = Math.ceil(rows.length / 2);
    lines.push(...tableLines(16, 82, 318, rows.slice(0, mid)));
    lines.push(...tableLines(346, 82, 318, rows.slice(mid)));
  } else if (format === "horizontal-broken") {
    const mid = Math.ceil(rows.length / 2);
    lines.push(
      `<text x="16" y="82" font-family="Arial,sans-serif" font-size="10" font-weight="700">PARTE 1</text>`,
      ...tableLines(16, 92, 528, rows.slice(0, mid)),
      `<text x="16" y="${92 + mid * 24 + 62}" font-family="Arial,sans-serif" font-size="10" font-weight="700">PARTE 2</text>`,
      ...tableLines(16, 92 + mid * 24 + 72, 528, rows.slice(mid))
    );
  } else if (format === "linear") {
    const linearItems = rows.map((cells) => `${cells[0]}: ${cells[2]} (${cells[3]}% VD)`).join("; ");
    const words = linearItems.match(/.{1,95}(?:\s|$)/g) ?? [linearItems];
    lines.push('<rect x="16" y="82" width="688" height="150" fill="#fff" stroke="#111" stroke-width="2"/>');
    words.forEach((line, index) => {
      lines.push(`<text x="28" y="${108 + index * 18}" font-family="Arial,sans-serif" font-size="9">${escapeSvg(line.trim())}</text>`);
    });
  } else {
    lines.push(...tableLines(16, 82, width - 32, rows));
  }
  lines.push(
    `<text x="${margin}" y="${height - 18}" font-family="Arial,sans-serif" font-size="8">*Percentual de valores diários fornecidos pela porção.</text>`,
    "</svg>"
  );
  return lines.join("");
}

function exportLabelCsv() {
  const name = elements["label-recipe-name"].textContent || "Sua receita";
  const format = elements["table-format"]?.value ?? "vertical";
  const rows = [
    ["Receita", name],
    ["Formato", format],
    ["Porcao", elements["label-serving"].textContent],
    [],
    ["Nutriente", "100 g", "Porcao", "%VD"]
  ];
  elements["nutrition-rows"].querySelectorAll("tr").forEach((row) => {
    if (row.cells.length === 4) rows.push(Array.from(row.cells).map((cell) => cell.textContent.trim()));
  });
  const csv = rows.map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
  downloadBlob("rotulamini-informacao-nutricional.csv", new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
}

async function loadData() {
  const [compositionResponse, fattyResponse] = await Promise.all([
    fetch(new URL("../data/taco_composicao.csv", import.meta.url)),
    fetch(new URL("../data/taco_acidos_graxos.csv", import.meta.url))
  ]);
  if (!compositionResponse.ok || !fattyResponse.ok) throw new Error("Falha ao carregar os arquivos locais da TACO.");
  const [compositionCsv, fattyCsv] = await Promise.all([compositionResponse.text(), fattyResponse.text()]);
  state.foods = buildFoodCatalog(parseCsv(compositionCsv), parseCsv(fattyCsv)).map((food) => ({
    ...food,
    source: "taco",
    sourceId: String(food.id),
    description: food.description
  }));
  state.foodById = new Map();
  for (const food of state.foods) {
    state.foodById.set(foodKey(food), food);
    state.foodById.set(String(food.id), food);
    state.foodById.set(Number(food.id), food);
  }
  renderFoodOptions();
}

function getTacoFood() {
  const query = elements["food-search"].value.trim();
  return state.foods.find((food) => food.description === query) ?? null;
}

const MAX_UNIFIED_RESULTS = 20;
let unifiedSearchTimer = null;

function splitResultLimit(enabledSourceCount) {
  const base = Math.floor(MAX_UNIFIED_RESULTS / enabledSourceCount);
  const remainder = MAX_UNIFIED_RESULTS % enabledSourceCount;
  return Array.from({ length: enabledSourceCount }, (_, index) => base + (index < remainder ? 1 : 0));
}

function clearUnifiedResults() {
  state.onlineResults = [];
  elements["source-search-results"].replaceChildren();
  elements["source-search-results"].hidden = true;
}

function addSearchFood(food) {
  const quantity = parseInputNumber(elements["ingredient-grams"], true) ?? 100;
  const correctionFactor = Number(elements["ingredient-correction"].value || 1);
  if (!Number.isFinite(correctionFactor) || correctionFactor <= 0) {
    showError("O fator de correcao deve ser maior que zero.");
    return;
  }
  state.foodById.set(foodKey(food), food);
  state.ingredients.push({
    food,
    quantity,
    grams: quantity,
    unit: elements["ingredient-unit"].value,
    correctionFactor
  });
  elements["food-search"].value = "";
  elements["ingredient-grams"].value = "";
  clearUnifiedResults();
  renderIngredients();
  renderCalculation();
  setNotice(`${food.description} carregado com ${numberFormat.format(quantity)} ${elements["ingredient-unit"].value}.`, "success");
}

async function runUnifiedSearch() {
  const query = elements["food-search"].value.trim();
  if (query.length < 2) {
    clearUnifiedResults();
    return;
  }
  const tbcaEnabled = state.sourceConfig.onlineEnabled &&
    state.sourceConfig.sources.some((source) => source.id === SOURCE_IDS.TBCA && source.enabled && source.adapterAvailable);
  const sourceCount = tbcaEnabled ? 2 : 1;
  const [tacoLimit, tbcaLimit] = splitResultLimit(sourceCount);
  const normalized = query.toLocaleLowerCase("pt-BR");
  const tacoResults = state.foods
    .filter((food) => food.description.toLocaleLowerCase("pt-BR").includes(normalized))
    .slice(0, tacoLimit);

  const groups = [];
  if (tacoResults.length > 0) groups.push({ sourceName: "TACO", results: tacoResults.map((food) => ({ food })) });

  if (tbcaEnabled) {
    try {
      const response = await fetch(`/api/tbca/search?q=${encodeURIComponent(query)}`);
      const payload = await response.json();
      if (response.ok) {
        const tbcaResults = (payload.results ?? []).slice(0, tbcaLimit);
        if (tbcaResults.length > 0) groups.push({ sourceName: "TBCA", results: tbcaResults });
      }
    } catch {
      // A indisponibilidade da fonte online não impede a busca local.
    }
  }

  if (groups.length === 0) {
    elements["source-search-results"].hidden = false;
    elements["source-search-results"].textContent = "Nenhum ingrediente encontrado.";
    return;
  }

  elements["source-search-results"].hidden = false;
  const table = document.createElement("table");
  table.className = "search-results-table";
  table.innerHTML = "<thead><tr><th>Fonte</th><th>Ingrediente</th></tr></thead>";
  const body = document.createElement("tbody");
  for (const group of groups) {
    for (const item of group.results) {
      const row = document.createElement("tr");
      const sourceCell = document.createElement("td");
      sourceCell.textContent = group.sourceName;
      const nameCell = document.createElement("td");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "search-result";
      if (group.sourceName === "TACO") {
        button.textContent = item.food.description;
        button.addEventListener("click", () => addSearchFood(item.food));
      } else {
        button.textContent = `${item.code ? `${item.code} — ` : ""}${item.name}`;
        button.addEventListener("click", async () => {
          try {
            const detailResponse = await fetch(`/api/tbca/detail?id=${encodeURIComponent(item.id)}`);
            const detail = await detailResponse.json();
            if (!detailResponse.ok) throw new Error(detail.error || "Falha ao obter o ingrediente.");
            const name = String(item.name ?? "").trim() || String(detail.name ?? "").trim() || "Ingrediente TBCA";
            const food = {
              id: detail.id,
              sourceId: detail.id,
              source: "tbca",
              description: name,
              nutrients: detail.nutrients,
              category: "TBCA"
            };
            addSearchFood(food);
          } catch (error) {
            showError(error.message);
          }
        });
      }
      nameCell.append(button);
      row.append(sourceCell, nameCell);
      body.append(row);
    }
  }
  table.append(body);
  elements["source-search-results"].replaceChildren(table);
}

elements["add-ingredient"].addEventListener("click", () => {
  clearError();
  try {
    const food = getTacoFood();
    const quantity = parseInputNumber(elements["ingredient-grams"]);
    const correctionFactor = Number(elements["ingredient-correction"].value || 1);
    if (!food) throw new Error("Selecione um alimento valido da lista da TACO.");
    if (!Number.isFinite(correctionFactor) || correctionFactor <= 0) throw new Error("O fator de correcao deve ser maior que zero.");
    state.ingredients.push({
      food,
      quantity,
      grams: quantity,
      unit: elements["ingredient-unit"].value,
      correctionFactor
    });
    elements["food-search"].value = "";
    elements["ingredient-grams"].value = "";
    clearUnifiedResults();
    renderIngredients();
    renderCalculation();
  } catch (error) {
    showError(error.message);
  }
});

elements["food-search"].addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventEvent?.();
    event.preventDefault();
    elements["add-ingredient"].click();
  }
});

for (const id of ["recipe-name", "yield-grams", "serving-grams"]) {
  elements[id].addEventListener("input", renderCalculation);
}

elements["save-recipe"].addEventListener("click", async () => {
  clearError();
  try {
    const recipe = currentRecipe();
    await saveRecipe(recipe);
    await refreshSavedRecipes(recipe.id);
    setNotice("Receita salva neste navegador.", "success");
  } catch (error) {
    showError(error.message);
  }
});

elements["save-recipe-as"].addEventListener("click", async () => {
  clearError();
  try {
    const name = prompt("Nome da copia da receita:");
    if (!name?.trim()) return;
    const recipe = currentRecipe(crypto.randomUUID());
    recipe.name = name.trim();
    await saveRecipe(recipe);
    state.selectedRecipeId = recipe.id;
    elements["recipe-name"].value = recipe.name;
    await refreshSavedRecipes(recipe.id);
    setNotice("Copia independente criada.", "success");
  } catch (error) {
    showError(error.message);
  }
});

elements["saved-recipes"].addEventListener("change", () => {
  const recipe = state.recipes.find(({ id }) => id === elements["saved-recipes"].value);
  if (!recipe) {
    state.selectedRecipeId = null;
    renderSavedRecipes(null);
    return;
  }
  try {
    loadRecipe(recipe);
  } catch (error) {
    showError(error.message);
  }
});

elements["delete-recipe"].addEventListener("click", async () => {
  if (!state.selectedRecipeId) return;
  try {
    await deleteRecipe(state.selectedRecipeId);
    state.selectedRecipeId = null;
    await refreshSavedRecipes(null);
    setNotice("Receita excluida deste navegador.", "success");
  } catch (error) {
    showError(error.message);
  }
});

elements["export-recipes"].addEventListener("click", async () => {
  try {
    downloadJson("rotulamini-receitas.json", {
      application: "RotulaMini",
      formatVersion: 2,
      exportedAt: new Date().toISOString(),
      recipes: await listRecipes()
    });
  } catch (error) {
    showError(error.message);
  }
});

elements["import-recipes"].addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  try {
    const backup = JSON.parse(await file.text());
    if (backup.application !== "RotulaMini" || ![1, 2].includes(backup.formatVersion) || !Array.isArray(backup.recipes)) {
      throw new Error("O arquivo nao e um backup JSON compativel do RotulaMini.");
    }
    for (const recipe of backup.recipes) {
      if (typeof recipe.id !== "string" || !recipe.name || !Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) {
        throw new Error("O backup contem uma receita invalida.");
      }
    }
    await importRecipes(backup.recipes);
    await refreshSavedRecipes();
    setNotice(`${backup.recipes.length} receita(s) importada(s).`, "success");
  } catch (error) {
    showError(`Nao foi possivel importar o backup: ${error.message}`);
  } finally {
    event.target.value = "";
  }
});

elements["print-label"].addEventListener("click", () => window.print());

elements["online-enabled"].addEventListener("change", () => {
  state.sourceConfig.onlineEnabled = elements["online-enabled"].checked;
  saveSourceConfig(state.sourceConfig);
  renderSourceConfig();
  renderSourceSearch();
});

elements["add-source"].addEventListener("click", () => {
  try {
    addCustomSource(state.sourceConfig, { name: elements["source-name"].value, url: elements["source-url"].value });
    elements["source-name"].value = "";
    elements["source-url"].value = "";
    renderSourceConfig();
    renderSourceSearch();
  } catch (error) {
    showError(error.message);
  }
});

elements["food-search"].addEventListener("input", () => {
  clearTimeout(unifiedSearchTimer);
  unifiedSearchTimer = setTimeout(runUnifiedSearch, 350);
});

elements["food-search"].addEventListener("keydown", (event) => {
  if (event.key === "Escape") clearUnifiedResults();
});

elements["table-format"].addEventListener("change", applyTableFormat);

elements["export-label-svg"].addEventListener("click", () => {
  const format = elements["table-format"]?.value ?? "vertical";
  downloadBlob(`rotulamini-informacao-nutricional-${format}.svg`, new Blob([getLabelSvg()], { type: "image/svg+xml;charset=utf-8" }));
});

elements["export-label-png"].addEventListener("click", () => {
  const format = elements["table-format"]?.value ?? "vertical";
  const svg = getLabelSvg();
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    canvas.toBlob((blob) => {
      URL.revokeObjectURL(svgUrl);
      if (blob) downloadBlob(`rotulamini-informacao-nutricional-${format}.png`, blob);
      else showError("Nao foi possivel gerar a imagem PNG.");
    }, "image/png");
  };
  image.onerror = () => {
    URL.revokeObjectURL(svgUrl);
    showError("Nao foi possivel gerar a imagem PNG.");
  };
  image.src = svgUrl;
});

elements["export-label-csv"].addEventListener("click", exportLabelCsv);

try {
  await loadData();
  state.ingredientsCatalog = await listIngredients();
  await refreshSavedRecipes(null);
  renderSourceConfig();
  renderSourceSearch();
} catch (error) {
  showError(`Nao foi possivel iniciar o RotulaMini: ${error.message}`);
}
