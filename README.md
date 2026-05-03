# Dashboard Operacional Eletromidia GO

Dashboard web para análise de chamados da operação técnica:

- Evolução mensal dos OFFs
- Meta de redução de OFF em 2%
- Ranking Top 10 por mês
- Ranking acumulado de pontos críticos
- Score inteligente de criticidade
- Causa raiz dos OFFs
- Visão por área, técnico e ambiente
- Corretivos x preventivos
- Tabela técnica filtrável

## Como rodar localmente

1. Instale Node.js 18 ou superior.
2. Abra a pasta do projeto no terminal.
3. Rode:

```bash
npm install
npm start
```

4. Acesse:

```text
http://localhost:3000
```

## Como subir no Railway

1. Crie um novo projeto no Railway.
2. Envie estes arquivos para um repositório GitHub.
3. No Railway, selecione **Deploy from GitHub repo**.
4. O Railway detecta Node.js automaticamente.
5. Comando de start: `npm start`.

## Atualização automática dos meses

O dashboard já vem com Janeiro, Fevereiro, Março e Abril cadastrados.

Para descoberta automática de novas planilhas na mesma pasta do Drive, configure estas variáveis no Railway:

```text
GOOGLE_DRIVE_FOLDER_ID=1ZlIQPBFVkN64icpt-jceolQY9-FwaRYe
GOOGLE_API_KEY=sua_chave_google_drive_api
```

Sem `GOOGLE_API_KEY`, o dashboard usa a lista fixa atual. Com a chave, ele tenta localizar automaticamente novos arquivos na pasta cujo nome contenha `Relatorio-de-Chamados` ou `Chamados`.

## Importante sobre permissão

As planilhas precisam estar compartilhadas como:

```text
Qualquer pessoa com o link pode visualizar
```

Se o dashboard não carregar, quase sempre é permissão do Google Drive bloqueando exportação CSV.

## Onde ajustar planilhas manualmente

Abra o arquivo `server.js` e altere a lista `fallbackSheets`.

Exemplo:

```js
{ month: 'Maio', order: 5, title: '05-Relatorio-de-Chamados-Maio.xlsx', id: 'ID_DA_PLANILHA' }
```

## Critério de OFF

O sistema identifica OFF procurando termos nos campos:

- Tipo de Atividade
- Problemas Relatados
- Soluções
- Observações
- Primeiro Histórico
- Status
- Nível

Termos usados: `off`, `offline`, `off-line`, `sem energia`, `desligado`, `elevador parado`, `oscilação de rede`, `serviço restabelecido`, `rede`.

## Critério de causa raiz

Classificação automática inicial:

- Link / Rede
- Energia
- Problema predial / Elevador
- Equipamento
- Preventiva
- Não classificado

Esse critério pode ser refinado depois conforme os padrões reais da operação.
