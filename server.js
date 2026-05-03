'use strict';
const express = require('express');
const axios   = require('axios');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── ID da planilha única com todas as abas mensais ───────────────────────────
const SHEET_ID = '1wfHx4_JkhgqCBdMzFNFuiZdoAxCSpwOsAzHzapiUpIQ';

// Nomes das abas (sem acentos para evitar problemas de encoding)
// Adicione novos meses aqui conforme criar as abas na planilha
const ABAS_MESES = [
  { aba: 'Janeiro',   label: 'Janeiro 2026',   ano: 2026, mes: 1 },
  { aba: 'Fevereiro', label: 'Fevereiro 2026',  ano: 2026, mes: 2 },
  { aba: 'Marco',     label: 'Março 2026',      ano: 2026, mes: 3 },
  { aba: 'Abril',     label: 'Abril 2026',      ano: 2026, mes: 4 },
  { aba: 'Maio',      label: 'Maio 2026',       ano: 2026, mes: 5 },
  { aba: 'Junho',     label: 'Junho 2026',      ano: 2026, mes: 6 },
  { aba: 'Julho',     label: 'Julho 2026',      ano: 2026, mes: 7 },
  { aba: 'Agosto',    label: 'Agosto 2026',     ano: 2026, mes: 8 },
  { aba: 'Setembro',  label: 'Setembro 2026',   ano: 2026, mes: 9 },
  { aba: 'Outubro',   label: 'Outubro 2026',    ano: 2026, mes: 10 },
  { aba: 'Novembro',  label: 'Novembro 2026',   ano: 2026, mes: 11 },
  { aba: 'Dezembro',  label: 'Dezembro 2026',   ano: 2026, mes: 12 },
];

// ─── Cache em memória ─────────────────────────────────────────────────────────
const cache = {};       // { 'Janeiro': { dados, metricas, updatedAt } }
let periodosDisponiveis = [];

