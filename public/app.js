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

// ── UPLOAD / ANÁLISE DE ARQUIVO ──
let uploadTabAtual = 'imagem'
let arquivosSelecionados = []
let csvSelecionado = null
let analiseResultados = []
let csvRegistros = null

function abrirUpload() {
  arquivosSelecionados = []
  csvSelecionado = null
  document.getElementById('up-lista-arquivos').innerHTML = ''
  document.getElementById('up-csv-nome').style.display = 'none'
  document.getElementById('up-arquivo').value = ''
  document.getElementById('up-csv').value = ''

  const usuarios = USUARIOS_CACHE.length ? USUARIOS_CACHE : [usuario]
  const opts = usuarios.map(u => `<option value="${u.id}"${u.id === usuario.id ? ' selected' : ''}>${u.nome}</option>`).join('')
  document.getElementById('up-usuario').innerHTML = opts
  document.getElementById('up-csv-usuario').innerHTML = opts

  selUploadTab(document.querySelector('.utab'), 'imagem')
  document.getElementById('modal-upload').style.display = 'flex'
}

function selUploadTab(btn, tab) {
  uploadTabAtual = tab
  document.querySelectorAll('.utab').forEach(b => b.classList.remove('sel'))
  btn.classList.add('sel')
  document.getElementById('up-painel-imagem').style.display = tab === 'imagem' ? 'block' : 'none'
  document.getElementById('up-painel-csv').style.display = tab === 'csv' ? 'block' : 'none'
  const btnEnviar = document.getElementById('up-btn-enviar')
  btnEnviar.textContent = tab === 'imagem' ? '🔍 Analisar com IA' : '📊 Processar CSV'
}

function renderListaArquivos() {
  const el = document.getElementById('up-lista-arquivos')
  if (!arquivosSelecionados.length) { el.innerHTML = ''; return }
  el.innerHTML = arquivosSelecionados.map((f, i) => `
    <div class="up-arquivo-item">
      <span>${f.type === 'application/pdf' ? '📄' : '🖼️'} ${f.name}</span>
      <span class="up-arquivo-kb">${(f.size/1024).toFixed(0)} KB</span>
      <button onclick="removerArquivo(${i})">✕</button>
    </div>
  `).join('')
  const btnEnviar = document.getElementById('up-btn-enviar')
  btnEnviar.textContent = `🔍 Analisar ${arquivosSelecionados.length} arquivo${arquivosSelecionados.length > 1 ? 's' : ''}`
}

function removerArquivo(i) {
  arquivosSelecionados.splice(i, 1)
  renderListaArquivos()
}

function handleArquivoSelect(input) {
  const novos = Array.from(input.files || [])
  for (const f of novos) {
    if (arquivosSelecionados.length >= 6) { toast('Máximo de 6 arquivos por vez', 'erro'); break }
    arquivosSelecionados.push(f)
  }
  renderListaArquivos()
}

function handleCSVSelect(input) {
  if (!input.files[0]) return
  csvSelecionado = input.files[0]
  const el = document.getElementById('up-csv-nome')
  el.textContent = `📎 ${csvSelecionado.name}`
  el.style.display = 'block'
}

function handleArquivoDrop(event) {
  const novos = Array.from(event.dataTransfer.files || [])
  for (const f of novos) {
    if (arquivosSelecionados.length >= 6) { toast('Máximo de 6 arquivos por vez', 'erro'); break }
    arquivosSelecionados.push(f)
  }
  renderListaArquivos()
}

async function enviarUpload() {
  if (uploadTabAtual === 'imagem') {
    if (!arquivosSelecionados.length) { toast('Selecione pelo menos um arquivo!', 'erro'); return }
    await processarImagem()
  } else {
    if (!csvSelecionado) { toast('Selecione um arquivo CSV!', 'erro'); return }
    await processarCSV()
  }
}

