// ═══════════════════════════════════
//  FinançasFamília — App.js
// ═══════════════════════════════════
let usuario = null
let graficoInstance = null
let metaEmojiSel = '🎯'
let receitaTipoSel = 'Freelance'

const AVATARES = ['👨','👩','🧑','👦','👧','👤']
const SAUDACOES = () => {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}
const EMOJI_CAT = {
  'Alimentação':'🍽️','Mercado':'🛒','Saúde':'💊','Farmácia':'💊',
  'Transporte':'🚗','Combustível':'⛽','Educação':'📚','Lazer':'🎉',
  'Vestuário':'👕','Casa':'🏠','Financiamento':'🏦','Assinatura':'📱',
  'Restaurante':'🍕','Outros':'📦'
}
const fmt = v => 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})

// Converte valor digitado em formato brasileiro (1.500,00 ou 1500,50 ou 1500.50) para número
function parseBRL(str) {
  if (!str) return 0
  const s = String(str).trim()
    .replace(/[R$\s]/g, '')   // remove R$ e espaços
    .replace(/\./g, '')        // remove pontos de milhar
    .replace(',', '.')         // troca vírgula decimal por ponto
  return parseFloat(s) || 0
}
const api = async (url, opts) => {
  const r = await fetch('/api' + url, opts)
  const data = await r.json().catch(() => ({ erro: `HTTP ${r.status}` }))
  if (!r.ok) {
    console.error(`API ${opts?.method||'GET'} ${url} →`, r.status, data)
    throw Object.assign(new Error(data.erro || `Erro ${r.status}`), { status: r.status, data })
  }
  return data
}

// ── TOAST ──
let _toastTimer = null
function toast(msg, tipo = 'sucesso') {
  const el = document.getElementById('toast')
  if (!el) return
  clearTimeout(_toastTimer)
  el.textContent = msg
  el.className = tipo
  // força reflow para reiniciar animação
  void el.offsetWidth
  el.classList.add('show')
  _toastTimer = setTimeout(() => el.classList.remove('show'), 3000)
}

// ── INIT ──
let USUARIOS_CACHE = []

async function init() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js')

  const salvo = localStorage.getItem('fin_usuario')
  if (salvo) {
    try {
      usuario = JSON.parse(salvo)
      usuario.id = Number(usuario.id)
      mostrarApp()
      return
    } catch(e) {
      localStorage.removeItem('fin_usuario')
    }
  }

  const { configurado, usuarios } = await api('/status')
  USUARIOS_CACHE = usuarios || []
  if (!configurado) {
    show('tela-setup')
  } else {
    show('tela-login')
    renderLogin(USUARIOS_CACHE)
  }
}

function show(id) {
  document.querySelectorAll('.tela, #app').forEach(el => el.style.display = 'none')
  const el = document.getElementById(id)
  el.style.display = id === 'app' ? 'flex' : 'flex'
  el.style.flexDirection = id === 'app' ? 'column' : ''
}

// ── SETUP ──
async function concluirSetup() {
  const n1 = document.getElementById('s-nome1').value.trim()
  const s1 = parseBRL(document.getElementById('s-sal1').value)
  const c1 = document.getElementById('s-cel1').value.trim()
  const p1 = document.getElementById('s-pin1').value.trim()
  const n2 = document.getElementById('s-nome2').value.trim()
  const s2 = parseBRL(document.getElementById('s-sal2').value)
  const c2 = document.getElementById('s-cel2').value.trim()
  const p2 = document.getElementById('s-pin2').value.trim()

  if (!n1 || !n2) { alert('Preencha os dois nomes!'); return }
  if (!/^\d{4}$/.test(p1)) { alert('PIN do 1º usuário: exatamente 4 dígitos!'); return }
  if (!/^\d{4}$/.test(p2)) { alert('PIN do 2º usuário: exatamente 4 dígitos!'); return }

  await api('/usuarios',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nome:n1,salario:s1,telefone:c1,pin:p1})})
  await api('/usuarios',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nome:n2,salario:s2,telefone:c2,pin:p2})})

  const { usuarios } = await api('/status')
  USUARIOS_CACHE = usuarios || []
  show('tela-login')
  renderLogin(USUARIOS_CACHE)
}

// ── LOGIN ──
function renderLogin(usuarios) {
  USUARIOS_CACHE = usuarios || []
  const container = document.getElementById('login-cards')
  container.innerHTML = USUARIOS_CACHE.map((u, i) => {
    const cel = u.telefone && u.telefone.length >= 4 ? '···· ' + u.telefone.slice(-4) : (u.telefone || '')
    return `
      <button class="login-card" data-idx="${i}">
        <div class="login-avatar">${AVATARES[i] || '👤'}</div>
        <div class="login-info">
          <div class="login-nome">${u.nome}</div>
          <div class="login-sal">${cel ? '📱 ' + cel : 'Toque para entrar'}</div>
        </div>
        <span class="login-arrow">🔑</span>
      </button>
    `
  }).join('')

  container.querySelectorAll('.login-card').forEach(btn => {
    btn.addEventListener('click', () => abrirPinModal(parseInt(btn.dataset.idx)))
  })
}

// ── PIN MODAL ──
let pinUsuarioIdx = null
let pinAtual = ''

function abrirPinModal(idx) {
  pinUsuarioIdx = idx
  pinAtual = ''
  const u = USUARIOS_CACHE[idx]
  if (!u) return
  document.getElementById('pin-avatar').textContent = AVATARES[idx] || '👤'
  document.getElementById('pin-nome').textContent = 'Olá, ' + u.nome + '! 👋'
  const cel = u.telefone && u.telefone.length >= 4 ? '📱 ···· ' + u.telefone.slice(-4) : ''
  document.getElementById('pin-cel').textContent = cel
  document.getElementById('pin-erro').style.display = 'none'
  atualizarPinDots()
  document.getElementById('modal-pin').style.display = 'flex'
}

function pinDigito(d) {
  if (pinAtual.length >= 4) return
  pinAtual += d
  atualizarPinDots()
  if (pinAtual.length === 4) setTimeout(verificarPin, 120)
}

function pinApagar() {
  pinAtual = pinAtual.slice(0, -1)
  atualizarPinDots()
  document.getElementById('pin-erro').style.display = 'none'
}

function atualizarPinDots() {
  document.querySelectorAll('.pin-dot').forEach((dot, i) => {
    dot.classList.toggle('filled', i < pinAtual.length)
  })
}

async function verificarPin() {
  const u = USUARIOS_CACHE[pinUsuarioIdx]
  if (!u) return
  try {
    const res = await api('/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ usuarioId: u.id, pin: pinAtual })
    })
    if (res.erro) {
      pinAtual = ''
      atualizarPinDots()
      document.getElementById('pin-erro').style.display = 'block'
      const dots = document.getElementById('pin-dots')
      dots.classList.remove('shake')
      void dots.offsetWidth // força reflow para reiniciar animação
      dots.classList.add('shake')
      return
    }
    fecharModal('modal-pin')
    usuario = { ...res, id: Number(res.id) }
    localStorage.setItem('fin_usuario', JSON.stringify(usuario))
    mostrarApp()
  } catch(e) {
    pinAtual = ''
    atualizarPinDots()
    alert('Erro de conexão. Tente novamente.')
  }
}

