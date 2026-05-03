const express = require('express');
const Papa = require('papaparse');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '1ZlIQPBFVkN64icpt-jceolQY9-FwaRYe';
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';

const fallbackSheets = [
  { month: 'Janeiro', order: 1, title: '01-Relatorio-de-Chamados-Janeiro.xlsx', id: '13a0T-HqtS3vv0ShYC1fNL2p1G99MW0nT' },
  { month: 'Fevereiro', order: 2, title: '02-Relatorio-de-Chamados-Fevereiro.xlsx', id: '1g39QBqCMCrjnmLy4f7uMMSuor5JW6dBZ' },
  { month: 'Março', order: 3, title: '03-Relatorio-de-Chamados-Março.xlsx', id: '15ze1zAvjqcQIzrHRGqkzkx9oQWw1yyNV' },
  { month: 'Abril', order: 4, title: '04-Relatorio-de-Chamados-Abril.xlsx', id: '1WZ_VvXR7xuIVLdpWH496AvY65QNvE7dh' }
];

const monthMap = [
  ['janeiro', 1], ['jan', 1], ['fevereiro', 2], ['fev', 2], ['março', 3], ['marco', 3], ['mar', 3],
  ['abril', 4], ['abr', 4], ['maio', 5], ['mai', 5], ['junho', 6], ['jun', 6], ['julho', 7], ['jul', 7],
  ['agosto', 8], ['ago', 8], ['setembro', 9], ['set', 9], ['outubro', 10], ['out', 10], ['novembro', 11], ['nov', 11], ['dezembro', 12], ['dez', 12]
];
const monthNames = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

app.use(express.static(path.join(__dirname, 'public')));

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getMonthFromTitle(title = '') {
  const t = normalizeText(title);
  for (const [name, order] of monthMap) {
    if (t.includes(name)) return { month: monthNames[order], order };
  }
  const prefix = String(title).match(/(^|\D)(\d{1,2})(\D|$)/);
  if (prefix) {
    const order = Number(prefix[2]);
    if (order >= 1 && order <= 12) return { month: monthNames[order], order };
  }
  return { month: title.replace(/\.xlsx|\.csv/gi, ''), order: 99 };
}

