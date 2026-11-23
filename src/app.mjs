import { buildFoodCatalog, calculateNutrition, NUTRIENTS, parseCsv } from "./nutrition.mjs";
import { deleteRecipe, importRecipes, listRecipes, saveRecipe } from "./storage.mjs";

const elements = Object.fromEntries([
  "app-error", "food-count", "food-options", "recipe-name", "yield-grams", "serving-grams",
  "food-search", "ingredient-grams", "add-ingredient", "ingredient-list", "ingredient-total",
  "saved-recipes", "save-recipe", "delete-recipe", "export-recipes", "import-recipes",
  "calculation-warning", "nutrition-rows", "label-recipe-name", "label-serving", "serving-column",
  "print-label"
].map((id) => [id, document.getElementById(id)]));

const state = {
  foods: [],
  foodById: new Map(),
  ingredients: [],
  recipes: [],
  selectedRecipeId: null
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

function parseInputNumber(input, allowBlank = false) {
  if (allowBlank && input.value.trim() === "") return null;
  if (input.validity.badInput) throw new Error("Informe um número válido.");
  const value = Number(input.value);
  if (!Number.isFinite(value) || value <= 0) throw new Error("Informe um valor maior que zero.");
  return value;
}

function formatValue(value) {
  return value === null || !Number.isFinite(value) ? "ND" : numberFormat.format(value);
}

function setNotice(message, severity = "warning") {
  elements["calculation-warning"].textContent = message;
  elements["calculation-warning"].className = `notice notice-${severity}`;
}

function getFoodFromSearch() {
  const query = elements["food-search"].value.trim();
  return state.foods.find((food) => food.description === query) ?? null;
}

function renderFoodOptions() {
  const fragment = document.createDocumentFragment();
  for (const food of state.foods) {
    const option = document.createElement("option");
    option.value = food.description;
    fragment.append(option);
  }
  elements["food-options"].replaceChildren(fragment);
  elements["food-count"].textContent = `${state.foods.length} alimentos`;
  elements["add-ingredient"].disabled = false;
}

function renderIngredients() {
  const fragment = document.createDocumentFragment();
  if (state.ingredients.length === 0) {
    const row = document.createElement("tr");
    row.className = "empty-row";
    const cell = document.createElement("td");
    cell.colSpan = 3;
    cell.textContent = "Adicione os ingredientes para começar.";
    row.append(cell);
    fragment.append(row);
  } else {
    state.ingredients.forEach((ingredient, index) => {
      const row = document.createElement("tr");
      const name = document.createElement("td");
      name.textContent = ingredient.food.description;
      const quantity = document.createElement("td");
      quantity.textContent = `${numberFormat.format(ingredient.grams)} g`;
      const action = document.createElement("td");
      action.className = "action-cell";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-button";
      remove.textContent = "Remover";
      remove.setAttribute("aria-label", `Remover ${ingredient.food.description}`);
      remove.addEventListener("click", () => {
        state.ingredients.splice(index, 1);
        renderIngredients();
        renderCalculation();
      });
      action.append(remove);
      row.append(name, quantity, action);
      fragment.append(row);
    });
  }
  elements["ingredient-list"].replaceChildren(fragment);
  const total = state.ingredients.reduce((sum, ingredient) => sum + ingredient.grams, 0);
  elements["ingredient-total"].textContent = `${state.ingredients.length} ${state.ingredients.length === 1 ? "item" : "itens"} · ${numberFormat.format(total)} g`;
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
    setNotice("Aguardando ingredientes. Os resultados são estimativas e não representam validação regulatória.");
    return;
  }

  try {
    const calculation = calculateNutrition(
      state.ingredients.map(({ food, grams }) => ({ foodId: food.id, grams })),
      state.foodById,
      parseInputNumber(elements["yield-grams"], true),
      parseInputNumber(elements["serving-grams"])
    );
    elements["label-recipe-name"].textContent = elements["recipe-name"].value.trim() || "Sua receita";
    elements["label-serving"].textContent = `Porção: ${numberFormat.format(calculation.servingGrams)} g`;
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
    const yieldNotice = Math.abs(calculation.yieldGrams - calculation.inputWeightGrams) > 0.01
      ? ` Rendimento informado (${numberFormat.format(calculation.yieldGrams)} g) difere do peso dos ingredientes (${numberFormat.format(calculation.inputWeightGrams)} g); confirme perdas/ganhos do preparo.`
      : "";
    const missingNotice = hasMissing ? " Há nutrientes sem dado para pelo menos um ingrediente; o total correspondente foi marcado como ND." : "";
    setNotice(`Composição estimada a partir dos valores TACO por 100 g. Não é uma avaliação de conformidade.${missingNotice}${yieldNotice}`);
  } catch (error) {
    elements["label-serving"].textContent = "Porção: dados inválidos";
    elements["serving-column"].textContent = "—";
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.className = "label-empty";
    cell.textContent = "Corrija os campos para atualizar a tabela.";
    row.append(cell);
    elements["nutrition-rows"].replaceChildren(row);
    setNotice(error.message, "error");
  }
}

