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
  "source-search-results", "ingredient-sheet"
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
  selectedIngredientIndex: null
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
  if (!elements["source-search-select"]) return;
  const available = state.sourceConfig.sources.filter((source) =>
    state.sourceConfig.onlineEnabled && source.enabled && source.adapterAvailable
  );
  const fragment = document.createDocumentFragment();
  for (const source of available) {
    const option = document.createElement("option");
    option.value = source.id;
    option.textContent = source.name;
    fragment.append(option);
  }
  elements["source-search-select"].replaceChildren(fragment);
  elements["source-search-select"].disabled = available.length === 0;
  elements["source-search"].disabled = available.length === 0;
  elements["source-search-button"].disabled = available.length === 0;
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
    return;
  }
  const food = state.ingredients[state.selectedIngredientIndex].food;
  const rows = NUTRIENTS.map((nutrient) =>
    `<tr><th>${escapeHtml(nutrient.label)}</th><td>${formatValue(food.nutrients[nutrient.key])}</td></tr>`
  ).join("");
  elements["ingredient-sheet"].innerHTML = `<h3>${escapeHtml(food.description)}</h3><p>${escapeHtml(food.source === "tbca" ? "TBCA" : "TACO")}</p><table>${rows}</table>`;
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
        state.selectedIngredientIndex = index;
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
      quantity.append(input, document.createTextNode(` ${ingredient.unit}`));
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

function renderCalculation() {
  if (state.ingredients.length === 0) {
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

elements["source-search-button"].addEventListener("click", async () => {
  clearError();
  const sourceId = elements["source-search-select"].value;
  if (sourceId !== SOURCE_IDS.TBCA) {
    showError("Esta fonte ainda nao possui adaptador de consulta.");
    return;
  }
  const query = elements["source-search"].value.trim();
  if (!query) {
    showError("Digite um termo para pesquisar na TBCA.");
    return;
  }
  elements["source-search-results"].textContent = "Consultando a TBCA...";
  try {
    const response = await fetch(`/api/tbca/search?q=${encodeURIComponent(query)}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Falha ao consultar a TBCA.");
    state.onlineResults = payload.results;
    const fragment = document.createDocumentFragment();
    for (const result of payload.results) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "search-result";
      button.textContent = `${result.code} — ${result.name}`;
      button.addEventListener("click", async () => {
        try {
          const detailResponse = await fetch(`/api/tbca/detail?id=${encodeURIComponent(result.id)}`);
          const detail = await detailResponse.json();
          if (!detailResponse.ok) throw new Error(detail.error || "Falha ao obter o alimento.");
          const food = {
            id: detail.id,
            sourceId: detail.id,
            source: "tbca",
            description: detail.name === "Alimento TBCA" ? result.name : detail.name,
            nutrients: detail.nutrients,
            category: "TBCA"
          };
          state.foodById.set(foodKey(food), food);
          state.ingredients.push({ food, quantity: 100, grams: 100, unit: "g", correctionFactor: 1 });
          renderIngredients();
          renderCalculation();
          setNotice("Alimento TBCA carregado com 100 g. Ajuste a quantidade na receita.", "success");
        } catch (error) {
          showError(error.message);
        }
      });
      fragment.append(button);
    }
    if (payload.results.length === 0) fragment.append(document.createTextNode("Nenhum alimento encontrado."));
    elements["source-search-results"].replaceChildren(fragment);
  } catch (error) {
    elements["source-search-results"].textContent = "";
    showError(error.message);
  }
});

try {
  await loadData();
  state.ingredientsCatalog = await listIngredients();
  await refreshSavedRecipes(null);
  renderSourceConfig();
  renderSourceSearch();
} catch (error) {
  showError(`Nao foi possivel iniciar o RotulaMini: ${error.message}`);
}