async function processarImagem() {
  const btn = document.getElementById('up-btn-enviar')
  btn.disabled = true
  const n = arquivosSelecionados.length
  btn.textContent = `⏳ Analisando ${n} arquivo${n > 1 ? 's' : ''}...`

  try {
    const formData = new FormData()
    arquivosSelecionados.forEach(f => formData.append('arquivos', f))

    const res = await fetch('/api/analisar-arquivo', { method: 'POST', body: formData })
    const data = await res.json()
    if (!res.ok) throw new Error(data.erro || 'Erro na análise')

    analiseResultados = data.resultados || []
    fecharModal('modal-upload')
    mostrarResultadosAnalise(analiseResultados)
  } catch (e) {
    toast('❌ ' + e.message, 'erro')
  } finally {
    btn.disabled = false
    renderListaArquivos()
  }
}

async function processarCSV() {
  const btn = document.getElementById('up-btn-enviar')
  btn.disabled = true
  btn.textContent = '⏳ Processando...'

  try {
    const formData = new FormData()
    formData.append('arquivo', csvSelecionado)

    const res = await fetch('/api/importar-csv', { method: 'POST', body: formData })
    const data = await res.json()
    if (!res.ok) throw new Error(data.erro || 'Erro ao processar CSV')

    csvRegistros = data.registros
    fecharModal('modal-upload')
    mostrarResultadoCSV(data)
  } catch (e) {
    toast('❌ ' + e.message, 'erro')
  } finally {
    btn.disabled = false
    btn.textContent = '📊 Processar CSV'
  }
}

// Renderiza múltiplos resultados (um card por arquivo analisado)
async function mostrarResultadosAnalise(resultados) {
  const modal = document.getElementById('modal-resultado-upload')
  const titulo = document.getElementById('res-titulo')
  const conteudo = document.getElementById('res-conteudo')
  const btns = document.getElementById('res-btns')
  const usuarioId = parseInt(document.getElementById('up-usuario').value)

  titulo.textContent = `📊 ${resultados.length} arquivo${resultados.length > 1 ? 's' : ''} analisado${resultados.length > 1 ? 's' : ''}`

  // Carrega contas e cartões para os selects
  const [contas, cartoes] = await Promise.all([api('/contas').catch(() => []), api('/cartoes').catch(() => [])])

  conteudo.innerHTML = resultados.map((data, idx) => renderCardResultado(data, idx, contas, cartoes)).join('')

  btns.innerHTML = `
    <button class="btn-cancel" onclick="fecharModal('modal-resultado-upload')">Cancelar</button>
    <button class="btn-confirm btn-verde" onclick="aplicarTodosResultados(${usuarioId})">✅ Aplicar todos</button>
  `
  modal.style.display = 'flex'
}

