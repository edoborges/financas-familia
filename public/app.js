// ═══════════════════════════════════
//  FinançasFamília — App.js
// ═══════════════════════════════════
let usuario = null
let graficoInstance = null
let metaEmojiSel = '🎯'
let receitaTipoSel = 'Atendimento'
let adminVisualizandoFamiliaId = null  // quando super_admin está vendo uma família
// 'pessoal' | 'consolidado'. Guardada por usuário (no computador compartilhado, a escolha
// de um não muda a do outro). Sempre começa em 'pessoal' até a pessoa escolher Família.
let visaoAtual = 'pessoal'
const chaveVisao = () => 'fin_visao_' + (usuario?.id || 'x')
function carregarVisao() {
  try { visaoAtual = localStorage.getItem(chaveVisao()) === 'consolidado' ? 'consolidado' : 'pessoal' } catch(e) { visaoAtual = 'pessoal' }
}

// Retorna o familiaId ativo: da família que o admin está visualizando, ou do próprio usuário
function famId() {
  if (adminVisualizandoFamiliaId) return adminVisualizandoFamiliaId
  return usuario?.familia_id || null
}

// Retorna o usuarioId quando na visão pessoal (admin visualizando = sem filtro pessoal)
function usuIdFiltro() {
  if (adminVisualizandoFamiliaId) return null // admin vê tudo da família
  if (visaoAtual === 'pessoal') return usuario?.id || null
  return null
}

function famQ() {
  const parts = []
  const f = famId()
  if (f) parts.push('familiaId=' + f)
  const u = usuIdFiltro()
  if (u) parts.push('usuarioId=' + u)
  return parts.length ? '?' + parts.join('&') : ''
}
function famQAnd() {
  const parts = []
  const f = famId()
  if (f) parts.push('familiaId=' + f)
  const u = usuIdFiltro()
  if (u) parts.push('usuarioId=' + u)
  return parts.length ? '&' + parts.join('&') : ''
}

// Toggle pessoal ↔ consolidado
function toggleVisao() {
  visaoAtual = visaoAtual === 'pessoal' ? 'consolidado' : 'pessoal'
  try { localStorage.setItem(chaveVisao(), visaoAtual) } catch(e) {}
  atualizarBadgeVisao()
  carregarInicio()
}
// Chave com as duas opções à vista; a ativa fica destacada.
function atualizarBadgeVisao() {
  const badge = document.getElementById('b-visao-badge')
  const btnH = document.getElementById('btn-visao')
  if (!badge) return
  const eu = visaoAtual === 'pessoal'
  badge.className = 'visao-seg'
  badge.title = eu ? 'Mostrando só os seus dados. Toque para ver a família.' : 'Mostrando a família toda. Toque para ver só os seus.'
  badge.innerHTML = `<span class="${eu ? 'on' : ''}">👤 Só eu</span><span class="${eu ? '' : 'on'}">👨‍👩‍👧 Família</span>`
  if (btnH) {
    btnH.textContent = eu ? '👤' : '👨‍👩‍👧'
    btnH.title = badge.title
  }
}

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
// Uma cor por categoria, usada no calendário, na pizza e nas barras de orçamento.
const COR_CAT = {
  'Alimentação':'#f97316','Mercado':'#84cc16','Saúde':'#ef4444','Farmácia':'#f43f5e',
  'Transporte':'#3b82f6','Combustível':'#0ea5e9','Educação':'#8b5cf6','Lazer':'#ec4899',
  'Vestuário':'#d946ef','Casa':'#a16207','Financiamento':'#64748b','Assinatura':'#6366f1',
  'Restaurante':'#f59e0b','Outros':'#94a3b8','Fatura':'#475569'
}
const corCat = c => COR_CAT[c] || '#94a3b8'
const fmt =v => 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})

// Converte valor digitado em formato brasileiro (1.500,00 ou 1500,50 ou 1500.50) para número
function parseBRL(str) {
  if (!str) return 0
  const s = String(str).trim()
    .replace(/[R$\s]/g, '')   // remove R$ e espaços
    .replace(/\./g, '')        // remove pontos de milhar
    .replace(',', '.')         // troca vírgula decimal por ponto
  return parseFloat(s) || 0
}
// Token de sessão recebido no login; vai em todo pedido para o servidor.
const lerToken = () => { try { return localStorage.getItem('fin_token') } catch(e) { return null } }
const comToken = (headers = {}) => {
  const t = lerToken()
  return t ? { ...headers, Authorization: 'Bearer ' + t } : headers
}
let _sessaoCaiu = false
function sessaoExpirada() {
  if (_sessaoCaiu) return
  _sessaoCaiu = true
  try { localStorage.removeItem('fin_usuario'); localStorage.removeItem('fin_token') } catch(e) {}
  alert('Sua sessão expirou. Entre de novo com seu PIN.')
  location.reload()
}

const api = async (url, opts = {}) => {
  const r = await fetch('/api' + url, { ...opts, headers: comToken(opts.headers) })
  const data = await r.json().catch(() => ({ erro: `HTTP ${r.status}` }))
  if (r.status === 401 && url !== '/login') sessaoExpirada()
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
  // Login feito antes da tranca não tem token: precisa entrar de novo uma vez.
  if (salvo && !lerToken()) localStorage.removeItem('fin_usuario')
  else if (salvo) {
    try {
      usuario = JSON.parse(salvo)
      usuario.id = Number(usuario.id)
      // Admin com login salvo volta para o painel dele, como logo após digitar o PIN.
      if (usuario.role === 'super_admin') {
        show('app')
        mostrarPainelAdmin()
      } else {
        mostrarApp()
      }
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

  await api('/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({usuarios:[
    {nome:n1,salario:s1,telefone:c1,pin:p1},
    {nome:n2,salario:s2,telefone:c2,pin:p2}
  ]})})

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
    const { token, ...dados } = res
    usuario = { ...dados, id: Number(dados.id) }
    localStorage.setItem('fin_token', token)
    localStorage.setItem('fin_usuario', JSON.stringify(usuario))
    if (usuario.role === 'super_admin') {
      show('app')
      mostrarPainelAdmin()
    } else {
      mostrarApp()
    }
  } catch(e) {
    pinAtual = ''
    atualizarPinDots()
    if (e.status === 401) {
      // PIN errado: chacoalha as bolinhas.
      document.getElementById('pin-erro').style.display = 'block'
      const dots = document.getElementById('pin-dots')
      dots.classList.remove('shake')
      void dots.offsetWidth
      dots.classList.add('shake')
    } else if (e.status === 429) {
      alert(e.message)
    } else {
      alert('Erro de conexão. Tente novamente.')
    }
  }
}

async function sair() {
  try { await api('/logout', { method: 'POST' }) } catch(e) {}
  localStorage.removeItem('fin_usuario')
  localStorage.removeItem('fin_token')
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
  carregarVisao()
  show('app')
  document.getElementById('painel-admin').style.display = 'none'
  document.getElementById('app-main').style.display = ''
  document.getElementById('app-nav').style.display = ''
  document.getElementById('admin-voltar-banner').style.display = adminVisualizandoFamiliaId ? 'flex' : 'none'
  const usuarios = await api('/usuarios')
  const idx = usuarios.findIndex(u => u.id === usuario.id)
  document.getElementById('h-avatar').textContent = AVATARES[idx] || '👤'
  document.getElementById('h-saudacao').textContent = SAUDACOES() + ','
  document.getElementById('h-nome').textContent = usuario.nome + ' ✏️'

  carregarInicio()
  processarRecorrentesAuto()
  sincronizarPush()
  tratarLinkInicial()
  addMsgBot(`${SAUDACOES()}, ${usuario.nome}! 👋\n\nDigite um gasto aqui. Exemplos:\n• "Mercado R$150"\n• "Gasolina R$80 débito"\n• "Farmácia R$45 Nubank"\n\nOu mande "ajuda" para ver todos os comandos.`)
}