function renderSavedRecipes(selectedId = state.selectedRecipeId) {
  state.selectedRecipeId = selectedId;
  const fragment = document.createDocumentFragment();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Selecione uma receita…";
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
}

async function refreshSavedRecipes(selectedId = state.selectedRecipeId) {
  state.recipes = await listRecipes();
  renderSavedRecipes(selectedId);
}

function currentRecipe() {
  const name = elements["recipe-name"].value.trim();
  if (!name) throw new Error("Informe um nome para a receita.");
  if (state.ingredients.length === 0) throw new Error("Adicione ingredientes antes de salvar.");
  return {
    id: state.selectedRecipeId ?? crypto.randomUUID(),
    name,
    yieldGrams: parseInputNumber(elements["yield-grams"], true),
    servingGrams: parseInputNumber(elements["serving-grams"]),
    ingredients: state.ingredients.map(({ food, grams }) => ({ foodId: food.id, grams })),
    updatedAt: new Date().toISOString(),
    formatVersion: 1
  };
}

function loadRecipe(recipe) {
  if (recipe.formatVersion !== 1 || !Array.isArray(recipe.ingredients)) {
    throw new Error(`A receita “${recipe.name}” tem formato não suportado.`);
  }
  const ingredients = recipe.ingredients.map(({ foodId, grams }) => {
    const food = state.foodById.get(Number(foodId));
    if (!food) throw new Error(`O alimento TACO ${foodId} da receita “${recipe.name}” não está nesta base.`);
    const amount = Number(grams);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error(`Quantidade inválida na receita “${recipe.name}”.`);
    return { food, grams: amount };
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
  if (!compositionResponse.ok || !fattyResponse.ok) {
    throw new Error(`Falha ao carregar os arquivos da TACO (composição: HTTP ${compositionResponse.status}, ácidos graxos: HTTP ${fattyResponse.status}).`);
  }
  const [compositionCsv, fattyCsv] = await Promise.all([compositionResponse.text(), fattyResponse.text()]);
  state.foods = buildFoodCatalog(parseCsv(compositionCsv), parseCsv(fattyCsv));
  state.foodById = new Map(state.foods.map((food) => [food.id, food]));
  renderFoodOptions();
}

elements["add-ingredient"].addEventListener("click", () => {
  clearError();
  const food = getFoodFromSearch();
  const grams = parseInputNumber(elements["ingredient-grams"]);
  if (!food) {
    showError("Selecione um alimento válido da lista da TACO.");
    return;
  }
  if (grams === null) {
    showError("Informe uma quantidade em gramas maior que zero.");
    return;
  }
  state.ingredients.push({ food, grams });
  elements["food-search"].value = "";
  elements["ingredient-grams"].value = "";
  renderIngredients();
  renderCalculation();
});

elements["food-search"].addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
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

elements["saved-recipes"].addEventListener("change", () => {
  const recipe = state.recipes.find(({ id }) => id === elements["saved-recipes"].value);
  if (!recipe) {
    state.selectedRecipeId = null;
    elements["delete-recipe"].disabled = true;
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
    setNotice("Receita excluída deste navegador.", "success");
  } catch (error) {
    showError(error.message);
  }
});

elements["export-recipes"].addEventListener("click", async () => {
  try {
    const recipes = await listRecipes();
    downloadJson("rotulamini-receitas.json", {
      application: "RotulaMini",
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      recipes
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
    if (backup.application !== "RotulaMini" || backup.formatVersion !== 1 || !Array.isArray(backup.recipes)) {
      throw new Error("O arquivo não é um backup JSON compatível do RotulaMini.");
    }
    for (const recipe of backup.recipes) {
      if (
        typeof recipe.id !== "string" || !recipe.id ||
        typeof recipe.name !== "string" || !recipe.name.trim() ||
        recipe.formatVersion !== 1 ||
        !Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0 ||
        (recipe.yieldGrams !== null && recipe.yieldGrams !== undefined &&
          (!Number.isFinite(Number(recipe.yieldGrams)) || Number(recipe.yieldGrams) <= 0)) ||
        !Number.isFinite(Number(recipe.servingGrams)) || Number(recipe.servingGrams) <= 0
      ) {
        throw new Error("O backup contém uma receita em formato inválido.");
      }
      for (const ingredient of recipe.ingredients) {
        if (!state.foodById.has(Number(ingredient.foodId)) || !Number.isFinite(Number(ingredient.grams)) || Number(ingredient.grams) <= 0) {
          throw new Error(`O backup contém ingrediente inválido na receita “${recipe.name}”.`);
        }
      }
    }
    await importRecipes(backup.recipes);
    await refreshSavedRecipes();
    setNotice(`${backup.recipes.length} receita(s) importada(s).`, "success");
  } catch (error) {
    showError(`Não foi possível importar o backup: ${error.message}`);
  } finally {
    event.target.value = "";
  }
});

elements["print-label"].addEventListener("click", () => window.print());

try {
  await loadData();
  await refreshSavedRecipes(null);
} catch (error) {
  showError(`Não foi possível iniciar o RotulaMini: ${error.message}`);
  elements["food-count"].textContent = "Base indisponível";
}