// ─── Leitura de uma aba do Google Sheets ──────────────────────────────────────
async function lerAba(nomeAba) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(nomeAba)}`;
  const resp = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 20000,
  });
  const raw  = resp.data;
  const json = JSON.parse(raw.substring(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  const table = json.table || {};
  const cols  = (table.cols || []).map(c => c.label || '');
  const rows  = (table.rows || []).map(r =>
    Object.fromEntries(cols.map((col, i) => [col, r.c?.[i]?.v ?? null]))
  );
  return rows;
}

// ─── Cálculo de métricas ──────────────────────────────────────────────────────
function calcularMetricas(rows) {
  const total      = rows.length;
  const concluidos = rows.filter(r => (r['Status'] || '').toLowerCase().includes('conclu')).length;
  const tempos     = rows.map(r => parseFloat(r['Duração Exec. em minutos'] || 0)).filter(t => t > 0);
  const tempoMedio = tempos.length ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : 0;

  // Técnicos únicos
  const tecnicos = [...new Set(rows.map(r => r['Técnico']).filter(Boolean))];

  // Por nível
  const porNivel = {};
  rows.forEach(r => {
    const n = r['Nível'] || 'N/A';
    porNivel[n] = (porNivel[n] || 0) + 1;
  });

  // Por tipo de atividade
  const porTipo = {};
  rows.forEach(r => {
    const t = r['Tipo de Atividade'] || 'N/A';
    porTipo[t] = (porTipo[t] || 0) + 1;
  });

  // Por cidade
  const porCidade = {};
  rows.forEach(r => {
    const c = r['Cidade'] || 'N/A';
    porCidade[c] = (porCidade[c] || 0) + 1;
  });

  // Por técnico
  const porTecnico = {};
  rows.forEach(r => {
    const t = r['Técnico'] || 'N/A';
    porTecnico[t] = (porTecnico[t] || 0) + 1;
  });

  // Top cidade
  const topCidade = Object.entries(porCidade).sort((a, b) => b[1] - a[1])[0] || ['N/A', 0];

  // Maior volume técnico
  const topTecnico = Object.entries(porTecnico).sort((a, b) => b[1] - a[1])[0] || ['N/A', 0];

  return {
    total,
    concluidos,
    taxaConclusao: total ? Math.round((concluidos / total) * 100) : 0,
    tempoMedio,
    totalTecnicos: tecnicos.length,
    topCidade: { nome: topCidade[0], total: topCidade[1] },
    topTecnico: { nome: topTecnico[0], total: topTecnico[1] },
    porNivel,
    porTipo: Object.entries(porTipo).sort((a, b) => b[1] - a[1]).slice(0, 10),
    porCidade: Object.entries(porCidade).sort((a, b) => b[1] - a[1]).slice(0, 10),
    porTecnico: Object.entries(porTecnico).sort((a, b) => b[1] - a[1]),
  };
}

// ─── Carregar todas as abas disponíveis ───────────────────────────────────────
async function carregarTodos() {
  const disponiveis = [];
  for (const { aba, label, ano, mes } of ABAS_MESES) {
    try {
      const rows = await lerAba(aba);
      if (rows.length > 1) {
        const metricas = calcularMetricas(rows);
        cache[aba] = { dados: rows, metricas, updatedAt: new Date().toISOString() };
        disponiveis.push({ aba, label, ano, mes, total: rows.length });
        console.log(`✅ Aba "${aba}" carregada: ${rows.length} chamados`);
      }
    } catch (e) {
      // Aba não existe ainda — ignorar silenciosamente
    }
  }
  // Ordenar por ano/mês
  periodosDisponiveis = disponiveis.sort((a, b) => a.ano !== b.ano ? a.ano - b.ano : a.mes - b.mes);
  console.log(`📊 Períodos disponíveis: ${periodosDisponiveis.map(p => p.label).join(', ')}`);
}

// ─── Rotas ────────────────────────────────────────────────────────────────────
app.use(express.static(__dirname));

// Lista os períodos disponíveis
app.get('/api/periodos', (req, res) => {
  res.json(periodosDisponiveis);
});

// Métricas de um período
app.get('/api/metricas/:aba', (req, res) => {
  const { aba } = req.params;
  if (!cache[aba]) return res.status(404).json({ erro: 'Período não encontrado' });
  res.json({
    ...cache[aba].metricas,
    updatedAt: cache[aba].updatedAt,
  });
});

// Chamados de um período (com paginação)
app.get('/api/chamados/:aba', (req, res) => {
  const { aba } = req.params;
  if (!cache[aba]) return res.status(404).json({ erro: 'Período não encontrado' });
  const page  = parseInt(req.query.page  || '1');
  const limit = parseInt(req.query.limit || '50');
  const busca = (req.query.busca || '').toLowerCase();
  let dados = cache[aba].dados;
  if (busca) {
    dados = dados.filter(r =>
      Object.values(r).some(v => String(v || '').toLowerCase().includes(busca))
    );
  }
  const total = dados.length;
  const inicio = (page - 1) * limit;
  res.json({
    total,
    pagina: page,
    totalPaginas: Math.ceil(total / limit),
    dados: dados.slice(inicio, inicio + limit),
  });
});

// Evolução mensal (todos os meses carregados)
app.get('/api/evolucao', (req, res) => {
  const evolucao = periodosDisponiveis.map(p => ({
    label: p.label,
    aba: p.aba,
    ...cache[p.aba]?.metricas,
  }));
  res.json(evolucao);
});

// Forçar recarga do cache
app.post('/api/recarregar', async (req, res) => {
  try {
    await carregarTodos();
    res.json({ ok: true, periodos: periodosDisponiveis.length });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

app.get('*', (req, res) =>
  res.sendFile(path.join(__dirname, 'index.html'))
);

// ─── Inicialização ────────────────────────────────────────────────────────────
carregarTodos().then(() => {
  app.listen(PORT, () => console.log(`🚀 Dashboard Eletromidia rodando na porta ${PORT}`));
}).catch(err => {
  console.error('Erro ao carregar dados:', err);
  app.listen(PORT, () => console.log(`🚀 Dashboard rodando na porta ${PORT} (sem dados)`));
});