// ── INÍCIO ──
async function carregarInicio() {
  try {
    atualizarBadgeVisao()
    renderSkeletonInicio()
    const [resumo, gastos, orcs, cats] = await Promise.all([
      api('/resumo' + famQ()),
      api('/gastos/recentes' + famQ()),
      api('/orcamentos' + famQ()),
      api('/gastos/categorias' + famQ())
    ])

    // Balance
    const rendaTotal = resumo.rendaTotal || resumo.salarioTotal || 0
    const resultado = rendaTotal - (resumo.gastosMes || 0)
    const pct = rendaTotal > 0 ? (((resumo.gastosMes||0)/rendaTotal)*100).toFixed(0) : 0
    const positivo = resultado >= 0

    // Número principal: resultado do mês (+ ou -)
    const saldoEl = document.getElementById('b-saldo')
    saldoEl.textContent = (positivo ? '+' : '') + fmt(resultado)
    saldoEl.style.color = positivo ? '#4ade80' : '#f87171'

    // Label contextual — menciona visão
    const visaoLabel = visaoAtual === 'pessoal' ? 'seus dados' : 'dados da família'
    document.getElementById('b-resultado-label').textContent =
      rendaTotal === 0
        ? '⚙️ Configure suas rendas programadas'
        : positivo ? `✅ Economizando (${visaoLabel})` : `⚠️ Acima da renda (${visaoLabel})`

    const rendaLabel = resumo.rendaProgramada > 0 ? 'Entradas prev.' : 'Entradas do mês'
    const rendaLabelEl = document.getElementById('b-renda-label')
    if (rendaLabelEl) rendaLabelEl.textContent = rendaLabel
    document.getElementById('b-renda').textContent = fmt(rendaTotal)
    document.getElementById('b-gastos').textContent = fmt(resumo.gastosMes || 0)
    document.getElementById('b-contas').textContent = fmt(resumo.saldoContas || 0)
    document.getElementById('b-mes').textContent = new Date().toLocaleString('pt-BR',{month:'long',year:'numeric'})
    const alertaPct = pct > 80 ? `<span class="badge-alerta">⚠️ ${pct}% usado</span>` : `<span style="color:#4ade80">✓ ${pct}% usado</span>`
    const dividas = (resumo.totalEmDividas || 0) > 0 ? `<span class="badge-alerta">💸 Dívidas: ${fmt(resumo.totalEmDividas)}</span>` : ''
    document.getElementById('b-alerta').innerHTML = alertaPct + ' ' + dividas

    // Score de saúde financeira
    const score = calcularScore(resumo, orcs, cats)
    renderScoreCard(score)

    // Meta de renda e contas a pagar
    renderMetaRendaCard()
    renderContasPagar()

    // Patrimônio líquido
    renderPatrimonio(resumo)

    // Orçamentos
    renderOrcamentosSecao()

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
    const [alertas, projecao] = await Promise.all([api('/alertas' + famQ()), api('/projecao' + famQ())])
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

// Mês escolhido no relatório para "por categoria", maiores saídas e comparativo.
let relMes = null, relAno = null

async function abrirRelatorio() {
  const now = new Date()
  relMes = now.getMonth() + 1
  relAno = now.getFullYear()
  document.getElementById('modal-relatorio').style.display = 'flex'
  await renderRelatorio()
}

function navegarRelatorio(delta) {
  relMes += delta
  if (relMes > 12) { relMes = 1; relAno++ }
  if (relMes < 1) { relMes = 12; relAno-- }
  renderRelatorio()
}

async function renderRelatorio() {
  document.getElementById('relatorio-conteudo').innerHTML =
    '<div class="plano-loading"><div class="spinner"></div><p>Carregando...</p></div>'

  // Mês anterior ao escolhido, para o comparativo
  const mesPrev = relMes === 1 ? 12 : relMes - 1
  const anoPrev = relMes === 1 ? relAno - 1 : relAno
  const now = new Date()
  const ehMesAtual = relMes === now.getMonth() + 1 && relAno === now.getFullYear()

  const [gastosEv, receitasEv, cats, catsPrev, gastosDoMes] = await Promise.all([
    api('/gastos/evolucao' + famQ()),
    api('/receitas/evolucao' + famQ()),
    api(`/gastos/categorias?mes=${relMes}&ano=${relAno}${famQAnd()}`),
    api(`/gastos/categorias?mes=${mesPrev}&ano=${anoPrev}${famQAnd()}`),
    api(`/gastos?mes=${relMes}&ano=${relAno}${famQAnd()}`)
  ])
  const maioresSaidas = (gastosDoMes || []).slice().sort((a, b) => b.valor - a.valor).slice(0, 5)

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

  const nomeMesPrev = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][mesPrev - 1]

  document.getElementById('relatorio-conteudo').innerHTML = `
    <div class="rel-secao">
      <div class="rel-titulo">Receitas vs Gastos — últimos 6 meses</div>
      <canvas id="chart-evolucao" style="max-height:220px"></canvas>
    </div>
    <div class="rel-secao">
      <div class="rel-titulo">Balanço mensal</div>
      <div id="rel-balanco" class="rel-balanco"></div>
    </div>
    <div class="rel-mes-nav">
      <button class="cal-nav" onclick="navegarRelatorio(-1)" aria-label="Mês anterior">‹</button>
      <div class="rel-mes-titulo">Para onde foi o dinheiro<b>${NOMES_MES[relMes - 1]} ${relAno}${ehMesAtual ? ' · mês atual' : ''}</b></div>
      <button class="cal-nav" onclick="navegarRelatorio(1)" aria-label="Próximo mês">›</button>
    </div>
    <div class="rel-secao">
      <div class="rel-titulo">Por categoria</div>
      ${cats.length ? `<canvas id="chart-cats" style="max-height:180px;margin-bottom:12px"></canvas>
      <div id="rel-cat-lista" class="cat-lista"></div>` : '<p style="color:#94a3b8;font-size:.88rem">Nenhum gasto lançado neste mês.</p>'}
    </div>
    <div class="rel-secao">
      <div class="rel-titulo">Maiores saídas</div>
      ${maioresSaidas.length ? maioresSaidas.map((g, i) => `
        <div class="rel-top-item">
          <span class="rel-top-pos">${i + 1}</span>
          <span class="rel-top-ico">${EMOJI_CAT[g.categoria] || '📦'}</span>
          <div class="rel-top-info">
            <div class="rel-top-desc">${g.descricao}</div>
            <div class="rel-top-meta"><i class="cal-dot" style="background:${corCat(g.categoria)}"></i> ${g.categoria} · ${String(g.data_gasto).slice(8, 10)}/${String(g.data_gasto).slice(5, 7)}${g.cartao_nome ? ' · 💳 ' + g.cartao_nome : ''}</div>
          </div>
          <b class="rel-top-val">${fmt(g.valor)}</b>
        </div>`).join('') : '<p style="color:#94a3b8;font-size:.88rem">Nenhuma saída neste mês.</p>'}
    </div>
    <div class="rel-secao" id="rel-comparativo-secao">
      <div class="rel-titulo">📊 Comparativo vs ${nomeMesPrev}</div>
      <div id="rel-comparativo" class="rel-comparativo"></div>
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
    const coresCat = cats.map(c => corCat(c.categoria))
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

  // Comparativo mês anterior
  renderComparativo(cats, catsPrev, nomeMesPrev)
}

function renderComparativo(cats, catsPrev, nomePrev) {
  const el = document.getElementById('rel-comparativo')
  if (!el) return
  if (!cats.length && !catsPrev.length) {
    el.innerHTML = '<p style="color:#94a3b8;font-size:.88rem">Sem dados para comparar.</p>'
    return
  }

  const prevMap = Object.fromEntries((catsPrev || []).map(c => [c.categoria, c.total]))
  const allCats = [...new Set([...cats.map(c => c.categoria), ...Object.keys(prevMap)])]

  el.innerHTML = allCats.map(cat => {
    const atual = (cats.find(c => c.categoria === cat)?.total) || 0
    const prev = prevMap[cat] || 0
    const diff = atual - prev
    const pctChange = prev > 0 ? ((diff / prev) * 100) : (atual > 0 ? 100 : 0)
    const subiu = diff > 0
    const estavel = Math.abs(pctChange) < 5
    const cor = estavel ? '#64748b' : subiu ? '#e11d48' : '#10b981'
    const seta = estavel ? '→' : subiu ? '↑' : '↓'
    const emoji = EMOJI_CAT[cat] || '📦'

    return `<div class="comp-item">
      <div class="comp-cat">${emoji} ${cat}</div>
      <div class="comp-valores">
        <span class="comp-prev">${fmt(prev)}</span>
        <span class="comp-seta" style="color:${cor}">${seta}</span>
        <span class="comp-atual">${fmt(atual)}</span>
      </div>
      <div class="comp-diff" style="color:${cor}">
        ${estavel ? '≈ sem mudança' : `${subiu ? '+' : ''}${fmt(diff)} (${subiu ? '+' : ''}${pctChange.toFixed(0)}%)`}
      </div>
    </div>`
  }).join('')
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

function txItemHTML(g) {
  const data = new Date(g.data_gasto+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})
  const cartao = g.cartao_nome ? ` · ${g.cartao_nome}` : ''
  const origemClass = g.origem === 'importado' ? ' tx-importado' : g.origem === 'recorrente' ? ' tx-recorrente' : ''
  return `
    <div class="tx-item${origemClass}" id="tx-${g.id}">
      <div class="tx-emoji">${EMOJI_CAT[g.categoria]||'📦'}</div>
      <div class="tx-info">
        <div class="tx-desc">${g.descricao}</div>
        <div class="tx-meta">${g.usuario_nome} · ${data}${cartao}</div>
      </div>
      <div class="tx-right">
        <div class="tx-valor">- ${fmt(g.valor)}</div>
        <button class="tx-del-btn" onclick="excluirGasto(${g.id})" title="Excluir">✕</button>
      </div>
    </div>`
}

function renderTransacoes(gastos) {
  const el = document.getElementById('inicio-transacoes')
  if (!gastos.length) {
    el.innerHTML = `<div class="tx-vazio">📭 Nenhum gasto ainda.<br>Lance pelo chat!</div>`
    return
  }
  el.innerHTML = gastos.map(txItemHTML).join('')
  setupSwipeItems()
}

async function excluirGasto(id) {
  if (!confirm('Excluir este lançamento?')) return
  try {
    await api(`/gastos/${id}`, { method: 'DELETE' })
    const el = document.getElementById(`tx-${id}`)
    if (el) { el.style.opacity = '0'; el.style.height = '0'; setTimeout(() => el.remove(), 250) }
    toast('🗑️ Lançamento removido')
    carregarInicio()
  } catch(e) {
    toast('❌ ' + e.message, 'erro')
  }
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
  renderPatrimonio()
  renderRecebiveis()
  const [metas, resumo] = await Promise.all([api('/metas' + famQ()), api('/resumo' + famQ())])

  // Resumo financeiro do planejamento. Usa a renda real do mês (programadas + lançadas),
  // a mesma do Início — salarioTotal é o campo legado do cadastro e costuma estar zerado.
  const renda = resumo.rendaTotal || 0
  const economia = renda - resumo.gastosMes
  document.getElementById('plan-resumo').innerHTML = `
    <div style="color:#e2e8f0;font-size:.8rem;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">💡 Visão do Planejamento</div>
    <div class="plan-resumo-grid">
      <div class="plan-item">
        <div class="plan-item-label">${visaoAtual === 'consolidado' ? 'Renda do casal' : 'Sua renda'}</div>
        <div class="plan-item-valor">${fmt(renda)}</div>
      </div>
      <div class="plan-item">
        <div class="plan-item-label">Gastos do mês</div>
        <div class="plan-item-valor">${fmt(resumo.gastosMes)}</div>
      </div>
      <div class="plan-item">
        <div class="plan-item-label">Economia possível</div>
        <div class="plan-item-valor" style="color:${economia >= 0 ? '#4ade80' : '#fb7185'}">${fmt(economia)}</div>
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
          <span>${faltam > 0 ? `Faltam: ${fmt(faltam)}` : '🎉 Meta alcançada'}</span>
        </div>
        <button class="meta-aporte-btn" onclick="abrirAporte(${JSON.stringify({ id: m.id, nome: m.nome, emoji: m.emoji, valor_atual: m.valor_atual, valor_alvo: m.valor_alvo }).replace(/"/g,'&quot;')})">💰 Aportar</button>
      </div>
    `
  }).join('')
}

// ── APORTE NA META ──
let aporteMeta = null, aporteTipo = 'guardar'

function abrirAporte(meta) {
  aporteMeta = meta
  document.getElementById('aporte-titulo').textContent = `${meta.emoji || '🎯'} ${meta.nome}`
  document.getElementById('aporte-info').textContent = `Guardado ${fmt(meta.valor_atual)} de ${fmt(meta.valor_alvo)}.`
  document.getElementById('aporte-valor').value = ''
  selAporteTipo('guardar')
  document.getElementById('modal-aporte').style.display = 'flex'
  document.getElementById('aporte-valor').focus()
}

function selAporteTipo(tipo) {
  aporteTipo = tipo
  document.getElementById('aporte-btn-guardar').classList.toggle('sel', tipo === 'guardar')
  document.getElementById('aporte-btn-retirar').classList.toggle('sel', tipo === 'retirar')
}

async function salvarAporte() {
  const valor = parseBRL(document.getElementById('aporte-valor').value)
  if (!valor || valor <= 0) { toast('Informe o valor!', 'erro'); return }
  const atual = Number(aporteMeta.valor_atual) || 0
  if (aporteTipo === 'retirar' && valor > atual) { toast(`Só há ${fmt(atual)} guardado nessa meta`, 'erro'); return }
  const novo = +(aporteTipo === 'guardar' ? atual + valor : atual - valor).toFixed(2)
  try {
    await api(`/metas/${aporteMeta.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ valorAtual: novo })
    })
    fecharModal('modal-aporte')
    const bateu = aporteTipo === 'guardar' && atual < aporteMeta.valor_alvo && novo >= aporteMeta.valor_alvo
    toast(bateu ? `🎉 Meta "${aporteMeta.nome}" alcançada!` : aporteTipo === 'guardar' ? `💰 ${fmt(valor)} guardados` : `➖ ${fmt(valor)} retirados`)
    carregarMetas()
  } catch(e) { toast('❌ ' + e.message, 'erro') }
}

// ── CARTÕES ──
async function carregarCartoes() {
  const [cartoes, cats] = await Promise.all([api('/cartoes' + famQ()), api('/gastos/categorias' + famQ())])

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
    const cores = cats.map(c => corCat(c.categoria))
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
  if (nome === 'agenda') carregarAgenda()
  if (nome === 'metas') carregarMetas()
  if (nome === 'cartoes') carregarCartoes()
  if (nome === 'contas') carregarContas()
  document.getElementById('app-main').scrollTop = 0
}

// ── ABA CONTAS ──
const TIPO_LABEL_CONTA = { corrente: 'Conta Corrente', poupanca: 'Poupança', investimento: 'Investimento', dinheiro: 'Carteira' }
const TIPO_ICONE_CONTA = { corrente: '🏦', poupanca: '🐷', investimento: '📈', dinheiro: '👛' }
const CORES_CONTA = ['#2563eb','#16a34a','#7c3aed','#d97706','#0891b2','#db2777']

async function carregarContas() {
  try {
    const [contas, gastos] = await Promise.all([api('/contas' + famQ()), api('/gastos/recentes' + famQ())])

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
      txEl.innerHTML = gastos.slice(0, 10).map(txItemHTML).join('')
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
    const contas = await api('/contas' + famQ())
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
    const contas = await api('/contas' + famQ())
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
    const cartoes = await api('/cartoes' + famQ())
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

    const res = await fetch('/api/analisar-arquivo', { method: 'POST', body: formData, headers: comToken() })
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

    const res = await fetch('/api/importar-csv', { method: 'POST', body: formData, headers: comToken() })
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
  const [contas, cartoes] = await Promise.all([api('/contas' + famQ()).catch(() => []), api('/cartoes' + famQ()).catch(() => [])])

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

// ── RENDAS PROGRAMADAS ──
let rendaTipoSel = 'mensal'

async function abrirModalRendas() {
  document.getElementById('renda-form').style.display = 'none'
  await carregarListaRendas()
  document.getElementById('modal-rendas').style.display = 'flex'
}

async function carregarListaRendas() {
  const fam = famId()
  const uid = usuario?.id
  const lista = await api(`/receitas-programadas${fam ? '?familiaId=' + fam : ''}`)
  const el = document.getElementById('rendas-lista')
  const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

  if (!lista.length) {
    el.innerHTML = '<p style="text-align:center;color:#888;font-size:13px;padding:12px">Nenhuma renda configurada ainda.<br>Clique em "+ Adicionar renda" abaixo.</p>'
    return
  }

  el.innerHTML = lista.map(r => {
    const ehMeu = r.usuario_id === uid
    const tipo_label = r.tipo === 'mensal' ? `Dia ${r.dia_mes || '—'} de cada mês`
      : r.tipo === 'semanal' ? `Toda ${DIAS_SEMANA[r.dia_semana ?? 1]}`
      : 'Quinzenal (2×/mês)'
    return `
      <div class="renda-item${ehMeu ? '' : ' renda-outro'}">
        <div class="renda-item-top">
          <span class="renda-item-desc">${r.descricao}</span>
          <span class="renda-item-val">${r.estimada ? '≈ ' : ''}${fmt(r.valor)}</span>
        </div>
        <div class="renda-item-bot">
          <span class="renda-item-tipo">${tipo_label}${r.estimada ? ' · <span class="tag-estimada">estimativa</span>' : ''}</span>
          ${r.usuario_nome ? `<span class="renda-item-user">👤 ${r.usuario_nome}</span>` : ''}
        </div>
        ${r.observacao ? `<div class="renda-item-obs">📝 ${r.observacao}</div>` : ''}
        ${ehMeu ? `
          <div class="renda-item-acoes">
            <button onclick="editarRenda(${JSON.stringify(r).replace(/"/g,'&quot;')})">✏️ Editar</button>
            <button class="btn-excluir" onclick="excluirRenda(${r.id})">🗑️ Excluir</button>
          </div>` : ''}
      </div>`
  }).join('')
}

function abrirFormRenda() {
  // limpa form para nova renda
  document.getElementById('rf-id').value = ''
  document.getElementById('rf-desc').value = ''
  document.getElementById('rf-valor').value = ''
  document.getElementById('rf-obs').value = ''
  document.getElementById('rf-dia-mes').value = ''
  document.getElementById('rf-dia-semana').value = '5'
  document.getElementById('rf-estimada').checked = false
  document.getElementById('renda-form-titulo').textContent = 'Nova renda'
  rendaTipoSel = 'mensal'
  document.querySelectorAll('#renda-form .rtipo-btn').forEach((b,i) => b.classList.toggle('sel', i===0))
  document.getElementById('rf-campo-dia-mes').style.display = ''
  document.getElementById('rf-campo-dia-semana').style.display = 'none'
  document.getElementById('renda-form').style.display = 'block'
  document.getElementById('rf-desc').focus()
}

function fecharFormRenda() {
  document.getElementById('renda-form').style.display = 'none'
}

function selRendaTipo(btn, tipo) {
  rendaTipoSel = tipo
  document.querySelectorAll('#renda-form .rtipo-btn').forEach(b => b.classList.remove('sel'))
  btn.classList.add('sel')
  document.getElementById('rf-campo-dia-mes').style.display = tipo === 'semanal' ? 'none' : ''
  document.getElementById('rf-campo-dia-semana').style.display = tipo === 'semanal' ? '' : 'none'
}

