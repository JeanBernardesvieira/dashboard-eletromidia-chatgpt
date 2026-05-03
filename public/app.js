let rawData = null;
let charts = [];
const $ = id => document.getElementById(id);

function destroyCharts(){ charts.forEach(c=>c.destroy()); charts=[]; }
function makeChart(id, type, labels, datasets, options={}){
  const chart = new Chart($(id), { type, data:{ labels, datasets }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ labels:{ color:'#eef6ff' } } }, scales: type==='doughnut' ? {} : { x:{ ticks:{ color:'#9db0c7' }, grid:{ color:'rgba(255,255,255,.08)' } }, y:{ ticks:{ color:'#9db0c7' }, grid:{ color:'rgba(255,255,255,.08)' }, beginAtZero:true } }, ...options } });
  charts.push(chart); return chart;
}
function top(list,n=10){ return (list||[]).slice(0,n); }
function setOptions(select, values){
  const current = select.value;
  select.innerHTML = '<option value="all">Todos</option>' + values.filter(Boolean).sort().map(v=>`<option>${v}</option>`).join('');
  if([...select.options].some(o=>o.value===current)) select.value=current;
}
function filteredRows(){
  if(!rawData) return [];
  const m=$('monthFilter').value, a=$('areaFilter').value, t=$('techFilter').value, e=$('envFilter').value, s=$('searchInput').value.toLowerCase();
  return rawData.rows.filter(r => (m==='all'||r.mes===m) && (a==='all'||r.area===a) && (t==='all'||r.tecnico===t) && (e==='all'||r.ambiente===e) && (!s || JSON.stringify(r).toLowerCase().includes(s)));
}
function group(rows,key){
  const map={}; rows.forEach(r=>{ const k=r[key]||'Não informado'; map[k]=(map[k]||0)+1; });
  return Object.entries(map).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
}
function renderRank(el, items, subFn){
  el.innerHTML = items.length ? items.map((it,i)=>`<div class="rank-item"><div class="rank-num">${i+1}</div><div><div class="rank-title">${it.name}</div><div class="rank-sub">${subFn?subFn(it):''}</div></div><div class="rank-value">${it.value ?? it.score ?? it.reincidencia}</div></div>`).join('') : '<p class="rank-sub">Sem dados para esse filtro.</p>';
}
function render(){
  const rows = filteredRows(); const offRows = rows.filter(r=>r.off);
  $('totalRegistros').textContent = rows.length; $('totalOff').textContent = offRows.length; $('totalCorretivos').textContent = rows.filter(r=>r.corretivo).length; $('totalPreventivos').textContent = rows.filter(r=>r.preventivo).length;
  destroyCharts();
  const months = [...new Set(rawData.rows.map(r=>r.mes))].sort((a,b)=>(rawData.rows.find(r=>r.mes===a)?.mesOrdem||99)-(rawData.rows.find(r=>r.mes===b)?.mesOrdem||99));
  const monthly = months.map(m=>({month:m, off: rows.filter(r=>r.mes===m && r.off).length, corretivos: rows.filter(r=>r.mes===m && r.corretivo).length, preventivos: rows.filter(r=>r.mes===m && r.preventivo).length}));
  makeChart('monthlyChart','line', monthly.map(x=>x.month), [{label:'OFF', data:monthly.map(x=>x.off), tension:.35, borderWidth:3},{label:'Meta -2%', data:monthly.map((x,i)=> i? monthly[i-1].off*.98 : null), borderDash:[6,6], borderWidth:2}], {interaction:{mode:'index',intersect:false}});
  makeChart('activityChart','bar', monthly.map(x=>x.month), [{label:'Corretivos',data:monthly.map(x=>x.corretivos)},{label:'Preventivos',data:monthly.map(x=>x.preventivos)}]);
  const critical = group(offRows,'ponto').slice(0,10).map(x=>{ const recent=offRows.filter(r=>r.ponto===x.name && r.mes===months[months.length-1]).length; return {...x, score:x.value*10+recent*5, recent}; }).sort((a,b)=>b.score-a.score);
  renderRank($('criticalList'), critical.map(x=>({...x,value:x.score})), it=>`${it.value/10} ocorrências base • score de criticidade`);
  const causes = group(offRows,'causa').slice(0,8); makeChart('causeChart','doughnut',causes.map(x=>x.name),[{label:'OFF',data:causes.map(x=>x.value)}]);
  const areas=group(offRows,'area').slice(0,8); makeChart('areaChart','bar',areas.map(x=>x.name),[{label:'OFF',data:areas.map(x=>x.value)}]);
  const tech=group(offRows,'tecnico').slice(0,8); makeChart('techChart','bar',tech.map(x=>x.name),[{label:'OFF',data:tech.map(x=>x.value)}]);
  const env=group(offRows,'ambiente').slice(0,8); makeChart('envChart','bar',env.map(x=>x.name),[{label:'OFF',data:env.map(x=>x.value)}]);
  $('monthTopContainer').innerHTML = months.map(m=>{ const items=group(offRows.filter(r=>r.mes===m),'ponto').slice(0,10); return `<div class="month-box"><h3>${m}</h3><ol>${items.map(i=>`<li><b>${i.name}</b> — ${i.value}</li>`).join('') || '<li>Sem OFF</li>'}</ol></div>` }).join('');
  const first=months[0], last=months[months.length-1]; const firstMap=group(rawData.rows.filter(r=>r.mes===first && r.off),'ponto'); const lastMap=new Map(group(rawData.rows.filter(r=>r.mes===last && r.off),'ponto').map(x=>[x.name,x.value]));
  const improves=firstMap.map(x=>({name:x.name,inicio:x.value,atual:lastMap.get(x.name)||0,value:x.value-(lastMap.get(x.name)||0)})).filter(x=>x.value>0).sort((a,b)=>b.value-a.value).slice(0,10);
  renderRank($('improvementList'), improves, it=>`${first}: ${it.inicio} → ${last}: ${it.atual}`);
  $('dataTable').innerHTML = rows.slice(0,500).map(r=>`<tr><td>${r.mes}</td><td>${r.ponto}</td><td>${r.area}</td><td>${r.tecnico}</td><td>${r.ambiente}</td><td>${r.tipoAtividade}</td><td>${r.causa}</td><td>${r.status}</td></tr>`).join('');
}
async function load(){
  $('statusBadge').textContent='Atualizando...';
  const res = await fetch('/api/data'); rawData = await res.json();
  if(rawData.error){ $('statusBadge').textContent='Erro'; alert(rawData.error); return; }
  setOptions($('monthFilter'), [...new Set(rawData.rows.map(r=>r.mes))]); setOptions($('areaFilter'), [...new Set(rawData.rows.map(r=>r.area))]); setOptions($('techFilter'), [...new Set(rawData.rows.map(r=>r.tecnico))]); setOptions($('envFilter'), [...new Set(rawData.rows.map(r=>r.ambiente))]);
  $('statusBadge').textContent = `Atualizado • ${new Date(rawData.generatedAt).toLocaleString('pt-BR')}`;
  render();
}
['monthFilter','areaFilter','techFilter','envFilter','searchInput'].forEach(id=>$(id).addEventListener('input',render));
$('refreshBtn').addEventListener('click',load); load();