function renderCardResultado(data, idx, contas, cartoes) {
  if (data.tipo === 'erro') {
    return `<div class="res-card-bloco erro-bloco">❌ Arquivo ${idx+1}: ${data.mensagem || 'Não foi possível analisar'}</div>`
  }

  if (data.tipo === 'extrato') {
    const optsContas = `<option value="">— Criar nova conta —</option>` +
      contas.map(c => {
        const sel = (c.banco||c.nome).toLowerCase().includes((data.banco||'').toLowerCase()) ? ' selected' : ''
        return `<option value="${c.id}"${sel}>${c.nome} (${fmt(c.saldo)})</option>`
      }).join('')
    return `
      <div class="res-card-bloco">
        <div class="res-card-label">🏦 Arquivo ${idx+1} — Extrato Bancário</div>
        <div class="res-info-card">
          <div class="res-info-row"><span>Banco</span><strong>${data.banco||'—'}</strong></div>
          <div class="res-info-row res-destaque"><span>Saldo detectado</span><strong class="verde">${fmt(data.saldo||0)}</strong></div>
          ${data.transacoes?.length ? `<div class="res-info-row"><span>Transações</span><strong>${data.transacoes.length}</strong></div>` : ''}
        </div>
        ${data.transacoes?.slice(0,3).map(t => `
          <div class="res-tx-item ${t.tipo_tx}">
            <span class="res-tx-desc">${t.descricao}</span>
            <span class="res-tx-val">${t.tipo_tx==='debito'?'-':'+'}${fmt(t.valor)}</span>
          </div>`).join('')||''}
        ${(data.transacoes?.length||0) > 3 ? `<div class="res-mais">+ ${data.transacoes.length-3} transações...</div>` : ''}
        <label class="input-label" style="margin-top:10px">Conta para atualizar:</label>
        <select class="select-input res-conta-sel" data-idx="${idx}">${optsContas}</select>
      </div>`
  }

  if (data.tipo === 'fatura_cartao') {
    const parcelas = (data.itens||[]).filter(i=>i.total_parcelas>1)
    const simples = (data.itens||[]).filter(i=>i.total_parcelas<=1)
    const optsCartoes = `<option value="">— Não atualizar cartão —</option>` +
      cartoes.map(c => {
        const sel = c.nome.toLowerCase().includes((data.banco||'').toLowerCase()) ? ' selected' : ''
        return `<option value="${c.id}"${sel}>${c.nome} (fatura: ${fmt(c.gasto_atual)})</option>`
      }).join('')
    return `
      <div class="res-card-bloco">
        <div class="res-card-label">💳 Arquivo ${idx+1} — Fatura de Cartão</div>
        <div class="res-info-card">
          <div class="res-info-row"><span>Banco / Cartão</span><strong>${data.banco||'—'}</strong></div>
          <div class="res-info-row"><span>Vencimento</span><strong>${data.vencimento?new Date(data.vencimento+'T00:00:00').toLocaleDateString('pt-BR'):'—'}</strong></div>
          <div class="res-info-row res-destaque"><span>Total da fatura</span><strong class="vermelho">${fmt(data.valor_total||0)}</strong></div>
          ${parcelas.length ? `<div class="res-info-row"><span>🔄 Parceladas</span><strong>${parcelas.length} compra(s)</strong></div>` : ''}
          ${simples.length ? `<div class="res-info-row"><span>📋 Avulsas</span><strong>${simples.length} compra(s)</strong></div>` : ''}
        </div>
        ${[...parcelas.slice(0,2), ...simples.slice(0,2)].map(i => `
          <div class="res-tx-item debito">
            <span class="res-tx-desc">${i.descricao}${i.total_parcelas>1?` <em>(${i.parcela_atual}/${i.total_parcelas})</em>`:''}</span>
            <span class="res-tx-val">${fmt(i.valor)}${i.total_parcelas>1?'/mês':''}</span>
          </div>`).join('')}
        ${(data.itens?.length||0) > 4 ? `<div class="res-mais">+ ${data.itens.length-4} itens...</div>` : ''}
        <label class="input-label" style="margin-top:10px">Cartão para atualizar:</label>
        <select class="select-input res-cartao-sel" data-idx="${idx}">${optsCartoes}</select>
      </div>`
  }

  if (data.tipo === 'contrato') {
    const SUBTIPO_EMOJI = { emprestimo: '💸', casa: '🏠', carro: '🚗', outro: '📦' }
    const SUBTIPO_LABEL = { emprestimo: 'Empréstimo Pessoal', casa: 'Financiamento Casa', carro: 'Financiamento Carro', outro: 'Outra Dívida' }
    const emoji = SUBTIPO_EMOJI[data.subtipo] || '💸'
    const label = SUBTIPO_LABEL[data.subtipo] || 'Dívida'
    const pagas = data.parcelas_pagas || 0
    const total = data.total_parcelas || 1
    const restante = (data.valor_total || 0) - (data.valor_pago || 0)
    return `
      <div class="res-card-bloco" style="border-left-color:#7c3aed">
        <div class="res-card-label">${emoji} Arquivo ${idx+1} — ${label}</div>
        <div class="res-info-card">
          <div class="res-info-row"><span>Credor / Banco</span><strong>${data.credor||'—'}</strong></div>
          <div class="res-info-row"><span>Descrição</span><strong>${data.descricao||'—'}</strong></div>
          <div class="res-info-row"><span>Valor total</span><strong>${fmt(data.valor_total||0)}</strong></div>
          <div class="res-info-row"><span>Parcela mensal</span><strong>${fmt(data.parcela_mensal||0)}</strong></div>
          <div class="res-info-row"><span>Parcelas</span><strong>${pagas > 0 ? `${pagas} pagas de ${total}` : `${total} no total`}</strong></div>
          ${data.taxa_juros ? `<div class="res-info-row"><span>Taxa de juros</span><strong>${data.taxa_juros}% a.m.</strong></div>` : ''}
          <div class="res-info-row res-destaque"><span>Saldo devedor</span><strong class="vermelho">${fmt(restante)}</strong></div>
          ${data.data_vencimento ? `<div class="res-info-row"><span>Próximo vencimento</span><strong>${new Date(data.data_vencimento+'T00:00:00').toLocaleDateString('pt-BR')}</strong></div>` : ''}
        </div>
      </div>`
  }

  return `<div class="res-card-bloco">❓ Arquivo ${idx+1}: tipo não reconhecido</div>`
}