function editarRenda(r) {
  document.getElementById('rf-id').value = r.id
  document.getElementById('rf-desc').value = r.descricao
  document.getElementById('rf-valor').value = String(r.valor).replace('.', ',')
  document.getElementById('rf-obs').value = r.observacao || ''
  document.getElementById('rf-dia-mes').value = r.dia_mes || ''
  document.getElementById('rf-dia-semana').value = r.dia_semana ?? 5
  document.getElementById('rf-estimada').checked = !!r.estimada
  document.getElementById('renda-form-titulo').textContent = 'Editar renda'
  rendaTipoSel = r.tipo || 'mensal'
  const btns = document.querySelectorAll('#renda-form .rtipo-btn')
  btns.forEach(b => b.classList.remove('sel'))
  const tipoIdx = ['mensal','semanal','quinzenal'].indexOf(rendaTipoSel)
  if (btns[tipoIdx]) btns[tipoIdx].classList.add('sel')
  document.getElementById('rf-campo-dia-mes').style.display = rendaTipoSel === 'semanal' ? 'none' : ''
  document.getElementById('rf-campo-dia-semana').style.display = rendaTipoSel === 'semanal' ? '' : 'none'
  document.getElementById('renda-form').style.display = 'block'
}

async function salvarRenda() {
  const id = document.getElementById('rf-id').value
  const descricao = document.getElementById('rf-desc').value.trim()
  const valor = parseBRL(document.getElementById('rf-valor').value)
  const obs = document.getElementById('rf-obs').value.trim()
  const diaMes = rendaTipoSel !== 'semanal' ? parseInt(document.getElementById('rf-dia-mes').value) || null : null
  const diaSemana = rendaTipoSel === 'semanal' ? parseInt(document.getElementById('rf-dia-semana').value) : null

  if (!descricao || !valor) { toast('⚠️ Preencha descrição e valor', 'aviso'); return }

  const estimada = document.getElementById('rf-estimada').checked
  const body = { usuarioId: usuario.id, descricao, valor, tipo: rendaTipoSel, diaMes, diaSemana, observacao: obs, estimada }

  try {
    if (id) {
      await api(`/receitas-programadas/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({...body, ativa: 1}) })
      toast('✅ Renda atualizada!')
    } else {
      await api('/receitas-programadas', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) })
      toast('✅ Renda adicionada!')
    }
    fecharFormRenda()
    await carregarListaRendas()
    carregarInicio()
  } catch(e) {
    toast('❌ ' + e.message, 'erro')
  }
}

async function excluirRenda(id) {
  if (!confirm('Remover esta renda programada?')) return
  await api(`/receitas-programadas/${id}`, { method: 'DELETE' })
  toast('🗑️ Removida')
  await carregarListaRendas()
  carregarInicio()
}

// ── RECEITAS ──
async function abrirModalReceita() {
  const hoje = new Date().toISOString().split('T')[0]
  document.getElementById('r-data').value = hoje
  document.getElementById('r-descricao').value = ''
  document.getElementById('r-valor').value = ''
  document.querySelectorAll('.rtipo-btn').forEach(b => b.classList.remove('sel'))
  document.querySelector('.rtipo-btn')?.classList.add('sel')
  receitaTipoSel = 'Atendimento'  // precisa bater com o 1º .rtipo-btn, que recebe .sel acima
  document.getElementById('modal-receita').style.display = 'flex'
  await carregarReceitasMes()
}

async function carregarReceitasMes() {
  const el = document.getElementById('receitas-mes-lista')
  if (!el) return
  try {
    const receitas = await api('/receitas' + famQ())
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
      body: JSON.stringify({ usuarioId: usuario.id, valor, descricao, dataReceita: dataReceita || null, tipo: receitaTipoSel })
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
  document.getElementById('emp-folha').checked = !!Number(emp?.desconto_folha)

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
  const descontoFolha = document.getElementById('emp-folha').checked ? 1 : 0

  if (!descricao || !credor || !valorTotal) { toast('Preencha descrição, credor e valor total!', 'erro'); return }

  try {
    if (empEdicaoId) {
      await api(`/emprestimos/${empEdicaoId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, descricao, credor, valorTotal, parcelaMensal, totalParcelas, taxaJuros, dataVencimento, valorPago, parcelasPagas, descontoFolha })
      })
      toast(`✅ "${descricao}" atualizado!`)
    } else {
      const criado = await api('/emprestimos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuarioId: usuario.id, tipo, descricao, credor, valorTotal, parcelaMensal, totalParcelas, taxaJuros, dataVencimento, descontoFolha })
      })
      if (valorPago > 0) {
        if (criado?.id) await api(`/emprestimos/${criado.id}/pagar`, {
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
  const emprestimos = await api('/emprestimos' + famQ())
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
            <div class="emp-credor">${label} · ${e.credor} · ${e.usuario_nome}${Number(e.desconto_folha) ? ' · 🧾 em folha' : ''}</div>
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
    const { plano } = await api('/plano' + famQ())
    document.getElementById('plano-conteudo').innerHTML = `<div class="plano-texto">${plano}</div>`
  } catch {
    document.getElementById('plano-conteudo').innerHTML = `<div class="plano-texto">❌ Erro ao gerar plano. Tente novamente.</div>`
  }
}

// ── FERRAMENTAS ──
function abrirMenuFerramentas() {
  document.getElementById('modal-ferramentas').style.display = 'flex'
}

// ── LIMPAR IMPORTADOS ──
async function limparImportados() {
  fecharModal('modal-ferramentas')
  const fam = famId()
  const uid = usuario?.id
  if (!confirm('⚠️ Isso vai remover TODOS os lançamentos importados via CSV ou extrato.\n\nOs lançamentos manuais não serão afetados.\n\nDeseja continuar?')) return
  try {
    const body = uid ? { usuarioId: uid } : { familiaId: fam }
    const res = await api('/gastos/importados', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    toast(`🧹 ${res.removidos} lançamento(s) removido(s)`)
    carregarInicio()
  } catch (e) {
    toast('❌ ' + e.message, 'erro')
  }
}

// ── RECOMEÇO: ZERAR NÚMEROS DE UMA FAMÍLIA (administrador) ──
async function zerarFamilia(familiaId, nome) {
  const palavra = prompt(
    `Zerar os números de "${nome}"?\n\n` +
    `SAEM: gastos, receitas, dívidas, rendas programadas, gastos fixos, orçamentos e metas.\n` +
    `FICAM: usuários, PINs, avisos do celular, cartões e contas (com saldo e fatura em zero).\n\n` +
    `Não dá para desfazer pelo app. Baixe a cópia de segurança antes.\n\n` +
    `Digite ZERAR para confirmar:`
  )
  if (palavra === null) return
  if (palavra.trim().toUpperCase() !== 'ZERAR') { toast('Nada foi apagado (palavra diferente de ZERAR).', 'erro'); return }
  try {
    const { resultado: r } = await api('/admin/zerar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ familiaId, confirmacao: 'ZERAR' })
    })
    alert(`✅ "${nome}" zerada.\n\n` +
      `Apagados: ${r.gastos} gastos, ${r.receitas} receitas, ${r.emprestimos} dívidas, ` +
      `${r.receitas_programadas} rendas programadas, ${r.gastos_recorrentes} gastos fixos.\n` +
      `Zerados: ${r.contasZeradas} contas e ${r.cartoesZerados} cartões.`)
    mostrarPainelAdmin()
  } catch (e) {
    toast('❌ ' + e.message, 'erro')
  }
}

// ── CÓPIA DE SEGURANÇA (administrador) ──
async function baixarBackup() {
  toast('⏳ Gerando cópia...')
  try {
    const r = await fetch('/api/backup', { headers: comToken() })
    if (r.status === 401) return sessaoExpirada()
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || 'HTTP ' + r.status)
    const blob = await r.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `financas-backup-${new Date().toLocaleDateString('sv-SE')}.db`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    toast('✅ Cópia baixada!')
  } catch (e) {
    toast('❌ ' + e.message, 'erro')
  }
}

