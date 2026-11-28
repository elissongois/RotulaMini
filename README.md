# RotulaMini

A local, experimental nutrition-label generator based on recipes and the Brazilian Food Composition Table (TACO).

RotulaMini is a static web application: it has no account, application server, or recipe uploads. Calculations run in the browser. This initial version is a prototype and **does not validate legal compliance or replace laboratory analysis or professional review**.

## Run

Python 3 is required. From this directory, run the app and TBCA proxy:

```bash
python3 server.py
```

Open <http://127.0.0.1:8000> in your browser. To stop the server, return to the terminal and press `Ctrl+C`.

Use the proxy server instead of opening `index.html` by double-clicking it: browsers restrict local data files and TBCA requires same-origin proxy access.

An internet connection is not required after downloading the repository.

## Use

1. Enter a recipe name and its estimated final weight.
2. Search for a TACO food, enter its quantity in grams, and add it to the recipe.
3. Enter a serving size to see the calculated values.
4. Save the recipe in this browser or export/import recipes as JSON.
5. Use **Print / Save as PDF** to print the preview.

If no final weight is provided, the calculation uses the sum of the ingredient quantities. This may not represent the yield after cooking, evaporation, draining, or other weight losses or gains.

Saved recipes are stored in the browser's IndexedDB on this device and browser profile. They are not written to the project files. Export JSON backups; clearing browser data may remove saved recipes.

## Nutrition data

This version includes normalized CSV files from [brolesi/taco](https://github.com/brolesi/taco), pinned to commit `cbba16930bf7135c1d8b950499c9bd080f2d641e`:

- TACO 4th edition: composition data for 597 foods, per 100 g of edible portion.
- Fatty acid profile: available for only some foods.

Credits, the license declared by the source project, and the original sources are documented in [`AVISOS-DE-TERCEIROS.md`](AVISOS-DE-TERCEIROS.md) and [`data/LICENSE-brolesi-taco.txt`](data/LICENSE-brolesi-taco.txt). The data distinguish zero, trace, and missing values. Missing values are shown as “ND” (“not available”), never as zero.

**Important limitations:** TACO does not provide total or added sugars, and some nutrients were analyzed for only a subset of foods. These rows may therefore show “ND”. Do not use this preview as a final label. Verify the data against product information and, where applicable, laboratory analysis.

## Storage and privacy

- There is no remote API or analytics.
- Recipes are stored in the browser's local IndexedDB.
- JSON exports are saved to your device by the browser.
- TACO data is read from local files in `data/`.

## Online sources

TBCA searches use the local Python proxy at `/api/tbca/search` and `/api/tbca/detail`. Queries require the general **Allow online lookup** switch, an enabled TBCA source, and the server. No database copy is saved in the browser or repository.

LATINFOODS and FoodData Central are registered but disabled until verified adapters are implemented. Custom sources store metadata only; adding a URL does not automatically make it queryable.

Public deployments must expose the proxy on the same origin. Provider API keys belong in server environment variables, never in source code, backups, or browser storage.

## Development and tests

Node.js is required only to run the tests:

```bash
node --test test/nutrition.test.mjs
```

There are no external package dependencies.

## Current scope

- Search the TACO food database.
- Enter quantities in grams.
- Calculate composition per 100 g and per serving.
- Print the preview.
- Save, export, and import recipes locally.

This version does not implement regulatory rounding, claims, front-of-pack warnings, complete sugar data, ingredient/allergen lists, or a guarantee of compliance with ANVISA regulations.

## License

Original RotulaMini code is distributed under the MIT License in [`LICENSE`](LICENSE). Third-party data and materials retain the notices and terms described in [`AVISOS-DE-TERCEIROS.md`](AVISOS-DE-TERCEIROS.md).
