const DATABASE_NAME = "rotulamini";
const STORE_NAME = "recipes";
const INGREDIENT_STORE_NAME = "ingredients";
const DATABASE_VERSION = 2;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(INGREDIENT_STORE_NAME)) {
        database.createObjectStore(INGREDIENT_STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error(`Não foi possível abrir o armazenamento local: ${request.error?.message ?? "erro desconhecido"}`));
    request.onblocked = () => reject(new Error("O armazenamento local está bloqueado por outra aba. Feche outras abas do RotulaMini e tente novamente."));
  });
}

async function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error(`Falha no armazenamento local: ${request.error?.message ?? "erro desconhecido"}`));
  });
}

async function transact(mode, operation) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    let result;
    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onerror = () => {
      database.close();
      reject(new Error(`Falha ao salvar receitas: ${transaction.error?.message ?? "erro desconhecido"}`));
    };
    transaction.onabort = () => {
      database.close();
      reject(new Error(`A operação de armazenamento foi cancelada: ${transaction.error?.message ?? "erro desconhecido"}`));
    };
    try {
      result = operation(transaction.objectStore(STORE_NAME));
    } catch (error) {
      transaction.abort();
      reject(error);
    }
  });
}

export async function listRecipes() {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const recipes = await requestResult(transaction.objectStore(STORE_NAME).getAll());
    return recipes.sort((first, second) => first.name.localeCompare(second.name, "pt-BR"));
  } finally {
    database.close();
  }
}

export async function saveRecipe(recipe) {
  await transact("readwrite", (store) => store.put(recipe));
}

export async function deleteRecipe(id) {
  await transact("readwrite", (store) => store.delete(id));
}

export async function importRecipes(recipes) {
  await transact("readwrite", (store) => {
    for (const recipe of recipes) store.put(recipe);
  });
}

async function transactStore(storeName, mode, operation) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    let result;
    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onerror = () => {
      database.close();
      reject(new Error(`Falha no armazenamento local: ${transaction.error?.message ?? "erro desconhecido"}`));
    };
    transaction.onabort = () => {
      database.close();
      reject(new Error("A operação de armazenamento foi cancelada."));
    };
    try {
      result = operation(transaction.objectStore(storeName));
    } catch (error) {
      transaction.abort();
      reject(error);
    }
  });
}

export async function listIngredients() {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(INGREDIENT_STORE_NAME, "readonly");
    const ingredients = await requestResult(transaction.objectStore(INGREDIENT_STORE_NAME).getAll());
    return ingredients.sort((first, second) => first.name.localeCompare(second.name, "pt-BR"));
  } finally {
    database.close();
  }
}

export async function saveIngredient(ingredient) {
  await transactStore(INGREDIENT_STORE_NAME, "readwrite", (store) => store.put(ingredient));
}

export async function deleteIngredient(key) {
  await transactStore(INGREDIENT_STORE_NAME, "readwrite", (store) => store.delete(key));
}