// ── EXPORTAÇÃO ──
function exportarCSV() {
  const now = new Date()
  const mes = now.getMonth() + 1
  const ano = now.getFullYear()
  // Baixa pelo fetch (com o token) e entrega o arquivo ao navegador.
  fetch(`/api/exportar/csv?mes=${mes}&ano=${ano}${famQAnd()}`, { headers: comToken() })
    .then(r => {
      if (r.status === 401) { sessaoExpirada(); throw new Error('sessão expirada') }
      if (!r.ok) throw new Error('HTTP ' + r.status)
      return r.blob()
    })
    .then(blob => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `financas-${ano}-${String(mes).padStart(2, '0')}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 5000)
      toast('📥 CSV baixado!')
    })
    .catch(e => toast('❌ Não foi possível exportar: ' + e.message, 'erro'))
}

async function abrirRelatorioHTML() {
  const now = new Date()
  const mes = now.getMonth() + 1
  const ano = now.getFullYear()
  toast('⏳ Gerando relatório...')
  try {
    const { gastos, receitas, resumo } = await api(`/exportar/dados?mes=${mes}&ano=${ano}${famQAnd()}`)
    const nomeMes = now.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })
    // rendaTotal já é renda programada + receitas lançadas no mês (somar as receitas de novo duplicaria).
    const totalReceitas = resumo.rendaTotal ?? (receitas.reduce((a, r) => a + r.valor, 0) + (resumo.salarioTotal || 0))
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
    const lista = await api('/importacoes' + famQ())
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

// ── PAINEL SUPER ADMIN ──
async function mostrarPainelAdmin() {
  document.getElementById('app-main').style.display = 'none'
  document.getElementById('app-nav').style.display = 'none'
  document.getElementById('admin-voltar-banner').style.display = 'none'
  const painel = document.getElementById('painel-admin')
  painel.style.display = 'flex'

  document.getElementById('h-saudacao').textContent = SAUDACOES() + ','
  document.getElementById('h-nome').textContent = '🔐 Admin'
  document.getElementById('h-avatar').textContent = '🛡️'

  const lista = document.getElementById('admin-familias-lista')
  lista.innerHTML = '<div class="plano-loading"><div class="spinner"></div><p>Carregando famílias...</p></div>'

  try {
    const familias = await api('/familias')
    if (!familias.length) {
      lista.innerHTML = '<div style="text-align:center;padding:32px;color:#94a3b8">Nenhuma família cadastrada ainda.</div>'
      return
    }
    lista.innerHTML = familias.map(f => `
      <div class="admin-fam-card">
        <div class="admin-fam-info">
          <div class="admin-fam-nome">🏠 ${f.nome}</div>
          <div class="admin-fam-meta">${f.total_membros} membro${f.total_membros !== 1 ? 's' : ''}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <button class="btn-visualizar" onclick="visualizarFamilia(${f.id}, '${f.nome.replace(/'/g, "\\'")}')">
            👁️ Visualizar
          </button>
          <button class="btn-visualizar" style="background:#fee2e2;color:#b91c1c" onclick="zerarFamilia(${f.id}, '${f.nome.replace(/'/g, "\\'")}')">
            🧹 Zerar números
          </button>
        </div>
      </div>
    `).join('')
  } catch (e) {
    lista.innerHTML = `<div style="color:#dc2626;padding:16px">Erro: ${e.message}</div>`
  }
}

async function visualizarFamilia(familiaId, familiaNome) {
  adminVisualizandoFamiliaId = familiaId
  document.getElementById('admin-voltar-nome').textContent = familiaNome
  await mostrarApp()
  carregarInicio()
}

function voltarParaAdmin() {
  adminVisualizandoFamiliaId = null
  mostrarPainelAdmin()
}

async function criarNovaFamilia() {
  const nome = prompt('Nome da nova família:')
  if (!nome?.trim()) return
  try {
    await api('/familias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: nome.trim() })
    })
    toast(`✅ Família "${nome.trim()}" criada!`)
    mostrarPainelAdmin()
  } catch (e) {
    toast('❌ Erro ao criar família: ' + e.message, 'erro')
  }
}

// ══════════════════════════════════════════
//  PATRIMÔNIO LÍQUIDO
// ══════════════════════════════════════════
function renderPatrimonio(resumo) {
  const el = document.getElementById('patrimonio-card')
  if (!el) return
  const ativos = resumo.saldoContas || 0
  const passivos = resumo.totalEmDividas || 0
  const patrimonio = ativos - passivos
  const positivo = patrimonio >= 0
  const cor = positivo ? '#10b981' : '#e11d48'
  const icone = positivo ? '📈' : '📉'

  el.innerHTML = `
    <div class="pat-titulo">${icone} Patrimônio Líquido</div>
    <div class="pat-valor" style="color:${cor}">${positivo ? '+' : ''}${fmt(patrimonio)}</div>
    <div class="pat-pills">
      <div class="pat-pill">
        <div class="pat-pill-label">✅ Ativos (contas)</div>
        <div class="pat-pill-valor" style="color:#10b981">${fmt(ativos)}</div>
      </div>
      <div class="pat-sep">−</div>
      <div class="pat-pill">
        <div class="pat-pill-label">💸 Passivos (dívidas)</div>
        <div class="pat-pill-valor" style="color:#e11d48">${fmt(passivos)}</div>
      </div>
    </div>
  `
}

// ══════════════════════════════════════════
//  SKELETON LOADING
// ══════════════════════════════════════════
function renderSkeletonInicio() {
  // Skeleton no score card
  const scoreEl = document.getElementById('saude-score-card')
  if (scoreEl && !_saudeData) {
    scoreEl.innerHTML = `<div class="saude-skeleton">
      <div class="sk-circle"></div>
      <div class="sk-lines"><div class="sk-line" style="width:60%"></div><div class="sk-line" style="width:40%"></div></div>
    </div>`
  }
  // Skeleton nas transações
  const txEl = document.getElementById('inicio-transacoes')
  if (txEl) {
    txEl.innerHTML = Array(4).fill(0).map(() => `
      <div class="tx-item tx-skeleton">
        <div class="sk-circle" style="width:38px;height:38px;border-radius:50%;flex-shrink:0"></div>
        <div class="sk-lines" style="flex:1">
          <div class="sk-line" style="width:55%"></div>
          <div class="sk-line" style="width:35%;margin-top:6px"></div>
        </div>
        <div class="sk-line" style="width:70px;height:16px;border-radius:6px"></div>
      </div>`).join('')
  }
}

// ══════════════════════════════════════════
//  SWIPE TO DELETE (transações mobile)
// ══════════════════════════════════════════
function setupSwipeItems() {
  document.querySelectorAll('.tx-item[id^="tx-"]').forEach(el => {
    let x0 = 0, y0 = 0, swiped = false, active = false

    el.addEventListener('touchstart', e => {
      x0 = e.touches[0].clientX
      y0 = e.touches[0].clientY
      swiped = false
      active = true
    }, { passive: true })

    el.addEventListener('touchmove', e => {
      if (!active) return
      const dx = e.touches[0].clientX - x0
      const dy = e.touches[0].clientY - y0
      // Se for scroll vertical, cancela gesto
      if (Math.abs(dy) > Math.abs(dx) + 5) { active = false; return }
      if (dx < -20) {
        const offset = Math.max(dx, -72)
        el.style.transform = `translateX(${offset}px)`
        swiped = offset < -55
      } else {
        el.style.transform = ''
        swiped = false
      }
    }, { passive: true })

    el.addEventListener('touchend', () => {
      active = false
      if (swiped) {
        el.classList.add('swiped-open')
        el.style.transform = 'translateX(-68px)'
        // Auto-reset após 4s sem ação
        setTimeout(() => {
          el.classList.remove('swiped-open')
          el.style.transform = ''
        }, 4000)
      } else {
        el.classList.remove('swiped-open')
        el.style.transform = ''
      }
    })
  })
}

// ══════════════════════════════════════════
//  SCORE DE SAÚDE FINANCEIRA
// ══════════════════════════════════════════
let _saudeData = null

function calcularScore(resumo, orcamentos = [], cats = []) {
  const renda = resumo.rendaTotal || resumo.salarioTotal || 0
  const gastos = resumo.gastosMes || 0
  const saldoContas = resumo.saldoContas || 0
  const dividas = resumo.totalEmDividas || 0

  // 1. Economia (35 pts): % da renda economizada
  let scoreEconomia = 0
  if (renda > 0) {
    const pctSalvo = Math.max(0, (renda - gastos) / renda)
    if (pctSalvo >= 0.20) scoreEconomia = 35
    else if (pctSalvo >= 0.10) scoreEconomia = 25
    else if (pctSalvo >= 0.05) scoreEconomia = 15
    else if (pctSalvo > 0) scoreEconomia = 5
  }

  // 2. Orçamentos (25 pts): categorias dentro do limite
  let scoreOrc = 25
  if (orcamentos.length > 0 && cats.length > 0) {
    const gastosMap = Object.fromEntries(cats.map(c => [c.categoria, c.total]))
    const estouros = orcamentos.filter(o => (gastosMap[o.categoria] || 0) > o.valor_limite).length
    scoreOrc = Math.max(0, Math.round(25 * (1 - estouros / orcamentos.length)))
  }

  // 3. Dívidas (20 pts): proporção de dívidas vs renda mensal
  let scoreDividas = 20
  if (renda > 0 && dividas > 0) {
    const ratio = dividas / (renda * 12)
    if (ratio > 1.5) scoreDividas = 0
    else if (ratio > 1.0) scoreDividas = 3
    else if (ratio > 0.5) scoreDividas = 8
    else if (ratio > 0.25) scoreDividas = 13
    else scoreDividas = 17
  }

  // 4. Contas / reserva (20 pts): saldo positivo em contas
  let scoreContas = 0
  if (saldoContas > 0) {
    if (saldoContas >= renda * 3) scoreContas = 20
    else if (saldoContas >= renda) scoreContas = 15
    else if (saldoContas >= renda * 0.5) scoreContas = 10
    else scoreContas = 5
  }

  const total = scoreEconomia + scoreOrc + scoreDividas + scoreContas
  const nota = total >= 80 ? 'A' : total >= 60 ? 'B' : total >= 40 ? 'C' : 'D'
  const cor = total >= 80 ? '#10b981' : total >= 60 ? '#6366f1' : total >= 40 ? '#f59e0b' : '#e11d48'
  const desc = total >= 80 ? 'Excelente — continue assim!' : total >= 60 ? 'Boa — ainda tem espaço para melhorar' : total >= 40 ? 'Regular — atenção aos gastos' : 'Crítica — revise seu orçamento'

  _saudeData = { total, nota, cor, desc, scoreEconomia, scoreOrc, scoreDividas, scoreContas, renda, gastos, dividas, saldoContas }
  return _saudeData
}

function renderScoreCard(s) {
  const el = document.getElementById('saude-score-card')
  if (!el) return

  const ringColor = s.cor
  const pct = s.total
  // SVG ring: circumference = 2π×30 ≈ 188.5
  const circ = 188.5
  const dash = (pct / 100) * circ

  el.innerHTML = `
    <div class="saude-top">
      <div class="saude-ring-wrap">
        <svg class="saude-ring" viewBox="0 0 72 72">
          <circle cx="36" cy="36" r="30" fill="none" stroke="#e2e8f0" stroke-width="7"/>
          <circle cx="36" cy="36" r="30" fill="none" stroke="${ringColor}" stroke-width="7"
            stroke-dasharray="${dash} ${circ}" stroke-dashoffset="${circ * 0.25}"
            stroke-linecap="round" style="transition:stroke-dasharray .8s ease"/>
        </svg>
        <div class="saude-score-num" style="color:${ringColor}">${pct}</div>
      </div>
      <div class="saude-info">
        <div class="saude-titulo">💚 Saúde Financeira</div>
        <div class="saude-nota" style="background:${ringColor}20;color:${ringColor}">Nota ${s.nota}</div>
        <div class="saude-desc">${s.desc}</div>
      </div>
    </div>
    <div class="saude-barras">
      ${saudeBarra('Economia', s.scoreEconomia, 35, s.cor)}
      ${saudeBarra('Orçamentos', s.scoreOrc, 25, s.cor)}
      ${saudeBarra('Dívidas', s.scoreDividas, 20, s.cor)}
      ${saudeBarra('Reserva', s.scoreContas, 20, s.cor)}
    </div>
    <div class="saude-tap">Toque para detalhes</div>
  `
}

function saudeBarra(label, pts, max, cor) {
  const pct = max > 0 ? Math.min((pts / max) * 100, 100) : 0
  const corBarra = pts >= max * 0.8 ? '#10b981' : pts >= max * 0.5 ? '#6366f1' : pts >= max * 0.25 ? '#f59e0b' : '#e11d48'
  return `<div class="saude-barra-item">
    <div class="saude-barra-row">
      <span class="saude-barra-label">${label}</span>
      <span class="saude-barra-pts" style="color:${corBarra}">${pts}/${max}</span>
    </div>
    <div class="orc-barra-bg"><div class="orc-barra-fill" style="width:${pct}%;background:${corBarra}"></div></div>
  </div>`
}

function abrirDetalhesSaude() {
  if (!_saudeData) return
  const s = _saudeData
  const renda = s.renda
  const gastos = s.gastos
  const economia = renda - gastos
  const pctSalvo = renda > 0 ? ((economia / renda) * 100).toFixed(0) : 0

  document.getElementById('saude-detalhe-conteudo').innerHTML = `
    <div class="saude-detalhe-score" style="color:${s.cor}">
      <div class="saude-detalhe-num">${s.total}</div>
      <div class="saude-detalhe-nota">Nota ${s.nota}</div>
      <div class="saude-detalhe-desc">${s.desc}</div>
    </div>
    <div class="saude-detalhe-grid">
      <div class="saude-d-item">
        <div class="saude-d-label">💰 Economia do mês</div>
        <div class="saude-d-valor" style="color:${economia>=0?'#10b981':'#e11d48'}">${economia>=0?'+':''}${fmt(economia)}</div>
        <div class="saude-d-sub">${pctSalvo}% da renda guardada</div>
      </div>
      <div class="saude-d-item">
        <div class="saude-d-label">💸 Dívidas em aberto</div>
        <div class="saude-d-valor" style="color:${s.dividas>0?'#e11d48':'#10b981'}">${fmt(s.dividas)}</div>
        <div class="saude-d-sub">${renda > 0 ? ((s.dividas/(renda*12))*100).toFixed(0) : 0}% da renda anual</div>
      </div>
      <div class="saude-d-item">
        <div class="saude-d-label">🏦 Saldo em contas</div>
        <div class="saude-d-valor" style="color:${s.saldoContas>=0?'#6366f1':'#e11d48'}">${fmt(s.saldoContas)}</div>
        <div class="saude-d-sub">${renda > 0 ? (s.saldoContas / renda).toFixed(1) : '—'} meses de reserva</div>
      </div>
    </div>
    <div class="saude-dicas">
      <div class="saude-dica-titulo">💡 Dicas para melhorar</div>
      ${gerarDicasSaude(s)}
    </div>
  `
  document.getElementById('modal-saude').style.display = 'flex'
}

function gerarDicasSaude(s) {
  const dicas = []
  if (s.scoreEconomia < 25) dicas.push('🎯 Tente economizar pelo menos 10% da renda todo mês.')
  if (s.scoreOrc < 20) dicas.push('📊 Defina orçamentos por categoria e monitore os estouros.')
  if (s.scoreDividas < 15) dicas.push('💸 Priorize quitar as dívidas com maior taxa de juros.')
  if (s.scoreContas < 10) dicas.push('🏦 Construa uma reserva de emergência de 3-6 meses de gastos.')
  if (!dicas.length) dicas.push('✅ Suas finanças estão ótimas! Continue assim.')
  return dicas.map(d => `<div class="saude-dica">${d}</div>`).join('')
}

// ══════════════════════════════════════════
//  ORÇAMENTOS POR CATEGORIA
// ══════════════════════════════════════════
const EMOJI_CAT_ORC = { 'Alimentação':'🍽️','Mercado':'🛒','Saúde':'💊','Farmácia':'💊','Transporte':'🚗','Combustível':'⛽','Educação':'📚','Lazer':'🎉','Vestuário':'👕','Casa':'🏠','Financiamento':'🏦','Assinatura':'📱','Restaurante':'🍕','Outros':'📦' }

async function abrirModalOrcamentos() {
  document.getElementById('orc-limite').value = ''
  document.getElementById('modal-orcamentos').style.display = 'flex'
  await carregarListaOrcamentos()
}

async function carregarListaOrcamentos() {
  const el = document.getElementById('orcamentos-lista')
  try {
    const [orcs, cats] = await Promise.all([
      api('/orcamentos' + famQ()),
      api('/gastos/categorias' + famQ())
    ])
    const gastosMap = Object.fromEntries(cats.map(c => [c.categoria, c.total]))
    if (!orcs.length) {
      el.innerHTML = '<p style="color:#94a3b8;font-size:.85rem;text-align:center;padding:12px 0">Nenhum orçamento definido ainda.</p>'
      return
    }
    el.innerHTML = orcs.map(o => {
      const gasto = gastosMap[o.categoria] || 0
      const pct = o.valor_limite > 0 ? Math.min((gasto / o.valor_limite) * 100, 120) : 0
      const cor = pct >= 100 ? '#e11d48' : pct >= 80 ? '#f59e0b' : '#059669'
      const emoji = EMOJI_CAT_ORC[o.categoria] || '📦'
      return `<div class="orc-item">
        <div class="orc-item-top">
          <span>${emoji} ${o.categoria}</span>
          <span style="color:${cor};font-weight:700;font-size:.82rem">${fmt(gasto)} / ${fmt(o.valor_limite)}</span>
          <button class="tx-del-btn" style="opacity:1" onclick="deletarOrcamento(${o.id})">🗑</button>
        </div>
        <div class="orc-barra-bg">
          <div class="orc-barra-fill" style="width:${Math.min(pct,100)}%;background:${cor}"></div>
        </div>
        <div style="font-size:.7rem;color:${cor};text-align:right;margin-top:2px">${pct.toFixed(0)}% usado${pct>=100?' ⚠️':''}</div>
      </div>`
    }).join('')
  } catch(e) {
    el.innerHTML = '<p style="color:#e11d48">Erro ao carregar</p>'
  }
}

async function salvarOrcamento() {
  const categoria = document.getElementById('orc-categoria').value
  const limite = parseBRL(document.getElementById('orc-limite').value)
  if (!categoria || !limite || limite <= 0) { toast('Informe categoria e valor!', 'erro'); return }
  try {
    await api('/orcamentos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuarioId: usuario.id, familiaId: famId(), categoria, valorLimite: limite })
    })
    document.getElementById('orc-limite').value = ''
    toast(`✅ Orçamento de ${fmt(limite)} para ${categoria} salvo!`)
    await carregarListaOrcamentos()
    renderOrcamentosSecao()
  } catch(e) { toast('❌ ' + e.message, 'erro') }
}

async function deletarOrcamento(id) {
  if (!confirm('Remover este orçamento?')) return
  await api(`/orcamentos/${id}`, { method: 'DELETE' })
  toast('🗑️ Orçamento removido')
  await carregarListaOrcamentos()
  renderOrcamentosSecao()
}

async function renderOrcamentosSecao() {
  const el = document.getElementById('orcamentos-section')
  if (!el) return
  try {
    const [orcs, cats] = await Promise.all([
      api('/orcamentos' + famQ()),
      api('/gastos/categorias' + famQ())
    ])
    if (!orcs.length) {
      el.innerHTML = `<div class="orc-vazio" onclick="abrirModalOrcamentos()">
        <span>🎯</span> <span>Defina limites por categoria para receber alertas</span>
      </div>`
      return
    }
    const gastosMap = Object.fromEntries(cats.map(c => [c.categoria, c.total]))
    el.innerHTML = orcs.map(o => {
      const gasto = gastosMap[o.categoria] || 0
      const pct = o.valor_limite > 0 ? Math.min((gasto / o.valor_limite) * 100, 120) : 0
      const cor = pct >= 100 ? '#e11d48' : pct >= 80 ? '#f59e0b' : '#059669'
      const emoji = EMOJI_CAT_ORC[o.categoria] || '📦'
      return `<div class="orc-barra-item" onclick="abrirModalOrcamentos()">
        <div class="orc-barra-row">
          <span class="orc-cat-label"><i class="cal-dot" style="background:${corCat(o.categoria)};margin-right:5px"></i>${emoji} ${o.categoria}</span>
          <span class="orc-pct-label" style="color:${cor}">${fmt(gasto)} <span style="color:#64748b">/ ${fmt(o.valor_limite)}</span></span>
        </div>
        <div class="orc-barra-bg">
          <div class="orc-barra-fill" style="width:${Math.min(pct,100)}%;background:${cor};transition:width .5s"></div>
        </div>
        <div class="orc-sobra" style="color:${cor}">${gasto <= o.valor_limite ? `Sobram ${fmt(o.valor_limite - gasto)}` : `Estourou ${fmt(gasto - o.valor_limite)}`}</div>
      </div>`
    }).join('')
  } catch(e) {}
}

// ══════════════════════════════════════════
//  GASTOS RECORRENTES
// ══════════════════════════════════════════
let recFormaAtual = 'debito'
let recEdicaoId = null
let recAtivaAtual = 1  // editar não pode reativar uma assinatura cancelada

async function abrirModalRecorrentes() {
  document.getElementById('modal-recorrentes').style.display = 'flex'
  fecharFormRecorrente()
  await carregarListaRecorrentes()
  // Processar recorrentes do mês ao abrir
  processarRecorrentesAuto()
}

async function carregarListaRecorrentes() {
  const el = document.getElementById('recorrentes-lista')
  try {
    const lista = await api('/recorrentes' + famQ())
    if (!lista.length) {
      el.innerHTML = '<p style="color:#94a3b8;font-size:.85rem;text-align:center;padding:12px 0">Nenhum gasto recorrente cadastrado.</p>'
      return
    }
    // Total do que ainda está ativo; as canceladas vão pro fim da lista.
    const ativos = lista.filter(r => r.ativa)
    const totalMensal = ativos.reduce((acc, r) => acc + Number(r.valor), 0)
    const totalAssinaturas = ativos.filter(r => r.categoria === 'Assinatura').reduce((acc, r) => acc + Number(r.valor), 0)
    const resumo = `<div class="rec-total">
      <div><small title="${ativos.length} ${ativos.length === 1 ? 'ativo' : 'ativos'}">Por mês (${ativos.length})</small><b>${fmt(totalMensal)}</b></div>
      ${totalAssinaturas > 0 ? `<div><small>Assinaturas</small><b>${fmt(totalAssinaturas)}</b></div>` : ''}
      <div><small>Por ano</small><b>${fmt(totalMensal * 12)}</b></div>
    </div>`

    el.innerHTML = resumo + lista.slice().sort((a, b) => b.ativa - a.ativa).map(r => {
      const cat = EMOJI_CAT_ORC[r.categoria] || '📦'
      const diaLabel = `Todo dia ${r.dia_mes}`
      const cancelada = !r.ativa ? ' <span class="rec-tag-cancelada">cancelada</span>' : ''
      return `<div class="renda-item${r.ativa ? '' : ' rec-cancelada'}">
        <div class="renda-item-top">
          <span class="renda-item-desc">${cat} ${r.descricao}${cancelada}</span>
          <span class="renda-item-val">${fmt(r.valor)}</span>
        </div>
        <div class="renda-item-bot">
          <span class="renda-item-tipo">${diaLabel} · ${r.categoria}${r.cartao_nome ? ` · 💳 ${r.cartao_nome}` : ''}</span>
          ${r.usuario_nome ? `<span class="renda-item-user">👤 ${r.usuario_nome}</span>` : ''}
        </div>
        <div class="renda-item-acoes">
          <button onclick="editarRecorrente(${JSON.stringify(r).replace(/"/g,'&quot;')})">✏️ Editar</button>
          ${r.ativa
            ? `<button onclick="alternarRecorrente(${r.id}, false)">🚫 Cancelar</button>`
            : `<button onclick="alternarRecorrente(${r.id}, true)">↩️ Reativar</button>`}
          <button class="btn-excluir" onclick="deletarRecorrente(${r.id})">🗑 Excluir</button>
        </div>
      </div>`
    }).join('')
  } catch(e) {
    el.innerHTML = '<p style="color:#e11d48">Erro ao carregar</p>'
  }
}

function abrirFormRecorrente() {
  recEdicaoId = null
  recAtivaAtual = 1
  recFormaAtual = 'debito'
  document.getElementById('rec-id').value = ''
  document.getElementById('rec-desc').value = ''
  document.getElementById('rec-valor').value = ''
  document.getElementById('rec-categoria').value = 'Assinatura'
  document.getElementById('rec-dia').value = '1'
  document.getElementById('rec-forma-val').value = 'debito'
  document.getElementById('rec-form-titulo').textContent = 'Novo gasto recorrente'
  document.querySelectorAll('#recorrente-form .forma-btn').forEach((b, i) => b.classList.toggle('sel', i === 0))
  mostrarCampoCartaoRec(null)
  document.getElementById('recorrente-form').style.display = 'block'
}

function fecharFormRecorrente() {
  document.getElementById('recorrente-form').style.display = 'none'
}

// Só os cartões do próprio usuário: o gasto fixo é dele.
async function mostrarCampoCartaoRec(cartaoSel) {
  const campo = document.getElementById('rec-campo-cartao')
  if (recFormaAtual !== 'credito') { campo.style.display = 'none'; return }
  campo.style.display = ''
  const sel = document.getElementById('rec-cartao')
  try {
    const cartoes = await api(`/cartoes?usuarioId=${usuario.id}`)
    sel.innerHTML = '<option value="">Sem cartão definido (fica no dia do gasto)</option>' +
      cartoes.map(c => `<option value="${c.id}">💳 ${c.nome} · fecha ${c.dia_fechamento}, vence ${c.dia_vencimento}</option>`).join('')
    sel.value = cartaoSel ? String(cartaoSel) : (cartoes.length === 1 ? String(cartoes[0].id) : '')
  } catch(e) {
    sel.innerHTML = '<option value="">Não foi possível carregar os cartões</option>'
  }
}

function selRecForma(btn, forma) {
  document.querySelectorAll('#recorrente-form .forma-btn').forEach(b => b.classList.remove('sel'))
  btn.classList.add('sel')
  recFormaAtual = forma
  document.getElementById('rec-forma-val').value = forma
  mostrarCampoCartaoRec(null)
}

function editarRecorrente(r) {
  recEdicaoId = r.id
  recAtivaAtual = r.ativa ? 1 : 0
  document.getElementById('rec-id').value = r.id
  document.getElementById('rec-desc').value = r.descricao
  document.getElementById('rec-valor').value = String(r.valor).replace('.', ',')
  document.getElementById('rec-categoria').value = r.categoria || 'Outros'
  document.getElementById('rec-dia').value = r.dia_mes || 1
  recFormaAtual = r.forma_pagamento || 'debito'
  document.getElementById('rec-forma-val').value = recFormaAtual
  document.querySelectorAll('#recorrente-form .forma-btn').forEach(b => {
    b.classList.toggle('sel', b.getAttribute('onclick').includes(`'${recFormaAtual}'`))
  })
  document.getElementById('rec-form-titulo').textContent = 'Editar gasto recorrente'
  mostrarCampoCartaoRec(r.cartao_id)
  document.getElementById('recorrente-form').style.display = 'block'
}

async function salvarRecorrente() {
  const desc = document.getElementById('rec-desc').value.trim()
  const valor = parseBRL(document.getElementById('rec-valor').value)
  const categoria = document.getElementById('rec-categoria').value
  const forma = recFormaAtual
  const dia = parseInt(document.getElementById('rec-dia').value) || 1
  const cartaoId = forma === 'credito' ? (parseInt(document.getElementById('rec-cartao').value) || null) : null
  if (!desc || !valor || valor <= 0) { toast('Preencha descrição e valor!', 'erro'); return }
  try {
    if (recEdicaoId) {
      await api(`/recorrentes/${recEdicaoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descricao: desc, valor, categoria, formaPagamento: forma, diaMes: dia, ativa: recAtivaAtual, cartaoId })
      })
      toast(`✅ "${desc}" atualizado!`)
    } else {
      await api('/recorrentes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuarioId: usuario.id, descricao: desc, valor, categoria, formaPagamento: forma, diaMes: dia, cartaoId })
      })
      toast(`✅ "${desc}" adicionado! Será lançado todo dia ${dia}.`)
    }
    fecharFormRecorrente()
    await carregarListaRecorrentes()
    await processarRecorrentesAuto()
    carregarInicio()
  } catch(e) { toast('❌ ' + e.message, 'erro') }
}