async function aplicarTodosResultados(usuarioId) {
  let totalAplicados = 0, totalDuplicatas = 0
  const erros = []

  for (let i = 0; i < analiseResultados.length; i++) {
    const analise = analiseResultados[i]
    if (analise.tipo === 'erro') continue

    const cartaoSel = document.querySelector(`.res-cartao-sel[data-idx="${i}"]`)
    const contaSel = document.querySelector(`.res-conta-sel[data-idx="${i}"]`)
    const cartaoId = cartaoSel?.value || null
    const contaId = contaSel?.value || null

    try {
      const res = await api('/aplicar-analise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuarioId, analise, cartaoId, contaId })
      })
      totalAplicados += res.aplicados || 0
      totalDuplicatas += res.duplicatas || 0
    } catch (e) {
      erros.push(`Arquivo ${i+1}: ${e.message}`)
    }
  }

  fecharModal('modal-resultado-upload')
  const dupMsg = totalDuplicatas > 0 ? ` (${totalDuplicatas} duplicata${totalDuplicatas>1?'s':''} ignorada${totalDuplicatas>1?'s':''})` : ''
  if (erros.length) toast(`⚠️ ${totalAplicados} item(s) importado(s)${dupMsg}. ${erros.length} erro(s).`, 'erro')
  else toast(`✅ ${totalAplicados} item(s) importado(s)!${dupMsg}`)
  carregarInicio()
  carregarCartoes()
}

function mostrarResultadoCSV(data) {
  const modal = document.getElementById('modal-resultado-upload')
  const titulo = document.getElementById('res-titulo')
  const conteudo = document.getElementById('res-conteudo')
  const btns = document.getElementById('res-btns')
  const usuarioId = parseInt(document.getElementById('up-csv-usuario').value)

  titulo.textContent = '📄 CSV Pronto para Importar'

  conteudo.innerHTML = `
    <div class="res-info-card">
      <div class="res-info-row"><span>Total de lançamentos</span><strong>${data.total}</strong></div>
      <div class="res-info-row"><span class="verde">Receitas</span><strong class="verde">${data.receitas}</strong></div>
      <div class="res-info-row"><span class="vermelho">Despesas</span><strong class="vermelho">${data.despesas}</strong></div>
    </div>
    <div class="res-secao-titulo">👀 Prévia (5 primeiros)</div>
    <div class="res-lista">
      ${(data.preview || []).map(r => `
        <div class="res-tx-item ${r.tipo === 'receita' ? 'credito' : 'debito'}">
          <span class="res-tx-desc">${r.descricao}</span>
          <span class="res-tx-val">${r.tipo === 'receita' ? '+' : '-'}${fmt(r.valor)}</span>
        </div>`).join('')}
    </div>
  `

  btns.innerHTML = `
    <button class="btn-cancel" onclick="fecharModal('modal-resultado-upload')">Cancelar</button>
    <button class="btn-confirm btn-verde" onclick="confirmarImportacaoCSV(${usuarioId})">✅ Importar ${data.total} lançamentos</button>
  `
  modal.style.display = 'flex'
}

