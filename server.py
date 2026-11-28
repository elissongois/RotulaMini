#!/usr/bin/env python3
import html
import json
import os
import re
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlencode, urljoin, urlparse
from urllib.request import Request, build_opener, HTTPCookieProcessor
from http.cookiejar import CookieJar

ROOT = os.path.dirname(os.path.abspath(__file__))
TBCA_BASE = "https://www.tbca.net.br/base-dados/"
SEARCH_URL = urljoin(TBCA_BASE, "composicao_alimentos_calculaveis.php")


class UpstreamError(Exception):
    pass


def tbca_open(url, data=None):
    jar = CookieJar()
    opener = build_opener(HTTPCookieProcessor(jar))
    request = Request(
        url,
        data=data,
        headers={
            "User-Agent": "RotulaMini/1.0",
            "Accept": "text/html,application/xhtml+xml",
            "Referer": SEARCH_URL,
        },
        method="POST" if data is not None else "GET",
    )
    try:
        with opener.open(request, timeout=20) as response:
            if response.status != 200:
                raise UpstreamError(f"TBCA respondeu HTTP {response.status}.")
            charset = response.headers.get_content_charset() or "utf-8"
            return response.read().decode(charset, "replace")
    except Exception as error:
        if isinstance(error, UpstreamError):
            raise
        raise UpstreamError(f"Nao foi possivel consultar a TBCA: {error}") from error


def strip_tags(value):
    value = re.sub(r"<[^>]+>", " ", value)
    return html.unescape(re.sub(r"\s+", " ", value)).strip()


def parse_search(query):
    query = re.sub(r"\s+", " ", query).strip()
    if len(query) < 1 or len(query) > 200:
        raise UpstreamError("A busca deve ter entre 1 e 200 caracteres.")
    body = tbca_open(
        SEARCH_URL,
        urlencode({
            "guarda": "tomo1",
            "produto": query,
            "cmb_grupo": "",
            "cmb_tipo_alimento": "",
        }).encode(),
    )
    if "int_composicao_alimentos_2_edit.php" not in body:
        raise UpstreamError("A resposta da TBCA nao continha resultados reconheciveis.")

    results = []
    seen = set()
    row_pattern = re.compile(r"<tr[^>]*>(.*?)</tr>", re.I | re.S)
    cell_pattern = re.compile(r"<td[^>]*>(.*?)</td>", re.I | re.S)
    link_pattern = re.compile(r"<a[^>]+href=['\"]([^'\"]+)['\"][^>]*>", re.I)
    for row in row_pattern.findall(body):
        href_match = link_pattern.search(row)
        if not href_match:
            continue
        href = html.unescape(href_match.group(1))
        cells = cell_pattern.findall(row)
        if len(cells) < 2:
            continue
        code = strip_tags(cells[0])
        name = strip_tags(cells[1])
        if not code or not name:
            continue
        parsed = urlparse(href)
        record_id = parsed.query
        if not record_id or record_id in seen:
            continue
        seen.add(record_id)
        results.append({"id": record_id, "code": code, "name": name, "href": href})

    results.sort(key=lambda item: item["name"].casefold())
    return results


def parse_br_number(value):
    value = strip_tags(value).replace("\xa0", "").replace(" ", "").replace(".", "").replace(",", ".")
    if not value or value in ("-", "nd", "ND", "N/A"):
        return None
    try:
        number = float(value)
        return number if number >= 0 else None
    except ValueError:
        return None


def parse_detail(record_id):
    if not re.fullmatch(r"[A-Za-z0-9%+=/&.-]+", record_id):
        raise UpstreamError("Identificador da TBCA invalido.")
    href = "int_composicao_alimentos_2_edit.php?" + record_id
    url = urljoin(TBCA_BASE, href)
    body = tbca_open(url)
    table_match = re.search(r"<table[^>]*id=['\"]tabela1['\"][^>]*>(.*?)</table>", body, re.I | re.S)
    if not table_match:
        raise UpstreamError("A pagina da TBCA nao continha a tabela de nutrientes.")

    nutrients = {
        "energyKcal": None,
        "carbohydrateG": None,
        "totalSugarsG": None,
        "addedSugarsG": None,
        "proteinG": None,
        "totalFatG": None,
        "saturatedFatG": None,
        "transFatG": None,
        "fiberG": None,
        "sodiumMg": None,
    }
    row_pattern = re.compile(r"<tr[^>]*>(.*?)</tr>", re.I | re.S)
    cell_pattern = re.compile(r"<td[^>]*>(.*?)</td>", re.I | re.S)
    for row in row_pattern.findall(table_match.group(1)):
        cells = cell_pattern.findall(row)
        if len(cells) < 3:
            continue
        component = strip_tags(cells[0]).casefold()
        unit = strip_tags(cells[1]).casefold()
        value = parse_br_number(cells[2])
        if component == "energia" and unit == "kcal":
            nutrients["energyKcal"] = value
        elif component == "carboidrato total":
            nutrients["carbohydrateG"] = value
        elif component.startswith("acucar") or component.startswith("açúcar"):
            if "adicionado" in component:
                nutrients["addedSugarsG"] = value
            elif nutrients["totalSugarsG"] is None:
                nutrients["totalSugarsG"] = value
        elif component == "proteína" or component == "proteina":
            nutrients["proteinG"] = value
        elif component == "lipídios" or component == "lipideos":
            nutrients["totalFatG"] = value
        elif "saturada" in component and "gordura" in component:
            nutrients["saturatedFatG"] = value
        elif "trans" in component:
            nutrients["transFatG"] = value
        elif "fibra" in component:
            nutrients["fiberG"] = value
        elif component == "sódio" or component == "sodio":
            nutrients["sodiumMg"] = value

    name = "Alimento TBCA"
    generic_names = (
        "Alimento TBCA",
        "Composição de Alimentos",
        "Composição de Alimentos (Em Medidas Caseiras) Personalizadas",
        "Composicao de Alimentos",
    )
    h5_matches = re.findall(r"<h5[^>]*>(.*?)</h5>", body, re.I | re.S)
    for h5 in h5_matches:
        description_match = re.search(
            r"<strong>\s*Descri(?:c|ç)(?:a|ã)o\s*:</strong>\s*(.*?)(?:<br|$)",
            h5,
            re.I | re.S,
        )
        if description_match:
            description = strip_tags(description_match.group(1))
            if description:
                name = description.split(" (", 1)[0].strip()
                break
    if name == "Alimento TBCA":
        title_matches = re.findall(r"<h[1-4][^>]*>(.*?)</h[1-4]>", body, re.I | re.S)
        for title_match in title_matches:
            title = strip_tags(title_match)
            if title and not any(generic.casefold() in title.casefold() for generic in generic_names):
                name = title
                break
    return {"id": record_id, "name": name, "nutrients": nutrients}


def tbca_search(query):
    return parse_search(query)


def tbca_detail(record_id):
    return parse_detail(record_id)


class RotulaMiniHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/tbca/search":
            query = parse_qs(parsed.query).get("q", [""])[0]
            try:
                self.send_json(200, {"results": parse_search(query)})
            except (UpstreamError, ValueError) as error:
                self.send_json(502, {"error": str(error)})
            return
        if parsed.path == "/api/tbca/detail":
            record_id = parse_qs(parsed.query).get("id", [""])[0]
            try:
                self.send_json(200, parse_detail(record_id))
            except (UpstreamError, ValueError) as error:
                self.send_json(502, {"error": str(error)})
            return
        super().do_GET()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer(("0.0.0.0", port), RotulaMiniHandler)
    print(f"RotulaMini em http://127.0.0.1:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