async function alternarRecorrente(id, ativa) {
  try {
    await api(`/recorrentes/${id}/ativa`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativa })
    })
    toast(ativa ? '↩️ Reativada: volta a ser lançada todo mês' : '🚫 Cancelada: não será mais lançada nem prevista')
    await carregarListaRecorrentes()
    carregarInicio()
  } catch(e) { toast('❌ ' + e.message, 'erro') }
}

async function deletarRecorrente(id) {
  if (!confirm('Excluir este gasto recorrente?')) return
  await api(`/recorrentes/${id}`, { method: 'DELETE' })
  toast('🗑️ Gasto recorrente removido')
  await carregarListaRecorrentes()
}

async function processarRecorrentesAuto() {
  try {
    const res = await api('/recorrentes/processar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ familiaId: famId(), usuarioId: usuario?.id })
    })
    if (res.criados > 0) {
      toast(`🔁 ${res.criados} gasto(s) recorrente(s) lançado(s) automaticamente!`)
      carregarInicio()
    }
  } catch(e) { /* silently ignore */ }
}

// ══════════════════════════════════════════
//  META DE RENDA
// ══════════════════════════════════════════
let _metaData = null

async function renderMetaRendaCard() {
  const el = document.getElementById('meta-renda-card')
  if (!el) return
  try {
    const m = await api('/meta-renda' + famQ())
    _metaData = m

    const pct = Math.round(m.pct)
    const fechou = m.gap <= 0
    const cor = fechou ? '#10b981' : pct >= 70 ? '#6366f1' : pct >= 40 ? '#f59e0b' : '#e11d48'

    // A linha de ação é o ponto do card: transformar o gap em nº de atendimentos.
    let acao
    if (fechou) {
      acao = `<div class="mr-acao" style="color:#10b981">🎉 Meta batida — sobra de ${fmt(m.realizado - m.alvo)}</div>`
    } else if (m.atendimentosNecessarios == null) {
      acao = `<div class="mr-acao mr-acao-vazia">Informe o ticket médio para ver quantos atendimentos faltam →</div>`
    } else {
      const plural = m.atendimentosNecessarios === 1 ? 'atendimento' : 'atendimentos'
      acao = `<div class="mr-acao">Faltam <b>${m.atendimentosNecessarios} ${plural}</b> · ~${m.porSemana}/semana nos ${m.diasRestantes} dias restantes</div>`
    }

    el.innerHTML = `
      <div class="mr-topo">
        <span class="mr-titulo">🎯 Meta do mês</span>
        <span class="mr-pct" style="color:${cor}">${pct}%</span>
      </div>
      <div class="mr-valores">
        <span class="mr-realizado">${fmt(m.realizado)}</span>
        <span class="mr-alvo">de ${fmt(m.alvo)}</span>
      </div>
      <div class="mr-barra-bg"><div class="mr-barra-fill" style="width:${pct}%;background:${cor}"></div></div>
      ${acao}
    `
  } catch(e) {
    el.innerHTML = `<div class="mr-acao mr-acao-vazia">Meta indisponível</div>`
  }
}

async function abrirModalMetaRenda() {
  document.getElementById('modal-meta-renda').style.display = 'flex'
  document.getElementById('meta-detalhe').innerHTML = '<div class="sk-lines"><div class="sk-line"></div><div class="sk-line"></div></div>'
  document.getElementById('meta-dividas').innerHTML = ''
  try {
    const [m, dividas] = await Promise.all([
      api('/meta-renda' + famQ()),
      api('/dividas/custo' + famQ())
    ])
    _metaData = m
    document.getElementById('meta-alvo').value = m.alvo ? fmtNum(m.alvo) : ''
    document.getElementById('meta-ticket').value = m.ticketManual ? fmtNum(m.ticketManual) : ''
    renderMetaDetalhe(m)
    renderMetaDividas(dividas)
  } catch(e) {
    document.getElementById('meta-detalhe').innerHTML = `<div class="orc-vazio">Erro ao carregar: ${e.message}</div>`
  }
}

