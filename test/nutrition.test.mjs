import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildFoodCatalog, calculateNutrition, parseCsv } from "../src/nutrition.mjs";

test("parseCsv handles quoted commas, escaped quotes, CRLF and missing values", () => {
  const rows = parseCsv('id,nome,valor\r\n1,"Arroz, integral",1e-05\r\n2,"""Teste""",\r\n');
  assert.deepEqual(rows, [
    { id: "1", nome: "Arroz, integral", valor: "1e-05" },
    { id: "2", nome: '"Teste"', valor: "" }
  ]);
});

test("buildFoodCatalog preserves missing values and joins fats by TACO identifier", () => {
  const foods = buildFoodCatalog(
    [{ numero_alimento: "1", descricao: "Arroz, cozido", categoria: "Cereais", energia_kcal: "100", carboidrato_g: "20", proteina_g: "2", lipideos_g: "1", fibra_g: "", sodio_mg: "4" }],
    [{ numero_alimento: "1", saturados_g: "0.2", c18_1t_g: "0.01", c18_2t_g: "0.02" }]
  );
  assert.equal(foods[0].nutrients.fiberG, null);
  assert.equal(foods[0].nutrients.saturatedFatG, 0.2);
  assert.equal(foods[0].nutrients.transFatG, 0.03);
  assert.equal(foods[0].nutrients.totalSugarsG, null);
});

test("buildFoodCatalog rejects a missing required nutrition column", () => {
  assert.throws(
    () => buildFoodCatalog([{ numero_alimento: "1", descricao: "Alimento", categoria: "Teste" }], []),
    /Campo ausente no CSV.*energia_kcal/
  );
});

test("calculateNutrition returns values by yield and portion and propagates missing data", () => {
  const food = {
    id: 1,
    description: "Alimento teste",
    nutrients: {
      energyKcal: 100, carbohydrateG: 20, totalSugarsG: null, addedSugarsG: null,
      proteinG: 5, totalFatG: 2, saturatedFatG: 1, transFatG: 0,
      fiberG: 3, sodiumMg: 10
    }
  };
  const result = calculateNutrition([{ foodId: 1, grams: 200 }], new Map([[1, food]]), 100, 30);
  assert.equal(result.inputWeightGrams, 200);
  assert.equal(result.per100g.energyKcal, 200);
  assert.equal(result.perServing.energyKcal, 60);
  assert.equal(result.per100g.totalSugarsG, null);
  assert.equal(result.per100g.fiberG, 6);
});

test("calculateNutrition rejects zero yield and unknown foods", () => {
  const foods = new Map();
  assert.throws(() => calculateNutrition([{ foodId: 4, grams: 20 }], foods, 100, 30), /Alimento não encontrado/);
  assert.throws(() => calculateNutrition([{ foodId: 1, grams: 20 }], new Map([[1, { id: 1, nutrients: {} }]]), 0, 30), /rendimento final/);
});

test("the pinned TACO CSV files load and calculate a known food", async () => {
  const [compositionCsv, fattyCsv] = await Promise.all([
    readFile(new URL("../data/taco_composicao.csv", import.meta.url), "utf8"),
    readFile(new URL("../data/taco_acidos_graxos.csv", import.meta.url), "utf8")
  ]);
  const foods = buildFoodCatalog(parseCsv(compositionCsv), parseCsv(fattyCsv));
  const rice = foods.find(({ id }) => id === 1);
  assert.equal(foods.length, 597);
  assert.equal(rice.description, "Arroz, integral, cozido");

  const result = calculateNutrition([{ foodId: 1, grams: 200 }], new Map(foods.map((food) => [food.id, food])), null, 100);
  assert.ok(Math.abs(result.per100g.energyKcal - 123.5348925) < 1e-8);
  assert.equal(result.perServing.energyKcal, result.per100g.energyKcal);
  assert.equal(result.per100g.totalSugarsG, null);
});