function sair() {
  localStorage.removeItem('fin_usuario')
  usuario = null
  location.reload()
}

// ── EDITAR PERFIL ──
function abrirPerfil() {
  if (!usuario) return
  document.getElementById('ep-nome').value = usuario.nome || ''
  document.getElementById('ep-sal').value = String(usuario.salario || 0).replace('.', ',')
  document.getElementById('ep-cel').value = usuario.telefone || ''
  document.getElementById('ep-pin-atual').value = ''
  document.getElementById('ep-pin').value = ''
  document.getElementById('ep-pin-erro').style.display = 'none'
  document.getElementById('modal-perfil').style.display = 'flex'
}

async function salvarPerfil() {
  const nome = document.getElementById('ep-nome').value.trim()
  const salario = parseBRL(document.getElementById('ep-sal').value)
  const telefone = document.getElementById('ep-cel').value.trim()
  const pinAtual = document.getElementById('ep-pin-atual').value.trim()
  const pinNovo = document.getElementById('ep-pin').value.trim()

  if (!nome) { alert('Informe o nome!'); return }
  if (pinNovo && !/^\d{4}$/.test(pinNovo)) { alert('Novo PIN deve ter exatamente 4 dígitos!'); return }
  if (pinNovo && !pinAtual) { alert('Informe o PIN atual para trocar!'); return }

  const body = { nome, salario, telefone }
  if (pinNovo) { body.pin = pinNovo; body.pinAtual = pinAtual }

  const res = await api(`/usuarios/${usuario.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  if (res.erro) {
    document.getElementById('ep-pin-erro').style.display = 'block'
    document.getElementById('ep-pin-atual').value = ''
    return
  }

  usuario = { ...usuario, ...res, id: Number(res.id) }
  localStorage.setItem('fin_usuario', JSON.stringify(usuario))
  fecharModal('modal-perfil')
  document.getElementById('h-nome').textContent = usuario.nome + ' ✏️'
  carregarInicio()
}

// ── APP ──
async function mostrarApp() {
  show('app')
  const usuarios = await api('/usuarios')
  const idx = usuarios.findIndex(u => u.id === usuario.id)
  document.getElementById('h-avatar').textContent = AVATARES[idx] || '👤'
  document.getElementById('h-saudacao').textContent = SAUDACOES() + ','
  document.getElementById('h-nome').textContent = usuario.nome + ' ✏️'

  carregarInicio()
  addMsgBot(`${SAUDACOES()}, ${usuario.nome}! 👋\n\nDigite um gasto aqui. Exemplos:\n• "Mercado R$150"\n• "Gasolina R$80 débito"\n• "Farmácia R$45 Nubank"\n\nOu mande "ajuda" para ver todos os comandos.`)
}

// ── INÍCIO ──
async function carregarInicio() {
  try {
    const [resumo, gastos] = await Promise.all([api('/resumo'), api('/gastos/recentes')])

    // Balance
    const rendaTotal = resumo.rendaTotal || resumo.salarioTotal || 0
    const resultado = rendaTotal - (resumo.gastosMes || 0)
    const pct = rendaTotal > 0 ? (((resumo.gastosMes||0)/rendaTotal)*100).toFixed(0) : 0
    const positivo = resultado >= 0

    // Número principal: resultado do mês (+ ou -)
    const saldoEl = document.getElementById('b-saldo')
    saldoEl.textContent = (positivo ? '+' : '') + fmt(resultado)
    saldoEl.style.color = positivo ? '#4ade80' : '#f87171'

    // Label contextual
    document.getElementById('b-resultado-label').textContent =
      positivo ? '✅ Economizando este mês' : '⚠️ Acima da renda este mês'

    document.getElementById('b-renda').textContent = fmt(rendaTotal)
    document.getElementById('b-gastos').textContent = fmt(resumo.gastosMes || 0)
    document.getElementById('b-contas').textContent = fmt(resumo.saldoContas || 0)
    document.getElementById('b-mes').textContent = new Date().toLocaleString('pt-BR',{month:'long',year:'numeric'})
    const alertaPct = pct > 80 ? `<span class="badge-alerta">⚠️ ${pct}% usado</span>` : `<span style="color:#4ade80">✓ ${pct}% usado</span>`
    const dividas = (resumo.totalEmDividas || 0) > 0 ? `<span class="badge-alerta">💸 Dívidas: ${fmt(resumo.totalEmDividas)}</span>` : ''
    document.getElementById('b-alerta').innerHTML = alertaPct + ' ' + dividas

    // Cartões
    renderCartoesScroll(resumo.cartoes || [])

    // Contas
    renderContasRow(resumo.contas || [])

    // Empréstimos
    renderEmprestimos()

    // Evolução mini
    renderEvolucaoMini(resumo.evolucao || [])

    // Projeção de parcelas
    renderProjecao(resumo.projecao || [])

    // Transações
    renderTransacoes((gastos || []).slice(0,8))

    // Alertas de vencimento
    verificarAlertas()
  } catch (e) {
    console.error('carregarInicio erro:', e)
    toast('⚠️ Erro ao atualizar: ' + e.message, 'erro')
  }
}

// ── ALERTAS ──
async function verificarAlertas() {
  try {
    const [alertas, projecao] = await Promise.all([api('/alertas'), api('/projecao')])
    const banner = document.getElementById('alertas-banner')

    const temEmpAlerta = alertas && alertas.length > 0
    const proxMes = projecao && projecao[0]
    const temParcelas = proxMes && proxMes.total > 0

    if (!temEmpAlerta && !temParcelas) { banner.style.display = 'none'; return }

    banner.style.display = 'block'
    let html = ''

    if (temEmpAlerta) {
      const hoje = new Date(); hoje.setHours(0,0,0,0)
      html += '<div class="alerta-titulo">🔔 Vencimentos próximos</div>'
      html += alertas.map(e => {
        const venc = new Date(e.data_vencimento + 'T00:00:00')
        const diff = Math.round((venc - hoje) / (1000*60*60*24))
        const tag = diff < 0 ? '🔴 VENCIDO' : diff === 0 ? '🟠 Vence HOJE' : `🟡 ${diff} dia${diff>1?'s':''}`
        return `<div class="alerta-item" onclick="abrirModalEmprestimo()" style="cursor:pointer">
          ${tag} — <strong>${e.descricao}</strong> · ${fmt(Number(e.parcela_mensal))}
        </div>`
      }).join('')
    }

    if (temParcelas) {
      const nomeMes = mesStr => {
        const [,n] = mesStr.split('-')
        return ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(n)-1]
      }
      if (!temEmpAlerta) html += '<div class="alerta-titulo">📅 Parcelas futuras</div>'
      html += projecao.filter(p => p.total > 0).map(p =>
        `<div class="alerta-item alerta-parcela">
          📅 <strong>${nomeMes(p.mes)}</strong> — ${fmt(p.total)} em parcelas comprometidas
        </div>`
      ).join('')
    }

    banner.innerHTML = html
  } catch(e) {}
}

// ── EVOLUÇÃO MINI ──
function renderEvolucaoMini(evolucao) {
  const el = document.getElementById('evolucao-mini')
  if (!el) return
  if (!evolucao || !evolucao.length) {
    el.innerHTML = '<div class="evol-vazio">Nenhum gasto registrado ainda.</div>'
    return
  }
  const meses = [...evolucao].reverse()
  const max = Math.max(...meses.map(m => m.total), 1)
  const nomeMes = m => {
    const [,n] = m.mes.split('-')
    return ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(n)-1]
  }
  el.innerHTML = `
    <div class="evol-bars">
      ${meses.map(m => {
        const pct = Math.max((m.total / max) * 100, 3)
        const atual = m.mes === new Date().toISOString().slice(0,7)
        return `<div class="evol-bar-wrap">
          <div class="evol-valor">${fmt(m.total).replace('R$ ','')}</div>
          <div class="evol-bar ${atual?'atual':''}" style="height:${pct}%"></div>
          <div class="evol-mes">${nomeMes(m)}</div>
        </div>`
      }).join('')}
    </div>
  `
}

// ── PROJEÇÃO DE PARCELAS ──
function renderProjecao(projecao) {
  const el = document.getElementById('projecao-parcelas')
  if (!el) return

  // Filtra só meses com parcelas futuras
  const comGasto = (projecao || []).filter(p => p.total > 0)
  if (!comGasto.length) {
    el.innerHTML = `<div class="proj-vazio">✅ Sem parcelas futuras em aberto</div>`
    return
  }

  const nomeMes = mesStr => {
    const [, n] = mesStr.split('-')
    return ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(n)-1]
  }

  el.innerHTML = comGasto.map(p => `
    <div class="proj-card">
      <div class="proj-mes">${nomeMes(p.mes)}</div>
      <div class="proj-valor">${fmt(p.total)}</div>
      <div class="proj-label">em parcelas</div>
    </div>
  `).join('')
}

// ── RELATÓRIO COMPLETO ──
let chartEvolucao = null, chartCats2 = null

async function abrirRelatorio() {
  document.getElementById('modal-relatorio').style.display = 'flex'
  document.getElementById('relatorio-conteudo').innerHTML =
    '<div class="plano-loading"><div class="spinner"></div><p>Carregando...</p></div>'

  const [gastosEv, receitasEv, cats] = await Promise.all([
    api('/gastos/evolucao'), api('/receitas/evolucao'), api('/gastos/categorias')
  ])

  const nomeMes = mesStr => {
    const [,n] = mesStr.split('-')
    return ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(n)-1]
  }

  // Merge gastos e receitas pelos mesmos rótulos (últimos 6 meses)
  const mesAtual = new Date().toISOString().slice(0,7)
  const allMeses = [...new Set([...(gastosEv||[]).map(m=>m.mes), ...(receitasEv||[]).map(m=>m.mes)])].sort()
  const ultimos6 = allMeses.slice(-6)
  const gastosMap = Object.fromEntries((gastosEv||[]).map(m => [m.mes, m.total]))
  const receitasMap = Object.fromEntries((receitasEv||[]).map(m => [m.mes, m.total]))

  // Calcula balanço mensal
  const balancoPorMes = ultimos6.map(m => {
    const g = gastosMap[m] || 0
    const r = receitasMap[m] || 0
    return { mes: m, gastos: g, receitas: r, saldo: r - g }
  })

  document.getElementById('relatorio-conteudo').innerHTML = `
    <div class="rel-secao">
      <div class="rel-titulo">Receitas vs Gastos — últimos 6 meses</div>
      <canvas id="chart-evolucao" style="max-height:220px"></canvas>
    </div>
    <div class="rel-secao">
      <div class="rel-titulo">Balanço mensal</div>
      <div id="rel-balanco" class="rel-balanco"></div>
    </div>
    <div class="rel-secao">
      <div class="rel-titulo">Por categoria — mês atual</div>
      ${cats.length ? `<canvas id="chart-cats" style="max-height:180px;margin-bottom:12px"></canvas>
      <div id="rel-cat-lista" class="cat-lista"></div>` : '<p style="color:#94a3b8;font-size:.88rem">Nenhum gasto lançado este mês.</p>'}
    </div>
  `

  // Gráfico grouped — receitas vs gastos
  if (chartEvolucao) chartEvolucao.destroy()
  chartEvolucao = new Chart(document.getElementById('chart-evolucao').getContext('2d'), {
    type: 'bar',
    data: {
      labels: ultimos6.map(nomeMes),
      datasets: [
        { label: 'Receitas', data: ultimos6.map(m => receitasMap[m] || 0), backgroundColor: '#22c55e', borderRadius: 6, borderSkipped: false },
        { label: 'Gastos',   data: ultimos6.map(m => gastosMap[m] || 0),   backgroundColor: '#f87171', borderRadius: 6, borderSkipped: false }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: true, position: 'top', labels: { boxWidth: 12, font: { size: 11 } } } },
      scales: {
        y: { grid: { color: '#f1f5f9' }, ticks: { callback: v => 'R$' + (v/1000).toFixed(0) + 'k' } },
        x: { grid: { display: false } }
      }
    }
  })

  // Balanço
  document.getElementById('rel-balanco').innerHTML = balancoPorMes.map(b => {
    const pos = b.saldo >= 0
    const atual = b.mes === mesAtual
    return `<div class="rel-balanco-item${atual ? ' atual' : ''}">
      <span class="rel-balanco-mes">${nomeMes(b.mes)}${atual ? ' ←' : ''}</span>
      <span class="rel-balanco-saldo" style="color:${pos?'#16a34a':'#dc2626'}">${pos?'+':''}${fmt(b.saldo)}</span>
    </div>`
  }).join('')

  // Gráfico de rosca — categorias
  if (cats.length) {
    if (chartCats2) chartCats2.destroy()
    const coresCat = ['#16a34a','#dc2626','#2563eb','#d97706','#7c3aed','#0891b2','#db2777','#65a30d']
    chartCats2 = new Chart(document.getElementById('chart-cats').getContext('2d'), {
      type: 'doughnut',
      data: { labels: cats.map(c=>c.categoria), datasets: [{ data: cats.map(c=>c.total), backgroundColor: coresCat, borderWidth: 0, hoverOffset: 6 }] },
      options: { responsive: true, cutout: '65%', plugins: { legend: { display: false } } }
    })
    const total = cats.reduce((a,c) => a+c.total, 0)
    document.getElementById('rel-cat-lista').innerHTML = cats.map((c,i) => `
      <div class="cat-item">
        <div style="width:10px;height:10px;border-radius:50%;background:${coresCat[i%coresCat.length]};flex-shrink:0"></div>
        <span>${EMOJI_CAT[c.categoria]||'📦'}</span>
        <span class="cat-nome">${c.categoria}</span>
        <span class="cat-valor">${fmt(c.total)}</span>
        <span class="cat-pct">${total>0?((c.total/total)*100).toFixed(0):0}%</span>
      </div>`).join('')
  }
}

function renderCartoesScroll(cartoes) {
  const el = document.getElementById('inicio-cartoes')
  if (!cartoes.length) {
    el.innerHTML = `<div class="cartao-vazio" onclick="mostrarAba('cartoes');navBtn('nav-cartoes')"><span>＋</span>Adicionar cartão</div>`
    return
  }
  el.innerHTML = cartoes.map(c => {
    const pct = c.limite > 0 ? Math.min((c.gasto_atual/c.limite)*100,100) : 0
    const disp = c.limite - c.gasto_atual
    const cJson = encodeURIComponent(JSON.stringify(c))
    return `
      <div class="cartao-visual" style="background:linear-gradient(135deg,${c.cor1||'#1a1a2e'},${c.cor2||'#16213e'})"
           onclick="abrirFaturaCartao(JSON.parse(decodeURIComponent('${cJson}')))">
        <div class="cv-nome">💳 ${c.nome} <span style="font-size:.7rem;opacity:.7">✏️ editar fatura</span></div>
        <div class="cv-bottom">
          <div class="cv-limite">Limite ${fmt(c.limite)}</div>
          <div class="cv-valores">
            <div class="cv-gasto">${fmt(c.gasto_atual)}</div>
            <div class="cv-disp">Disponível<br><strong>${fmt(disp)}</strong></div>
          </div>
          <div class="cv-barra"><div class="cv-barra-fill" style="width:${pct}%"></div></div>
        </div>
      </div>
    `
  }).join('') + `<div class="cartao-vazio" onclick="abrirModalCartao()"><span>＋</span>Novo cartão</div>`
}

function renderContasRow(contas) {
  const cores = ['#2563eb','#16a34a','#7c3aed','#d97706','#dc2626']
  const el = document.getElementById('inicio-contas')
  if (!contas.length) {
    el.innerHTML = `<div class="conta-vazia" onclick="abrirModalConta()"><span>＋</span> Adicionar conta</div>`
    return
  }
  el.innerHTML = contas.map((c,i) => {
    const negativo = c.saldo < 0
    const corSaldo = negativo ? '#dc2626' : '#16a34a'
    const corBorda = negativo ? '#dc2626' : cores[i%cores.length]
    const prefixo = negativo ? '⚠️ ' : ''
    const contaJson = encodeURIComponent(JSON.stringify(c))
    return `
    <div class="conta-chip" style="border-left-color:${corBorda}" onclick="abrirEditarConta(JSON.parse(decodeURIComponent('${contaJson}')))">
      <div class="conta-chip-nome">${c.nome} ✏️</div>
      <div class="conta-chip-banco">${c.banco || c.tipo}</div>
      <div class="conta-chip-saldo" style="color:${corSaldo}">${prefixo}${fmt(c.saldo)}</div>
    </div>`
  }).join('') + `<div class="conta-vazia" onclick="abrirModalConta()"><span>＋</span> Nova conta</div>`
}

function renderTransacoes(gastos) {
  const el = document.getElementById('inicio-transacoes')
  if (!gastos.length) {
    el.innerHTML = `<div class="tx-vazio">📭 Nenhum gasto ainda.<br>Lance pelo chat!</div>`
    return
  }
  el.innerHTML = gastos.map(g => {
    const data = new Date(g.data_gasto+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})
    const cartao = g.cartao_nome ? ` · ${g.cartao_nome}` : ''
    return `
      <div class="tx-item">
        <div class="tx-emoji">${EMOJI_CAT[g.categoria]||'📦'}</div>
        <div class="tx-info">
          <div class="tx-desc">${g.descricao}</div>
          <div class="tx-meta">${g.usuario_nome} · ${data}${cartao}</div>
        </div>
        <div class="tx-valor">- ${fmt(g.valor)}</div>
      </div>
    `
  }).join('')
}

// ── CHAT ──
function chipGasto(texto) {
  document.getElementById('chat-input').value = texto
  document.getElementById('chat-input').focus()
}

function irParaChat() {
  mostrarAba('gastos')
  navBtn('nav-gastos')
  setTimeout(() => document.getElementById('chat-input').focus(), 300)
}

async function enviarMsg() {
  const input = document.getElementById('chat-input')
  const texto = input.value.trim()
  if (!texto) return
  input.value = ''

  addMsgUser(texto)
  const loading = addLoading()

  try {
    const res = await api('/chat',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({mensagem:texto, usuarioId:usuario.id})
    })
    loading.remove()
    addMsgBot(res.resposta || '❌ Sem resposta.')
    if (res.tipo === 'gasto' || res.tipo === 'receita') carregarInicio()
  } catch {
    loading.remove()
    addMsgBot('❌ Erro de conexão. Tente novamente.')
  }
}

function addMsgUser(txt) {
  const d = document.createElement('div')
  d.className = 'msg-user'
  d.textContent = txt
  appendChat(d)
}
function addMsgBot(txt) {
  const d = document.createElement('div')
  d.className = 'msg-bot'
  d.textContent = txt
  appendChat(d)
}
function addLoading() {
  const d = document.createElement('div')
  d.className = 'msg-loading'
  d.innerHTML = '<div class="dots"><span></span><span></span><span></span></div>'
  appendChat(d)
  return d
}
function appendChat(el) {
  const c = document.getElementById('chat-msgs')
  c.appendChild(el)
  c.scrollTop = c.scrollHeight
}

// ── METAS ──
async function carregarMetas() {
  const [metas, resumo] = await Promise.all([api('/metas'), api('/resumo')])

  // Resumo financeiro do planejamento
  const economia = resumo.salarioTotal - resumo.gastosMes
  document.getElementById('plan-resumo').innerHTML = `
    <div style="color:#e2e8f0;font-size:.8rem;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">💡 Visão do Planejamento</div>
    <div class="plan-resumo-grid">
      <div class="plan-item">
        <div class="plan-item-label">Renda do casal</div>
        <div class="plan-item-valor">${fmt(resumo.salarioTotal)}</div>
      </div>
      <div class="plan-item">
        <div class="plan-item-label">Gastos do mês</div>
        <div class="plan-item-valor">${fmt(resumo.gastosMes)}</div>
      </div>
      <div class="plan-item">
        <div class="plan-item-label">Economia possível</div>
        <div class="plan-item-valor" style="color:#4ade80">${fmt(economia)}</div>
      </div>
      <div class="plan-item">
        <div class="plan-item-label">Metas ativas</div>
        <div class="plan-item-valor">${metas.length}</div>
      </div>
    </div>
  `

  const el = document.getElementById('metas-lista')
  if (!metas.length) {
    el.innerHTML = `
      <div class="meta-vazio">
        <div class="meta-vazio-icon">🎯</div>
        <p>Nenhuma meta ainda.<br>Crie sua primeira meta abaixo!</p>
      </div>
    `
    return
  }
  el.innerHTML = metas.map(m => {
    const pct = m.valor_alvo > 0 ? Math.min((m.valor_atual/m.valor_alvo)*100,100) : 0
    const prazo = m.prazo ? new Date(m.prazo+'T00:00:00').toLocaleDateString('pt-BR') : 'Sem prazo'
    const faltam = m.valor_alvo - m.valor_atual
    return `
      <div class="meta-card">
        <div class="meta-top">
          <div class="meta-emoji">${m.emoji||'🎯'}</div>
          <div class="meta-info">
            <div class="meta-nome">${m.nome}</div>
            <div class="meta-prazo">📅 ${prazo}</div>
          </div>
          <div class="meta-pct-badge">${pct.toFixed(0)}%</div>
        </div>
        <div class="meta-barra"><div class="meta-barra-fill" style="width:${pct}%"></div></div>
        <div class="meta-valores">
          <span>Guardado: ${fmt(m.valor_atual)}</span>
          <span>Faltam: ${fmt(faltam)}</span>
        </div>
      </div>
    `
  }).join('')
}

// ── CARTÕES ──
async function carregarCartoes() {
  const [cartoes, cats] = await Promise.all([api('/cartoes'), api('/gastos/categorias')])

  const el = document.getElementById('cartoes-full')
  if (!cartoes.length) {
    el.innerHTML = `<div class="vazio">💳 Nenhum cartão cadastrado ainda.</div>`
  } else {
    el.innerHTML = cartoes.map(c => {
      const pct = c.limite > 0 ? Math.min((c.gasto_atual/c.limite)*100,100) : 0
      const disp = c.limite - c.gasto_atual
      const alerta = pct > 80 ? '⚠️ ' : ''
      const cfJson = encodeURIComponent(JSON.stringify(c))
      return `
        <div class="cartao-full" style="background:linear-gradient(135deg,${c.cor1||'#1a1a2e'},${c.cor2||'#16213e'});cursor:pointer"
             onclick="abrirFaturaCartao(JSON.parse(decodeURIComponent('${cfJson}')))">
          <div class="cf-top">
            <div>
              <div class="cf-nome">${alerta}💳 ${c.nome}</div>
              <div class="cf-usuario">👤 ${c.usuario_nome} · Toque para editar fatura</div>
            </div>
            <div class="cf-bandeira">${c.bandeira||'Visa'}</div>
          </div>
          <div class="cf-barra"><div class="cf-barra-fill" style="width:${pct}%"></div></div>
          <div class="cf-bottom">
            <div>
              <div class="cf-label">Gasto este mês</div>
              <div class="cf-valor">${fmt(c.gasto_atual)}</div>
            </div>
            <div class="cf-disp">
              <div class="cf-label">Disponível</div>
              <div class="cf-valor">${fmt(disp)}</div>
            </div>
            <div>
              <div class="cf-label">Limite total</div>
              <div class="cf-valor">${fmt(c.limite)}</div>
            </div>
          </div>
        </div>
      `
    }).join('')
  }

  // Gráfico categorias
  if (cats.length) {
    const ctx = document.getElementById('grafico-cat').getContext('2d')
    if (graficoInstance) graficoInstance.destroy()
    const cores = ['#16a34a','#dc2626','#2563eb','#d97706','#7c3aed','#0891b2','#db2777','#65a30d']
    graficoInstance = new Chart(ctx, {
      type: 'doughnut',
      data: { labels: cats.map(c=>c.categoria), datasets: [{ data: cats.map(c=>c.total), backgroundColor: cores, borderWidth: 0, hoverOffset: 6 }] },
      options: { responsive: true, cutout: '65%', plugins: { legend: { display: false } } }
    })
    const total = cats.reduce((a,c) => a+c.total, 0)
    document.getElementById('cat-lista').innerHTML = cats.map((c,i) => `
      <div class="cat-item">
        <div style="width:10px;height:10px;border-radius:50%;background:${cores[i%cores.length]};flex-shrink:0"></div>
        <span>${EMOJI_CAT[c.categoria]||'📦'}</span>
        <span class="cat-nome">${c.categoria}</span>
        <span class="cat-valor">${fmt(c.total)}</span>
        <span class="cat-pct">${total>0?((c.total/total)*100).toFixed(0):0}%</span>
      </div>
    `).join('')
  }
}

// ── ABAS ──
function mostrarAba(nome) {
  document.querySelectorAll('.aba').forEach(a => a.style.display = 'none')
  document.getElementById('aba-' + nome).style.display = 'block'
  if (nome === 'inicio') carregarInicio()
  if (nome === 'metas') carregarMetas()
  if (nome === 'cartoes') carregarCartoes()
  if (nome === 'contas') carregarContas()
  document.getElementById('app-main').scrollTop = 0
}

// ── ABA CONTAS ──
const TIPO_LABEL_CONTA = { corrente: 'Conta Corrente', poupanca: 'Poupança', investimento: 'Investimento' }
const TIPO_ICONE_CONTA = { corrente: '🏦', poupanca: '🐷', investimento: '📈' }
const CORES_CONTA = ['#2563eb','#16a34a','#7c3aed','#d97706','#0891b2','#db2777']

async function carregarContas() {
  try {
    const [contas, gastos] = await Promise.all([api('/contas'), api('/gastos/recentes')])

    // — Saldo total —
    const total = contas.reduce((a, c) => a + Number(c.saldo), 0)
    document.getElementById('contas-total-valor').textContent = fmt(total)
    const n = contas.length
    document.getElementById('contas-total-sub').textContent =
      n === 0 ? 'Nenhuma conta cadastrada' : `${n} conta${n > 1 ? 's' : ''} cadastrada${n > 1 ? 's' : ''}`

    // — Lista de contas —
    const el = document.getElementById('contas-lista-full')
    if (!contas.length) {
      el.innerHTML = `<div class="conta-vazia-full"><span>🏦</span>Nenhuma conta cadastrada ainda.<br><small>Adicione sua primeira conta abaixo.</small></div>`
    } else {
      el.innerHTML = contas.map((c, i) => {
        const cor = c.saldo < 0 ? '#dc2626' : CORES_CONTA[i % CORES_CONTA.length]
        const corSaldo = c.saldo < 0 ? '#dc2626' : '#16a34a'
        const icone = TIPO_ICONE_CONTA[c.tipo] || '🏦'
        const tipoLabel = TIPO_LABEL_CONTA[c.tipo] || c.tipo
        const badgeTipo = { corrente: '#2563eb', poupanca: '#16a34a', investimento: '#7c3aed' }[c.tipo] || '#64748b'
        const cJson = encodeURIComponent(JSON.stringify(c))
        return `
        <div class="conta-card-full${c.saldo < 0 ? ' negativo' : ''}" style="border-left-color:${cor}"
             onclick="abrirEditarConta(JSON.parse(decodeURIComponent('${cJson}')))">
          <div class="ccf-esq">
            <div class="ccf-icone" style="background:${cor}18;color:${cor}">${icone}</div>
            <div>
              <div class="ccf-nome">${c.nome}</div>
              <div class="ccf-banco">${c.banco || tipoLabel}</div>
              <span class="ccf-badge" style="background:${badgeTipo}18;color:${badgeTipo}">${tipoLabel}</span>
            </div>
          </div>
          <div class="ccf-dir">
            <div class="ccf-saldo" style="color:${corSaldo}">${fmt(c.saldo)}</div>
            <div class="ccf-tipo">toque para editar</div>
          </div>
        </div>`
      }).join('')
    }

    // — Movimentações recentes —
    const txEl = document.getElementById('contas-transacoes')
    if (!gastos.length) {
      txEl.innerHTML = `<div class="tx-vazio">📭 Nenhuma movimentação ainda.</div>`
    } else {
      txEl.innerHTML = gastos.slice(0, 10).map(g => {
        const data = new Date(g.data_gasto + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
        const cartao = g.cartao_nome ? ` · ${g.cartao_nome}` : ''
        return `
        <div class="tx-item">
          <div class="tx-emoji">${EMOJI_CAT[g.categoria] || '📦'}</div>
          <div class="tx-info">
            <div class="tx-desc">${g.descricao}</div>
            <div class="tx-meta">${g.usuario_nome} · ${data}${cartao}</div>
          </div>
          <div class="tx-valor">- ${fmt(g.valor)}</div>
        </div>`
      }).join('')
    }
  } catch (e) {
    console.error('carregarContas:', e)
    toast('⚠️ Erro ao carregar contas: ' + e.message, 'erro')
  }
}

function navBtn(id) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'))
  document.getElementById(id).classList.add('active')
}

// ── MODAIS ──
function abrirModalMeta() { document.getElementById('modal-meta').style.display = 'flex' }
function abrirModalCartao() { document.getElementById('modal-cartao').style.display = 'flex' }
function abrirModalConta() { document.getElementById('modal-conta').style.display = 'flex' }
function fecharModal(id) { document.getElementById(id).style.display = 'none' }

// ── EDITAR CONTA ──
let contaEditandoId = null
function abrirEditarConta(conta) {
  contaEditandoId = conta.id
  document.getElementById('ec-nome').value = conta.nome
  document.getElementById('ec-banco').value = conta.banco || ''
  document.getElementById('ec-tipo').value = conta.tipo || 'corrente'
  document.getElementById('ec-saldo').value = String(conta.saldo).replace('.', ',')
  document.getElementById('modal-editar-conta').style.display = 'flex'
}
async function salvarEdicaoConta() {
  const nome = document.getElementById('ec-nome').value.trim()
  const banco = document.getElementById('ec-banco').value.trim()
  const tipo = document.getElementById('ec-tipo').value
  const saldo = parseBRL(document.getElementById('ec-saldo').value)
  if (!nome) { toast('Informe o nome!', 'erro'); return }
  try {
    await api(`/contas/${contaEditandoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, banco, tipo, saldo })
    })
    fecharModal('modal-editar-conta')
    toast(`✅ Conta "${nome}" atualizada!`)
    const contas = await api('/contas')
    renderContasRow(contas)
    carregarContas()
    carregarInicio()
  } catch (e) {
    toast('❌ Erro ao atualizar conta: ' + e.message, 'erro')
  }
}
async function deletarContaAtual() {
  if (!confirm('Excluir esta conta?')) return
  try {
    await api(`/contas/${contaEditandoId}`, { method: 'DELETE' })
    fecharModal('modal-editar-conta')
    toast('🗑️ Conta excluída')
    const contas = await api('/contas')
    renderContasRow(contas)
    carregarContas()
    carregarInicio()
  } catch (e) {
    toast('❌ Erro ao excluir: ' + e.message, 'erro')
  }
}

