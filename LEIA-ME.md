# RotulaMini

Gerador local e experimental de tabelas nutricionais a partir de receitas e da Tabela Brasileira de Composição de Alimentos (TACO).

O RotulaMini é uma aplicação web estática: não possui conta, servidor de aplicação ou envio de receitas para a internet. Os cálculos são feitos no navegador. Esta primeira versão é um protótipo e **não valida conformidade legal nem substitui análise laboratorial ou revisão profissional**.

## Executar

É necessário ter Python 3 instalado. No terminal, dentro desta pasta, execute:

```bash
python3 -m http.server 8000
```

Abra <http://127.0.0.1:8000> no navegador. Para encerrar, volte ao terminal e pressione `Ctrl+C`.

Use um servidor local em vez de abrir `index.html` por duplo clique: navegadores restringem o carregamento de arquivos de dados locais (`file://`).

Não é necessária conexão à internet depois de baixar o repositório.

## Usar

1. Informe o nome da receita e a massa final estimada.
2. Pesquise um alimento da TACO, informe a quantidade em gramas e adicione à receita.
3. Informe o tamanho da porção para consultar os valores calculados.
4. Salve a receita neste navegador ou exporte/importe receitas em JSON.
5. Use **Imprimir / Salvar em PDF** para imprimir a prévia.

Quando a massa final não for informada, o cálculo usa a soma das quantidades dos ingredientes. Esse valor pode não representar o rendimento após cocção, evaporação, drenagem ou outras perdas/ganhos.

As receitas salvas ficam no IndexedDB do navegador e neste dispositivo/perfil. Elas não são gravadas nos arquivos do projeto. Exporte cópias JSON para backup; limpar os dados do navegador pode removê-las.

## Dados nutricionais

A versão inicial incorpora os CSVs normalizados do projeto [brolesi/taco](https://github.com/brolesi/taco), fixados no commit `cbba16930bf7135c1d8b950499c9bd080f2d641e`:

- TACO 4ª edição: composição de 597 alimentos, por 100 g de parte comestível.
- Perfil de ácidos graxos: disponível somente para parte dos alimentos.

Créditos, licença informada pelo projeto de origem e fontes originais estão registrados em [`AVISOS-DE-TERCEIROS.md`](AVISOS-DE-TERCEIROS.md) e [`data/LICENSE-brolesi-taco.txt`](data/LICENSE-brolesi-taco.txt). Os dados distinguem zero, traço e valor ausente. Um valor ausente é exibido como “ND”, nunca como zero.

**Limitações importantes:** a TACO não fornece açúcares totais ou adicionados, e alguns nutrientes só foram analisados para parte dos alimentos. Por isso, algumas linhas aparecem como “ND”. Não use esta prévia como rótulo final. Os dados devem ser conferidos com as informações do produto e, quando aplicável, com análise laboratorial.

## Armazenamento e privacidade

- Não há API remota ou analytics.
- As receitas ficam no IndexedDB local do navegador.
- A exportação JSON é salva no dispositivo pelo navegador.
- A base TACO é lida dos arquivos locais dentro de `data/`.

## Desenvolvimento e testes

Requer Node.js somente para executar os testes:

```bash
node --test test/nutrition.test.mjs
```

Não há dependências de pacote externas.

## Escopo atual

- Busca de alimentos da TACO.
- Quantidades em gramas.
- Cálculo de composição por 100 g e por porção.
- Prévia imprimível no navegador.
- Salvamento local, exportação e importação de receitas.

Não implementa arredondamento regulamentar, alegações, lupa frontal, tratamento completo de açúcares, lista de ingredientes/alergênicos ou garantia de conformidade com normas da ANVISA.

## Licença

O código original do RotulaMini é distribuído sob a licença MIT, conforme [`LICENSE`](LICENSE). Os dados e materiais de terceiros mantêm os avisos e condições descritos em [`AVISOS-DE-TERCEIROS.md`](AVISOS-DE-TERCEIROS.md).