function fmtNum(v) {
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function metaFonteLinha(label, valor, total, cor) {
  const pct = total > 0 ? (valor / total) * 100 : 0
  return `
    <div class="mr-fonte">
      <div class="mr-fonte-top">
        <span>${label}</span>
        <b>${fmt(valor)}</b>
      </div>
      <div class="mr-fonte-bg"><div class="mr-fonte-fill" style="width:${pct}%;background:${cor}"></div></div>
    </div>
  `
}

function renderMetaDetalhe(m) {
  const f = m.fontes
  const el = document.getElementById('meta-detalhe')

  const fontes = [
    metaFonteLinha('💼 Fixa (salário/adiantamento)', f.fixa, m.alvo, '#6366f1'),
    metaFonteLinha('📅 Semanal', f.semanal, m.alvo, '#0ea5e9'),
    metaFonteLinha(`🩺 Atendimentos (${m.atendimentos.qtd})`, f.atendimentos, m.alvo, '#10b981'),
    metaFonteLinha('📦 Outras', f.outras, m.alvo, '#94a3b8')
  ].join('')

  // Régua de realismo: comparar o esforço exigido com o melhor mês já feito.
  let veredito = ''
  if (m.gap > 0 && m.atendimentosNecessarios != null) {
    const totalNoMes = m.atendimentos.qtd + m.atendimentosNecessarios
    if (m.melhorMes > 0 && totalNoMes > m.melhorMes * 1.5) {
      veredito = `<div class="mr-dica mr-dica-alerta">⚠️ Isso daria ${totalNoMes} atendimentos no mês. Seu melhor mês registrado foi ${m.melhorMes}. Ou o ticket precisa subir, ou a meta precisa de outra fonte de renda.</div>`
    } else {
      veredito = `<div class="mr-dica">✅ ${totalNoMes} atendimentos no mês — dentro do que você já fez (melhor mês: ${m.melhorMes || '—'}).</div>`
    }
  }

  const ticketInfo = m.ticket > 0
    ? `<div class="mr-linha-info">Ticket usado: <b>${fmt(m.ticket)}</b> ${m.ticketManual > 0 ? '(definido por você)' : '(média real do histórico)'}</div>`
    : `<div class="mr-linha-info">Sem ticket médio ainda — registre atendimentos ou informe um valor abaixo.</div>`

  el.innerHTML = `
    <div class="mr-resumo-grid">
      <div class="mr-box">
        <span class="mr-box-label">Realizado</span>
        <span class="mr-box-val" style="color:#10b981">${fmt(m.realizado)}</span>
      </div>
      <div class="mr-box">
        <span class="mr-box-label">Falta</span>
        <span class="mr-box-val" style="color:${m.gap > 0 ? '#e11d48' : '#10b981'}">${fmt(m.gap)}</span>
      </div>
    </div>
    <div class="mr-fontes">${fontes}</div>
    ${ticketInfo}
    ${veredito}
  `
}

function renderMetaDividas(dividas) {
  const el = document.getElementById('meta-dividas')
  if (!el) return
  if (!dividas.length) {
    el.innerHTML = `<div class="orc-vazio">Nenhuma dívida ativa 🎉</div>`
    return
  }
  const totalJuros = dividas.reduce((a, d) => a + d.juros_mes, 0)
  el.innerHTML = `
    <div class="mr-linha-info">Você paga cerca de <b style="color:#e11d48">${fmt(totalJuros)}/mês</b> só em juros. Quitar de cima para baixo é o que economiza mais.</div>
    ${dividas.map((d, i) => `
      <div class="divida-item">
        <div class="divida-rank">${i + 1}</div>
        <div class="divida-info">
          <div class="divida-desc">${d.descricao}</div>
          <div class="divida-meta">${d.credor} · saldo ${fmt(d.saldo)} · ${d.taxa_juros}% a.m.</div>
        </div>
        <div class="divida-custo">
          <span>${d.juros_mes > 0 ? fmt(d.juros_mes) : '—'}</span>
          <small>juros/mês</small>
        </div>
      </div>
    `).join('')}
  `
}

async function salvarMetaRenda() {
  const alvo = parseBRL(document.getElementById('meta-alvo').value)
  const ticket = parseBRL(document.getElementById('meta-ticket').value)
  if (!alvo || alvo <= 0) { toast('Informe o valor da meta!', 'erro'); return }
  try {
    await api('/meta-renda', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ familiaId: famId(), valorAlvo: alvo, ticketMedio: ticket })
    })
    toast(`🎯 Meta de ${fmt(alvo)} salva!`)
    const m = await api('/meta-renda' + famQ())
    _metaData = m
    renderMetaDetalhe(m)
    renderMetaRendaCard()
  } catch(e) {
    toast('❌ ' + e.message, 'erro')
  }
}

// ══════════════════════════════════════════
//  AGENDA — calendário do mês com saldo previsto
// ══════════════════════════════════════════
const NOMES_MES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
let calMes = null, calAno = null, calDados = null, calDiaSel = null
let calDiaForcado = null  // dia pedido por um link (toque numa notificação)

async function carregarAgenda() {
  if (!calMes) {
    const now = new Date()
    calMes = now.getMonth() + 1
    calAno = now.getFullYear()
  }
  document.getElementById('cal-titulo').textContent = `${NOMES_MES[calMes - 1]} ${calAno}`
  document.getElementById('cal-dias').innerHTML = '<div class="cal-carregando">Carregando…</div>'
  try {
    calDados = await api(`/calendario?mes=${calMes}&ano=${calAno}${famQAnd()}`)
    // Abre no dia de hoje se o mês for o corrente; senão no primeiro dia com movimento.
    const forcado = calDiaForcado && calDados.dias.find(d => d.data === calDiaForcado)
    calDiaForcado = null
    const hojeNoMes = calDados.dias.find(d => d.data === calDados.hoje)
    const primeiroComItem = calDados.dias.find(d => d.itens.length)
    calDiaSel = (forcado || hojeNoMes || primeiroComItem || calDados.dias[0]).data
    renderCalendario()
  } catch(e) {
    document.getElementById('cal-dias').innerHTML = `<div class="cal-carregando">Erro: ${e.message}</div>`
  }
}

function navegarMes(delta) {
  calMes += delta
  if (calMes > 12) { calMes = 1; calAno++ }
  if (calMes < 1) { calMes = 12; calAno-- }
  carregarAgenda()
}

function renderCalendario() {
  const c = calDados
  renderCalResumo(c)

  const vazios = Array.from({ length: c.primeiroDiaSemana }, () => '<div class="cal-dia cal-vazio"></div>').join('')
  const celulas = c.dias.map(d => {
    const classes = ['cal-dia']
    if (d.data === c.hoje) classes.push('cal-hoje')
    if (d.data === calDiaSel) classes.push('cal-sel')
    if (d.saldo != null && d.saldo < 0) classes.push('cal-negativo')
    if (d.data < c.hoje) classes.push('cal-passado')

    // Até 4 pontos: entrada em verde, saídas na cor da categoria; previsto vira contorno;
    // compra no cartão fica apagada, porque o dinheiro só sai na fatura.
    const pontos = d.itens.slice().sort((x, y) => !!x.informativo - !!y.informativo).slice(0, 4).map(i => {
      const cor = i.tipo === 'entrada' ? '#10b981' : corCat(i.categoria)
      const apagado = i.informativo ? ' cal-dot-info' : ''
      return i.previsto
        ? `<i class="cal-dot cal-dot-prev${apagado}" style="border-color:${cor}"></i>`
        : `<i class="cal-dot${apagado}" style="background:${cor}"></i>`
    }).join('')
    const mais = d.itens.length > 4 ? `<i class="cal-mais">+${d.itens.length - 4}</i>` : ''

    return `<button class="${classes.join(' ')}" onclick="selecionarDia('${d.data}')">
      <span class="cal-num">${d.dia}</span>
      <span class="cal-dots">${pontos}${mais}</span>
    </button>`
  }).join('')

  document.getElementById('cal-dias').innerHTML = vazios + celulas
  renderDiaDetalhe()
}

function renderCalResumo(c) {
  const el = document.getElementById('cal-resumo')
  const resultado = c.totalEntradas - c.totalSaidas
  let saldoHtml = ''
  if (c.saldoFinal != null) {
    const corFinal = c.saldoFinal >= 0 ? '#10b981' : '#e11d48'
    const dataMenor = c.menorSaldo ? c.menorSaldo.data.slice(8, 10) + '/' + c.menorSaldo.data.slice(5, 7) : ''
    // O alerta é o ponto da tela: em que dia o dinheiro acaba, se acabar.
    const alerta = c.menorSaldo && c.menorSaldo.valor < 0
      ? `<div class="cal-alerta">⚠️ O saldo fica negativo em <b>${dataMenor}</b> (chega a ${fmt(c.menorSaldo.valor)})</div>`
      : c.menorSaldo
        ? `<div class="cal-ok">✅ Fecha no azul. Ponto mais baixo: ${fmt(c.menorSaldo.valor)} em ${dataMenor}</div>`
        : ''
    // Conta vencida e não marcada ainda vai sair da conta bancária: o saldo já a desconta hoje.
    const pend = c.pendentes && c.pendentes.qtd
      ? `<div class="cal-alerta cal-alerta-pend">💸 ${c.pendentes.qtd} ${c.pendentes.qtd === 1 ? 'conta vencida ou vencendo hoje' : 'contas vencidas ou vencendo hoje'} sem marcar como paga (${fmt(c.pendentes.total)}). O saldo previsto já desconta. Pagou? Marque <b>Paguei</b>.</div>`
      : ''
    saldoHtml = `
      <div class="cal-saldo-linha">
        <span>Saldo previsto no fim do mês</span>
        <b style="color:${corFinal}">${fmt(c.saldoFinal)}</b>
      </div>
      ${pend}
      ${alerta}`
  } else {
    saldoHtml = `<div class="cal-saldo-linha cal-saldo-info"><span>Saldo previsto só aparece do mês atual em diante</span></div>`
  }

  el.innerHTML = `
    <div class="cal-totais">
      <div><small>Entradas</small><b style="color:#10b981">${fmt(c.totalEntradas)}</b></div>
      <div><small>Saídas</small><b style="color:#e11d48">${fmt(c.totalSaidas)}</b></div>
      <div><small>Resultado</small><b style="color:${resultado >= 0 ? '#10b981' : '#e11d48'}">${fmt(resultado)}</b></div>
    </div>
    ${saldoHtml}`
}