// ── EDITAR FATURA CARTÃO ──
let cartaoEditandoId = null
function abrirFaturaCartao(cartao) {
  cartaoEditandoId = cartao.id
  const disp = cartao.limite - cartao.gasto_atual
  document.getElementById('fatura-titulo').textContent = `💳 ${cartao.nome}`
  document.getElementById('fatura-desc').textContent = `Atualize o valor atual da fatura de ${cartao.usuario_nome}`
  document.getElementById('fatura-valor').value = String(cartao.gasto_atual).replace('.', ',')
  document.getElementById('fatura-limite-info').innerHTML =
    `<strong>Limite:</strong> ${fmt(cartao.limite)}<br>
     <strong>Disponível atual:</strong> <span style="color:${disp < 0 ? '#dc2626' : '#16a34a'}">${fmt(disp)}</span>`
  document.getElementById('modal-fatura').style.display = 'flex'
}
async function salvarFatura() {
  const gastoAtual = parseBRL(document.getElementById('fatura-valor').value)
  await api(`/cartoes/${cartaoEditandoId}/fatura`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gastoAtual })
  })
  fecharModal('modal-fatura')
  carregarInicio()
  carregarCartoes()
}
async function deletarCartaoAtual() {
  if (!confirm('Excluir este cartão?')) return
  await api(`/cartoes/${cartaoEditandoId}`, { method: 'DELETE' })
  fecharModal('modal-fatura')
  carregarInicio()
  carregarCartoes()
}