async function confirmarImportacaoCSV(usuarioId) {
  if (!csvRegistros?.length) return
  try {
    const res = await api('/importar-csv/confirmar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuarioId, registros: csvRegistros })
    })
    fecharModal('modal-resultado-upload')
    toast(`✅ ${res.total} lançamentos importados! (${res.gastos} gastos · ${res.receitas} receitas)`)
    carregarInicio()
  } catch (e) {
    toast('❌ Erro ao importar: ' + e.message, 'erro')
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

// ── FERRAMENTAS ──
function abrirMenuFerramentas() {
  document.getElementById('modal-ferramentas').style.display = 'flex'
}

// ── EXPORTAÇÃO ──
function exportarCSV() {
  const now = new Date()
  const mes = now.getMonth() + 1
  const ano = now.getFullYear()
  window.location.href = `/api/exportar/csv?mes=${mes}&ano=${ano}`
  toast('📥 Download do CSV iniciado!')
}

async function abrirRelatorioHTML() {
  const now = new Date()
  const mes = now.getMonth() + 1
  const ano = now.getFullYear()
  toast('⏳ Gerando relatório...')
  try {
    const { gastos, receitas, resumo } = await api(`/exportar/dados?mes=${mes}&ano=${ano}`)
    const nomeMes = now.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })
    const totalReceitas = receitas.reduce((a, r) => a + r.valor, 0) + (resumo.salarioTotal || 0)
    const totalGastos = gastos.reduce((a, g) => a + g.valor, 0)
    const resultado = totalReceitas - totalGastos

    const catMap = {}
    for (const g of gastos) {
      catMap[g.categoria] = (catMap[g.categoria] || 0) + g.valor
    }
    const cats = Object.entries(catMap).sort((a,b) => b[1]-a[1])

    const html = `<!DOCTYPE html><html lang="pt-BR"><head>
      <meta charset="UTF-8"><title>Relatório ${nomeMes}</title>
      <style>
        body{font-family:system-ui,sans-serif;max-width:800px;margin:0 auto;padding:24px;color:#1e293b}
        h1{font-size:1.5rem;margin-bottom:4px}
        .sub{color:#64748b;font-size:.9rem;margin-bottom:24px}
        .cards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px}
        .card{background:#f8fafc;border-radius:12px;padding:16px;border-top:4px solid #2563eb}
        .card.verde{border-color:#16a34a}.card.vermelho{border-color:#dc2626}
        .card-label{font-size:.7rem;color:#64748b;text-transform:uppercase;margin-bottom:6px}
        .card-val{font-size:1.3rem;font-weight:800}
        table{width:100%;border-collapse:collapse;font-size:.85rem;margin-top:12px}
        th{background:#f1f5f9;padding:8px 10px;text-align:left;font-size:.75rem;color:#64748b;text-transform:uppercase}
        td{padding:8px 10px;border-bottom:1px solid #f1f5f9}
        tr:hover td{background:#fafafa}
        .tag{display:inline-block;padding:2px 8px;border-radius:20px;font-size:.7rem;font-weight:600}
        .tag.receita{background:#dcfce7;color:#16a34a}.tag.despesa{background:#fee2e2;color:#dc2626}
        h2{margin:24px 0 10px;font-size:1.1rem;color:#334155}
        @media print{body{padding:0}.no-print{display:none}}
      </style>
    </head><body>
      <div class="no-print" style="margin-bottom:16px">
        <button onclick="window.print()" style="padding:8px 16px;background:#2563eb;color:#fff;border:none;border-radius:8px;cursor:pointer;margin-right:8px">🖨️ Imprimir / Salvar PDF</button>
        <button onclick="window.close()" style="padding:8px 16px;background:#f1f5f9;border:none;border-radius:8px;cursor:pointer">Fechar</button>
      </div>
      <h1>💰 Relatório Financeiro</h1>
      <div class="sub">FinançasFamília · ${nomeMes.charAt(0).toUpperCase()+nomeMes.slice(1)}</div>
      <div class="cards">
        <div class="card verde"><div class="card-label">Renda Total</div><div class="card-val" style="color:#16a34a">R$ ${totalReceitas.toFixed(2).replace('.',',')}</div></div>
        <div class="card vermelho"><div class="card-label">Total Gastos</div><div class="card-val" style="color:#dc2626">R$ ${totalGastos.toFixed(2).replace('.',',')}</div></div>
        <div class="card"><div class="card-label">Resultado</div><div class="card-val" style="color:${resultado>=0?'#16a34a':'#dc2626'}">${resultado>=0?'+':''}R$ ${resultado.toFixed(2).replace('.',',')}</div></div>
      </div>
      ${cats.length ? `<h2>📊 Por Categoria</h2><table><tr><th>Categoria</th><th>Total</th><th>% da renda</th></tr>
        ${cats.map(([cat,val]) => `<tr><td>${cat}</td><td>R$ ${val.toFixed(2).replace('.',',')}</td><td>${totalReceitas>0?((val/totalReceitas)*100).toFixed(1):0}%</td></tr>`).join('')}
      </table>` : ''}
      <h2>📋 Lançamentos</h2>
      <table>
        <tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Valor</th><th>Tipo</th><th>Pessoa</th></tr>
        ${receitas.map(r => `<tr><td>${r.data_receita}</td><td>${r.descricao}</td><td>Receita</td><td style="color:#16a34a">+R$ ${Number(r.valor).toFixed(2).replace('.',',')}</td><td><span class="tag receita">Entrada</span></td><td>${r.usuario_nome}</td></tr>`).join('')}
        ${gastos.map(g => `<tr><td>${g.data_gasto}</td><td>${g.descricao}</td><td>${g.categoria}</td><td style="color:#dc2626">-R$ ${Number(g.valor).toFixed(2).replace('.',',')}</td><td><span class="tag despesa">Gasto</span></td><td>${g.usuario_nome}</td></tr>`).join('')}
      </table>
      <div style="margin-top:32px;font-size:.75rem;color:#94a3b8;text-align:center">Gerado pelo FinançasFamília · ${new Date().toLocaleString('pt-BR')}</div>
    </body></html>`

    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
  } catch (e) {
    toast('❌ Erro ao gerar relatório: ' + e.message, 'erro')
  }
}