async function discoverSheets() {
  if (!GOOGLE_API_KEY) return fallbackSheets;
  try {
    const q = encodeURIComponent(`'${FOLDER_ID}' in parents and trashed=false`);
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&key=${GOOGLE_API_KEY}&fields=files(id,name,mimeType,modifiedTime)&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Drive API ${response.status}`);
    const payload = await response.json();
    const files = (payload.files || [])
      .filter(f => /Relatorio-de-Chamados|Chamados/i.test(f.name))
      .map(f => {
        const parsed = getMonthFromTitle(f.name);
        return { id: f.id, title: f.name, month: parsed.month, order: parsed.order, modifiedTime: f.modifiedTime };
      })
      .sort((a,b) => a.order - b.order);
    return files.length ? files : fallbackSheets;
  } catch (error) {
    console.warn('Falha ao descobrir planilhas automaticamente. Usando fallback.', error.message);
    return fallbackSheets;
  }
}

async function fetchCsv(sheet) {
  const urls = [
    `https://docs.google.com/spreadsheets/d/${sheet.id}/export?format=csv&gid=0`,
    `https://docs.google.com/spreadsheets/d/${sheet.id}/gviz/tq?tqx=out:csv&gid=0`
  ];
  let lastError = null;
  for (const url of urls) {
    try {
      const response = await fetch(url, { redirect: 'follow' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      if (text.includes('<!DOCTYPE html') || text.includes('<html')) throw new Error('Retornou HTML em vez de CSV. Verifique compartilhamento.');
      return text;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function isOff(row) {
  const blob = normalizeText([
    row['Tipo de Atividade'], row['Problemas Relatados'], row['Soluções'], row['Observações'], row['Primeiro Histórico'], row['Status'], row['Nível']
  ].join(' '));
  if (blob.includes('preventiva') || blob.includes('sem problemas')) return false;
  return blob.includes('off') || blob.includes('offline') || blob.includes('off-line') || blob.includes('sem energia') || blob.includes('desligado') || blob.includes('elevador parado') || blob.includes('oscilacao de rede') || blob.includes('servico restabelecido') || blob.includes('rede');
}

function rootCause(row) {
  const blob = normalizeText([
    row['Problemas Relatados'], row['Soluções'], row['Observações'], row['Primeiro Histórico'], row['Tipo de Atividade'], row['Nível']
  ].join(' '));
  if (blob.includes('link') || blob.includes('internet') || blob.includes('rede') || blob.includes('oscilacao')) return 'Link / Rede';
  if (blob.includes('energia') || blob.includes('sem energia') || blob.includes('desligado') || blob.includes('quadro') || blob.includes('disjuntor')) return 'Energia';
  if (blob.includes('elevador') || blob.includes('manutencao') || blob.includes('reparo')) return 'Problema predial / Elevador';
  if (blob.includes('monitor') || blob.includes('tv') || blob.includes('hdmi') || blob.includes('player') || blob.includes('equipamento')) return 'Equipamento';
  if (blob.includes('preventiva')) return 'Preventiva';
  return 'Não classificado';
}

function cleanRow(row, sheet) {
  const activity = String(row['Tipo de Atividade'] || '').trim();
  const preventive = normalizeText(activity).includes('preventiva');
  const corrective = normalizeText(activity).includes('corretiva');
  return {
    mes: sheet.month,
    mesOrdem: sheet.order,
    ponto: String(row['Ponto'] || 'Sem ponto informado').trim(),
    endereco: String(row['Endereço'] || '').trim(),
    bairro: String(row['Bairro'] || '').trim(),
    cidade: String(row['Cidade'] || '').trim(),
    area: String(row['Área de Trabalho'] || 'Sem área').trim(),
    ambiente: String(row['Ambiente'] || 'Não informado').trim(),
    nivel: String(row['Nível'] || '').trim(),
    tecnico: String(row['Técnico'] || 'Não informado').trim(),
    tipoAtividade: activity || 'Não informado',
    problema: String(row['Problemas Relatados'] || '').trim(),
    solucao: String(row['Soluções'] || '').trim(),
    status: String(row['Status'] || '').trim(),
    dataCriacao: String(row['Data de Criação'] || '').trim(),
    observacoes: String(row['Observações'] || '').trim(),
    primeiroHistorico: String(row['Primeiro Histórico'] || '').trim(),
    preventivo: preventive,
    corretivo: corrective,
    off: isOff(row),
    causa: rootCause(row)
  };
}

function groupCount(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row) || 'Não informado';
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
}

function buildAnalytics(rows) {
  const offRows = rows.filter(r => r.off);
  const correctiveRows = rows.filter(r => r.corretivo);
  const preventiveRows = rows.filter(r => r.preventivo);
  const months = [...new Set(rows.map(r => r.mes))].sort((a,b) => (rows.find(r=>r.mes===a)?.mesOrdem || 99) - (rows.find(r=>r.mes===b)?.mesOrdem || 99));
  const monthly = months.map(month => {
    const all = rows.filter(r => r.mes === month);
    const off = all.filter(r => r.off);
    const corretivos = all.filter(r => r.corretivo);
    const preventivos = all.filter(r => r.preventivo);
    return { month, total: all.length, off: off.length, corretivos: corretivos.length, preventivos: preventivos.length };
  });
  for (let i = 1; i < monthly.length; i++) {
    const prev = monthly[i-1].off || 0;
    monthly[i].variation = prev ? Number((((monthly[i].off - prev) / prev) * 100).toFixed(1)) : 0;
    monthly[i].target = Number((prev * 0.98).toFixed(1));
  }
  const pointMonthCounts = {};
  for (const month of months) {
    const monthOff = offRows.filter(r => r.mes === month);
    pointMonthCounts[month] = groupCount(monthOff, r => r.ponto).slice(0, 10);
  }
  const topOff = groupCount(offRows, r => r.ponto).slice(0, 25);
  const topImprovement = [];
  if (months.length >= 2) {
    const first = groupCount(offRows.filter(r => r.mes === months[0]), r => r.ponto);
    const lastMap = new Map(groupCount(offRows.filter(r => r.mes === months[months.length - 1]), r => r.ponto).map(x => [x.name, x.value]));
    for (const item of first) {
      const last = lastMap.get(item.name) || 0;
      if (item.value > last) topImprovement.push({ name: item.name, inicio: item.value, atual: last, reducao: item.value - last });
    }
    topImprovement.sort((a,b) => b.reducao - a.reducao);
  }
  const score = topOff.map(item => {
    const pointRows = offRows.filter(r => r.ponto === item.name);
    const recent = months.length ? pointRows.filter(r => r.mes === months[months.length - 1]).length : 0;
    const causes = groupCount(pointRows, r => r.causa).slice(0, 1)[0]?.name || 'Não classificado';
    const score = item.value * 10 + recent * 5;
    return { name: item.name, reincidencia: item.value, recentes: recent, causaPrincipal: causes, score };
  }).sort((a,b) => b.score - a.score).slice(0, 10);
  return {
    generatedAt: new Date().toISOString(),
    totals: {
      registros: rows.length,
      off: offRows.length,
      corretivos: correctiveRows.length,
      preventivos: preventiveRows.length,
      pontosCriticos: topOff.length
    },
    monthly,
    top10ByMonth: pointMonthCounts,
    topOff: topOff.slice(0, 10),
    criticalScore: score,
    causes: groupCount(offRows, r => r.causa),
    byArea: groupCount(offRows, r => r.area),
    byTechnician: groupCount(offRows, r => r.tecnico),
    byEnvironment: groupCount(offRows, r => r.ambiente),
    improvements: topImprovement.slice(0, 10),
    rows
  };
}

app.get('/api/sheets', async (_req, res) => {
  const sheets = await discoverSheets();
  res.json(sheets);
});

app.get('/api/data', async (_req, res) => {
  try {
    const sheets = await discoverSheets();
    const allRows = [];
    const errors = [];
    for (const sheet of sheets) {
      try {
        const csv = await fetchCsv(sheet);
        const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
        for (const raw of parsed.data) allRows.push(cleanRow(raw, sheet));
      } catch (error) {
        errors.push({ sheet: sheet.title, error: error.message });
      }
    }
    const analytics = buildAnalytics(allRows);
    analytics.sources = sheets;
    analytics.errors = errors;
    res.json(analytics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Dashboard Eletromidia rodando na porta ${PORT}`));