function selEmoji(btn, emoji) {
  document.querySelectorAll('.emoji-opt').forEach(b => b.classList.remove('sel'))
  btn.classList.add('sel')
  metaEmojiSel = emoji
}

async function salvarMeta() {
  const nome = document.getElementById('m-nome').value.trim()
  const valorAlvo = parseBRL(document.getElementById('m-valor').value)
  const prazo = document.getElementById('m-prazo').value || null
  if (!nome || !valorAlvo) { toast('Preencha nome e valor!', 'erro'); return }
  try {
    await api('/metas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome, valorAlvo, prazo, emoji: metaEmojiSel }) })
    fecharModal('modal-meta')
    document.getElementById('m-nome').value = ''
    document.getElementById('m-valor').value = ''
    document.getElementById('m-prazo').value = ''
    toast(`✅ Meta "${nome}" criada!`)
    carregarMetas()
  } catch (e) {
    toast('❌ Erro ao salvar meta: ' + e.message, 'erro')
  }
}

async function salvarCartao() {
  const nome = document.getElementById('c-nome').value.trim()
  const limite = parseBRL(document.getElementById('c-limite').value)
  const diaFechamento = parseInt(document.getElementById('c-fecha').value) || 1
  const diaVencimento = parseInt(document.getElementById('c-vence').value) || 10
  if (!nome || !limite) { toast('Preencha nome e limite!', 'erro'); return }
  try {
    await api('/cartoes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuarioId: usuario.id, nome, limite, diaFechamento, diaVencimento }) })
    fecharModal('modal-cartao')
    document.getElementById('c-nome').value = ''
    document.getElementById('c-limite').value = ''
    toast(`✅ Cartão "${nome}" adicionado!`)
    carregarInicio()
    carregarCartoes()
  } catch (e) {
    toast('❌ Erro ao salvar cartão: ' + e.message, 'erro')
  }
}

async function salvarConta() {
  const nome = document.getElementById('ct-nome').value.trim()
  const banco = document.getElementById('ct-banco').value.trim()
  const tipo = document.getElementById('ct-tipo').value
  const saldo = parseBRL(document.getElementById('ct-saldo').value)
  if (!nome) { toast('Informe o nome da conta!', 'erro'); return }
  try {
    await api('/contas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuarioId: usuario.id, nome, banco, tipo, saldo }) })
    fecharModal('modal-conta')
    document.getElementById('ct-nome').value = ''
    document.getElementById('ct-banco').value = ''
    document.getElementById('ct-saldo').value = ''
    toast(`✅ Conta "${nome}" adicionada!`)
    const contas = await api('/contas')
    renderContasRow(contas)
    carregarContas()
    carregarInicio()
  } catch (e) {
    toast('❌ Erro ao salvar conta: ' + e.message, 'erro')
  }
}

// ── GASTO MANUAL ──
let gastoFormaSel = 'debito'

async function abrirModalGasto() {
  document.getElementById('g-descricao').value = ''
  document.getElementById('g-valor').value = ''
  document.getElementById('g-parcelas').value = '1'
  document.getElementById('g-categoria').value = 'Alimentação'
  // Reseta forma
  document.querySelectorAll('.forma-btn').forEach(b => b.classList.remove('sel'))
  document.querySelector('.forma-btn')?.classList.add('sel')
  gastoFormaSel = 'debito'
  document.getElementById('g-cartao-row').style.display = 'none'

  // Carrega cartões do usuário
  try {
    const cartoes = await api(`/cartoes?usuarioId=${usuario.id}`)
    const sel = document.getElementById('g-cartao')
    sel.innerHTML = `<option value="">Sem cartão específico</option>` +
      cartoes.map(c => `<option value="${c.id}">${c.nome} (disp. ${fmt(c.limite - c.gasto_atual)})</option>`).join('')
  } catch(e) {}

  document.getElementById('modal-gasto').style.display = 'flex'
}

function selForma(btn, forma) {
  document.querySelectorAll('.forma-btn').forEach(b => b.classList.remove('sel'))
  btn.classList.add('sel')
  gastoFormaSel = forma
  document.getElementById('g-forma-val').value = forma
  // Só mostra cartão/parcelas no crédito
  document.getElementById('g-cartao-row').style.display = forma === 'credito' ? 'block' : 'none'
}

async function salvarGastoManual() {
  const descricao = document.getElementById('g-descricao').value.trim()
  const valor = parseBRL(document.getElementById('g-valor').value)
  const categoria = document.getElementById('g-categoria').value
  const formaPagamento = gastoFormaSel
  const cartaoId = formaPagamento === 'credito' ? (document.getElementById('g-cartao').value || null) : null
  const parcelas = formaPagamento === 'credito' ? parseInt(document.getElementById('g-parcelas').value) || 1 : 1

  if (!descricao) { toast('Informe a descrição!', 'erro'); return }
  if (!valor || valor <= 0) { toast('Informe o valor!', 'erro'); return }

  try {
    await api('/gastos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuarioId: usuario.id, descricao, valor, categoria, formaPagamento, cartaoId, parcelas })
    })
    fecharModal('modal-gasto')
    const parcelaInfo = parcelas > 1 ? ` em ${parcelas}x de ${fmt(valor/parcelas)}` : ''
    toast(`✅ ${descricao} — ${fmt(valor)}${parcelaInfo} lançado!`)
    carregarInicio()
    carregarCartoes()
  } catch(e) {
    toast('❌ Erro ao lançar: ' + e.message, 'erro')
  }
}

// ── RECEITAS ──
async function abrirModalReceita() {
  const hoje = new Date().toISOString().split('T')[0]
  document.getElementById('r-data').value = hoje
  document.getElementById('r-descricao').value = ''
  document.getElementById('r-valor').value = ''
  document.querySelectorAll('.rtipo-btn').forEach(b => b.classList.remove('sel'))
  document.querySelector('.rtipo-btn')?.classList.add('sel')
  receitaTipoSel = 'Freelance'
  document.getElementById('modal-receita').style.display = 'flex'
  await carregarReceitasMes()
}

async function carregarReceitasMes() {
  const el = document.getElementById('receitas-mes-lista')
  if (!el) return
  try {
    const receitas = await api(`/receitas?usuarioId=${usuario.id}`)
    const now = new Date()
    const mesStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
    const doMes = receitas.filter(r => r.data_receita?.startsWith(mesStr))
    if (!doMes.length) {
      el.innerHTML = `<div class="receitas-mes-titulo">Receitas deste mês</div><div class="receitas-mes-vazio">Nenhuma receita extra lançada ainda.</div>`
      return
    }
    const totalMes = doMes.reduce((a, r) => a + Number(r.valor), 0)
    el.innerHTML = `
      <div class="receitas-mes-titulo">Receitas deste mês <span class="receitas-mes-total">${fmt(totalMes)}</span></div>
      ${doMes.map(r => {
        const data = new Date(r.data_receita + 'T00:00:00').toLocaleDateString('pt-BR', {day:'2-digit',month:'short'})
        return `<div class="receita-item">
          <div class="receita-item-info">
            <div class="receita-item-desc">💰 ${r.descricao}</div>
            <div class="receita-item-meta">${r.usuario_nome} · ${data}</div>
          </div>
          <div class="receita-item-dir">
            <span class="receita-item-valor">${fmt(r.valor)}</span>
            <button class="receita-item-del" onclick="excluirReceita(${r.id})">🗑</button>
          </div>
        </div>`
      }).join('')}
    `
  } catch(e) {
    el.innerHTML = ''
  }
}

async function excluirReceita(id) {
  if (!confirm('Excluir esta receita?')) return
  try {
    await api(`/receitas/${id}`, { method: 'DELETE' })
    toast('🗑️ Receita removida')
    await carregarReceitasMes()
    carregarInicio()
  } catch(e) {
    toast('❌ Erro ao excluir: ' + e.message, 'erro')
  }
}

function selReceitaTipo(btn, tipo) {
  document.querySelectorAll('.rtipo-btn').forEach(b => b.classList.remove('sel'))
  btn.classList.add('sel')
  receitaTipoSel = tipo
}

async function salvarReceita() {
  const valor = parseBRL(document.getElementById('r-valor').value)
  const descricaoInput = document.getElementById('r-descricao').value.trim()
  const dataReceita = document.getElementById('r-data').value
  const descricao = descricaoInput || receitaTipoSel

  if (!valor || valor <= 0) { toast('Informe o valor da receita!', 'erro'); return }

  try {
    await api('/receitas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuarioId: usuario.id, valor, descricao, dataReceita: dataReceita || null })
    })
    document.getElementById('r-descricao').value = ''
    document.getElementById('r-valor').value = ''
    toast(`💰 Receita de ${fmt(valor)} registrada!`)
    await carregarReceitasMes()
    carregarInicio()
  } catch (e) {
    toast('❌ Erro ao registrar receita: ' + e.message, 'erro')
  }
}

// ── EMPRÉSTIMOS ──
let empEdicaoId = null
const TIPO_EMOJI = { emprestimo: '💸', casa: '🏠', carro: '🚗', outro: '📦' }
const TIPO_LABEL = { emprestimo: 'Empréstimo Pessoal', casa: 'Financiamento Casa', carro: 'Financiamento Carro', outro: 'Outra Dívida' }
const TIPO_COR   = { emprestimo: '#dc2626', casa: '#7c3aed', carro: '#2563eb', outro: '#d97706' }

function selTipo(btn, tipo) {
  document.querySelectorAll('.tipo-btn').forEach(b => b.classList.remove('sel'))
  btn.classList.add('sel')
  document.getElementById('emp-tipo-val').value = tipo
}

function abrirModalEmprestimo(emp = null) {
  empEdicaoId = emp ? Number(emp.id) : null
  const tipo = emp?.tipo || 'emprestimo'

  document.getElementById('emp-btn-excluir').style.display = emp ? 'block' : 'none'
  document.getElementById('emp-descricao').value = emp?.descricao || ''
  document.getElementById('emp-credor').value = emp?.credor || ''
  document.getElementById('emp-total').value = emp ? String(Number(emp.valor_total)).replace('.', ',') : ''
  document.getElementById('emp-parcela').value = emp ? String(Number(emp.parcela_mensal)).replace('.', ',') : ''
  document.getElementById('emp-nparcelas').value = emp?.total_parcelas || ''
  document.getElementById('emp-juros').value = emp ? String(Number(emp.taxa_juros)).replace('.', ',') : ''
  document.getElementById('emp-vencimento').value = emp?.data_vencimento || ''
  document.getElementById('emp-pago').value = emp ? String(Number(emp.valor_pago)).replace('.', ',') : ''

  // Selecionar o tipo correto
  document.querySelectorAll('.tipo-btn').forEach(b => {
    b.classList.toggle('sel', b.dataset.tipo === tipo)
  })
  document.getElementById('emp-tipo-val').value = tipo
  document.getElementById('modal-emprestimo').style.display = 'flex'
}

async function salvarEmprestimo() {
  const tipo = document.getElementById('emp-tipo-val').value || 'emprestimo'
  const descricao = document.getElementById('emp-descricao').value.trim()
  const credor = document.getElementById('emp-credor').value.trim()
  const valorTotal = parseBRL(document.getElementById('emp-total').value)
  const parcelaMensal = parseBRL(document.getElementById('emp-parcela').value)
  const totalParcelas = parseInt(document.getElementById('emp-nparcelas').value) || 1
  const taxaJuros = parseBRL(document.getElementById('emp-juros').value)
  const dataVencimento = document.getElementById('emp-vencimento').value || null
  const valorPago = parseBRL(document.getElementById('emp-pago').value)
  const parcelasPagas = valorPago > 0 && parcelaMensal > 0 ? Math.floor(valorPago / parcelaMensal) : 0

  if (!descricao || !credor || !valorTotal) { toast('Preencha descrição, credor e valor total!', 'erro'); return }

  try {
    if (empEdicaoId) {
      await api(`/emprestimos/${empEdicaoId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, descricao, credor, valorTotal, parcelaMensal, totalParcelas, taxaJuros, dataVencimento, valorPago, parcelasPagas })
      })
      toast(`✅ "${descricao}" atualizado!`)
    } else {
      await api('/emprestimos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuarioId: usuario.id, tipo, descricao, credor, valorTotal, parcelaMensal, totalParcelas, taxaJuros, dataVencimento })
      })
      if (valorPago > 0) {
        const criado = await api('/emprestimos').then(list => list[0])
        if (criado) await api(`/emprestimos/${criado.id}/pagar`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ valorPago, parcelasPagas })
        })
      }
      toast(`✅ "${descricao}" cadastrado!`)
    }
    fecharModal('modal-emprestimo')
    renderEmprestimos()
  } catch (e) {
    toast('❌ Erro ao salvar: ' + e.message, 'erro')
  }
}

async function deletarEmprestimoAtual() {
  if (!confirm('Excluir este empréstimo?')) return
  await api(`/emprestimos/${empEdicaoId}`, { method: 'DELETE' })
  fecharModal('modal-emprestimo')
  renderEmprestimos()
}

async function renderEmprestimos() {
  const emprestimos = await api('/emprestimos')
  const el = document.getElementById('inicio-emprestimos')
  if (!el) return

  if (!emprestimos.length) {
    el.innerHTML = `<div class="emp-vazio" onclick="abrirModalEmprestimo()">✅ Nenhum empréstimo em aberto.<br><span style="font-size:.8rem">+ Cadastrar empréstimo</span></div>`
    return
  }

  el.innerHTML = emprestimos.map(e => {
    const pago = Number(e.valor_pago)
    const total = Number(e.valor_total)
    const restante = total - pago
    const pct = total > 0 ? Math.min((pago / total) * 100, 100) : 0
    const eJson = encodeURIComponent(JSON.stringify(e))
    const venc = e.data_vencimento ? new Date(e.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '—'
    const tipo = e.tipo || 'emprestimo'
    const emoji = TIPO_EMOJI[tipo] || '💸'
    const label = TIPO_LABEL[tipo] || 'Dívida'
    const cor = TIPO_COR[tipo] || '#dc2626'
    return `
      <div class="emp-card" style="border-left-color:${cor}" onclick="abrirModalEmprestimo(JSON.parse(decodeURIComponent('${eJson}')))">
        <div class="emp-top">
          <div>
            <div class="emp-desc">${emoji} ${e.descricao}</div>
            <div class="emp-credor">${label} · ${e.credor} · ${e.usuario_nome}</div>
          </div>
          <div class="emp-badge">Faltam ${fmt(restante)}</div>
        </div>
        <div class="emp-barra"><div class="emp-barra-fill" style="width:${pct}%"></div></div>
        <div class="emp-bottom">
          <div class="emp-item">
            <div class="emp-item-label">Total</div>
            <div class="emp-item-valor">${fmt(total)}</div>
          </div>
          <div class="emp-item">
            <div class="emp-item-label">Parcela</div>
            <div class="emp-item-valor">${fmt(Number(e.parcela_mensal))}</div>
          </div>
          <div class="emp-item">
            <div class="emp-item-label">Vence</div>
            <div class="emp-item-valor" style="font-size:.78rem">${venc}</div>
          </div>
        </div>
      </div>`
  }).join('')
}

// ── PLANO IA ──
async function abrirPlano() {
  document.getElementById('modal-plano').style.display = 'flex'
  document.getElementById('plano-conteudo').innerHTML = `
    <div class="plano-loading">
      <div class="spinner"></div>
      <p>Analisando suas finanças...</p>
    </div>
  `
  try {
    const { plano } = await api('/plano')
    document.getElementById('plano-conteudo').innerHTML = `<div class="plano-texto">${plano}</div>`
  } catch {
    document.getElementById('plano-conteudo').innerHTML = `<div class="plano-texto">❌ Erro ao gerar plano. Tente novamente.</div>`
  }
}

// ── START ──
init()