async function abrirHistoricoImportacoes() {
  const modal = document.getElementById('modal-resultado-upload')
  const titulo = document.getElementById('res-titulo')
  const conteudo = document.getElementById('res-conteudo')
  const btns = document.getElementById('res-btns')

  titulo.textContent = '📥 Histórico de Importações'
  conteudo.innerHTML = '<div class="plano-loading"><div class="spinner"></div><p>Carregando...</p></div>'
  btns.innerHTML = `<button class="btn-confirm" onclick="fecharModal('modal-resultado-upload')">Fechar</button>`
  modal.style.display = 'flex'

  try {
    const lista = await api(`/importacoes?usuarioId=${usuario.id}`)
    if (!lista.length) {
      conteudo.innerHTML = `<p class="res-desc" style="text-align:center;padding:24px">Nenhuma importação realizada ainda.</p>`
      return
    }
    const TIPO_LABEL = { csv: '📄 CSV', imagem_extrato: '🏦 Extrato', imagem_fatura: '💳 Fatura' }
    conteudo.innerHTML = lista.map(imp => {
      const data = new Date(imp.criado_em).toLocaleString('pt-BR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })
      const dup = imp.duplicatas_ignoradas > 0 ? ` · ${imp.duplicatas_ignoradas} dup.` : ''
      return `<div class="res-info-row" style="padding:10px 0">
        <span>${TIPO_LABEL[imp.tipo]||'📥'} <strong>${imp.descricao||imp.tipo}</strong><br><small style="color:#94a3b8">${data}</small></span>
        <span style="text-align:right"><strong>${imp.qtd_registros}</strong> registros${dup}</span>
      </div>`
    }).join('')
  } catch (e) {
    conteudo.innerHTML = `<p class="res-desc">Erro ao carregar: ${e.message}</p>`
  }
}

// ── START ──
init()