function selecionarDia(data) {
  calDiaSel = data
  renderCalendario()
  document.getElementById('cal-dia-detalhe').scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

function renderDiaDetalhe() {
  const el = document.getElementById('cal-dia-detalhe')
  const d = calDados.dias.find(x => x.data === calDiaSel)
  if (!d) { el.innerHTML = ''; return }
  const [a, m, dia] = d.data.split('-')
  const semana = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'][new Date(+a, +m - 1, +dia).getDay()]

  const ddmm = data => data.slice(8, 10) + '/' + data.slice(5, 7)
  // Ordem: entradas, saídas que mexem no saldo, e por último as compras no cartão.
  const peso = i => i.tipo === 'entrada' ? 0 : i.informativo ? 2 : 1
  const itens = d.itens.length
    ? d.itens
        .slice()
        .sort((x, y) => peso(x) - peso(y) || y.valor - x.valor)
        .map(i => {
          const entrada = i.tipo === 'entrada'
          const icone = entrada
            ? (i.categoria === 'atendimento' ? '🩺' : i.categoria === 'salario' ? '💼' : '💰')
            : i.fonte === 'fatura' ? '💳' : (EMOJI_CAT[i.categoria] || '📦')
          const cor = entrada ? '#10b981' : corCat(i.categoria)
          const fonte = { recorrente: 'fixa', emprestimo: 'parcela', programada: 'renda fixa', estimada: '<span class="tag-estimada">estimativa</span>' }[i.fonte]
          let meta = `${entrada ? 'Entrada' : i.categoria}${fonte ? ' · ' + fonte : ''}`
          if (i.fonte === 'recebivel') {
            const destino = { investimento: 'vai para investimento', reserva: 'vai para a reserva', divida: 'vai quitar dívida', livre: 'entra no saldo' }[i.destino] || ''
            meta = `A receber · ${destino}${i.recebido ? ' · <span class="cal-tag-pago">✓ recebido</span>' : ''}`
          } else if (i.informativo) meta += ` · 💳 ${i.cartao}, sai na fatura de ${ddmm(i.vencimentoFatura)}`
          if (i.fonte === 'fatura') meta = `${i.compras.length} ${i.compras.length === 1 ? 'compra' : 'compras'}`
          // Conta a pagar: status e botão. Paga só por ser anterior ao "paguei" não ganha
          // "desfazer" — não há marcação para desfazer.
          let acao = ''
          if (i.conta && !i.pagoAuto) {
            // Dentro do <summary> da fatura, o clique no botão não pode abrir/fechar a lista.
            const pare = 'event.preventDefault();event.stopPropagation();'
            if (i.pago) {
              meta += ' · <span class="cal-tag-pago">✓ paga</span>'
              acao = `<button class="cal-desfazer" onclick="${pare}desfazerPaguei('${i.chave}')">desfazer</button>`
            } else {
              if (i.atrasada) meta += ' · <span class="cal-tag-atrasada">vencida</span>'
              else if (!i.previsto) meta += ' · <span class="cal-tag-atrasada">vence hoje</span>'
              else meta += ' · <span class="cal-tag-prev">previsto</span>'
              acao = `<button class="cp-paguei" onclick="${pare}marcarPaguei('${i.chave}', this)">Paguei</button>`
            }
          } else if (i.previsto) {
            meta += ' · <span class="cal-tag-prev">previsto</span>'
          }

          const corValor = entrada ? '#10b981' : i.informativo ? '#94a3b8' : '#e11d48'
          const linha = `<div class="cal-item${i.informativo ? ' cal-item-info-cartao' : ''}${i.conta && i.pago && !i.pagoAuto ? ' cal-item-pago' : ''}" style="border-left-color:${cor}">
            <span class="cal-item-ico">${icone}</span>
            <div class="cal-item-info">
              <div class="cal-item-desc">${i.descricao}</div>
              <div class="cal-item-meta">${meta}</div>
            </div>
            <div class="cal-item-dir">
              <b class="cal-item-val" style="color:${corValor}">${entrada ? '+' : '−'}${fmt(i.valor)}</b>
              ${acao}
            </div>
          </div>`

          if (i.fonte !== 'fatura') return linha
          // A fatura abre para mostrar de quais compras ela é feita.
          return `<details class="cal-fatura">
            <summary>${linha}</summary>
            <div class="cal-fatura-compras">
              ${i.compras.map(c => `<div><span>${ddmm(c.data)} · ${c.descricao}</span><b${c.valor < 0 ? ' style="color:#10b981"' : ''}>${c.valor < 0 ? '−' + fmt(-c.valor) : fmt(c.valor)}${c.creditoId ? ` <button class="cal-desfazer" onclick="removerCreditoFatura(${c.creditoId})">✕</button>` : ''}</b></div>`).join('')}
              <button class="cal-antecipar" onclick="registrarCreditoFatura(${i.cartaoId}, '${i.data}')">💵 Paguei parte antes / estorno</button>
            </div>
          </details>`
        }).join('')
    : `<div class="orc-vazio">Nenhum movimento neste dia</div>`

  const saldo = d.saldo != null
    ? `<div class="cal-dia-saldo">Saldo previsto ao fim do dia: <b style="color:${d.saldo >= 0 ? '#10b981' : '#e11d48'}">${fmt(d.saldo)}</b></div>`
    : ''

  el.innerHTML = `
    <div class="section-title-row"><span>${semana}, ${dia}/${m}</span></div>
    ${itens}
    ${saldo}`
}

// ══════════════════════════════════════════
//  CONTAS A PAGAR + "PAGUEI"
// ══════════════════════════════════════════
const ddmmStr = data => data.slice(8, 10) + '/' + data.slice(5, 7)

function quandoVence(data, hoje) {
  const dias = Math.round((new Date(data + 'T12:00:00') - new Date(hoje + 'T12:00:00')) / 86400000)
  if (dias < 0) return { txt: `venceu ${ddmmStr(data)}`, classe: 'cp-atrasada' }
  if (dias === 0) return { txt: 'vence hoje', classe: 'cp-hoje' }
  if (dias === 1) return { txt: 'amanhã', classe: 'cp-breve' }
  if (dias <= 2) return { txt: `em ${dias} dias`, classe: 'cp-breve' }
  return { txt: ddmmStr(data), classe: '' }
}

async function renderContasPagar() {
  const el = document.getElementById('contas-pagar-section')
  if (!el) return
  atualizarBotaoAvisos()
  try {
    const contas = await api('/contas-a-pagar' + famQ())
    // Mesmo fuso que o servidor usa para decidir o que está atrasado.
    const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
    const abertas = contas.filter(c => !c.pago)
    const pagas = contas.filter(c => c.pago && c.data >= hoje)
    if (!abertas.length) {
      el.innerHTML = `<div class="orc-vazio" onclick="mostrarAba('agenda');navBtn('nav-agenda')">
        <span>🎉</span><span>Nada vencendo nos próximos 7 dias${pagas.length ? ` · ${pagas.length} já ${pagas.length === 1 ? 'paga' : 'pagas'}` : ''}</span>
      </div>`
      return
    }
    const totalAberto = abertas.reduce((acc, c) => acc + c.valor, 0)
    const atrasadas = abertas.filter(c => c.atrasada)
    el.innerHTML = `
      ${atrasadas.length ? `<div class="cp-alerta">⚠️ ${atrasadas.length} ${atrasadas.length === 1 ? 'conta vencida' : 'contas vencidas'} sem marcar como paga. Já pagou? Toque em <b>Paguei</b>.</div>` : ''}
      ${abertas.slice(0, 6).map(c => {
        const q = quandoVence(c.data, hoje)
        const icone = c.fonte === 'fatura' ? '💳' : (EMOJI_CAT[c.categoria] || '📦')
        return `<div class="cp-item ${q.classe}">
          <span class="cp-ico">${icone}</span>
          <div class="cp-info">
            <div class="cp-desc">${c.descricao}</div>
            <div class="cp-quando">${q.txt}</div>
          </div>
          <b class="cp-valor">${fmt(c.valor)}</b>
          <button class="cp-paguei" onclick="marcarPaguei('${c.chave}', this)">Paguei</button>
        </div>`
      }).join('')}
      <div class="cp-rodape" onclick="mostrarAba('agenda');navBtn('nav-agenda')">
        <span>${abertas.length > 6 ? `+${abertas.length - 6} contas · ` : ''}Total em aberto: <b>${fmt(totalAberto)}</b></span>
        <span>Ver na agenda ›</span>
      </div>`
  } catch(e) {
    el.innerHTML = `<div class="orc-vazio">Não foi possível carregar as contas</div>`
  }
}

async function marcarPaguei(chave, btn) {
  if (btn) { btn.disabled = true; btn.textContent = '…' }
  try {
    await api('/pagamentos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chave, usuarioId: usuario.id }) })
    toast('✅ Marcada como paga')
    renderContasPagar()
    if (document.getElementById('aba-agenda').style.display !== 'none') carregarAgenda()
  } catch(e) {
    toast('❌ ' + e.message, 'erro')
    if (btn) { btn.disabled = false; btn.textContent = 'Paguei' }
  }
}

async function desfazerPaguei(chave) {
  try {
    await api('/pagamentos', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chave }) })
    toast('↩️ Voltou a ficar em aberto')
    renderContasPagar()
    if (document.getElementById('aba-agenda').style.display !== 'none') carregarAgenda()
  } catch(e) { toast('❌ ' + e.message, 'erro') }
}

// ══════════════════════════════════════════
//  AVISOS (WEB PUSH)
// ══════════════════════════════════════════
const ehIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const appInstalado = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
const pushSuportado = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
const descreverAparelho = () => ehIOS() ? 'iPhone' : /Android/i.test(navigator.userAgent) ? 'Android' : 'Navegador'

// No iPhone o push só existe com o app aberto pela tela inicial (iOS 16.4+);
// no Safari comum o PushManager nem aparece, então essa checagem vem primeiro.
async function estadoPush() {
  if (ehIOS() && !appInstalado()) return 'precisa-instalar'
  if (!pushSuportado()) return 'sem-suporte'
  if (Notification.permission === 'denied') return 'negado'
  try {
    const reg = await navigator.serviceWorker.ready
    return (await reg.pushManager.getSubscription()) ? 'ativo' : 'inativo'
  } catch(e) { return 'inativo' }
}

async function atualizarBotaoAvisos() {
  const estado = await estadoPush()
  // Cartão de convite no topo do Início: some quando já está ativo. No iPhone antigo continua
  // aparecendo para o modal explicar que precisa atualizar o iOS.
  const convite = document.getElementById('push-convite')
  // No computador o convite só atrapalha: os avisos são para o celular.
  const ehCelular = window.matchMedia('(pointer: coarse)').matches
  const esconder = !ehCelular || estado === 'ativo' || (estado === 'sem-suporte' && !ehIOS())
  if (convite) convite.style.display = esconder ? 'none' : 'flex'
  const btn = document.getElementById('btn-avisos')
  if (!btn) return
  btn.textContent = estado === 'ativo' ? '🔔 Avisos ✓' : '🔔 Ativar avisos'
  btn.classList.toggle('btn-avisos-on', estado === 'ativo')
}

async function abrirModalPush() {
  document.getElementById('modal-push').style.display = 'flex'
  const el = document.getElementById('push-conteudo')
  const estado = await estadoPush()
  const telas = {
    'precisa-instalar': `
      <div class="push-passos">
        <b>No iPhone, os avisos só funcionam com o app na tela inicial:</b>
        <ol>
          <li>Abra este endereço no <b>Safari</b></li>
          <li>Toque em <b>Compartilhar</b> <span class="push-ico">⬆️</span> na barra de baixo</li>
          <li>Escolha <b>Adicionar à Tela de Início</b> e confirme</li>
          <li>Abra o app <b>pelo ícone</b> novo e toque em 🔔 de novo</li>
        </ol>
        <small>Precisa do iOS 16.4 ou mais novo (Ajustes → Geral → Sobre).</small>
      </div>`,
    'sem-suporte': ehIOS()
      ? `<div class="push-passos">Este iPhone ainda não aceita avisos de apps da tela inicial. Atualize para o <b>iOS 16.4 ou mais novo</b> (Ajustes → Geral → Atualização de Software) e tente de novo.</div>`
      : `<div class="push-passos">Este navegador não aceita avisos. No Android, abra o app pelo <b>Chrome</b>.</div>`,
    'negado': `
      <div class="push-passos">
        <b>Os avisos foram bloqueados neste aparelho.</b> Para liberar:
        <ul>
          <li><b>iPhone:</b> Ajustes → Notificações → Finanças → Permitir</li>
          <li><b>Android:</b> segure o ícone do app → ⓘ Informações → Notificações</li>
        </ul>
        Depois volte aqui e toque em ativar.
      </div>`,
    'inativo': `<button class="btn-confirm btn-verde" style="width:100%" onclick="ativarPush(this)">🔔 Ativar avisos neste aparelho</button>`,
    'ativo': `
      <div class="push-ok">✅ Avisos ativos neste aparelho (${descreverAparelho()})</div>
      <div class="modal-btns">
        <button class="btn-cancel" onclick="desativarPush()">Desativar</button>
        <button class="btn-confirm" onclick="testarPush(this)">Enviar teste</button>
      </div>`
  }
  el.innerHTML = telas[estado]
}

function base64UrlParaBytes(base64) {
  const pad = '='.repeat((4 - base64.length % 4) % 4)
  const bin = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, c => c.charCodeAt(0))
}

async function ativarPush(btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Ativando…' }
  try {
    // O pedido de permissão tem de ser a primeira coisa após o toque: o Safari recusa
    // se houver uma chamada de rede antes.
    const permissao = await Notification.requestPermission()
    if (permissao !== 'granted') { await abrirModalPush(); return }
    const { chave } = await api('/push/chave')
    const reg = await navigator.serviceWorker.ready
    const inscricao = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlParaBytes(chave) })
    await api('/push/inscrever', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuarioId: usuario.id, inscricao: inscricao.toJSON(), dispositivo: descreverAparelho() })
    })
    await testarPush()
    await abrirModalPush()
    atualizarBotaoAvisos()
  } catch(e) {
    toast('❌ Não foi possível ativar: ' + e.message, 'erro')
    if (btn) { btn.disabled = false; btn.textContent = '🔔 Ativar avisos neste aparelho' }
  }
}

async function testarPush(btn) {
  if (btn) btn.disabled = true
  try {
    const { enviados } = await api('/push/teste', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuarioId: usuario.id }) })
    toast(enviados ? '🔔 Aviso de teste enviado' : '⚠️ Nenhum aparelho recebeu — tente ativar de novo', enviados ? undefined : 'erro')
  } catch(e) { toast('❌ ' + e.message, 'erro') }
  if (btn) btn.disabled = false
}

async function desativarPush() {
  try {
    const reg = await navigator.serviceWorker.ready
    const inscricao = await reg.pushManager.getSubscription()
    if (inscricao) {
      await api('/push/cancelar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: inscricao.endpoint }) })
      await inscricao.unsubscribe()
    }
    toast('🔕 Avisos desativados neste aparelho')
    await abrirModalPush()
    atualizarBotaoAvisos()
  } catch(e) { toast('❌ ' + e.message, 'erro') }
}

// Se o aparelho já tem inscrição, confirma no servidor de quem ela é: o mesmo celular
// pode ter trocado de usuário, e o aviso tem de ir para quem está logado.
async function sincronizarPush() {
  if (await estadoPush() !== 'ativo') return
  try {
    const reg = await navigator.serviceWorker.ready
    const inscricao = await reg.pushManager.getSubscription()
    if (inscricao) await api('/push/inscrever', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuarioId: usuario.id, inscricao: inscricao.toJSON(), dispositivo: descreverAparelho() })
    })
  } catch(e) { /* silencioso: tenta de novo na próxima abertura */ }
}

// Toque numa notificação abre o app em /?aba=agenda&dia=AAAA-MM-DD.
function abrirLink(url) {
  const p = new URL(url, location.origin).searchParams
  if (p.get('aba') === 'metas') {
    mostrarAba('metas')
    navBtn('nav-metas')
    return true
  }
  if (p.get('aba') !== 'agenda') return false
  const dia = p.get('dia')
  if (dia && /^\d{4}-\d{2}-\d{2}$/.test(dia)) {
    calAno = Number(dia.slice(0, 4))
    calMes = Number(dia.slice(5, 7))
    calDiaForcado = dia
  }
  mostrarAba('agenda')
  navBtn('nav-agenda')
  return true
}

function tratarLinkInicial() {
  if (abrirLink(location.href)) history.replaceState(null, '', '/')
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data && e.data.tipo === 'abrir-url' && usuario) abrirLink(e.data.url)
  })
}

// ══════════════════════════════════════════
//  PATRIMÔNIO E VALORES A RECEBER (aba Metas)
// ══════════════════════════════════════════
const escH = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const hojeLocalBR = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
const dataBR = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : ''
const TIPO_PT = {
  reserva: { emoji: '🛟', nome: 'Reserva', cor: '#0ea5e9' },
  investimento: { emoji: '📈', nome: 'Investimentos', cor: '#16a34a' },
  negocio: { emoji: '🏪', nome: 'Negócios', cor: '#f59e0b' },
  bem: { emoji: '🏠', nome: 'Bens', cor: '#8b5cf6' },
  outro: { emoji: '📦', nome: 'Outros', cor: '#64748b' }
}
const DESTINO_RB = {
  investimento: '📈 Investir', reserva: '🛟 Reserva', divida: '💸 Quitar dívida', livre: '🛒 Usar no mês'
}
let ptItens = []
let ptEdicaoId = null
let ptTipoSel = 'investimento'
let rbDestinoSel = 'investimento'
let rcAtual = null
let rcDestinoSel = 'investimento'

async function renderPatrimonio() {
  const el = document.getElementById('patrimonio-section')
  if (!el) return
  try {
    const { itens, resumo: r } = await api('/patrimonio' + famQ())
    ptItens = itens
    const linhas = Object.entries(TIPO_PT)
      .filter(([t]) => r.porTipo[t])
      .map(([t, info]) => `<div class="pt-linha"><span>${info.emoji} ${info.nome}</span><b>${fmt(r.porTipo[t])}</b></div>`).join('')
    const max = Math.max(1, ...r.historico.map(h => Math.abs(h.liquido)))
    const barras = r.historico.length > 1 ? `
      <div class="pt-hist">${r.historico.map(h => `
        <div class="pt-hist-col" title="${h.mes}: ${fmt(h.liquido)}">
          <div class="pt-hist-bar ${h.liquido < 0 ? 'neg' : ''}" style="height:${Math.max(4, Math.abs(h.liquido) / max * 46)}px"></div>
          <span>${h.mes.slice(5)}</span>
        </div>`).join('')}
      </div>` : ''
    el.innerHTML = `
      <div class="pt-card">
        <div class="pt-label">Patrimônio líquido</div>
        <div class="pt-valor ${r.liquido < 0 ? 'neg' : ''}">${fmt(r.liquido)}</div>
        <div class="pt-sub">Com o que ainda vai receber: <b>${fmt(r.liquidoComReceber)}</b></div>
        ${barras}
        <div class="pt-linhas">
          ${linhas}
          <div class="pt-linha"><span>🏦 Saldo nas contas</span><b>${fmt(r.contas)}</b></div>
          <div class="pt-linha neg"><span>💸 Dívidas</span><b>− ${fmt(r.dividas)}</b></div>
          ${r.aReceber ? `<div class="pt-linha receber"><span>💰 A receber</span><b>+ ${fmt(r.aReceber)}</b></div>` : ''}
        </div>
      </div>
      ${itens.length ? `<div class="pt-itens">${itens.map(p => {
        const info = TIPO_PT[p.tipo] || TIPO_PT.outro
        return `<div class="pt-item" style="border-left-color:${info.cor}" onclick="abrirModalPatrimonio(${p.id})">
          <div><div class="pt-item-nome">${info.emoji} ${escH(p.nome)}</div>
          <div class="pt-item-sub">${escH(p.instituicao || info.nome)}${visaoAtual === 'consolidado' ? ' · ' + escH(p.usuario_nome) : ''} · atualizado ${dataBR(p.atualizado_em)}</div></div>
          <b>${fmt(p.valor)}</b></div>`
      }).join('')}</div>` : `<div class="pt-vazio" onclick="abrirModalPatrimonio()">Cadastre sua reserva, investimentos, negócios e bens para acompanhar o patrimônio crescer. <b>＋ Adicionar</b></div>`}`
  } catch (e) {
    el.innerHTML = `<div class="pt-vazio">Não foi possível carregar o patrimônio: ${escH(e.message)}</div>`
  }
}

function selPtTipo(tipo) {
  ptTipoSel = tipo
  document.querySelectorAll('#pt-tipos .rtipo-btn').forEach(b => b.classList.toggle('sel', b.dataset.tipo === tipo))
}
function abrirModalPatrimonio(id = null) {
  const p = id ? ptItens.find(x => x.id === id) : null
  ptEdicaoId = p ? p.id : null
  document.getElementById('pt-titulo').textContent = p ? '🏛️ Editar item' : '🏛️ Novo item do patrimônio'
  document.getElementById('pt-nome').value = p?.nome || ''
  document.getElementById('pt-inst').value = p?.instituicao || ''
  document.getElementById('pt-valor').value = p ? String(Number(p.valor).toFixed(2)).replace('.', ',') : ''
  document.getElementById('pt-excluir').style.display = p ? 'block' : 'none'
  selPtTipo(p?.tipo || 'investimento')
  document.getElementById('modal-patrimonio').style.display = 'flex'
}
async function salvarPatrimonioItem() {
  const nome = document.getElementById('pt-nome').value.trim()
  if (!nome) { toast('Informe o nome!', 'erro'); return }
  const body = { usuarioId: usuario.id, tipo: ptTipoSel, nome, instituicao: document.getElementById('pt-inst').value.trim(), valor: parseBRL(document.getElementById('pt-valor').value) }
  try {
    await api(ptEdicaoId ? `/patrimonio/${ptEdicaoId}` : '/patrimonio', {
      method: ptEdicaoId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    })
    fecharModal('modal-patrimonio')
    toast('✅ Patrimônio atualizado')
    renderPatrimonio()
  } catch (e) { toast('❌ ' + e.message, 'erro') }
}
async function excluirPatrimonio() {
  if (!ptEdicaoId || !confirm('Excluir este item do patrimônio?')) return
  await api(`/patrimonio/${ptEdicaoId}`, { method: 'DELETE' })
  fecharModal('modal-patrimonio')
  renderPatrimonio()
}

async function renderRecebiveis() {
  const el = document.getElementById('recebiveis-section')
  if (!el) return
  try {
    const lista = await api('/recebiveis' + famQ())
    if (!lista.length) {
      el.innerHTML = `<div class="pt-vazio" onclick="abrirModalRecebivel()">Venda parcelada, dinheiro que vão te devolver… Cadastre e o app mostra na Agenda e avisa se atrasar. <b>＋ Novo</b></div>`
      return
    }
    const hoje = hojeLocalBR()
    const grupos = {}
    for (const r of lista) (grupos[r.grupo] ||= []).push(r)
    el.innerHTML = Object.entries(grupos).map(([grupo, rs]) => {
      const total = rs.reduce((a, r) => a + Number(r.valor), 0)
      const recebido = rs.filter(r => r.recebido_em).reduce((a, r) => a + Number(r.valor_recebido ?? r.valor), 0)
      const pend = rs.filter(r => !r.recebido_em)
      const atrasados = pend.filter(r => r.data_prevista < hoje)
      const proximos = pend.filter(r => r.data_prevista >= hoje)
      const pct = total > 0 ? Math.min(100, recebido / total * 100) : 0
      const linha = r => {
        const atr = !r.recebido_em && r.data_prevista < hoje
        return `<div class="rb-item ${r.recebido_em ? 'ok' : ''} ${atr ? 'atr' : ''}">
          <div class="rb-item-info">
            <div class="rb-item-nome">${escH(r.descricao)} <span class="rb-tag">${DESTINO_RB[r.destino] || ''}</span></div>
            <div class="rb-item-sub">${r.recebido_em ? `✅ recebido em ${dataBR(r.recebido_em)}${r.patrimonio_nome ? ' → ' + escH(r.patrimonio_nome) : ''}` : (atr ? '⚠️ atrasado · era ' : 'previsto ') + dataBR(r.data_prevista)}</div>
          </div>
          <div class="rb-item-dir">
            <b>${fmt(r.valor_recebido ?? r.valor)}</b>
            ${r.recebido_em
              ? `<button class="cal-desfazer" onclick="desfazerRecebi(event, ${r.id})">desfazer</button>`
              : `<button class="cp-paguei" onclick="abrirRecebi(${r.id})">Recebi</button>`}
          </div>
        </div>`
      }
      const visiveis = [...atrasados, ...proximos.slice(0, 2)]
      const resto = rs.filter(r => !visiveis.includes(r))
      return `<div class="rb-grupo">
        <div class="rb-topo">
          <div><div class="rb-nome">💰 ${escH(grupo)}</div>
          <div class="rb-sub">${rs.length - pend.length} de ${rs.length} recebidos${visaoAtual === 'consolidado' ? ' · ' + escH(rs[0].usuario_nome) : ''}</div></div>
          <div class="rb-total"><b>${fmt(recebido)}</b><span>de ${fmt(total)}</span></div>
        </div>
        <div class="rb-barra"><div style="width:${pct}%"></div></div>
        ${visiveis.map(linha).join('')}
        ${resto.length ? `<details class="rb-mais"><summary>Ver todos (${resto.length} a mais)</summary>${resto.map(linha).join('')}</details>` : ''}
      </div>`
    }).join('')
  } catch (e) {
    el.innerHTML = `<div class="pt-vazio">Não foi possível carregar: ${escH(e.message)}</div>`
  }
}

function selRbDestino(d) {
  rbDestinoSel = d
  document.querySelectorAll('#rb-destinos .rtipo-btn').forEach(b => b.classList.toggle('sel', b.dataset.destino === d))
}
function abrirModalRecebivel() {
  document.getElementById('rb-grupo').value = ''
  document.getElementById('rb-valor').value = ''
  document.getElementById('rb-qtd').value = '1'
  document.getElementById('rb-data').value = hojeLocalBR()
  selRbDestino('investimento')
  document.getElementById('modal-recebivel').style.display = 'flex'
}
// Mesma data nos meses seguintes; em mês mais curto, cai no último dia.
function somaMesesData(data, n) {
  const [a, m, d] = data.split('-').map(Number)
  const alvo = new Date(a, m - 1 + n, 1)
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate()
  return `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`
}
async function salvarRecebivel() {
  const grupo = document.getElementById('rb-grupo').value.trim()
  const valor = parseBRL(document.getElementById('rb-valor').value)
  const qtd = Math.min(120, Math.max(1, parseInt(document.getElementById('rb-qtd').value) || 1))
  const data = document.getElementById('rb-data').value
  if (!grupo || !(valor > 0) || !data) { toast('Preencha nome, valor e data!', 'erro'); return }
  const itens = Array.from({ length: qtd }, (_, i) => ({
    descricao: qtd > 1 ? `Parcela ${i + 1}/${qtd}` : 'Entrada', valor, data: somaMesesData(data, i), destino: rbDestinoSel
  }))
  try {
    await api('/recebiveis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuarioId: usuario.id, grupo, itens }) })
    fecharModal('modal-recebivel')
    toast(`✅ ${qtd} valor${qtd > 1 ? 'es' : ''} a receber cadastrado${qtd > 1 ? 's' : ''}`)
    renderRecebiveis(); renderPatrimonio()
  } catch (e) { toast('❌ ' + e.message, 'erro') }
}

function selRcDestino(d) {
  rcDestinoSel = d
  document.querySelectorAll('#rc-destinos .rtipo-btn').forEach(b => b.classList.toggle('sel', b.dataset.destino === d))
  const ondeVisivel = d === 'investimento' || d === 'reserva'
  document.getElementById('rc-onde').style.display = ondeVisivel ? 'block' : 'none'
  if (ondeVisivel) {
    const sel = document.getElementById('rc-patrimonio')
    const opcoes = ptItens.filter(p => p.tipo === d)
    sel.innerHTML = opcoes.map(p => `<option value="${p.id}">${escH(p.nome)} (${fmt(p.valor)})</option>`).join('') +
      `<option value="novo">＋ Criar "${d === 'reserva' ? 'Reserva de emergência' : 'Investimentos'}"</option>` +
      `<option value="">Não somar em nenhum</option>`
  }
}
async function abrirRecebi(id) {
  const lista = await api('/recebiveis' + famQ())
  rcAtual = lista.find(r => r.id === id)
  if (!rcAtual) return
  try { ptItens = (await api('/patrimonio' + famQ())).itens } catch (e) {}
  document.getElementById('rc-desc').textContent = `${rcAtual.grupo} · ${rcAtual.descricao} — previsto ${dataBR(rcAtual.data_prevista)}`
  document.getElementById('rc-valor').value = String(Number(rcAtual.valor).toFixed(2)).replace('.', ',')
  document.getElementById('rc-data').value = hojeLocalBR()
  selRcDestino(rcAtual.destino || 'investimento')
  document.getElementById('modal-recebi').style.display = 'flex'
}
async function confirmarRecebi() {
  if (!rcAtual) return
  try {
    let patrimonioId = null
    if (rcDestinoSel === 'investimento' || rcDestinoSel === 'reserva') {
      const v = document.getElementById('rc-patrimonio').value
      if (v === 'novo') {
        const novo = await api('/patrimonio', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usuarioId: rcAtual.usuario_id, tipo: rcDestinoSel, nome: rcDestinoSel === 'reserva' ? 'Reserva de emergência' : 'Investimentos', valor: 0 }) })
        patrimonioId = novo.id
      } else if (v) patrimonioId = parseInt(v)
    }
    await api(`/recebiveis/${rcAtual.id}/recebi`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ valor: parseBRL(document.getElementById('rc-valor').value), data: document.getElementById('rc-data').value, destino: rcDestinoSel, patrimonioId }) })
    fecharModal('modal-recebi')
    toast('✅ Recebimento registrado')
    renderRecebiveis(); renderPatrimonio()
  } catch (e) { toast('❌ ' + e.message, 'erro') }
}
async function desfazerRecebi(ev, id) {
  ev.preventDefault(); ev.stopPropagation()
  if (!confirm('Desfazer este recebimento? Se o valor foi somado num item do patrimônio, ele sai de lá.')) return
  await api(`/recebiveis/${id}/recebi`, { method: 'DELETE' })
  renderRecebiveis(); renderPatrimonio()
}

// ── Pagamento antecipado / estorno que abate uma fatura (Agenda) ──
async function registrarCreditoFatura(cartaoId, vencimento) {
  const txt = prompt('Quanto você já pagou (ou foi estornado) desta fatura?\n\nO valor sai do total que ainda vai vencer.')
  if (txt === null) return
  const valor = parseBRL(txt)
  if (!(valor > 0)) { toast('Valor inválido', 'erro'); return }
  try {
    await api('/creditos-fatura', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cartaoId, vencimento, valor }) })
    toast('✅ Fatura abatida')
    carregarAgenda(); renderContasPagar()
  } catch (e) { toast('❌ ' + e.message, 'erro') }
}
async function removerCreditoFatura(id) {
  if (!confirm('Remover este abatimento da fatura?')) return
  await api('/creditos-fatura/' + id, { method: 'DELETE' })
  carregarAgenda(); renderContasPagar()
}

// ── START ──
init()
