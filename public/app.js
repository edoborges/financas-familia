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
  'Vestuário':'👕','Cuidados pessoais':'💇','Casa':'🏠','Financiamento':'🏦','Assinatura':'📱',
  'Restaurante':'🍕','Outros':'📦'
}
// Uma cor por categoria, usada no calendário, na pizza e nas barras de orçamento.
const COR_CAT = {
  'Alimentação':'#f97316','Mercado':'#84cc16','Saúde':'#ef4444','Farmácia':'#f43f5e',
  'Transporte':'#3b82f6','Combustível':'#0ea5e9','Educação':'#8b5cf6','Lazer':'#ec4899',
  'Vestuário':'#d946ef','Cuidados pessoais':'#db2777','Casa':'#a16207','Financiamento':'#64748b','Assinatura':'#6366f1',
  'Restaurante':'#f59e0b','Outros':'#94a3b8','Fatura':'#475569'
}
const corCat = c => COR_CAT[c] || '#94a3b8'
const inicialNome = n => (String(n || '?').trim().charAt(0) || '?').toUpperCase()
// Número do saldo sobe até o valor (só na primeira vez que muda; quem prefere menos movimento vê direto).
function contarAte(el, valor, prefixo) {
  const final = prefixo + fmt(valor)
  const reduz = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduz || el.dataset.valor === String(valor)) { el.textContent = final; el.dataset.valor = valor; return }
  const ini = parseFloat(el.dataset.valor || 0) || 0
  el.dataset.valor = valor
  const t0 = performance.now(), dur = 700
  const passo = agora => {
    const p = Math.min(1, (agora - t0) / dur), e = 1 - Math.pow(1 - p, 3)
    el.textContent = p < 1 ? prefixo + fmt(ini + (valor - ini) * e) : final
    if (p < 1) requestAnimationFrame(passo)
  }
  requestAnimationFrame(passo)
}
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
        <div class="login-avatar">${inicialNome(u.nome)}</div>
        <div class="login-info">
          <div class="login-nome">${u.nome}</div>
          <div class="login-sal">${cel ? '📱 ' + cel : 'Toque para entrar'}</div>
        </div>
        <span class="login-arrow">›</span>
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
  document.getElementById('pin-avatar').textContent = inicialNome(u.nome)
  document.getElementById('pin-nome').textContent = 'Olá, ' + u.nome
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
  document.getElementById('h-avatar').textContent = inicialNome(usuario.nome)
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
    contarAte(saldoEl, resultado, positivo ? '+' : '')
    saldoEl.style.color = positivo ? '#8FE0BE' : '#FFB4A8'

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
    const alertaPct = pct > 80 ? `<span class="badge-alerta">⚠️ ${pct}% usado</span>` : `<span style="color:rgba(255,255,255,.6)">${pct}% da renda usada</span>`
    const dividas = (resumo.totalEmDividas || 0) > 0 ? `<span class="badge-alerta">💸 Dívidas: ${fmt(resumo.totalEmDividas)}</span>` : ''
    document.getElementById('b-alerta').innerHTML = alertaPct + ' ' + dividas

    // Score de saúde financeira
    const score = calcularScore(resumo, orcs, cats)
    renderScoreCard(score)

    // Meta de renda e contas a pagar
    renderMetaRendaCard()
    renderContasPagar()
    renderLivre()
    renderBannerRevisar()
    renderBannerOutros()

    // Patrimônio líquido
    renderPatrimonio(resumo)

    // Planejamento (reserva, mesada, cobranças fixas, dívidas, quem gastou, mês passado)
    renderPlanejamento().catch(e => console.error('planejamento:', e))

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
    const usado = c.limite_usado ?? c.gasto_atual
    const pct = c.limite > 0 ? Math.min((usado/c.limite)*100,100) : 0
    const disp = c.limite > 0 ? c.limite - usado : null
    const venc = c.proxima_fatura ? ddmmStr(c.proxima_fatura.data) : null
    return `
      <div class="cartao-visual" style="background:linear-gradient(135deg,${c.cor1||'#1a1a2e'},${c.cor2||'#16213e'})"
           onclick="${venc ? `abrirLink('/?aba=agenda&dia=${c.proxima_fatura.data}')` : `mostrarAba('cartoes');navBtn('nav-cartoes')`}">
        <div class="cv-nome">💳 ${c.nome} <span style="font-size:.7rem;opacity:.8">${venc ? 'vence ' + venc : 'sem fatura em aberto'}</span></div>
        <div class="cv-bottom">
          <div class="cv-limite">${c.limite > 0 ? 'Limite ' + fmt(c.limite) : 'Limite não informado'}</div>
          <div class="cv-valores">
            <div class="cv-gasto">${fmt(c.gasto_atual)}</div>
            <div class="cv-disp">Disponível<br><strong>${disp != null ? fmt(disp) : '—'}</strong></div>
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

const _gastosVistos = new Map()
function txItemHTML(g) {
  _gastosVistos.set(g.id, g)
  const data = new Date(g.data_gasto+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})
  const cartao = g.cartao_nome ? ` · ${g.cartao_nome}` : ''
  const origemClass = g.origem === 'importado' ? ' tx-importado' : g.origem === 'recorrente' ? ' tx-recorrente' : ''
  return `
    <div class="tx-item${origemClass}" id="tx-${g.id}">
      <div class="tx-emoji" style="--c:${corCat(g.categoria)}" onclick="abrirCategoriaGasto(${g.id})">${EMOJI_CAT[g.categoria]||'📦'}</div>
      <div class="tx-info" onclick="abrirCategoriaGasto(${g.id})">
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

// ── CATEGORIA DE UM LANÇAMENTO ──
// Lista de categorias: CATS_GASTO (definida junto da revisão do Open Finance).
let catGastoAtual = null

function abrirCategoriaGasto(id) {
  const g = _gastosVistos.get(id)
  if (!g) return
  catGastoAtual = g
  const data = new Date(g.data_gasto + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  document.getElementById('cg-info').innerHTML = `<b>${escH(g.descricao)}</b><span>${fmt(g.valor)} · ${data}${g.cartao_nome ? ' · ' + escH(g.cartao_nome) : ''}</span>`
  document.getElementById('cg-grade').innerHTML = CATS_GASTO.map(c => `
    <button class="cg-cat${c === g.categoria ? ' on' : ''}" style="--c:${corCat(c)}" onclick="salvarCategoriaGasto('${c}')">
      <span class="cg-ic">${EMOJI_CAT[c] || '📦'}</span>${c}
    </button>`).join('')
  document.getElementById('cg-iguais').checked = true
  document.getElementById('modal-catgasto').style.display = 'flex'
}

async function salvarCategoriaGasto(categoria) {
  const g = catGastoAtual
  if (!g) return
  const iguais = document.getElementById('cg-iguais').checked
  try {
    const r = await api(`/gastos/${g.id}/categoria`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ categoria, iguais })
    })
    fecharModal('modal-catgasto')
    toast(r.alterados > 1 ? `✅ ${r.alterados} lançamentos agora em ${categoria}` : `✅ Agora em ${categoria}`)
    for (const v of _gastosVistos.values()) if (v.id === g.id) v.categoria = categoria
    if (document.getElementById('modal-outros').style.display === 'flex') renderListaOutros()
    carregarInicio()
  } catch (e) { toast('❌ ' + e.message, 'erro') }
}

// Lançamentos do mês em "Outros": aviso no Início e lista para organizar.
async function gastosOutrosMes() {
  const lista = await api('/gastos' + famQ())
  return lista.filter(g => (g.categoria || 'Outros') === 'Outros')
}
async function renderBannerOutros() {
  const el = document.getElementById('outros-banner')
  if (!el) return
  try {
    const outros = await gastosOutrosMes()
    if (!outros.length) { el.style.display = 'none'; return }
    const total = outros.reduce((a, g) => a + Number(g.valor), 0)
    el.innerHTML = `📦 <b>${outros.length}</b> lançamento${outros.length > 1 ? 's' : ''} em "Outros" este mês (${fmt(total)}). Organizar <span>→</span>`
    el.style.display = 'flex'
  } catch (e) { el.style.display = 'none' }
}
function abrirOutros() {
  document.getElementById('modal-outros').style.display = 'flex'
  renderListaOutros()
}
async function renderListaOutros() {
  const el = document.getElementById('outros-lista')
  el.innerHTML = '<div class="plano-loading"><div class="spinner"></div></div>'
  try {
    const outros = await gastosOutrosMes()
    el.innerHTML = outros.length
      ? outros.map(txItemHTML).join('')
      : '<div class="pt-vazio">Tudo com categoria 🎉</div>'
    el.querySelectorAll('.tx-del-btn').forEach(b => b.remove())
  } catch (e) { el.innerHTML = `<div class="pt-vazio">Não foi possível carregar: ${escH(e.message)}</div>` }
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
  renderInvestResumo()
  renderPatrimonio()
  renderRecebiveis()
  renderOportunidades()
  const [metas, resumo] = await Promise.all([api('/metas' + famQ()), api('/resumo' + famQ())])

  // Resumo financeiro do planejamento. Usa a renda real do mês (programadas + lançadas),
  // a mesma do Início — salarioTotal é o campo legado do cadastro e costuma estar zerado.
  const renda = resumo.rendaTotal || 0
  const economia = renda - resumo.gastosMes
  document.getElementById('plan-resumo').innerHTML = `
    <div style="color:rgba(255,255,255,.6);font-size:.8rem;font-weight:500;margin-bottom:8px">Visão do planejamento</div>
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
      const usado = c.limite_usado ?? c.gasto_atual
      const pct = c.limite > 0 ? Math.min((usado/c.limite)*100,100) : 0
      const disp = c.limite > 0 ? c.limite - usado : null
      const alerta = pct > 80 ? '⚠️ ' : ''
      const venc = c.proxima_fatura ? ddmmStr(c.proxima_fatura.data) : null
      const futuras = (c.faturas_futuras || []).slice(1, 4).map(f => `${ddmmStr(f.data)} ${fmt(f.valor)}`).join(' · ')
      return `
        <div class="cartao-full" style="background:linear-gradient(135deg,${c.cor1||'#1a1a2e'},${c.cor2||'#16213e'});cursor:pointer"
             onclick="${venc ? `abrirLink('/?aba=agenda&dia=${c.proxima_fatura.data}')` : ''}">
          <div class="cf-top">
            <div>
              <div class="cf-nome">${alerta}💳 ${c.nome}</div>
              <div class="cf-usuario">👤 ${c.usuario_nome} · fecha dia ${c.dia_fechamento}, vence dia ${c.dia_vencimento}${c.limite_usado_fonte === 'banco' ? ' · 🔌 do banco' : ''}</div>
            </div>
            <div class="cf-bandeira">${c.bandeira||'Visa'}</div>
          </div>
          <div class="cf-barra"><div class="cf-barra-fill" style="width:${pct}%"></div></div>
          <div class="cf-bottom">
            <div>
              <div class="cf-label">${venc ? 'Fatura de ' + venc : 'Próxima fatura'}</div>
              <div class="cf-valor">${fmt(c.gasto_atual)}</div>
            </div>
            <div class="cf-disp">
              <div class="cf-label">Disponível</div>
              <div class="cf-valor">${disp != null ? fmt(disp) : '—'}</div>
            </div>
            <div>
              <div class="cf-label">Limite total</div>
              <div class="cf-valor">${c.limite > 0 ? fmt(c.limite) : '—'}</div>
            </div>
          </div>
          ${futuras ? `<div class="cf-futuras">Próximas: ${futuras}</div>` : ''}
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
  if (nome === 'viagens') carregarViagens()
  document.getElementById('app-main').scrollTop = 0
}

// ── ABA CONTAS ──
const TIPO_LABEL_CONTA = { corrente: 'Conta Corrente', poupanca: 'Poupança', investimento: 'Investimento', dinheiro: 'Carteira' }
const TIPO_ICONE_CONTA = { corrente: '🏦', poupanca: '🐷', investimento: '📈', dinheiro: '👛' }
const CORES_CONTA = ['#2563eb','#16a34a','#7c3aed','#d97706','#0891b2','#db2777']

async function carregarContas() {
  renderTransferencias()
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
  document.getElementById('ec-limite').value = conta.limite ? String(conta.limite).replace('.', ',') : ''
  document.getElementById('modal-editar-conta').style.display = 'flex'
}
async function salvarEdicaoConta() {
  const nome = document.getElementById('ec-nome').value.trim()
  const banco = document.getElementById('ec-banco').value.trim()
  const tipo = document.getElementById('ec-tipo').value
  const saldo = parseBRL(document.getElementById('ec-saldo').value)
  const limite = parseBRL(document.getElementById('ec-limite').value)
  if (!nome) { toast('Informe o nome!', 'erro'); return }
  try {
    await api(`/contas/${contaEditandoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, banco, tipo, saldo, limite })
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
  const limite = parseBRL(document.getElementById('ct-limite').value)
  if (!nome) { toast('Informe o nome da conta!', 'erro'); return }
  try {
    await api('/contas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuarioId: usuario.id, nome, banco, tipo, saldo, limite }) })
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
    // Texto da IA: escapa e só deixa o **negrito** virar <b>.
    const html = escH(plano).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^#{1,4}\s*(.+)$/gm, '<b>$1</b>')
    document.getElementById('plano-conteudo').innerHTML = `<div class="plano-texto">${html}</div>`
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
const EMOJI_CAT_ORC = { 'Alimentação':'🍽️','Mercado':'🛒','Saúde':'💊','Farmácia':'💊','Transporte':'🚗','Combustível':'⛽','Educação':'📚','Lazer':'🎉','Vestuário':'👕','Cuidados pessoais':'💇','Casa':'🏠','Financiamento':'🏦','Assinatura':'📱','Restaurante':'🍕','Outros':'📦' }

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
              acao = `<button class="cp-paguei" onclick="${pare}marcarPaguei('${i.chave}', this, ${i.valor}, '${String(i.descricao).replace(/'/g, '')}')">Paguei</button>`
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
          <button class="cp-paguei" onclick="marcarPaguei('${c.chave}', this, ${c.valor}, '${String(c.descricao).replace(/'/g, '')}')">Paguei</button>
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

// "Paguei": pergunta de qual conta saiu, para o saldo dela já ficar certo.
let pgAtual = null
async function marcarPaguei(chave, btn, valor, descricao) {
  pgAtual = { chave, valor: Number(valor) || 0, descricao: descricao || '' }
  let contas = []
  try { contas = await api('/contas' + famQ()) } catch (e) {}
  document.getElementById('pg-desc').textContent = `${pgAtual.descricao}${pgAtual.valor ? ' · ' + fmt(pgAtual.valor) : ''}. De qual conta saiu o dinheiro?`
  document.getElementById('pg-contas').innerHTML = contas.length && pgAtual.valor
    ? contas.map(c => `<button class="pg-conta" onclick="confirmarPaguei(${c.id})"><span>🏦 ${escH(c.nome)}</span><small>saldo ${fmt(c.saldo)}</small></button>`).join('')
    : '<div class="pg-vazio">Nenhuma conta cadastrada para descontar.</div>'
  document.getElementById('modal-paguei').style.display = 'flex'
}
async function confirmarPaguei(contaId) {
  if (!pgAtual) return
  try {
    await api('/pagamentos', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chave: pgAtual.chave, usuarioId: usuario.id, contaId, valor: contaId ? pgAtual.valor : null }) })
    fecharModal('modal-paguei')
    toast(contaId ? '✅ Paga e descontada da conta' : '✅ Marcada como paga')
    renderContasPagar(); renderLivre()
    if (document.getElementById('aba-agenda').style.display !== 'none') carregarAgenda()
  } catch (e) { toast('❌ ' + e.message, 'erro') }
}

async function desfazerPaguei(chave) {
  try {
    await api('/pagamentos', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chave }) })
    toast('↩️ Voltou a ficar em aberto')
    renderContasPagar(); renderLivre()
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
  if (p.get('abrir') === 'fechamento') {
    abrirPlanej('fechamento')
    return true
  }
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

// ── QUANTO POSSO GASTAR ATÉ A PRÓXIMA ENTRADA (Início) ──
async function renderLivre() {
  const el = document.getElementById('livre-card')
  if (!el) return
  try {
    const r = await api('/livre-para-gastar' + famQ())
    if (!r) { el.style.display = 'none'; return }
    const ate = r.proximaEntrada
      ? `até ${ddmmStr(r.proximaEntrada.data)} (${escH(r.proximaEntrada.descricao)}${r.proximaEntrada.estimada ? ', estimado' : ''})`
      : `até ${ddmmStr(r.horizonte)}`
    const positivo = r.livre > 0
    const corpo = positivo
      ? `<div class="lv-label">💵 Livre para gastar ${ate}</div>
         <div class="lv-valor">${fmt(r.livre)}</div>
         <div class="lv-sub">≈ ${fmt(r.porDia)} por dia · ${r.dias} dia${r.dias > 1 ? 's' : ''}</div>`
      : `<div class="lv-label">⚠️ ${ate.charAt(0).toUpperCase() + ate.slice(1)}, faltam</div>
         <div class="lv-valor">${fmt(-r.livre)}</div>
         <div class="lv-sub">Mesmo sem gastar mais nada, o saldo previsto chega a ${fmt(r.livre)} em ${ddmmStr(r.menorEm)}.${r.sobraLimite > 0 ? ` Do cheque especial ainda sobram ${fmt(r.sobraLimite)}.` : ''}</div>`
    const estouro = r.estouro
      ? `<div class="lv-estouro" onclick="event.stopPropagation(); abrirLink('/?aba=agenda&dia=${r.estouro.data}')">🚨 Em ${ddmmStr(r.estouro.data)} o saldo previsto (${fmt(r.estouro.saldo)}) passa do limite do cheque especial (${fmt(r.limite)}). Ver na Agenda →</div>`
      : (r.saldoHoje < 0 && !r.limite ? `<div class="lv-dica">Cadastre o limite do cheque especial na conta (aba Contas) para ser avisado antes de estourar.</div>` : '')
    el.className = 'lv-card ' + (positivo ? 'ok' : 'neg')
    el.innerHTML = corpo + estouro
    el.onclick = () => { mostrarAba('agenda'); navBtn('nav-agenda') }
    el.style.display = 'block'
  } catch (e) {
    el.style.display = 'none'
  }
}

// ── TRANSFERÊNCIAS (aba Contas) ──
async function renderTransferencias() {
  const el = document.getElementById('transferencias-lista')
  if (!el) return
  try {
    const lista = await api('/transferencias' + famQ())
    el.innerHTML = lista.length ? lista.map(t => `
      <div class="tf-item">
        <div class="tf-info">
          <div class="tf-rota">${escH(t.de_nome || 'Fora do app')} → ${escH(t.para_nome || 'Fora do app')}</div>
          <div class="tf-sub">${ddmmStr(String(t.data))}${t.descricao ? ' · ' + escH(t.descricao) : ''}</div>
        </div>
        <div class="tf-dir"><b>${fmt(t.valor)}</b><button class="cal-desfazer" onclick="desfazerTransferencia(${t.id})">desfazer</button></div>
      </div>`).join('')
      : '<div class="pt-vazio">Nenhuma transferência registrada. Use para Pix entre contas próprias ou para a família — assim não vira gasto.</div>'
  } catch (e) { el.innerHTML = '' }
}
async function abrirModalTransferencia() {
  // Destino pode ser conta de qualquer pessoa da família (ex.: Pix para a Leide).
  const contas = await api('/contas?familiaId=' + famId())
  const meus = contas.filter(c => Number(c.usuario_id) === Number(usuario.id))
  const opt = c => `<option value="${c.id}">${escH(c.nome)}${c.usuario_nome && Number(c.usuario_id) !== Number(usuario.id) ? ' (' + escH(c.usuario_nome) + ')' : ''}</option>`
  document.getElementById('tf-de').innerHTML = (meus.length ? meus : contas).map(opt).join('') + '<option value="">Fora do app</option>'
  document.getElementById('tf-para').innerHTML = contas.map(opt).join('') + '<option value="">Fora do app</option>'
  if (contas.length > 1) document.getElementById('tf-para').selectedIndex = 1
  document.getElementById('tf-valor').value = ''
  document.getElementById('tf-desc').value = ''
  document.getElementById('tf-data').value = hojeLocalBR()
  document.getElementById('modal-transferencia').style.display = 'flex'
}
async function salvarTransferencia() {
  const deContaId = document.getElementById('tf-de').value || null
  const paraContaId = document.getElementById('tf-para').value || null
  const valor = parseBRL(document.getElementById('tf-valor').value)
  if (!(valor > 0)) { toast('Informe o valor', 'erro'); return }
  if (!deContaId && !paraContaId) { toast('Escolha pelo menos uma conta', 'erro'); return }
  if (deContaId && deContaId === paraContaId) { toast('Escolha contas diferentes', 'erro'); return }
  try {
    await api('/transferencias', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      usuarioId: usuario.id, deContaId, paraContaId, valor, data: document.getElementById('tf-data').value, descricao: document.getElementById('tf-desc').value.trim() }) })
    fecharModal('modal-transferencia')
    toast('✅ Transferência registrada')
    carregarContas(); renderLivre()
  } catch (e) { toast('❌ ' + e.message, 'erro') }
}
async function desfazerTransferencia(id) {
  if (!confirm('Desfazer esta transferência? Os saldos das contas voltam como estavam.')) return
  await api('/transferencias/' + id, { method: 'DELETE' })
  carregarContas(); renderLivre()
}

// ══════════════════════════════════════════
//  OPEN FINANCE (Meu Pluggy)
// ══════════════════════════════════════════
const PLUGGY_CONNECT_JS = 'https://cdn.pluggy.ai/pluggy-connect/v2.8.2/pluggy-connect.js'
const CATS_GASTO = ['Mercado','Alimentação','Restaurante','Combustível','Transporte','Casa','Saúde','Farmácia','Educação','Lazer','Vestuário','Cuidados pessoais','Assinatura','Financiamento','Outros']
let ofStatus = null

async function renderBannerRevisar() {
  const el = document.getElementById('of-revisar-banner')
  if (!el) return
  try {
    const s = await api('/of/status' + famQ())
    ofStatus = s
    if (s.revisar > 0) {
      el.innerHTML = `🔎 <b>${s.revisar}</b> movimento${s.revisar > 1 ? 's' : ''} do banco para revisar <span>→</span>`
      el.style.display = 'flex'
    } else el.style.display = 'none'
  } catch (e) { el.style.display = 'none' }
}

function carregarPluggyConnect() {
  if (window.PluggyConnect) return Promise.resolve()
  return new Promise((ok, falha) => {
    const s = document.createElement('script')
    s.src = PLUGGY_CONNECT_JS
    s.onload = ok
    s.onerror = () => falha(new Error('Não foi possível carregar o conector da Pluggy'))
    document.head.appendChild(s)
  })
}

async function abrirConexoes() {
  document.getElementById('modal-conexoes').style.display = 'flex'
  const el = document.getElementById('of-conteudo')
  el.innerHTML = '<div class="plano-loading"><div class="spinner"></div></div>'
  try {
    const [s, contasApp, cartoesApp] = await Promise.all([api('/of/status' + famQ()), api('/contas?familiaId=' + famId()), api('/cartoes?familiaId=' + famId())])
    ofStatus = s
    if (!s.configurado) {
      el.innerHTML = `<div class="push-passos">
        <b>Falta configurar o servidor.</b> No painel do <b>Railway</b> → serviço do app → <b>Variables</b>, crie:
        <ul><li><code>PLUGGY_CLIENT_ID</code></li><li><code>PLUGGY_CLIENT_SECRET</code></li></ul>
        Os dois valores ficam na sua aplicação em <b>dashboard.pluggy.ai</b>. Depois de salvar, o app reinicia e esta tela libera o botão de conectar.
      </div>`
      return
    }
    const optConta = (sel) => '<option value="">— não ligar —</option>' + contasApp.map(c => `<option value="${c.id}" ${Number(sel) === c.id ? 'selected' : ''}>${escH(c.nome)} (${escH(c.usuario_nome || '')})</option>`).join('')
    const optCartao = (sel) => '<option value="">— não ligar —</option>' + cartoesApp.map(c => `<option value="${c.id}" ${Number(sel) === c.id ? 'selected' : ''}>💳 ${escH(c.nome)} (${escH(c.usuario_nome || '')})</option>`).join('')
    const porItem = {}
    for (const c of s.contas) (porItem[c.item_id] ||= []).push(c)
    el.innerHTML = `
      <p class="modal-desc">Os dados vêm do <b>Meu Pluggy</b> (Open Finance, só leitura). Ligue cada conta do banco à conta ou ao cartão do app — só então os movimentos começam a entrar (a partir da data de hoje, para não duplicar o que já foi lançado).</p>
      ${s.itens.length ? s.itens.map(it => `
        <div class="of-item">
          <div class="of-item-topo">
            <div><b>🏦 ${escH((/meupluggy/i.test(it.banco || '') && (porItem[it.item_id] || []).length) ? porItem[it.item_id].map(c => c.nome).join(' + ') : (it.banco || 'Conexão'))}</b>
              <div class="of-sub">${it.erro ? '⚠️ ' + escH(it.erro) : (it.ultimo_sync ? 'atualizado em ' + new Date(it.ultimo_sync.replace(' ', 'T') + 'Z').toLocaleString('pt-BR') : 'ainda não sincronizou')} · ${escH(it.usuario_nome || '')}</div></div>
            <button class="cal-desfazer" onclick="removerConexao('${it.item_id}')">remover</button>
          </div>
          ${(porItem[it.item_id] || []).map(c => `
            <div class="of-conta">
              <div class="of-conta-nome">${c.tipo === 'CREDIT' ? '💳' : '🏦'} ${escH(c.nome || '')}${c.numero ? ' ·' + escH(String(c.numero).slice(-4)) : ''} <span class="of-sub">${c.tipo === 'CREDIT' ? 'fatura' : 'saldo'} ${fmt(c.saldo)}</span></div>
              ${c.ignorar ? `<div class="of-sub">ignorada · <a href="#" onclick="event.preventDefault();ligarContaOF('${c.account_id}', {ignorar:false})">voltar a usar</a></div>` : `
              <div class="of-conta-acoes">
                <select onchange="ligarContaOF('${c.account_id}', ${c.tipo === 'CREDIT' ? '{cartaoId:this.value}' : '{contaId:this.value}'})">${c.tipo === 'CREDIT' ? optCartao(c.cartao_id) : optConta(c.conta_id)}</select>
                <button class="cal-desfazer" onclick="ligarContaOF('${c.account_id}', {ignorar:true})">ignorar</button>
              </div>
              <div class="of-sub">${(c.conta_id || c.cartao_id) ? '✅ importando movimentos desde ' + dataBR(c.importar_desde) : 'escolha a conta/cartão do app para começar a importar'}</div>`}
            </div>`).join('') || '<div class="of-sub">Nenhuma conta encontrada ainda.</div>'}
        </div>`).join('') : '<div class="pt-vazio">Nenhum banco conectado ainda.</div>'}
      <button class="btn-confirm of-conectar" onclick="conectarPluggy()">＋ Conectar banco (Meu Pluggy)</button>
      ${s.itens.length ? '<button class="pg-so-marcar" onclick="sincronizarOF(this)">🔄 Sincronizar agora</button>' : ''}`
  } catch (e) {
    el.innerHTML = `<div class="pt-vazio">Erro: ${escH(e.message)}</div>`
  }
}

async function conectarPluggy() {
  try {
    await carregarPluggyConnect()
    const { accessToken } = await api('/of/connect-token', { method: 'POST' })
    const widget = new window.PluggyConnect({
      connectToken: accessToken,
      onSuccess: async (dados) => {
        const item = dados && (dados.item || dados)
        if (!item || !item.id) return
        toast('⏳ Buscando contas…')
        try {
          await api('/of/itens', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: item.id }) })
          toast('✅ Banco conectado! Agora ligue cada conta.')
        } catch (e) { toast('❌ ' + e.message, 'erro') }
        abrirConexoes()
      },
      onError: (erro) => toast('❌ ' + ((erro && erro.message) || 'Erro na conexão'), 'erro')
    })
    widget.init()
  } catch (e) { toast('❌ ' + e.message, 'erro') }
}

async function ligarContaOF(accountId, campos) {
  try {
    await api('/of/contas/' + accountId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(campos) })
    toast('✅ Salvo')
    abrirConexoes()
  } catch (e) { toast('❌ ' + e.message, 'erro') }
}
async function removerConexao(itemId) {
  if (!confirm('Remover esta conexão? O app para de receber os dados desse banco (o que já foi lançado continua).')) return
  await api('/of/itens/' + itemId, { method: 'DELETE' })
  abrirConexoes()
}
async function sincronizarOF(btn) {
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Sincronizando…' }
  try {
    const r = await api('/of/sincronizar' + famQ(), { method: 'POST' })
    const novos = r.reduce((a, x) => a + (x.novos || 0), 0)
    const erros = r.filter(x => !x.ok)
    toast(erros.length ? '⚠️ ' + erros[0].erro : `✅ ${novos} movimento${novos === 1 ? '' : 's'} novo${novos === 1 ? '' : 's'}`, erros.length ? 'erro' : 'sucesso')
  } catch (e) { toast('❌ ' + e.message, 'erro') }
  abrirConexoes(); carregarInicio()
}

// ── Lista "Para revisar" ──
let rvPendentes = []
async function abrirRevisar() {
  document.getElementById('modal-revisar').style.display = 'flex'
  const el = document.getElementById('rv-lista')
  el.innerHTML = '<div class="plano-loading"><div class="spinner"></div></div>'
  const [lista, pagar] = await Promise.all([api('/of/revisar' + famQ()), api('/contas-a-pagar' + famQ() + (famQ() ? '&' : '?') + 'dias=15')])
  rvPendentes = pagar.filter(c => !c.pago)
  if (!lista.length) { el.innerHTML = '<div class="pt-vazio">Tudo revisado 🎉</div>'; renderBannerRevisar(); return }
  const rotulo = { gasto: '💸 Gasto', receita: '💰 Receita', transferencia: '⇄ Transferência', pagamento: '🧾 Pagamento de conta', ignorar: '🚫 Ignorar' }
  el.innerHTML = lista.map(t => `
    <div class="rv-item" id="rv-${t.tx_id}">
      <div class="rv-topo">
        <div class="rv-info"><div class="rv-desc">${escH(t.descricao)}</div>
          <div class="of-sub">${dataBR(t.data)} · ${escH(t.conta_banco || '')}${t.contraparte ? ' · ' + escH(t.contraparte) : ''}</div></div>
        <b class="${t.direcao === 'entrada' ? 'rv-entra' : 'rv-sai'}">${t.direcao === 'entrada' ? '+' : '−'}${fmt(t.valor)}</b>
      </div>
      <div class="rv-sugestao">Sugestão: <b>${rotulo[t.sugestao] || t.sugestao}</b>${t.sugestao === 'gasto' && t.sugestao_categoria ? ' · ' + escH(t.sugestao_categoria) : ''}</div>
      <div class="rv-acoes">
        ${t.direcao === 'saida' ? `<select id="rv-cat-${t.tx_id}">${CATS_GASTO.map(c => `<option ${c === (t.sugestao_categoria || 'Outros') ? 'selected' : ''}>${c}</option>`).join('')}</select>
          <button class="rv-btn" onclick="decidirOF('${t.tx_id}','gasto')">💸 Gasto</button>
          <button class="rv-btn" onclick="decidirOF('${t.tx_id}','pagamento')">🧾 Pagou conta</button>`
        : `<button class="rv-btn" onclick="decidirOF('${t.tx_id}','receita')">💰 Receita</button>
          <button class="rv-btn" onclick="decidirOF('${t.tx_id}','receita','salario')">💼 Salário</button>`}
        <button class="rv-btn" onclick="decidirOF('${t.tx_id}','transferencia')">⇄ Transferência</button>
        <button class="rv-btn rv-ign" onclick="decidirOF('${t.tx_id}','ignorar')">Ignorar</button>
      </div>
      <label class="rv-lembrar"><input type="checkbox" id="rv-lem-${t.tx_id}"> lembrar para os próximos parecidos</label>
    </div>`).join('')
}

async function decidirOF(txId, acao, tipoReceita) {
  const body = { acao, tipoReceita, lembrar: document.getElementById('rv-lem-' + txId)?.checked }
  if (acao === 'gasto') body.categoria = document.getElementById('rv-cat-' + txId)?.value
  if (acao === 'pagamento' && rvPendentes.length) {
    const opcoes = rvPendentes.map((c, i) => `${i + 1}) ${c.descricao} · ${fmt(c.valor)} · ${dataBR(c.data)}`).join('\n')
    const esc = prompt('Qual conta foi paga? Digite o número (ou deixe vazio para só registrar):\n\n' + opcoes)
    if (esc === null) return
    const c = rvPendentes[parseInt(esc) - 1]
    if (c) body.chavePagamento = c.chave
  }
  try {
    await api(`/of/transacoes/${txId}/aplicar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    document.getElementById('rv-' + txId)?.remove()
    if (!document.querySelector('#rv-lista .rv-item')) document.getElementById('rv-lista').innerHTML = '<div class="pt-vazio">Tudo revisado 🎉</div>'
    renderBannerRevisar(); renderLivre(); renderContasPagar()
  } catch (e) { toast('❌ ' + e.message, 'erro') }
}

// ══════════════════════════════════════════
//  INVESTIMENTOS (dados e contas; nada de recomendação)
// ══════════════════════════════════════════
const pct = (v, casas = 2) => v == null || isNaN(v) ? '—' : `${v >= 0 ? '+' : ''}${Number(v).toFixed(casas).replace('.', ',')}%`
const TIPO_INV = { acao: '📊 Ação', fii: '🏢 FII', etf: '🧺 ETF', bdr: '🌎 BDR', cripto: '🪙 Cripto', tesouro: '🏛️ Tesouro', cdb: '🏦 CDB/LCI/LCA', outro: '📦 Outro' }
const RV = ['acao', 'fii', 'etf', 'bdr', 'cripto']
let ivAba = 'simulador'
let ivIndic = null

async function carregarIndicadores() {
  if (ivIndic) return ivIndic
  ivIndic = await api('/invest/indicadores')
  return ivIndic
}

async function renderInvestResumo() {
  const el = document.getElementById('invest-resumo')
  if (!el) return
  try {
    const i = await carregarIndicadores()
    el.innerHTML = `
      <div><span>Selic</span><b>${String(i.selic).replace('.', ',')}%</b></div>
      <div><span>CDI</span><b>${String(i.cdi).replace('.', ',')}%</b></div>
      <div><span>IPCA 12m</span><b>${String(i.ipca12m).replace('.', ',')}%</b></div>
      <div><span>Ibovespa</span><b class="${(i.ibov?.variacaoDia || 0) >= 0 ? 'iv-up' : 'iv-down'}">${i.ibov ? pct(i.ibov.variacaoDia) : '—'}</b></div>
      <div><span>Dólar</span><b>${i.dolar ? i.dolar.valor.toFixed(2).replace('.', ',') : '—'}</b></div>`
  } catch (e) { el.innerHTML = '<div class="of-sub">Indicadores indisponíveis agora.</div>' }
}

function abrirInvest(aba) {
  document.getElementById('modal-invest').style.display = 'flex'
  abaInvest(aba || ivAba)
}
function abaInvest(aba) {
  ivAba = aba
  document.querySelectorAll('.iv-abas button').forEach(b => b.classList.toggle('on', b.dataset.aba === aba))
  const el = document.getElementById('iv-conteudo')
  el.innerHTML = '<div class="plano-loading"><div class="spinner"></div></div>'
  ;({ monitor: renderIvMonitor, indicadores: renderIvIndicadores, simulador: renderIvSimulador, carteira: renderIvCarteira, acompanhar: renderIvAcompanhar })[aba]()
}

// ── Monitor: maiores altas e quedas do Ibovespa, com as manchetes de cada ação ──
let ivMonitorLado = 'altas'
async function renderIvMonitor() {
  const el = document.getElementById('iv-conteudo')
  try {
    const m = await api('/invest/monitor')
    window._ivMonitor = m
    const lista = ivMonitorLado === 'altas' ? m.altas : m.quedas
    el.innerHTML = `
      <div class="mn-topo">
        <div class="mn-seg">
          <button class="${ivMonitorLado === 'altas' ? 'on' : ''}" onclick="ivMonitorLado='altas';renderIvMonitor()">📈 Maiores altas</button>
          <button class="${ivMonitorLado === 'quedas' ? 'on' : ''}" onclick="ivMonitorLado='quedas';renderIvMonitor()">📉 Maiores quedas</button>
        </div>
        <div class="of-sub">Ações do Ibovespa hoje: <b class="iv-up">${m.sobem} sobem</b> · <b class="iv-down">${m.caem} caem</b>${m.atualizadoEm ? ' · ' + new Date(m.atualizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}</div>
      </div>
      ${lista.length ? lista.map((x, i) => {
        const daMax = x.max52 ? (x.preco / x.max52 - 1) * 100 : null
        return `<div class="mn-item" onclick="abrirNoticias('${x.ticker}', this)">
          <div class="mn-linha">
            <span class="mn-pos">${i + 1}</span>
            <div class="mn-info"><b>${escH(x.ticker)}</b><div class="pt-item-sub">${escH(x.nome)}</div></div>
            <div style="text-align:right"><b class="${x.variacao >= 0 ? 'iv-up' : 'iv-down'}">${pct(x.variacao)}</b><div class="pt-item-sub">${fmt(x.preco)}</div></div>
          </div>
          <div class="mn-extra" style="display:none">
            ${x.min52 && x.max52 ? `<div class="of-sub">52 semanas: mínima ${fmt(x.min52)} · máxima ${fmt(x.max52)}${daMax != null ? ` · está ${pct(daMax, 1)} da máxima` : ''}</div>` : ''}
            <div class="mn-news"><div class="plano-loading"><div class="spinner"></div></div></div>
            <button class="rv-btn" onclick="event.stopPropagation();acompanharDoMonitor('${x.ticker}', this)">👀 Acompanhar</button>
          </div>
        </div>`
      }).join('') : '<div class="pt-vazio">Nenhuma ação nesse lado hoje (ou o pregão ainda não abriu).</div>'}
      <p class="of-sub">Toque numa ação para ver as notícias que podem explicar o movimento. Uma alta ou queda de um dia, sozinha, não diz se a ação é boa ou ruim — é só o que aconteceu hoje.</p>`
  } catch (e) { el.innerHTML = `<div class="pt-vazio">Monitor indisponível agora: ${escH(e.message)}</div>` }
}

async function abrirNoticias(ticker, card) {
  const extra = card.querySelector('.mn-extra')
  const aberto = extra.style.display !== 'none'
  extra.style.display = aberto ? 'none' : 'block'
  if (aberto || extra.dataset.carregado) return
  extra.dataset.carregado = '1'
  const box = extra.querySelector('.mn-news')
  try {
    const n = await api('/invest/noticias/' + encodeURIComponent(ticker))
    box.innerHTML = n.length
      ? '<div class="mn-news-tit">📰 Notícias recentes</div>' + n.map(x => `<a class="mn-noticia" href="${escH(x.link)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${escH(x.titulo)}<span>${escH(x.fonte || '')}${x.data ? ' · ' + new Date(x.data).toLocaleDateString('pt-BR') : ''}</span></a>`).join('')
      : '<div class="of-sub">Nenhuma notícia recente encontrada.</div>'
  } catch (e) { box.innerHTML = '<div class="of-sub">Notícias indisponíveis agora.</div>' }
}

async function acompanharDoMonitor(ticker, btn) {
  try {
    await api('/invest/acompanhar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticker }) })
    btn.textContent = '✓ Na sua lista'
    btn.disabled = true
  } catch (e) { toast('❌ ' + e.message, 'erro') }
}

// ── Indicadores ──
async function renderIvIndicadores() {
  const el = document.getElementById('iv-conteudo')
  try {
    const i = await carregarIndicadores()
    const real = ((1 + i.cdi / 100) / (1 + i.ipca12m / 100) - 1) * 100
    el.innerHTML = `
      <div class="iv-cards">
        <div class="iv-card"><span>Selic (meta)</span><b>${String(i.selic).replace('.', ',')}% a.a.</b><small>Taxa básica de juros, definida pelo Copom.</small></div>
        <div class="iv-card"><span>CDI</span><b>${String(i.cdi).replace('.', ',')}% a.a.</b><small>Referência da renda fixa (CDB, Tesouro Selic…). Ref. ${i.cdiRef}.</small></div>
        <div class="iv-card"><span>Inflação (IPCA 12 meses)</span><b>${String(i.ipca12m).replace('.', ',')}%</b><small>Quanto os preços subiram. Ref. ${i.ipcaRef}.</small></div>
        <div class="iv-card"><span>Juro real (CDI − inflação)</span><b>${pct(real)}</b><small>Quanto o CDI ganha da inflação, em 12 meses.</small></div>
        <div class="iv-card"><span>Ibovespa</span><b>${i.ibov ? Math.round(i.ibov.pontos).toLocaleString('pt-BR') + ' pts' : '—'}</b>
          <small>Hoje ${i.ibov ? pct(i.ibov.variacaoDia) : '—'} · 12 meses ${i.ibov ? pct(i.ibov.variacao12m) : '—'}</small></div>
        <div class="iv-card"><span>Dólar comercial</span><b>${i.dolar ? fmt(i.dolar.valor) : '—'}</b>
          <small>${!i.dolar ? 'Cotação indisponível agora.'
            : i.dolar.fonte === 'ptax' ? `PTAX do Banco Central, ref. ${i.dolar.ref}${i.dolar.variacaoDia != null ? ' · ' + pct(i.dolar.variacaoDia) + ' no dia' : ''}.`
            : `Hoje ${pct(i.dolar.variacaoDia)} · 12 meses ${pct(i.dolar.variacao12m)}. Quanto custa 1 US$ em reais.`}</small></div>
      </div>
      <p class="of-sub">Fontes: Banco Central (SGS), B3 e câmbio via Yahoo Finance. Juros e inflação atualizam a cada poucas horas; bolsa e dólar, a cada 15 minutos.</p>`
  } catch (e) { el.innerHTML = `<div class="pt-vazio">Não foi possível buscar os indicadores: ${escH(e.message)}</div>` }
}

// ── Simulador ──
function mesesAte(dataISO) {
  const hoje = new Date(hojeLocalBR() + 'T12:00:00'), d = new Date(dataISO + 'T12:00:00')
  return Math.max(0, (d.getFullYear() - hoje.getFullYear()) * 12 + (d.getMonth() - hoje.getMonth()))
}
const taxaMes = anual => Math.pow(1 + anual / 100, 1 / 12) - 1
const aliquotaIR = dias => dias <= 180 ? 0.225 : dias <= 360 ? 0.20 : dias <= 720 ? 0.175 : 0.15

// Cada aporte rende do mês em que entra até o fim; IR regressivo pelo tempo de cada um.
function simular(aportes, horizonte, taxaMensal, comIR) {
  let bruto = 0, liquido = 0, aportado = 0
  for (const ap of aportes) {
    if (ap.mes > horizonte) continue
    const n = horizonte - ap.mes
    const fim = ap.valor * Math.pow(1 + taxaMensal, n)
    const ganho = fim - ap.valor
    aportado += ap.valor
    bruto += fim
    liquido += comIR ? fim - ganho * aliquotaIR(n * 30) : fim
  }
  return { aportado, bruto, liquido }
}

let ivVenda = []
let ivSimModo = 'rf'
function segSimulador() {
  return `<div class="mn-seg sim-seg">
    <button class="${ivSimModo === 'rf' ? 'on' : ''}" onclick="ivSimModo='rf';renderIvSimulador()">Renda fixa</button>
    <button class="${ivSimModo === 'acoes' ? 'on' : ''}" onclick="ivSimModo='acoes';renderIvSimulador()">Ações e dólar</button>
  </div>`
}
async function renderIvSimulador() {
  const el = document.getElementById('iv-conteudo')
  if (ivSimModo === 'acoes') return renderSimAcoes()
  try {
    const [i, receb] = await Promise.all([carregarIndicadores(), api('/recebiveis' + famQ())])
    ivVenda = receb.filter(r => !r.recebido_em && r.destino === 'investimento')
    const ultimo = ivVenda.length ? mesesAte(ivVenda[ivVenda.length - 1].data_prevista) : 0
    const totalVenda = ivVenda.reduce((s, r) => s + Number(r.valor), 0)
    el.innerHTML = segSimulador() + `
      <p class="modal-desc">Quanto o dinheiro renderia mantendo as taxas de hoje (Selic ${String(i.selic).replace('.', ',')}%, CDI ${String(i.cdi).replace('.', ',')}%, inflação ${String(i.ipca12m).replace('.', ',')}%).</p>
      ${ivVenda.length ? `<label class="rf-estimada"><input id="sim-venda" type="checkbox" checked onchange="calcularSimulacao()"><span><b>Usar as parcelas da venda</b> (${fmt(totalVenda)} em ${ivVenda.length} entradas, nas datas previstas)</span></label>` : ''}
      <label class="input-label">Valor que já tem para começar</label>
      <div class="input-prefix"><span>R$</span><input id="sim-inicial" type="text" inputmode="decimal" placeholder="0,00" oninput="calcularSimulacao()" /></div>
      <label class="input-label">Quanto mais por mês (além da venda)</label>
      <div class="input-prefix"><span>R$</span><input id="sim-mensal" type="text" inputmode="decimal" placeholder="0,00" oninput="calcularSimulacao()" /></div>
      <label class="input-label">Por quanto tempo (meses)</label>
      <input id="sim-meses" type="number" min="1" max="600" value="${Math.max(12, ultimo + 12)}" oninput="calcularSimulacao()" />
      <div id="sim-resultado"></div>`
    calcularSimulacao()
  } catch (e) { el.innerHTML = `<div class="pt-vazio">Erro: ${escH(e.message)}</div>` }
}

function calcularSimulacao() {
  const i = ivIndic
  const out = document.getElementById('sim-resultado')
  if (!i || !out) return
  const horizonte = Math.max(1, parseInt(document.getElementById('sim-meses').value) || 12)
  const inicial = parseBRL(document.getElementById('sim-inicial').value)
  const mensal = parseBRL(document.getElementById('sim-mensal').value)
  const aportes = []
  if (inicial > 0) aportes.push({ mes: 0, valor: inicial })
  if (mensal > 0) for (let m = 1; m <= horizonte; m++) aportes.push({ mes: m, valor: mensal })
  if (document.getElementById('sim-venda')?.checked) for (const r of ivVenda) aportes.push({ mes: mesesAte(String(r.data_prevista).slice(0, 10)), valor: Number(r.valor) })
  if (!aportes.length) { out.innerHTML = '<div class="pt-vazio">Informe um valor para simular.</div>'; return }
  // Poupança: 0,5% a.m. (+TR, ignorada) se Selic > 8,5%; senão 70% da Selic. Isenta de IR.
  const poup = i.selic > 8.5 ? 0.005 : taxaMes(i.selic * 0.7)
  const linhas = [
    { nome: '🐷 Poupança', r: simular(aportes, horizonte, poup, false), obs: 'isenta de IR; TR não considerada' },
    { nome: '🏦 100% do CDI', r: simular(aportes, horizonte, taxaMes(i.cdi), true), obs: 'ex.: CDB de liquidez diária; com IR regressivo' },
    { nome: '🏛️ Tesouro Selic', r: simular(aportes, horizonte, taxaMes(i.selic - 0.2), true), obs: 'Selic − 0,2% de custódia B3; com IR' }
  ]
  const max = Math.max(...linhas.map(l => l.r.liquido))
  const inflacao = Math.pow(1 + i.ipca12m / 100, horizonte / 12)
  const aportado = linhas[0].r.aportado
  out.innerHTML = `
    <div class="sim-total">Você colocaria <b>${fmt(aportado)}</b> ao longo de ${horizonte} meses.</div>
    ${linhas.map(l => `
      <div class="sim-linha">
        <div class="sim-topo"><b>${l.nome}</b><b>${fmt(l.r.liquido)}</b></div>
        <div class="sim-barra"><div style="width:${Math.max(3, l.r.liquido / max * 100)}%"></div></div>
        <div class="of-sub">Rende ${fmt(l.r.liquido - l.r.aportado)} líquido · em dinheiro de hoje ≈ ${fmt(l.r.liquido / inflacao)} · ${l.obs}</div>
      </div>`).join('')}
    <p class="of-sub">Simulação com as taxas de hoje mantidas constantes, só para comparar ordens de grandeza. Taxas mudam, cada produto tem regras e riscos próprios, e isto não é recomendação.</p>`
}

// ── Simulador de ações e dólar: o que aconteceu (histórico real) e faixas do que pode acontecer ──
let simAcao = null, simAcaoResumo = null
function renderSimAcoes() {
  const el = document.getElementById('iv-conteudo')
  el.innerHTML = segSimulador() + `
    <p class="modal-desc">Use o histórico de 5 anos de uma ação, fundo da bolsa ou do dólar para ver o que teria acontecido e uma faixa do que pode acontecer.</p>
    <label class="input-label">Código (ex.: PETR4, ITUB4, BOVA11, IVVB11, ou USD para dólar)</label>
    <div class="sa-busca">
      <input id="sa-ticker" type="text" autocapitalize="characters" placeholder="PETR4" value="${simAcao ? escH(simAcao.ticker) : ''}" onkeydown="if(event.key==='Enter')carregarSimAcao()" />
      <button class="btn-save" onclick="carregarSimAcao()">Buscar</button>
    </div>
    <label class="input-label">Valor para começar</label>
    <div class="input-prefix"><span>R$</span><input id="sa-inicial" type="text" inputmode="decimal" placeholder="0,00" value="10.000,00" oninput="calcularSimAcao()" /></div>
    <label class="input-label">Quanto mais por mês</label>
    <div class="input-prefix"><span>R$</span><input id="sa-mensal" type="text" inputmode="decimal" placeholder="0,00" oninput="calcularSimAcao()" /></div>
    <label class="input-label">Por quanto tempo (meses)</label>
    <input id="sa-meses" type="number" min="1" max="360" value="36" oninput="calcularSimAcao()" />
    <div id="sa-resultado">${simAcao ? '' : '<div class="pt-vazio">Digite um código e toque em Buscar.</div>'}</div>`
  if (simAcao) calcularSimAcao()
}

async function carregarSimAcao() {
  const t = document.getElementById('sa-ticker').value.trim().toUpperCase()
  if (!t) return
  const out = document.getElementById('sa-resultado')
  out.innerHTML = '<div class="plano-loading"><div class="spinner"></div></div>'
  try {
    await carregarIndicadores()
    simAcao = await api('/invest/historico/' + encodeURIComponent(t))
    simAcao.ticker = t
    calcularSimAcao()
  } catch (e) { simAcao = null; out.innerHTML = `<div class="pt-vazio">${escH(e.message)}</div>` }
}

// Sorteio com semente fixa: os números não pulam a cada tecla digitada.
function geradorAleatorio(seed) {
  let a = seed >>> 0
  const u = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296 }
  return () => Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u())
}

function calcularSimAcao() {
  const h = simAcao, i = ivIndic, out = document.getElementById('sa-resultado')
  if (!h || !out) return
  const H = Math.max(1, Math.min(360, parseInt(document.getElementById('sa-meses').value) || 36))
  const inicial = parseBRL(document.getElementById('sa-inicial').value)
  const mensal = parseBRL(document.getElementById('sa-mensal').value)
  const aportado = inicial + mensal * H
  if (aportado <= 0) { out.innerHTML = '<div class="pt-vazio">Informe um valor para simular.</div>'; return }
  const ehDolar = h.ticker === 'USD' || h.ticker === 'DOLAR'
  const nome = ehDolar ? 'Dólar' : h.ticker

  // 1) O que teria acontecido: começando há N meses com os mesmos aportes (preço ajustado = dividendos reinvestidos).
  // Começo: o mês de H meses atrás (o histórico pode ter meses faltando).
  const pm = h.meses
  const ultimo = pm[pm.length - 1].mes
  const [ua, um] = ultimo.split('-').map(Number)
  const alvoD = new Date(ua, um - 1 - H, 1)
  const alvo = `${alvoD.getFullYear()}-${String(alvoD.getMonth() + 1).padStart(2, '0')}`
  let ini = Math.min(pm.findIndex(m => m.mes >= alvo), pm.length - 2)
  if (ini < 0) ini = 0
  const [ia, im] = pm[ini].mes.split('-').map(Number)
  const N = (ua - ia) * 12 + (um - im)
  let cotas = inicial / pm[ini].preco
  const cdiMes = new Map(h.cdiMensal.map(x => [x.mes, x.valor / 100]))
  let cdiV = inicial, colocadoHist = inicial
  for (let k = ini + 1; k < pm.length; k++) {
    cdiV *= 1 + (cdiMes.get(pm[k].mes) ?? 0)
    cotas += mensal / pm[k].preco
    cdiV += mensal
    colocadoHist += mensal
  }
  const histFinal = cotas * pm[pm.length - 1].preco
  const desdeTxt = new Date(pm[ini].mes + '-15').toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })

  // 2) O que pode acontecer: 3.000 caminhos sorteados com a média e a oscilação mensais do histórico.
  let seed = 0; for (const c of h.ticker) seed = seed * 31 + c.charCodeAt(0)
  const rnd = geradorAleatorio(seed + H)
  const finais = []
  for (let s = 0; s < 3000; s++) {
    let v = inicial
    for (let m = 1; m <= H; m++) { v *= Math.exp(h.mu + h.sigma * rnd()); v += mensal }
    finais.push(v)
  }
  finais.sort((a, b) => a - b)
  const q = f => finais[Math.floor(f * (finais.length - 1))]
  const aportes = []
  if (inicial > 0) aportes.push({ mes: 0, valor: inicial })
  if (mensal > 0) for (let m = 1; m <= H; m++) aportes.push({ mes: m, valor: mensal })
  const cdiFut = simular(aportes, H, taxaMes(i.cdi), true).liquido
  const chancePerda = finais.filter(v => v < aportado).length / finais.length * 100
  const chanceCdi = finais.filter(v => v > cdiFut).length / finais.length * 100
  simAcaoResumo = { meses: H, aportado, p10: q(0.1), p50: q(0.5), p90: q(0.9), cdi: cdiFut, chancePerda, chanceCdi }
  const max = Math.max(q(0.9), cdiFut)
  const barra = (v, cor) => `<div class="sim-barra"><div style="width:${Math.max(3, v / max * 100)}%;${cor ? 'background:' + cor : ''}"></div></div>`

  out.innerHTML = `
    <div class="sa-cab"><b>${escH(ehDolar ? 'Dólar comercial (US$ em R$)' : h.nome)}</b><span>${ehDolar ? 'R$ ' + h.preco.toFixed(2).replace('.', ',') : fmt(h.preco)} hoje</span></div>
    <div class="sa-stats">
      <div><span>Últimos ${String(h.anos).replace('.', ',')} anos</span><b class="${h.retornoTotal >= 0 ? 'iv-up' : 'iv-down'}">${pct(h.retornoTotal, 0)}</b><small>${pct(h.retornoAnual, 1)} ao ano</small></div>
      <div><span>CDI no período</span><b>${pct(h.cdiPeriodo, 0)}</b><small>inflação ${pct(h.ipcaPeriodo, 0)}</small></div>
      <div><span>Sobe e desce</span><b>${pct(h.volAnual, 0).replace('+', '')}</b><small>ao ano</small></div>
      <div><span>Maior queda</span><b class="iv-down">${pct(h.maxQueda, 0)}</b><small>do topo ao fundo</small></div>
    </div>

    <div class="sa-bloco">
      <div class="sa-tit">Se você tivesse começado em ${desdeTxt}</div>
      <div class="sim-linha"><div class="sim-topo"><b>${escH(nome)}</b><b>${fmt(histFinal)}</b></div>${barra(histFinal)}</div>
      <div class="sim-linha"><div class="sim-topo"><b>100% do CDI</b><b>${fmt(cdiV)}</b></div>${barra(cdiV, '#94a3b8')}</div>
      <div class="of-sub">Colocando ${fmt(colocadoHist)} em ${N} meses${N < H ? ` (o histórico só tem ${N} meses)` : ''}. Valores reais do passado, antes do IR${ehDolar ? '' : ', com dividendos reinvestidos'}.</div>
    </div>

    <div class="sa-bloco">
      <div class="sa-tit">Daqui a ${H} meses, se ${ehDolar ? 'o dólar' : escH(nome)} continuar se comportando como nos últimos ${String(h.anos).replace('.', ',')} anos</div>
      <div class="sim-linha"><div class="sim-topo"><b>Cenário ruim</b><b>${fmt(q(0.1))}</b></div>${barra(q(0.1), '#C93A2E')}</div>
      <div class="sim-linha"><div class="sim-topo"><b>Cenário do meio</b><b>${fmt(q(0.5))}</b></div>${barra(q(0.5))}</div>
      <div class="sim-linha"><div class="sim-topo"><b>Cenário bom</b><b>${fmt(q(0.9))}</b></div>${barra(q(0.9), '#13795B')}</div>
      <div class="sim-linha"><div class="sim-topo"><b>100% do CDI de hoje</b><b>${fmt(cdiFut)}</b></div>${barra(cdiFut, '#94a3b8')}</div>
      <div class="sa-chances">
        <div><b>${Math.round(chancePerda)}%</b><span>de chance de terminar com menos que os ${fmt(aportado)} colocados</span></div>
        <div><b>${Math.round(chanceCdi)}%</b><span>de chance de ganhar do CDI</span></div>
      </div>
      <div class="of-sub">3.000 caminhos sorteados com a média e a oscilação de cada mês do histórico. "Ruim" e "bom" são os 10% piores e melhores. ${escH(nome)} antes do IR (${ehDolar ? 'ganho com moeda paga 15% de IR' : 'ações pagam 15% sobre o lucro na venda; vendas de até R$ 20 mil no mês são isentas'}); CDI já com IR. Se os últimos anos foram muito bons para ${ehDolar ? 'o dólar' : escH(nome)}, a faixa sai otimista; se foram ruins, sai pessimista. O passado não garante nada: crises, mudanças na empresa e no país podem levar a resultados fora dessa faixa.</div>
    </div>

    <button class="rv-btn sa-ia" onclick="explicarSimAcao(this)">✨ Explicar estes números com IA</button>
    <div id="sa-ia-texto"></div>
    <p class="of-sub">Isto não é recomendação de compra ou venda. Para decidir, converse com um analista CNPI ou planejador CFP.</p>`
}

async function explicarSimAcao(btn) {
  if (!simAcao) return
  const box = document.getElementById('sa-ia-texto')
  btn.disabled = true
  box.innerHTML = '<div class="plano-loading"><div class="spinner"></div><p>Lendo os números…</p></div>'
  try {
    const { texto } = await api('/invest/analise/' + encodeURIComponent(simAcao.ticker), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(simAcaoResumo || {})
    })
    box.innerHTML = `<div class="plano-texto sa-ia-box">${escH(texto).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^#{1,4}\s*(.+)$/gm, '<b>$1</b>')}</div>`
  } catch (e) { box.innerHTML = `<div class="pt-vazio">Não foi possível explicar agora: ${escH(e.message)}</div>` }
  btn.disabled = false
}

// ── Carteira ──
async function renderIvCarteira() {
  const el = document.getElementById('iv-conteudo')
  try {
    const c = await api('/invest/carteira' + famQ())
    el.innerHTML = `
      ${c.itens.length ? `
        <div class="iv-tot">
          <div><span>Aplicado</span><b>${fmt(c.aplicado)}</b></div>
          <div><span>Hoje</span><b>${fmt(c.atual)}</b></div>
          <div><span>Resultado</span><b class="${c.resultado >= 0 ? 'iv-up' : 'iv-down'}">${c.resultado >= 0 ? '+' : ''}${fmt(c.resultado)}</b></div>
        </div>
        ${c.itens.map(it => {
          const atual = Number(it.valor_atual ?? it.valor_aplicado ?? 0), apl = Number(it.valor_aplicado || 0)
          const res = apl ? (atual / apl - 1) * 100 : null
          return `<div class="pt-item" onclick="editarInvest(${it.id})">
            <div><div class="pt-item-nome">${TIPO_INV[it.tipo] || ''} ${escH(it.ticker || it.nome || '')}</div>
              <div class="pt-item-sub">${RV.includes(it.tipo) ? `${Number(it.quantidade).toLocaleString('pt-BR')} × ${it.preco_atual ? fmt(it.preco_atual) : '—'} (médio ${fmt(it.preco_medio)})` : escH(it.instituicao || '') + (it.percentual_cdi ? ` · ${it.percentual_cdi}% do CDI` : '')}${it.erro_cotacao ? ' · ⚠️ ' + escH(it.erro_cotacao) : ''}</div></div>
            <div style="text-align:right"><b>${fmt(atual)}</b><div class="pt-item-sub ${(res || 0) >= 0 ? 'iv-up' : 'iv-down'}">${pct(res)}</div></div>
          </div>`
        }).join('')}`
      : '<div class="pt-vazio">Sua carteira está vazia. Quando você investir, registre aqui e o app acompanha cotações e resultado — e soma no patrimônio.</div>'}
      <button class="btn-confirm of-conectar" onclick="editarInvest()">＋ Registrar investimento</button>
      <div id="iv-form"></div>`
    window._ivItens = c.itens
  } catch (e) { el.innerHTML = `<div class="pt-vazio">Erro: ${escH(e.message)}</div>` }
}

function editarInvest(id) {
  const it = id ? (window._ivItens || []).find(x => x.id === id) : null
  const f = document.getElementById('iv-form')
  f.innerHTML = `
    <div class="iv-form">
      <label class="input-label">Tipo</label>
      <select id="ivf-tipo" class="select-input" onchange="ajustarFormInvest()">${Object.entries(TIPO_INV).map(([k, v]) => `<option value="${k}" ${it?.tipo === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <div id="ivf-rv">
        <input id="ivf-ticker" type="text" placeholder="Código (ex.: PETR4, BOVA11, MXRF11, BTC)" value="${escH(it?.ticker || '')}" style="text-transform:uppercase" />
        <div class="form-row">
          <div class="input-prefix small"><span>Qtd</span><input id="ivf-qtd" type="text" inputmode="decimal" value="${it ? String(it.quantidade).replace('.', ',') : ''}" /></div>
          <div class="input-prefix small"><span>R$</span><input id="ivf-preco" type="text" inputmode="decimal" placeholder="Preço médio" value="${it ? String(it.preco_medio).replace('.', ',') : ''}" /></div>
        </div>
      </div>
      <div id="ivf-rf">
        <input id="ivf-nome" type="text" placeholder="Nome (ex.: CDB Banco X, Tesouro Selic 2029)" value="${escH(it?.nome || '')}" />
        <input id="ivf-inst" type="text" placeholder="Onde está (banco/corretora)" value="${escH(it?.instituicao || '')}" />
        <div class="form-row">
          <div class="input-prefix small"><span>R$</span><input id="ivf-valor" type="text" inputmode="decimal" placeholder="Valor aplicado" value="${it ? String(it.valor_aplicado).replace('.', ',') : ''}" /></div>
          <div class="input-prefix small"><span>% CDI</span><input id="ivf-cdi" type="text" inputmode="decimal" placeholder="ex.: 100" value="${it?.percentual_cdi || ''}" /></div>
        </div>
      </div>
      <label class="input-label">Data da aplicação</label>
      <input id="ivf-data" type="date" value="${it?.data_aplicacao || hojeLocalBR()}" />
      <div class="modal-btns">
        ${it ? `<button class="btn-cancel" onclick="removerInvest(${it.id})">🗑 Excluir</button>` : ''}
        <button class="btn-confirm" onclick="salvarInvest(${it ? it.id : 'null'})">Salvar</button>
      </div>
    </div>`
  ajustarFormInvest()
  f.scrollIntoView({ behavior: 'smooth' })
}
function ajustarFormInvest() {
  const rv = RV.includes(document.getElementById('ivf-tipo').value)
  document.getElementById('ivf-rv').style.display = rv ? 'block' : 'none'
  document.getElementById('ivf-rf').style.display = rv ? 'none' : 'block'
}
async function salvarInvest(id) {
  const tipo = document.getElementById('ivf-tipo').value
  const rv = RV.includes(tipo)
  const body = { usuarioId: usuario.id, tipo, dataAplicacao: document.getElementById('ivf-data').value }
  if (rv) {
    Object.assign(body, { ticker: document.getElementById('ivf-ticker').value.trim().toUpperCase(), quantidade: parseBRL(document.getElementById('ivf-qtd').value), precoMedio: parseBRL(document.getElementById('ivf-preco').value) })
    if (!body.ticker || !(body.quantidade > 0)) { toast('Informe código e quantidade', 'erro'); return }
    try { await api('/invest/cotacao/' + encodeURIComponent(body.ticker)) } catch (e) { toast('❌ Não achei ' + body.ticker + '. Confira o código.', 'erro'); return }
  } else {
    Object.assign(body, { nome: document.getElementById('ivf-nome').value.trim(), instituicao: document.getElementById('ivf-inst').value.trim(), valorAplicado: parseBRL(document.getElementById('ivf-valor').value), percentualCdi: parseBRL(document.getElementById('ivf-cdi').value) })
    if (!body.nome || !(body.valorAplicado > 0)) { toast('Informe nome e valor', 'erro'); return }
  }
  try {
    await api(id ? '/invest/carteira/' + id : '/invest/carteira', { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    toast('✅ Salvo')
    renderIvCarteira(); renderPatrimonio()
  } catch (e) { toast('❌ ' + e.message, 'erro') }
}
async function removerInvest(id) {
  if (!confirm('Excluir este investimento da carteira?')) return
  await api('/invest/carteira/' + id, { method: 'DELETE' })
  renderIvCarteira(); renderPatrimonio()
}

// ── Acompanhar ──
async function renderIvAcompanhar() {
  const el = document.getElementById('iv-conteudo')
  try {
    const lista = await api('/invest/acompanhar')
    el.innerHTML = `
      <p class="modal-desc">Ativos que você quer observar. Você escolhe quais — o app só mostra preço e variação.</p>
      <div class="iv-add"><input id="iv-novo" type="text" placeholder="Código (ex.: PETR4, ITUB4, BOVA11, BTC)" style="text-transform:uppercase" />
        <button class="btn-confirm" onclick="acompanharAtivo()">＋</button></div>
      ${lista.length ? lista.map(c => c.erro ? `<div class="pt-item"><div>${escH(c.ticker)} · ⚠️ ${escH(c.erro)}</div><button class="cal-desfazer" onclick="deixarAcompanhar('${escH(c.ticker)}')">✕</button></div>` : `
        <div class="pt-item">
          <div><div class="pt-item-nome">${escH(c.ticker)}</div><div class="pt-item-sub">${escH(c.nome)}</div></div>
          <div style="text-align:right"><b>${c.moeda === 'BRL' ? fmt(c.preco) : c.preco.toLocaleString('pt-BR') + ' ' + c.moeda}</b>
            <div class="pt-item-sub"><span class="${(c.variacaoDia || 0) >= 0 ? 'iv-up' : 'iv-down'}">hoje ${pct(c.variacaoDia)}</span> · 12m ${pct(c.variacao12m, 1)}</div></div>
          <button class="cal-desfazer" onclick="deixarAcompanhar('${escH(c.ticker)}')">✕</button>
        </div>`).join('') : '<div class="pt-vazio">Nenhum ativo na lista.</div>'}`
  } catch (e) { el.innerHTML = `<div class="pt-vazio">Erro: ${escH(e.message)}</div>` }
}
async function acompanharAtivo() {
  const t = document.getElementById('iv-novo').value.trim().toUpperCase()
  if (!t) return
  try {
    await api('/invest/acompanhar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticker: t }) })
    renderIvAcompanhar()
  } catch (e) { toast('❌ ' + e.message, 'erro') }
}
async function deixarAcompanhar(t) {
  await api('/invest/acompanhar/' + encodeURIComponent(t), { method: 'DELETE' })
  renderIvAcompanhar()
}

// ══════════════════════════════════════════
//  OPORTUNIDADES DE NEGÓCIO (mapa de modelos + ideias em estudo)
//  Faixas de referência gerais, não promessa de resultado. O app calcula e compara;
//  a decisão é de quem investe.
// ══════════════════════════════════════════
const OP_TIPOS = {
  fisico:    { nome: 'Físico',     ic: 'loja' },
  digital:   { nome: 'Digital',    ic: 'notebook' },
  ecommerce: { nome: 'E-commerce', ic: 'carrinho' },
  servico:   { nome: 'Serviço',    ic: 'pasta' },
  franquia:  { nome: 'Franquia',   ic: 'repetir' },
  imovel:    { nome: 'Imóvel',     ic: 'home' },
  sociedade: { nome: 'Sociedade',  ic: 'pessoas' },
}
const OP_STATUS = {
  ideia: 'Só uma ideia', estudando: 'Estudando', testando: 'Testando pequeno', andamento: 'Em andamento', descartada: 'Descartada'
}
const OP_CHECK = [
  ['clientes', 'Conversei com pelo menos 10 possíveis clientes'],
  ['concorrentes', 'Mapeei 3 ou mais concorrentes e os preços deles'],
  ['custos', 'Listei os custos fixos e variáveis de cada mês'],
  ['teste', 'Fiz um teste pequeno antes de investir tudo'],
  ['legal', 'Vi a parte legal (CNPJ/MEI, alvará, contrato)'],
  ['reserva', 'Minha reserva de emergência está separada deste dinheiro'],
  ['limite', 'Sei quanto posso perder e em que ponto eu paro'],
]
// [id, tipo, nome, resumo, investimento mín, máx, margem, dedicação, risco 1-5, combina, atenção]
const OP_CATALOGO = [
  ['consultorio', 'servico', 'Ampliar o consultório', 'Sublocar horários e salas ou montar uma clínica com outros psicólogos atendendo pelo seu CNPJ.', 10000, 60000, '20% a 40%', 'Média', 2,
    'Você já tem CNPJ, clientela e conhece o mercado por dentro.', 'Contrato com os profissionais, ponto, e regras do CFP para clínicas.'],
  ['curso', 'digital', 'Curso ou grupo online na sua área', 'Grupos terapêuticos online, cursos de saúde emocional, palestras para empresas.', 2000, 20000, '50% a 80%', 'Alta no começo', 3,
    'Aproveita sua formação; o custo de produzir é baixo.', 'Precisa de audiência e marketing; publicidade de psicólogo segue regras do CFP.'],
  ['comunidade', 'digital', 'Comunidade por assinatura', 'Conteúdo mensal e encontros ao vivo para assinantes.', 1000, 10000, '50% a 70%', 'Média e contínua', 3,
    'Receita recorrente e previsível quando engrena.', 'Muita gente cancela nos primeiros meses; exige constância.'],
  ['micromarket', 'fisico', 'Micro market em condomínio', 'Mercadinho autônomo com geladeiras e pagamento no totem, dentro de prédios.', 15000, 60000, '15% a 30%', 'Baixa a média (reposição)', 3,
    'Funciona com pouco tempo seu; dá para começar com um ponto.', 'Furtos, acordo com o síndico e giro baixo em prédio pequeno.'],
  ['lavanderia', 'franquia', 'Lavanderia self-service', 'Máquinas de lavar e secar com atendimento por app; geralmente por franquia.', 150000, 350000, '15% a 25%', 'Baixa (gestão)', 3,
    'Pouca mão de obra; cliente fiel do bairro.', 'Investimento alto, aluguel do ponto por anos e concorrência no mesmo bairro.'],
  ['quiosque', 'fisico', 'Café ou quiosque de comida', 'Café, açaí ou lanche em quiosque de shopping, hospital ou faculdade.', 30000, 120000, '8% a 15%', 'Alta', 4,
    'Retorno rápido quando o ponto tem fluxo.', 'Aluguel e taxas de shopping pesam; depende de funcionário e de você presente.'],
  ['lavarapido', 'fisico', 'Lava-rápido ou estética automotiva', 'Lavagem, higienização e polimento; dá para começar pequeno.', 30000, 150000, '15% a 25%', 'Média a alta', 3,
    'Serviço recorrente, com procura o ano todo.', 'Licença ambiental para água, funcionários e ponto com estacionamento.'],
  ['carros', 'fisico', 'Compra e venda de carros usados', 'Comprar abaixo da tabela FIPE, ajustar o que precisa e revender. Dá para começar com um carro de cada vez.', 30000, 80000, '5% a 15% por carro', 'Média a alta (anunciar, mostrar, negociar)', 4,
    'Começa sem loja; você vê o resultado de cada carro em 1 a 3 meses.', 'Dinheiro parado enquanto o carro não vende; vício oculto, multa ou débito no nome anterior; vistoria, transferência e IPVA comem a margem. Várias revendas por ano pedem CNPJ.'],
  ['marketplace', 'ecommerce', 'Revenda em marketplace', 'Comprar de fornecedor e vender no Mercado Livre, Shopee ou Amazon.', 5000, 40000, '5% a 15%', 'Média a alta', 3,
    'Começa sem loja física e com estoque pequeno.', 'Taxas do marketplace (10% a 20%), frete, devoluções e guerra de preço.'],
  ['marca', 'ecommerce', 'Marca própria em loja online', 'Um produto de nicho com marca sua, loja própria e redes sociais.', 15000, 80000, '10% a 25%', 'Alta', 4,
    'Margem melhor que revenda e a marca vira patrimônio.', 'Precisa de anúncios constantes; o primeiro ano costuma dar prejuízo.'],
  ['pod', 'ecommerce', 'Estampa sob demanda ou dropshipping', 'Você vende e o fornecedor produz e entrega; sem estoque.', 1000, 5000, '5% a 20%', 'Média', 4,
    'Teste barato para validar se um nicho vende.', 'Depende de anúncio pago; prazo de entrega e qualidade fora do seu controle.'],
  ['microfranquia', 'franquia', 'Microfranquia de serviço', 'Franquias até cerca de R$ 100 mil: limpeza, cuidado com idosos, reforço escolar…', 10000, 100000, '10% a 25%', 'Alta', 3,
    'Modelo pronto, marca e treinamento.', 'Royalties de 5% a 10% do faturamento; leia a Circular de Oferta (COF) com calma.'],
  ['imovel', 'imovel', 'Imóvel para alugar', 'Kitnet ou studio para aluguel mensal ou por temporada.', 150000, 400000, 'Aluguel de 0,4% a 0,7% do valor por mês', 'Baixa', 2,
    'Renda estável e um bem que pode valorizar.', 'Vacância, manutenção, condomínio e IR sobre aluguel; dinheiro fica preso.'],
  ['socio', 'sociedade', 'Sócio investidor', 'Entrar com dinheiro no negócio de alguém que você conhece.', 10000, 200000, 'Depende do negócio', 'Baixa', 5,
    'Aproveita a experiência de quem já toca o negócio.', 'Contrato social, acesso às contas e acordo de saída escritos antes de pagar.'],
]
const opCat = id => OP_CATALOGO.find(c => c[0] === id)
let opLista = [], opAbaAtual = 'mapa', opFiltro = 'todos', opEdicao = null, opForm = {}
let opCdi = null // % ao ano

async function opCarregarCdi() {
  if (opCdi != null) return opCdi
  try { const i = await api('/invest/indicadores'); opCdi = Number(i.cdi) || null } catch (e) { opCdi = null }
  return opCdi
}
// Indicadores de uma ideia a partir dos números dela.
function opCalc(o) {
  const inv = Number(o.investimento) || 0, lucro = Number(o.lucro_mensal ?? o.lucroMensal) || 0
  const meses = Number(o.meses_ate_lucro ?? o.mesesAteLucro) || 0, horas = Number(o.horas_semana ?? o.horasSemana) || 0
  const r = {}
  if (inv > 0 && lucro > 0) {
    r.payback = Math.ceil(meses + inv / lucro)
    r.anual = lucro * 12 / inv * 100
  }
  if (lucro > 0 && horas > 0) r.porHora = lucro / (horas * 4.33)
  if (opCdi && inv > 0) {
    r.cdiMes = inv * (Math.pow(1 + opCdi / 100, 1 / 12) - 1)
    if (r.anual != null) r.vsCdi = r.anual / opCdi
  }
  return r
}
const opPrazo = m => m >= 24 ? `${(m / 12).toFixed(1).replace('.0', '').replace('.', ',')} anos` : `${m} ${m === 1 ? 'mês' : 'meses'}`
const opFaixa = (a, b) => `${fmt(a).replace(',00', '')} a ${fmt(b).replace(',00', '')}`
const opRiscoTxt = n => ['', 'muito baixo', 'baixo', 'médio', 'alto', 'muito alto'][n] || 'médio'

// Resumo na aba Metas
async function renderOportunidades() {
  const el = document.getElementById('oportunidades-section')
  if (!el) return
  try {
    const [lista] = await Promise.all([api('/oportunidades' + famQ()), opCarregarCdi()])
    opLista = lista
    const ativas = lista.filter(o => o.status !== 'descartada')
    if (!ativas.length) {
      el.innerHTML = `<div class="op-convite" onclick="abrirOportunidades('mapa')">
        <div class="op-convite-ic">${ico('alvo')}</div>
        <div><b>Mapeie onde o dinheiro pode trabalhar</b>
        <span>Modelos de negócio físicos, digitais e de e-commerce, com investimento típico, margem e riscos. Monte suas ideias e compare com deixar o dinheiro no CDI.</span></div>
        <span class="op-convite-seta">${ico('seta')}</span></div>`
      return
    }
    el.innerHTML = ativas.slice(0, 4).map(opCardHTML).join('') +
      (ativas.length > 4 ? `<button class="op-mais" onclick="abrirOportunidades('ideias')">Ver as ${ativas.length} ideias</button>` : '') +
      `<button class="btn-add-full" onclick="abrirFormOportunidade()">＋ Nova ideia</button>`
  } catch (e) {
    el.innerHTML = `<div class="pt-vazio">Não foi possível carregar as oportunidades: ${escH(e.message)}</div>`
  }
}
function opCardHTML(o) {
  const c = opCalc(o), t = OP_TIPOS[o.tipo] || OP_TIPOS.fisico
  let chk = []
  try { chk = JSON.parse(o.checklist || '[]') } catch (e) {}
  const pront = Math.round(chk.length / OP_CHECK.length * 100)
  const vs = c.vsCdi == null ? '' : c.vsCdi >= 1
    ? `<span class="op-tag op-bom">${c.vsCdi.toFixed(1).replace('.', ',')}× o CDI</span>`
    : `<span class="op-tag op-ruim">abaixo do CDI</span>`
  return `<div class="op-card ${o.status === 'descartada' ? 'op-off' : ''}" onclick="abrirFormOportunidade(${o.id})">
    <div class="op-card-topo">
      <div class="op-ic">${ico(t.ic)}</div>
      <div class="op-card-info"><div class="op-card-nome">${escH(o.nome)}</div>
        <div class="op-card-sub">${t.nome} · ${OP_STATUS[o.status] || 'Ideia'}${visaoAtual === 'consolidado' ? ' · ' + escH(o.usuario_nome) : ''}</div></div>
      ${vs}
    </div>
    <div class="op-nums">
      <div><small>Investimento</small><b>${o.investimento ? fmt(o.investimento) : '—'}</b></div>
      <div><small>Retorno ao ano</small><b>${c.anual != null ? c.anual.toFixed(0) + '%' : '—'}</b></div>
      <div><small>Se paga em</small><b>${c.payback ? opPrazo(c.payback) : '—'}</b></div>
    </div>
    <div class="op-pront"><div class="op-pront-barra"><div style="width:${pront}%"></div></div><span>${chk.length} de ${OP_CHECK.length} passos de validação</span></div>
  </div>`
}

// Folha com o mapa e as ideias
async function abrirOportunidades(aba = 'mapa') {
  document.getElementById('modal-oportunidades').style.display = 'flex'
  opAba(aba)
  opRenderCapital()
}
function opAba(aba) {
  opAbaAtual = aba
  document.querySelectorAll('#op-seg button').forEach(b => b.classList.toggle('on', b.dataset.aba === aba))
  if (aba === 'mapa') opRenderMapa(); else opRenderIdeias()
}
async function opRenderCapital() {
  const el = document.getElementById('op-capital')
  try {
    const [rs] = await Promise.all([api('/recebiveis' + famQ()), opCarregarCdi()])
    const pend = rs.filter(r => !r.recebido_em && r.destino === 'investimento')
    const hoje = hojeLocalBR()
    const em12 = new Date(); em12.setFullYear(em12.getFullYear() + 1)
    const lim = em12.toLocaleDateString('sv-SE')
    const total = pend.reduce((a, r) => a + Number(r.valor), 0)
    const ano = pend.filter(r => r.data_prevista <= lim).reduce((a, r) => a + Number(r.valor), 0)
    const partes = []
    if (total > 0) partes.push(`<div><small>A receber para investir</small><b>${fmt(total)}</b><span>${fmt(ano)} nos próximos 12 meses</span></div>`)
    if (opCdi) partes.push(`<div><small>CDI hoje</small><b>${opCdi.toFixed(2).replace('.', ',')}% ao ano</b><span>a régua: deixar o dinheiro rendendo</span></div>`)
    el.innerHTML = partes.length ? `<div class="op-capital-grid">${partes.join('')}</div>` : ''
    void hoje
  } catch (e) { el.innerHTML = '' }
}
function opFiltrar(t) { opFiltro = t; opRenderMapa() }
function opRenderMapa() {
  const el = document.getElementById('op-conteudo')
  const filtros = ['todos', ...Object.keys(OP_TIPOS)].filter(t => t === 'todos' || OP_CATALOGO.some(c => c[1] === t))
  const itens = OP_CATALOGO.filter(c => opFiltro === 'todos' || c[1] === opFiltro)
  el.innerHTML = `
    <div class="op-filtros">${filtros.map(t => `<button class="${opFiltro === t ? 'on' : ''}" onclick="opFiltrar('${t}')">${t === 'todos' ? 'Todos' : OP_TIPOS[t].nome}</button>`).join('')}</div>
    ${itens.map(c => {
      const [id, tipo, nome, resumo, min, max, margem, dedic, risco, combina, atencao] = c
      const t = OP_TIPOS[tipo]
      const cdiAno = opCdi ? (min + max) / 2 * opCdi / 100 : null
      return `<div class="op-modelo">
        <div class="op-card-topo">
          <div class="op-ic">${ico(t.ic)}</div>
          <div class="op-card-info"><div class="op-card-nome">${nome}</div><div class="op-card-sub">${t.nome}</div></div>
        </div>
        <p class="op-resumo">${resumo}</p>
        <div class="op-fatos">
          <div><small>Investimento típico</small><b>${opFaixa(min, max)}</b></div>
          <div><small>Margem de lucro</small><b>${margem}</b></div>
          <div><small>Seu tempo</small><b>${dedic}</b></div>
          <div><small>Risco</small><b class="op-risco-dots">${'●'.repeat(risco)}<i>${'●'.repeat(5 - risco)}</i> ${opRiscoTxt(risco)}</b></div>
        </div>
        <div class="op-pros"><b>Combina:</b> ${combina}</div>
        <div class="op-contras"><b>Atenção:</b> ${atencao}</div>
        ${cdiAno ? `<div class="op-regua">Régua: no CDI, ${fmt((min + max) / 2).replace(',00', '')} renderiam cerca de ${fmt(cdiAno / 12)} por mês, sem trabalho e antes do IR.</div>` : ''}
        <button class="op-estudar" onclick="abrirFormOportunidade(null, '${id}')">Estudar esta ideia</button>
      </div>`
    }).join('')}
    <p class="op-aviso">Faixas gerais de mercado para comparar modelos; variam muito por cidade, ponto e gestão. Não é recomendação de investimento: antes de decidir, valide com o Sebrae e, se for usar o dinheiro da venda, converse com um planejador financeiro (CFP).</p>`
}
function opRenderIdeias() {
  const el = document.getElementById('op-conteudo')
  el.innerHTML = (opLista.length
    ? opLista.map(opCardHTML).join('')
    : `<div class="pt-vazio">Nenhuma ideia ainda. Abra o <b onclick="opAba('mapa')">Mapa</b> e toque em "Estudar esta ideia", ou crie a sua.</div>`) +
    `<button class="btn-add-full" onclick="abrirFormOportunidade()">＋ Nova ideia</button>`
}

// Formulário de uma ideia
function abrirFormOportunidade(id = null, modelo = null) {
  const o = id ? opLista.find(x => x.id === id) : null
  const m = modelo ? opCat(modelo) : (o?.modelo ? opCat(o.modelo) : null)
  opEdicao = o ? o.id : null
  let chk = []
  try { chk = JSON.parse(o?.checklist || '[]') } catch (e) {}
  opForm = { tipo: o?.tipo || m?.[1] || 'fisico', risco: o?.risco || m?.[8] || 3, status: o?.status || 'ideia', modelo: o?.modelo || m?.[0] || null, checklist: new Set(chk) }
  const v = n => n ? String(Number(n).toFixed(2)).replace('.', ',') : ''
  document.getElementById('opf-titulo').textContent = o ? 'Editar ideia' : (m ? m[2] : 'Nova ideia')
  document.getElementById('opf-nome').value = o?.nome || m?.[2] || ''
  document.getElementById('opf-invest').value = v(o?.investimento)
  document.getElementById('opf-invest').placeholder = m ? `Típico: ${opFaixa(m[4], m[5])}` : '0,00'
  document.getElementById('opf-lucro').value = v(o?.lucro_mensal)
  document.getElementById('opf-meses').value = o?.meses_ate_lucro || ''
  document.getElementById('opf-horas').value = o?.horas_semana || ''
  document.getElementById('opf-notas').value = o?.notas || ''
  document.getElementById('opf-excluir').style.display = o ? 'block' : 'none'
  document.getElementById('opf-tipos').innerHTML = Object.entries(OP_TIPOS).map(([k, t]) =>
    `<button class="rtipo-btn" data-v="${k}" onclick="opSel('tipo','${k}')">${t.nome}</button>`).join('')
  document.getElementById('opf-risco').innerHTML = [1, 2, 3, 4, 5].map(n =>
    `<button data-v="${n}" onclick="opSel('risco',${n})">${n}<small>${opRiscoTxt(n)}</small></button>`).join('')
  document.getElementById('opf-status').innerHTML = Object.entries(OP_STATUS).map(([k, s]) =>
    `<button class="rtipo-btn" data-v="${k}" onclick="opSel('status','${k}')">${s}</button>`).join('')
  document.getElementById('opf-check').innerHTML = OP_CHECK.map(([k, txt]) =>
    `<label><input type="checkbox" data-k="${k}" ${opForm.checklist.has(k) ? 'checked' : ''} onchange="opMarcar(this)"> <span>${txt}</span></label>`).join('')
  opMarcarSel()
  fecharModal('modal-oportunidades')
  document.getElementById('modal-oportunidade').style.display = 'flex'
  opCarregarCdi().then(opCalcForm)
}
function opSel(campo, v) { opForm[campo] = v; opMarcarSel() }
function opMarcarSel() {
  document.querySelectorAll('#opf-tipos button').forEach(b => b.classList.toggle('sel', b.dataset.v === opForm.tipo))
  document.querySelectorAll('#opf-status button').forEach(b => b.classList.toggle('sel', b.dataset.v === opForm.status))
  document.querySelectorAll('#opf-risco button').forEach(b => b.classList.toggle('sel', Number(b.dataset.v) === Number(opForm.risco)))
}
function opMarcar(cb) { cb.checked ? opForm.checklist.add(cb.dataset.k) : opForm.checklist.delete(cb.dataset.k) }
function opDadosForm() {
  return {
    nome: document.getElementById('opf-nome').value.trim(),
    tipo: opForm.tipo, modelo: opForm.modelo, risco: opForm.risco, status: opForm.status,
    investimento: parseBRL(document.getElementById('opf-invest').value),
    lucroMensal: parseBRL(document.getElementById('opf-lucro').value),
    mesesAteLucro: parseInt(document.getElementById('opf-meses').value) || 0,
    horasSemana: parseFloat(String(document.getElementById('opf-horas').value).replace(',', '.')) || 0,
    notas: document.getElementById('opf-notas').value.trim(),
    checklist: [...opForm.checklist],
  }
}
function opCalcForm() {
  const el = document.getElementById('opf-calc')
  if (!el) return
  const d = opDadosForm(), c = opCalc(d)
  const linhas = []
  if (c.payback) linhas.push(`<div><small>Se paga em</small><b>${opPrazo(c.payback)}</b></div>`)
  if (c.anual != null) linhas.push(`<div><small>Retorno ao ano</small><b>${c.anual.toFixed(0)}%</b></div>`)
  if (c.porHora) linhas.push(`<div><small>Por hora sua</small><b>${fmt(c.porHora)}</b></div>`)
  if (c.cdiMes) linhas.push(`<div><small>No CDI renderia</small><b>${fmt(c.cdiMes)}/mês</b></div>`)
  let veredito = ''
  if (c.vsCdi != null) veredito = c.vsCdi >= 1.5
    ? `<p class="op-ok">Rende ${c.vsCdi.toFixed(1).replace('.', ',')} vezes o CDI. A diferença paga o risco e o seu trabalho?</p>`
    : c.vsCdi >= 1 ? `<p class="op-meio">Pouco acima do CDI. Com risco e trabalho, a conta fica apertada.</p>`
    : `<p class="op-alerta">Abaixo do CDI: deixar o dinheiro rendendo daria mais, sem risco de negócio.</p>`
  el.innerHTML = linhas.length ? `<div class="op-calc-grid">${linhas.join('')}</div>${veredito}` : `<p class="op-dica">Preencha investimento e lucro por mês para ver em quanto tempo se paga e a comparação com o CDI.</p>`
}
async function salvarOportunidade() {
  const d = opDadosForm()
  if (!d.nome) { toast('Dê um nome para a ideia', 'erro'); return }
  try {
    await api(opEdicao ? `/oportunidades/${opEdicao}` : '/oportunidades', {
      method: opEdicao ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...d, usuarioId: usuario.id })
    })
    fecharModal('modal-oportunidade')
    toast('✅ Ideia salva')
    await renderOportunidades()
  } catch (e) { toast('❌ ' + e.message, 'erro') }
}
async function excluirOportunidade() {
  if (!opEdicao || !confirm('Excluir esta ideia?')) return
  await api(`/oportunidades/${opEdicao}`, { method: 'DELETE' })
  fecharModal('modal-oportunidade')
  renderOportunidades()
}

// ══════════════════════════════════════════
//  PLANEJAMENTO — mês passado, reserva, mesada, cobranças fixas, dívidas, quem gastou
// ══════════════════════════════════════════
const fmt0 = v => (Number(v) < 0 ? '-' : '') + 'R$ ' + Math.abs(Math.round(Number(v) || 0)).toLocaleString('pt-BR')
const mesNome = mes => NOMES_MES[Number(mes.slice(5, 7)) - 1]
const mesAno = mes => `${mesNome(mes)} de ${mes.slice(0, 4)}`
const mesCurto = mes => `${mesNome(mes).slice(0, 3).toLowerCase()}/${mes.slice(2, 4)}`
const somaMesStr = (mes, k) => {
  const [y, m] = mes.split('-').map(Number)
  const t = y * 12 + (m - 1) + k
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}
const mesHojeStr = () => hojeLocalBR().slice(0, 7)
const num1 = v => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
let planejTipo = null, planejMes = null, planejPessoasMes = null, planejDividas = null

async function renderPlanejamento() {
  const el = document.getElementById('plan-grade')
  if (!el) return
  const q = famQ()
  const [rRes, rMes, rAss, rDiv, rFech, rPes] = await Promise.allSettled([
    api('/plan/reserva' + q), api('/plan/mesadas' + q), api('/plan/assinaturas' + q),
    api('/dividas/custo' + q), api('/plan/fechamento' + q), api('/plan/pessoas' + q)
  ])
  const v = r => (r.status === 'fulfilled' ? r.value : null)
  const res = v(rRes), mesadas = v(rMes), ass = v(rAss), div = v(rDiv), fech = v(rFech), pes = v(rPes)

  const tile = (tipo, ico, nome, valor, sub, pct = null, cor = '') => `
    <button class="pl-tile" onclick="abrirPlanej('${tipo}')">
      <span class="pl-topo"><span class="pl-ico">${ico}</span><span class="pl-nome">${nome}</span></span>
      <span class="pl-valor ${cor}">${valor}</span>
      <span class="pl-sub">${sub}</span>
      ${pct == null ? '' : `<span class="pl-barra"><i style="width:${Math.max(2, Math.min(100, pct))}%"></i></span>`}
    </button>`

  const tiles = []
  // Reserva
  if (!res || !res.temDados) tiles.push(tile('reserva', '🛟', 'Reserva', '—', 'Precisa de um mês fechado com gastos'))
  else if (res.falta <= 0 && res.alvo > 0) tiles.push(tile('reserva', '🛟', 'Reserva', 'Completa', `${num1(res.mesesCobertos)} meses do básico`, 100, 'pos'))
  else tiles.push(tile('reserva', '🛟', 'Reserva', `${num1(res.mesesCobertos)} de ${res.metaMeses} meses`,
    res.negativo > 0 ? `<b class="pl-alerta">Antes: cobrir o negativo</b>` : `Faltam ${fmt0(res.falta)}`, res.pct))
  // Mesada
  const minha = (mesadas || []).find(m => m.minha)
  if (!minha || !minha.configurada) tiles.push(tile('mesada', '👛', 'Minha mesada', 'Definir', 'Um valor livre por mês'))
  else tiles.push(tile('mesada', '👛', 'Minha mesada', `Restam ${fmt0(minha.resta)}`, `de ${fmt0(minha.valor)} este mês`, minha.pct, minha.resta < 0 ? 'neg' : ''))
  // Cobranças que se repetem
  if (!ass || !ass.achadas.length) tiles.push(tile('assinaturas', '🔁', 'Cobranças fixas', 'Nada novo', 'Nenhuma cobrança repetida'))
  else tiles.push(tile('assinaturas', '🔁', 'Cobranças fixas', `${fmt0(ass.totalAchadasAno)}/ano`,
    ass.paraRevisar ? `<b class="pl-alerta">${ass.paraRevisar} para revisar</b>` : (ass.achadas.length === 1 ? '1 repetida, revisada' : `${ass.achadas.length} repetidas, revisadas`)))
  // Dívidas
  if (!div || !div.length) tiles.push(tile('dividas', '💸', 'Saída das dívidas', 'Sem dívidas', 'Nenhuma ativa', null, 'pos'))
  else {
    const plano = simularDividas(div, 0, true)
    const base = simularDividas(div, 0, false)
    const saldo = div.reduce((a, d) => a + d.saldo, 0)
    const sub = base.meses != null && base.meses !== plano.meses
      ? `no plano · só parcelas: ${mesCurto(somaMesStr(mesHojeStr(), base.meses))}`
      : `${div.length} dívida${div.length > 1 ? 's' : ''} · ${fmt0(saldo)}`
    tiles.push(plano.meses != null
      ? tile('dividas', '💸', 'Saída das dívidas', `Livres em ${mesCurto(somaMesStr(mesHojeStr(), plano.meses))}`, sub)
      : tile('dividas', '💸', 'Saída das dívidas', fmt0(saldo), 'Toque para ver a ordem'))
  }
  // Quem gastou (sempre da família)
  if (!pes || !pes.pessoas.length) tiles.push(tile('pessoas', '👨‍👩‍👧', 'Quem gastou', '—', 'Sem gastos neste mês'))
  else {
    const [a, b] = pes.pessoas
    tiles.push(tile('pessoas', '👨‍👩‍👧', 'Quem gastou', `${escH(a.nome.split(' ')[0])} ${a.pct}%`, b ? `${escH(b.nome.split(' ')[0])} ${b.pct}% · este mês` : 'este mês'))
  }
  // Mês passado
  if (!fech || !fech.temDados) tiles.push(tile('fechamento', '📊', 'Mês passado', '—', 'Sem lançamentos'))
  else if (fech.incompleto) tiles.push(tile('fechamento', '📊', 'Mês passado', 'Poucos lançamentos', `${mesNome(fech.mes)} foi antes do app`))
  else if (fech.renda > 0) tiles.push(tile('fechamento', '📊', 'Mês passado', `${fech.resultado >= 0 ? 'Sobrou' : 'Faltou'} ${fmt0(Math.abs(fech.resultado))}`, `${mesNome(fech.mes)} · gastos ${fmt0(fech.gastos)}`, null, fech.resultado >= 0 ? 'pos' : 'neg'))
  else tiles.push(tile('fechamento', '📊', 'Mês passado', `Gastos ${fmt0(fech.gastos)}`, mesNome(fech.mes)))

  tiles.push(`<button class="pl-tile pl-tile-largo" onclick="mostrarAba('viagens'); document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'))">
      <span class="pl-topo"><span class="pl-ico">✈</span><span class="pl-nome">Viagens</span></span>
      <span class="pl-valor">Quando e para onde ir</span>
      <span class="pl-sub">Férias, datas do casal, feriados, sugestões e quanto guardar</span>
    </button>`)
  el.innerHTML = tiles.join('')
  renderFechamentoCard(fech)
}

// Cartão no topo da Início nos 10 primeiros dias do mês, até a pessoa fechar.
function renderFechamentoCard(f) {
  const el = document.getElementById('fechamento-card')
  if (!el) return
  const chave = 'fin_fech_visto_' + (usuario?.id || 'x') + '_' + (f?.mes || '')
  let visto = false
  try { visto = localStorage.getItem(chave) === '1' } catch (e) {}
  if (!f || !f.temDados || f.incompleto || Number(hojeLocalBR().slice(8, 10)) > 10 || visto) { el.style.display = 'none'; return }
  const dif = f.gastos - f.gastosAnterior
  const comp = f.gastosAnterior > 0 ? ` · ${dif >= 0 ? fmt0(dif) + ' a mais' : fmt0(-dif) + ' a menos'} que ${mesNome(f.mesAnterior).toLowerCase()}` : ''
  const sobra = f.renda > 0 ? (f.resultado >= 0 ? `sobraram <b class="pos">${fmt0(f.resultado)}</b>` : `faltaram <b class="neg">${fmt0(-f.resultado)}</b>`) : ''
  el.innerHTML = `
    <div class="fc-topo"><span>📊 Como foi ${mesNome(f.mes).toLowerCase()}</span>
      <button class="fc-x" aria-label="Dispensar" onclick="event.stopPropagation();dispensarFechamento('${chave}')">✕</button></div>
    <div class="fc-linha">Gastos de <b>${fmt0(f.gastos)}</b>${comp}${sobra ? ', ' + sobra : ''}.</div>
    ${f.subiram[0] ? `<div class="fc-linha fc-sub">O que mais subiu: ${escH(f.subiram[0].categoria)} (+${fmt0(f.subiram[0].diferenca)})</div>` : ''}
    <div class="fc-ver">Ver o resumo <span>→</span></div>`
  el.style.display = 'block'
}
function dispensarFechamento(chave) {
  try { localStorage.setItem(chave, '1') } catch (e) {}
  document.getElementById('fechamento-card').style.display = 'none'
}

const PLANEJ_TITULOS = {
  fechamento: 'Resumo do mês', reserva: 'Reserva de emergência', mesada: 'Mesada pessoal',
  assinaturas: 'Cobranças que se repetem', dividas: 'Saída das dívidas', pessoas: 'Quem gastou o quê'
}
function abrirPlanej(tipo) {
  planejTipo = tipo
  document.getElementById('px-titulo').textContent = PLANEJ_TITULOS[tipo] || ''
  document.getElementById('px-corpo').innerHTML = '<div class="sk-lines"><div class="sk-line"></div><div class="sk-line"></div><div class="sk-line"></div></div>'
  document.getElementById('modal-plano-x').style.display = 'flex'
  if (tipo === 'fechamento') { planejMes = somaMesStr(mesHojeStr(), -1); renderPxFechamento() }
  else if (tipo === 'reserva') renderPxReserva()
  else if (tipo === 'mesada') renderPxMesada()
  else if (tipo === 'assinaturas') renderPxAssinaturas()
  else if (tipo === 'dividas') renderPxDividas()
  else if (tipo === 'pessoas') { planejPessoasMes = mesHojeStr(); renderPxPessoas() }
}
function fecharPlanej() {
  fecharModal('modal-plano-x')
  renderPlanejamento()
}
const pxCorpo = html => { document.getElementById('px-corpo').innerHTML = html }
const pxErro = e => pxCorpo(`<div class="orc-vazio">Não foi possível carregar: ${escH(e.message)}</div>`)
const catIco = c => EMOJI_CAT[c] || '📦'

// ── Resumo do mês ──
async function renderPxFechamento() {
  try {
    const f = await api('/plan/fechamento' + famQ() + (famQ() ? '&' : '?') + 'mes=' + planejMes)
    const atual = planejMes === mesHojeStr()
    const dif = f.gastos - f.gastosAnterior
    const pctDif = f.gastosAnterior > 0 ? Math.round((dif / f.gastosAnterior) * 100) : null
    const linhaCat = (c, sinal) => `
      <div class="px-row"><span class="px-row-ico">${catIco(c.categoria)}</span>
        <span class="px-row-txt"><b>${escH(c.categoria)}</b><small>${fmt0(c.anterior)} → ${fmt0(c.atual)}</small></span>
        <span class="px-row-val ${sinal > 0 ? 'neg' : 'pos'}">${sinal > 0 ? '+' : '−'}${fmt0(Math.abs(c.diferenca))}</span></div>`
    pxCorpo(`
      <div class="px-nav">
        <button onclick="navPxFechamento(-1)" aria-label="Mês anterior">‹</button>
        <b>${mesAno(planejMes)}${atual ? ' <small>(em andamento)</small>' : ''}</b>
        <button onclick="navPxFechamento(1)" ${atual ? 'disabled' : ''} aria-label="Próximo mês">›</button>
      </div>
      ${f.incompleto ? `<p class="px-aviso">Este mês tem poucos lançamentos (foi antes de vocês começarem a usar o app), então a sobra não é real. Os números valem a partir do primeiro mês completo.</p>` : ''}
      ${!f.temDados ? '<div class="orc-vazio">Nenhum gasto lançado neste mês.</div>' : `
      <div class="px-tres">
        <div><small>Entradas</small><b>${fmt0(f.renda)}</b></div>
        <div><small>Gastos</small><b>${fmt0(f.gastos)}</b></div>
        <div><small>${f.resultado >= 0 ? 'Sobrou' : 'Faltou'}</small><b class="${f.resultado >= 0 ? 'pos' : 'neg'}">${fmt0(Math.abs(f.resultado))}</b></div>
      </div>
      ${f.gastosAnterior > 0 ? `<p class="px-txt">Em relação a ${mesNome(f.mesAnterior).toLowerCase()}, os gastos ${dif >= 0 ? 'subiram' : 'caíram'} <b class="${dif >= 0 ? 'neg' : 'pos'}">${fmt0(Math.abs(dif))}</b> (${pctDif >= 0 ? '+' : ''}${pctDif}%).</p>` : ''}
      ${f.subiram.length ? `<h4 class="px-h">O que mais subiu</h4>${f.subiram.map(c => linhaCat(c, 1)).join('')}` : ''}
      ${f.cairam.length ? `<h4 class="px-h">O que mais caiu</h4>${f.cairam.map(c => linhaCat(c, -1)).join('')}` : ''}
      <h4 class="px-h">Para onde foi mais dinheiro</h4>
      ${f.maiores.map(c => `<div class="px-row"><span class="px-row-ico">${catIco(c.categoria)}</span>
        <span class="px-row-txt"><b>${escH(c.categoria)}</b><small>${f.gastos > 0 ? Math.round((c.total / f.gastos) * 100) : 0}% dos gastos</small></span>
        <span class="px-row-val">${fmt0(c.total)}</span></div>`).join('')}
      <p class="px-nota">Compras parceladas contam no mês de cada parcela.</p>`}`)
  } catch (e) { pxErro(e) }
}
function navPxFechamento(k) {
  const novo = somaMesStr(planejMes, k)
  if (novo > mesHojeStr()) return
  planejMes = novo
  renderPxFechamento()
}

// ── Reserva de emergência ──
async function renderPxReserva() {
  try { pintarPxReserva(await api('/plan/reserva' + famQ())) } catch (e) { pxErro(e) }
}
function pintarPxReserva(r) {
  if (!r.temDados) {
    pxCorpo(`<p class="px-txt">Para calcular a reserva, o app precisa de pelo menos um mês fechado com gastos lançados. Volte aqui no começo do próximo mês.</p>`)
    return
  }
  const quem = visaoAtual === 'pessoal' ? 'do seu custo básico' : 'do custo básico de vocês'
  const hoje = mesHojeStr()
  const periodo = r.baseMesAtual ? 'Neste mês, até agora,' : r.mesesUsados === 1 ? 'No último mês' : `Nos últimos ${r.mesesUsados} meses`
  const sobraTxt = r.baseMesAtual
    ? (r.sobraMedia > 0 ? `Pela previsão deste mês (entradas menos gastos), devem sobrar <b>${fmt0(r.sobraMedia)}</b>.` : 'Pela previsão deste mês, não vai sobrar dinheiro.')
    : r.sobraMedia > 0
      ? `${periodo} sobraram em média <b>${fmt0(r.sobraMedia)}</b> por mês.`
      : `${periodo} não sobrou dinheiro no fim do mês.`

  // Antes da reserva: conta no negativo.
  const negativo = r.negativo > 0 ? `
    <div class="px-aviso"><b>Antes de guardar: ${fmt0(r.negativo)} no negativo</b>
      O cheque especial pode cobrar até 8% ao mês, e uma aplicação segura rende perto de 1% ao mês. Enquanto a conta estiver negativa, cada real que sobra vale mais cobrindo o negativo do que guardado. A reserva começa depois disso.</div>` : ''

  // Quanto guardar: três ritmos, marcando os que cabem na sobra.
  let quanto
  if (r.falta <= 0) {
    quanto = `<p class="px-txt">A reserva está completa. O que sobrar daqui para frente pode ir para outros objetivos.</p>`
  } else {
    const etapa1 = r.guardado < r.custoMensal ? `<p class="px-txt"><b>Primeira etapa:</b> juntar 1 mês do custo básico, <b>${fmt0(r.custoMensal)}</b>. Isso já cobre um imprevisto grande sem recorrer a empréstimo.</p>` : ''
    const ritmos = [12, 24, 36].map(n => {
      const v = r.falta / n
      const cabe = r.sobraMedia > 0 && v <= r.sobraMedia
      return `<div class="px-row"><span class="px-row-txt"><b>Completa em ${n} meses</b><small>${mesCurto(somaMesStr(hoje, n))}${cabe ? ' · cabe na sobra atual' : ''}</small></span>
        <span class="px-row-val ${cabe ? 'pos' : ''}">${fmt0(v)}<small>por mês</small></span></div>`
    }).join('')
    const acabando = (r.acabando || []).map(d => `<p class="px-txt">Em <b>${mesCurto(somaMesStr(hoje, d.meses))}</b> termina ${escH(d.descricao)} (${escH(d.credor)}): a parcela de <b>${fmt0(d.parcela)}</b> pode passar a ir para a reserva, sem apertar mais o orçamento.</p>`).join('')
    quanto = `${etapa1}<p class="px-txt">${sobraTxt}</p>${ritmos}${acabando}
      <p class="px-nota">Guardar logo que o dinheiro entra, como se fosse uma conta a pagar, funciona melhor do que guardar o que sobra no fim do mês.</p>`
  }

  const onde = `
    <h4 class="px-h">Onde guardar</h4>
    <p class="px-txt">A reserva precisa de quatro coisas:</p>
    <ul class="px-lista">
      <li><b>Resgate rápido:</b> no mesmo dia ou no dia seguinte (liquidez diária).</li>
      <li><b>Risco muito baixo:</b> título do Tesouro ou aplicação coberta pelo FGC (até R$ 250 mil por pessoa em cada instituição).</li>
      <li><b>Render perto de 100% do CDI</b>, para não perder para a inflação.</li>
      <li><b>Ficar separada</b> da conta do dia a dia, para não ser gasta sem querer.</li>
    </ul>
    <p class="px-txt">O que costuma cumprir isso: Tesouro Selic, CDB com liquidez diária que pague 100% do CDI ou mais, e contas ou "caixinhas" de banco que rendem 100% do CDI.</p>
    <p class="px-txt">Não servem para reserva: ações, fundos imobiliários, dólar e cripto (o valor oscila e pode estar baixo justo quando precisar), previdência e aplicações com carência. A poupança é segura, mas costuma render menos que as opções acima.</p>
    <p class="px-nota">Isto é a regra geral, não uma indicação de produto. Para escolher o produto e a instituição, um planejador financeiro com certificação CFP pode ajudar.</p>`

  pxCorpo(`
    <div class="px-destaque">
      <small>Guardado</small><b>${fmt0(r.guardado)}</b>
      <span>de ${fmt0(r.alvo)} · ${r.metaMeses} meses do custo básico</span>
      <span class="pl-barra px-barra"><i style="width:${Math.max(2, r.pct)}%"></i></span>
    </div>
    <div class="px-chips"><span>Meta:</span>
      ${[3, 6, 12].map(n => `<button class="px-chip ${r.metaMeses === n ? 'on' : ''}" onclick="salvarMetaReservaPx(${n})">${n} meses</button>`).join('')}
    </div>
    <p class="px-txt">Hoje a reserva cobre <b>${num1(r.mesesCobertos)} ${r.mesesCobertos === 1 ? 'mês' : 'meses'}</b> ${quem}.</p>
    ${negativo}
    <h4 class="px-h">Quanto guardar por mês</h4>
    ${quanto}
    <h4 class="px-h">Custo básico por mês: ${fmt(r.custoMensal)}</h4>
    ${r.essenciais.map(c => `<div class="px-row"><span class="px-row-ico">${catIco(c.categoria)}</span><span class="px-row-txt"><b>${escH(c.categoria)}</b></span><span class="px-row-val">${fmt0(c.media)}</span></div>`).join('')}
    ${r.financiamento > 0 ? `<div class="px-row"><span class="px-row-ico">🏦</span><span class="px-row-txt"><b>Parcelas de dívidas</b></span><span class="px-row-val">${fmt0(r.financiamento)}</span></div>` : ''}
    <p class="px-nota">${r.baseMesAtual ? 'Calculado com o mês atual até agora (ainda não há mês completo no app); fica mais preciso a cada mês fechado.' : `Média dos últimos ${r.mesesUsados} ${r.mesesUsados === 1 ? 'mês fechado' : 'meses fechados'}.`} Conta só o que continua existindo se a renda parar: casa, mercado, saúde, transporte, educação e parcelas. Lazer, restaurante e assinaturas ficam de fora.</p>
    ${onde}
    <button class="btn-confirm btn-verde px-btn" onclick="${r.temItemReserva ? 'irParaPatrimonio()' : 'novaReservaPatrimonio()'}">${r.temItemReserva ? 'Atualizar o valor guardado' : 'Cadastrar onde está a reserva'}</button>`)
}
async function salvarMetaReservaPx(n) {
  try {
    pintarPxReserva(await api('/plan/reserva' + famQ(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ meses: n }) }))
  } catch (e) { toast('❌ ' + e.message, 'erro') }
}
function irParaPatrimonio() {
  fecharModal('modal-plano-x')
  mostrarAba('metas'); navBtn('nav-metas')
}
function novaReservaPatrimonio() {
  fecharModal('modal-plano-x')
  abrirModalPatrimonio()
  selPtTipo('reserva')
  document.getElementById('pt-nome').value = 'Reserva de emergência'
}

// ── Mesada pessoal ──
const CATS_MESADA_PADRAO = ['Lazer', 'Vestuário', 'Cuidados pessoais', 'Restaurante']
let pxMesadaEditando = false, pxMesadaCats = []
async function renderPxMesada() {
  try { pintarPxMesada(await api('/plan/mesadas' + famQ())) } catch (e) { pxErro(e) }
}
function pintarPxMesada(lista) {
  const eu = lista.find(m => m.minha)
  const outros = lista.filter(m => !m.minha)
  let meu
  if (!eu || !eu.configurada || pxMesadaEditando) {
    if (!pxMesadaEditando) pxMesadaCats = (eu && eu.categorias && eu.categorias.length) ? [...eu.categorias] : [...CATS_MESADA_PADRAO]
    meu = `
      <p class="px-txt">Escolha um valor para gastar no mês sem precisar explicar para ninguém, e em quais categorias ele vale. O app mostra quanto ainda resta.</p>
      <label class="px-label">Valor por mês</label>
      <input id="px-mesada-valor" class="px-input" inputmode="decimal" placeholder="R$ 0,00" value="${eu && eu.valor ? fmtNum(eu.valor) : ''}">
      <label class="px-label">Conta o que eu lançar em</label>
      <div class="px-chips px-chips-wrap">${CATS_GASTO.map(c => `<button class="px-chip ${pxMesadaCats.includes(c) ? 'on' : ''}" onclick="togglePxMesadaCat(this, '${c}')">${catIco(c)} ${c}</button>`).join('')}</div>
      <button class="btn-confirm btn-verde px-btn" onclick="salvarPxMesada()">Salvar mesada</button>`
  } else {
    const porDia = eu.diasRestantes > 0 && eu.resta > 0 ? eu.resta / (eu.diasRestantes + 1) : 0
    meu = `
      <div class="px-destaque">
        <small>${eu.resta >= 0 ? 'Restam' : 'Passou'}</small><b class="${eu.resta < 0 ? 'neg' : ''}">${fmt(Math.abs(eu.resta))}</b>
        <span>gastou ${fmt0(eu.gasto)} de ${fmt0(eu.valor)} neste mês</span>
        <span class="pl-barra px-barra"><i style="width:${Math.max(2, eu.pct)}%"></i></span>
      </div>
      ${porDia > 0 ? `<p class="px-txt">Dá cerca de <b>${fmt0(porDia)} por dia</b> até o fim do mês.</p>` : ''}
      <p class="px-nota">Conta os seus lançamentos em: ${eu.categorias.map(escH).join(', ')}.</p>
      <button class="btn-cancel px-btn" onclick="editarPxMesada()">Mudar valor ou categorias</button>`
  }
  const deles = outros.map(o => `<div class="px-row"><span class="px-row-ico">👤</span>
    <span class="px-row-txt"><b>${escH(o.nome.split(' ')[0])}</b><small>${o.configurada ? `de ${fmt0(o.valor)} no mês` : 'ainda não definiu'}</small></span>
    <span class="px-row-val ${o.resta < 0 ? 'neg' : ''}">${o.configurada ? (o.resta >= 0 ? 'restam ' : 'passou ') + fmt0(Math.abs(o.resta)) : '—'}</span></div>`).join('')
  pxCorpo(`${meu}${deles ? `<h4 class="px-h">Dos outros</h4>${deles}<p class="px-nota">Do outro aparece só quanto resta, não no que foi gasto.</p>` : ''}`)
}
function togglePxMesadaCat(btn, c) {
  pxMesadaCats = pxMesadaCats.includes(c) ? pxMesadaCats.filter(x => x !== c) : [...pxMesadaCats, c]
  btn.classList.toggle('on', pxMesadaCats.includes(c))
}
function editarPxMesada() {
  pxMesadaEditando = true
  api('/plan/mesadas' + famQ()).then(l => {
    const eu = l.find(m => m.minha)
    pxMesadaCats = eu && eu.categorias ? [...eu.categorias] : [...CATS_MESADA_PADRAO]
    pintarPxMesada(l)
  }).catch(pxErro)
}
async function salvarPxMesada() {
  const valor = parseBRL(document.getElementById('px-mesada-valor').value)
  if (!(valor > 0)) { toast('Informe o valor da mesada', 'erro'); return }
  if (!pxMesadaCats.length) { toast('Escolha ao menos uma categoria', 'erro'); return }
  try {
    const l = await api('/plan/mesada' + famQ(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ valor, categorias: pxMesadaCats }) })
    pxMesadaEditando = false
    toast('✅ Mesada salva')
    pintarPxMesada(l)
  } catch (e) { toast('❌ ' + e.message, 'erro') }
}

// ── Cobranças que se repetem ──
async function renderPxAssinaturas() {
  try {
    const a = await api('/plan/assinaturas' + famQ())
    const revisar = a.achadas.filter(x => !x.mantida)
    const mantidas = a.achadas.filter(x => x.mantida)
    const linha = (x, botoes) => `
      <div class="px-ass">
        <div class="px-row"><span class="px-row-ico">${catIco(x.categoria)}</span>
          <span class="px-row-txt"><b>${escH(x.descricao)}</b><small>${escH(x.categoria)} · cobrou em ${x.meses} meses${visaoAtual === 'consolidado' ? ' · ' + escH(x.usuario_nome.split(' ')[0]) : ''}</small></span>
          <span class="px-row-val">${fmt(x.valor)}<small>${fmt0(x.anual)}/ano</small></span></div>
        <div class="px-ass-btns">${botoes}</div>
      </div>`
    pxAssAchadas = a.achadas
    const btn = (x, acao, txt, cls = '') => `<button class="px-mini ${cls}" onclick="marcarPxAssinatura(${a.achadas.indexOf(x)}, '${acao}')">${txt}</button>`
    pxCorpo(`
      ${a.achadas.length ? `<div class="px-destaque"><small>Cobranças repetidas encontradas</small><b>${fmt0(a.totalAchadasAno)}<span class="px-por">/ano</span></b><span>${fmt(a.totalAchadasAno / 12)} por mês</span></div>`
        : '<p class="px-txt">Nenhuma cobrança nova se repetindo nos últimos 6 meses.</p>'}
      ${revisar.length ? `<h4 class="px-h">Para revisar</h4><p class="px-nota">Apareceram com o mesmo valor em 3 meses ou mais. Ainda usam?</p>
        ${revisar.map(x => linha(x, btn(x, 'manter', 'Manter', 'on') + btn(x, 'ignorar', 'Não é mensalidade'))).join('')}` : ''}
      ${mantidas.length ? `<h4 class="px-h">Vocês decidiram manter</h4>${mantidas.map(x => linha(x, btn(x, 'revisar', 'Rever'))).join('')}` : ''}
      ${a.fixas.length ? `<h4 class="px-h">Contas fixas cadastradas</h4>${a.fixas.map(f => `<div class="px-row"><span class="px-row-ico">${catIco(f.categoria)}</span>
        <span class="px-row-txt"><b>${escH(f.descricao)}</b><small>${escH(f.categoria)}</small></span>
        <span class="px-row-val">${fmt(f.valor)}<small>${fmt0(f.anual)}/ano</small></span></div>`).join('')}` : ''}
      <p class="px-nota">Para cancelar, cancele direto no serviço. Quando parar de cobrar, ela sai daqui sozinha.</p>
      ${a.qtdIgnoradas ? `<button class="px-link" onclick="restaurarPxAssinaturas()">Mostrar de novo ${a.qtdIgnoradas === 1 ? 'a que foi marcada' : `as ${a.qtdIgnoradas} marcadas`} como "não é mensalidade"</button>` : ''}`)
  } catch (e) { pxErro(e) }
}
let pxAssAchadas = []
async function marcarPxAssinatura(idx, acao) {
  const item = pxAssAchadas[idx]
  if (!item) return
  try {
    await api('/plan/assinaturas/marcar' + famQ(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chave: item.chave, acao }) })
    renderPxAssinaturas()
  } catch (e) { toast('❌ ' + e.message, 'erro') }
}
async function restaurarPxAssinaturas() {
  try {
    await api('/plan/assinaturas/restaurar' + famQ(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    renderPxAssinaturas()
  } catch (e) { toast('❌ ' + e.message, 'erro') }
}

// ── Saída das dívidas ──
// Simulação mês a mês. Cada dívida começa pelo valor de quitação de hoje (as parcelas
// restantes trazidas a valor presente pela taxa dela), rende juros e recebe a parcela.
// No plano, o valor a mais vai para a de juros mais alto e, quando uma acaba, a parcela
// dela passa a reforçar a próxima.
function simularDividas(dividas, extra = 0, plano = true) {
  const ds = dividas.map(d => {
    const i = (Number(d.taxa_juros) || 0) / 100
    const P = Number(d.parcela_mensal) || 0
    const n = Number(d.parcelas_restantes) || 0
    let saldo = Number(d.saldo) || 0
    if (P > 0 && n > 0) {
      const vp = i > 0 ? P * (1 - Math.pow(1 + i, -n)) / i : P * n
      saldo = saldo > 0 ? Math.min(saldo, vp) : vp
    }
    return { ...d, i, P, saldo, saldo0: saldo, fim: saldo <= 0.01 ? 0 : null, juros: 0 }
  })
  const ordem = [...ds].sort((a, b) => b.i - a.i || a.saldo - b.saldo)
  let mes = 0
  while (ds.some(d => d.fim == null) && mes < 600) {
    mes++
    let livre = plano ? extra : 0
    for (const d of ds) {
      if (d.fim != null) { if (plano) livre += d.P; continue }
      const j = d.saldo * d.i
      d.saldo += j; d.juros += j
      const pago = Math.min(d.P, d.saldo)
      d.saldo -= pago
      if (plano) livre += d.P - pago
    }
    for (const d of ordem) {
      if (d.fim != null || livre <= 0) continue
      const pago = Math.min(livre, d.saldo)
      d.saldo -= pago; livre -= pago
    }
    for (const d of ds) if (d.fim == null && d.saldo <= 0.01) d.fim = mes
  }
  const fins = ds.map(d => d.fim)
  return {
    dividas: ordem, meses: fins.some(f => f == null) ? null : Math.max(0, ...fins),
    juros: ds.reduce((a, d) => a + d.juros, 0)
  }
}
async function renderPxDividas() {
  try {
    planejDividas = await api('/dividas/custo' + famQ())
    if (!planejDividas.length) {
      pxCorpo('<p class="px-txt">Nenhuma dívida ativa cadastrada. Se tiver algum empréstimo, financiamento ou acordo, cadastre na aba Contas para ver aqui o caminho para quitar.</p>')
      return
    }
    pxCorpo(`
      <label class="px-label">Consigo pagar a mais por mês</label>
      <input id="px-div-extra" class="px-input" inputmode="decimal" placeholder="R$ 0,00" oninput="pintarPxDividas()">
      <div id="px-div-res"></div>`)
    pintarPxDividas()
  } catch (e) { pxErro(e) }
}
function pintarPxDividas() {
  const el = document.getElementById('px-div-res')
  if (!el || !planejDividas) return
  const extra = parseBRL(document.getElementById('px-div-extra').value) || 0
  const base = simularDividas(planejDividas, 0, false)
  const plano = simularDividas(planejDividas, extra, true)
  const hoje = mesHojeStr()
  const quando = m => (m == null ? 'sem data' : m === 0 ? 'já' : mesCurto(somaMesStr(hoje, m)))
  const economia = base.meses != null && plano.meses != null ? base.juros - plano.juros : null
  const semTaxa = planejDividas.some(d => !(Number(d.taxa_juros) > 0))
  const semParcela = planejDividas.some(d => !(Number(d.parcela_mensal) > 0))
  el.innerHTML = `
    <div class="px-dois">
      <div><small>Só as parcelas</small><b>${quando(base.meses)}</b><span>${fmt0(base.juros)} de juros</span></div>
      <div class="on"><small>Com o plano</small><b>${quando(plano.meses)}</b><span>${fmt0(plano.juros)} de juros</span></div>
    </div>
    ${economia != null && economia > 1 ? `<p class="px-txt">Seguindo o plano, vocês ficam livres ${base.meses - plano.meses > 0 ? `<b>${base.meses - plano.meses} meses antes</b> e ` : ''}pagam <b class="pos">${fmt0(economia)} a menos</b> de juros.</p>` : ''}
    <h4 class="px-h">Ordem para quitar</h4>
    ${plano.dividas.map((d, k) => `<div class="px-row"><span class="px-rank">${k + 1}</span>
      <span class="px-row-txt"><b>${escH(d.descricao)}</b><small>${escH(d.credor || '')}${d.taxa_juros > 0 ? ` · ${num1(d.taxa_juros)}% ao mês` : ' · sem taxa informada'} · quitação hoje ${fmt0(d.saldo0)}</small></span>
      <span class="px-row-val">${quando(d.fim)}<small>quitada</small></span></div>`).join('')}
    <p class="px-nota">O plano: pague todas as parcelas em dia e coloque o valor a mais na dívida de juros mais altos. Quando uma acabar, a parcela dela passa a reforçar a próxima. Ao antecipar, peça ao credor o valor de quitação: pelo Código de Defesa do Consumidor, os juros das parcelas antecipadas são descontados.</p>
    ${semTaxa ? '<p class="px-nota">Dívida sem taxa informada fica no fim da fila. Coloque a taxa no cadastro para a ordem ficar certa.</p>' : ''}
    ${semParcela && plano.meses == null ? '<p class="px-nota">Há dívida sem parcela mensal: informe um valor a mais por mês ou a parcela no cadastro para calcular a data.</p>' : ''}
    <p class="px-nota">Fatura de cartão paga inteira não entra aqui. Se estiver pagando só o mínimo, cadastre o saldo como dívida com a taxa do rotativo.</p>`
}

// ── Quem gastou o quê ──
async function renderPxPessoas() {
  try {
    const p = await api('/plan/pessoas?mes=' + planejPessoasMes + famQAnd())
    const atual = planejPessoasMes === mesHojeStr()
    pxCorpo(`
      <div class="px-nav">
        <button onclick="navPxPessoas(-1)" aria-label="Mês anterior">‹</button>
        <b>${mesAno(planejPessoasMes)}</b>
        <button onclick="navPxPessoas(1)" ${atual ? 'disabled' : ''} aria-label="Próximo mês">›</button>
      </div>
      ${!p.pessoas.length ? '<div class="orc-vazio">Nenhum gasto neste mês.</div>' : `
      <p class="px-txt">Total da família: <b>${fmt0(p.total)}</b></p>
      ${p.pessoas.map(pe => `
        <div class="px-pessoa">
          <div class="px-pessoa-topo"><b>${escH(pe.nome)}</b><span>${fmt0(pe.total)} · ${pe.pct}%</span></div>
          <span class="pl-barra px-barra"><i style="width:${Math.max(2, pe.pct)}%"></i></span>
          ${pe.categorias.slice(0, 5).map(c => `<div class="px-row px-row-mini"><span class="px-row-ico">${catIco(c.categoria)}</span>
            <span class="px-row-txt">${escH(c.categoria)}</span><span class="px-row-val">${fmt0(c.total)}</span></div>`).join('')}
        </div>`).join('')}
      <p class="px-nota">Mostra quem lançou o gasto ou passou o cartão. O mercado da casa pode estar no nome de um só, então serve para combinar, não para cobrar.</p>`}`)
  } catch (e) { pxErro(e) }
}
function navPxPessoas(k) {
  const novo = somaMesStr(planejPessoasMes, k)
  if (novo > mesHojeStr()) return
  planejPessoasMes = novo
  renderPxPessoas()
}

// ══════════════════════════════════════════
//  VIAGENS — janelas, sugestões da IA e plano de pagamento
// ══════════════════════════════════════════
let vgPainel = null, vgJanela = null, vgSug = null, vgPlanoId = null
const VG_STATUS = { ideia: 'Ideia', planejada: 'Planejada', reservada: 'Reservada', feita: 'Feita' }
const VG_CUSTOS = [['transporte', 'Transporte'], ['hospedagem', 'Hospedagem'], ['alimentacao', 'Alimentação'], ['passeios', 'Passeios'], ['outros', 'Outros']]
const VG_ICO = { ferias: '🏖', data: '❤', feriado: '📅' }
const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const dCurta = s => s ? `${Number(s.slice(8, 10))} ${MES_CURTO[Number(s.slice(5, 7)) - 1]}` : ''
const periodoTxt = (a, b) => a && b ? (a === b ? dCurta(a) : `${dCurta(a)} a ${dCurta(b)}${a.slice(0, 4) !== b.slice(0, 4) || a.slice(0, 4) !== hojeLocalBR().slice(0, 4) ? ' de ' + b.slice(0, 4) : ''}`) : 'sem data'
const vgTotal = c => VG_CUSTOS.reduce((a, [k]) => a + (Number(c?.[k]) || 0), 0)
const vgPost = (url, body, method = 'POST') => api(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })

async function carregarViagens() {
  try {
    vgPainel = await api('/viagem/painel')
    renderViagens()
  } catch (e) {
    document.getElementById('vg-janelas').innerHTML = `<div class="orc-vazio">Não foi possível carregar: ${escH(e.message)}</div>`
  }
}

function renderViagens() {
  const p = vgPainel
  const cap = p.capacidade
  const livre = cap.cartoes.reduce((a, c) => a + c.livre, 0)
  document.getElementById('vg-capacidade').innerHTML = `
    <div class="px-tres">
      <div><small>Sobra por mês</small><b class="${cap.sobraMensal > 0 ? '' : 'neg'}">${fmt0(cap.sobraMensal)}</b></div>
      <div><small>Limite livre</small><b>${fmt0(livre)}</b></div>
      <div><small>Viagens</small><b>${p.viagens.filter(v => v.status !== 'feita').length}</b></div>
    </div>
    ${cap.negativo > 0 ? `<p class="px-aviso"><b>A conta está ${fmt0(cap.negativo)} no negativo</b>Viajar com o dinheiro já guardado sai mais barato do que parcelar agora. Use as sugestões para planejar com antecedência.</p>` : ''}`

  document.getElementById('vg-janelas').innerHTML = p.janelas.length ? p.janelas.map((j, i) => `
    <button class="vg-item" onclick="abrirVgSugestoes(${i})">
      <span class="px-row-ico vg-ico-${j.tipo}">${VG_ICO[j.tipo] || '📅'}</span>
      <span class="px-row-txt"><b>${escH(j.titulo)}</b>
        <small>${periodoTxt(j.inicio, j.fim)} · ${j.dias} dias${j.detalhe ? ' · ' + escH(j.detalhe) : ''}${j.combina.length ? ' · junto com ' + escH(j.combina.join(', ')) : ''}</small></span>
      <span class="vg-seta">›</span>
    </button>`).join('') : '<div class="orc-vazio">Cadastre as férias e as datas do casal abaixo.</div>'

  document.getElementById('vg-planos').innerHTML = p.viagens.length ? p.viagens.map(v => `
    <button class="vg-item" onclick="abrirViagemPlano(${v.id})">
      <span class="px-row-ico">✈</span>
      <span class="px-row-txt"><b>${escH(v.destino)}</b>
        <small>${periodoTxt(v.ida, v.volta)} · ${VG_STATUS[v.status] || 'Ideia'}${v.pagamento.porMes ? ` · guardar ${fmt0(v.pagamento.porMes)}/mês` : ''}</small></span>
      <span class="px-row-val">${fmt0(v.pagamento.total)}</span>
    </button>`).join('') : '<div class="orc-vazio">Nenhuma viagem ainda. Escolha uma janela acima para ver sugestões.</div>'

  document.getElementById('vg-destinos').innerHTML = p.destinos.map(d => `<span class="vg-chip">${escH(d.nome)}<button aria-label="Remover ${escH(d.nome)}" onclick="delVg('destinos', ${d.id})">✕</button></span>`).join('')
    || '<span class="vg-ajuda">Nenhum lugar ainda.</span>'

  document.getElementById('vg-datas').innerHTML = p.datas.map(d => `
    <div class="px-row"><span class="px-row-ico">❤</span>
      <span class="px-row-txt"><b>${escH(d.titulo)}</b><small>${d.data.split('-').reverse().join('/')}</small></span>
      <button class="px-mini" onclick="delVg('datas', ${d.id})">Excluir</button></div>`).join('') || '<div class="vg-ajuda">Ex.: aniversário de casamento, de namoro, aniversário de cada um.</div>'

  document.getElementById('vg-ferias').innerHTML = p.ferias.map(f => `
    <div class="px-row"><span class="px-row-ico">🏖</span>
      <span class="px-row-txt"><b>${f.usuario_nome ? escH(f.usuario_nome.split(' ')[0]) : 'Os dois'}</b><small>${f.inicio.split('-').reverse().join('/')} a ${f.fim.split('-').reverse().join('/')}</small></span>
      <button class="px-mini" onclick="delVg('ferias', ${f.id})">Excluir</button></div>`).join('') || '<div class="vg-ajuda">Coloque as férias previstas de cada um.</div>'

  const sel = document.getElementById('vg-ferias-quem')
  if (!sel.options.length) {
    api('/usuarios').then(us => {
      sel.innerHTML = '<option value="">Os dois</option>' + us.filter(u => u.role !== 'super_admin').map(u => `<option value="${u.id}">${escH(u.nome)}</option>`).join('')
    }).catch(() => { sel.innerHTML = '<option value="">Os dois</option>' })
  }
}

async function addVgDestino() {
  const el = document.getElementById('vg-destino-nome')
  if (!el.value.trim()) return
  try { await vgPost('/viagem/destinos', { nome: el.value.trim() }); el.value = ''; carregarViagens() } catch (e) { toast('❌ ' + e.message, 'erro') }
}
async function addVgData() {
  const t = document.getElementById('vg-data-titulo'), d = document.getElementById('vg-data-data')
  if (!t.value.trim() || !d.value) { toast('Informe o nome e a data', 'erro'); return }
  try { await vgPost('/viagem/datas', { titulo: t.value.trim(), data: d.value }); t.value = ''; d.value = ''; carregarViagens() } catch (e) { toast('❌ ' + e.message, 'erro') }
}
async function addVgFerias() {
  const i = document.getElementById('vg-ferias-inicio'), f = document.getElementById('vg-ferias-fim')
  if (!i.value || !f.value || f.value < i.value) { toast('Informe o início e o fim das férias', 'erro'); return }
  try {
    await vgPost('/viagem/ferias', { inicio: i.value, fim: f.value, usuarioId: document.getElementById('vg-ferias-quem').value || null })
    i.value = ''; f.value = ''; carregarViagens()
  } catch (e) { toast('❌ ' + e.message, 'erro') }
}
async function delVg(tipo, id) {
  if (!confirm('Excluir?')) return
  try { await api(`/viagem/${tipo}/${id}`, { method: 'DELETE' }); carregarViagens() } catch (e) { toast('❌ ' + e.message, 'erro') }
}

// ── Sugestões para uma janela ──
const vgCorpo = html => { document.getElementById('vgm-corpo').innerHTML = html }
function abrirVgSugestoes(i) {
  vgJanela = vgPainel.janelas[i]
  vgSug = null
  document.getElementById('vgm-titulo').textContent = vgJanela.titulo
  vgCorpo(`
    <p class="px-txt"><b>${periodoTxt(vgJanela.inicio, vgJanela.fim)}</b> · ${vgJanela.dias} dias${vgJanela.detalhe ? `<br><small class="px-nota">${escH(vgJanela.detalhe)}</small>` : ''}</p>
    <label class="px-label">Algum pedido? (opcional)</label>
    <input id="vg-foco" class="px-input vg-input-txt" placeholder="Ex.: praia, frio, até R$ 2.000, Gramado" maxlength="80">
    <button class="btn-confirm btn-verde px-btn" onclick="buscarVgSugestoes(false)">Buscar sugestões</button>
    <p class="px-nota">A IA pesquisa preços e promoções atuais para essas datas, saindo de Cotia. Leva de 30 segundos a 2 minutos.</p>`)
  document.getElementById('modal-viagem').style.display = 'flex'
}
async function buscarVgSugestoes(forcar) {
  const foco = (document.getElementById('vg-foco')?.value || vgSug?.foco || '').trim()
  vgCorpo(`<div class="vg-carregando"><div class="vg-spinner"></div><b>Pesquisando passagens, hospedagens e promoções…</b><span>Isso leva de 30 segundos a 2 minutos. Pode deixar esta tela aberta.</span></div>`)
  try {
    const r = await vgPost('/viagem/sugerir', { inicio: vgJanela.inicio, fim: vgJanela.fim, motivo: vgJanela.titulo, foco, forcar })
    vgSug = { ...r, foco }
    pintarVgSugestoes()
  } catch (e) {
    vgCorpo(`<div class="orc-vazio">${escH(e.message)}</div><button class="btn-confirm btn-verde px-btn" onclick="buscarVgSugestoes(true)">Tentar de novo</button>`)
  }
}
function linksBusca(destino, ida, volta, comoIr) {
  const d = encodeURIComponent(destino)
  const links = []
  if (comoIr === 'aviao') links.push(`<a class="px-mini" target="_blank" rel="noopener" href="https://www.google.com/travel/flights?hl=pt-BR&q=${encodeURIComponent(`Voos de São Paulo para ${destino} ida ${ida} volta ${volta}`)}">Passagens</a>`)
  links.push(`<a class="px-mini" target="_blank" rel="noopener" href="https://www.airbnb.com.br/s/${d}/homes?checkin=${ida}&checkout=${volta}&adults=2">Airbnb</a>`)
  links.push(`<a class="px-mini" target="_blank" rel="noopener" href="https://www.booking.com/searchresults.pt-br.html?ss=${d}&checkin=${ida}&checkout=${volta}&group_adults=2&no_rooms=1&group_children=0">Booking</a>`)
  return links.join('')
}
function pintarVgSugestoes() {
  const s = vgSug, j = vgJanela
  const quando = s.geradoEm ? new Date(s.geradoEm.replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
  vgCorpo(`
    <p class="px-nota">${periodoTxt(j.inicio, j.fim)} · ${j.dias} dias${s.emCache ? ` · pesquisa de ${quando} · <button class="px-link" onclick="buscarVgSugestoes(true)">pesquisar de novo</button>` : ''}</p>
    ${s.sugestoes.map((x, i) => `
      <div class="vg-sug">
        <div class="vg-sug-topo"><div><b>${escH(x.destino)}</b><small>${escH(x.deslocamento || '')}</small></div>
          <div class="vg-sug-total">${fmt0(x.total)}<small>para 2</small></div></div>
        <p class="px-txt">${escH(x.porque)}</p>
        ${x.hospedagem ? `<p class="px-nota">Hospedagem: ${escH(x.hospedagem)}</p>` : ''}
        <div class="vg-custos">${VG_CUSTOS.map(([k, n]) => x.custos[k] ? `<span>${n} <b>${fmt0(x.custos[k])}</b></span>` : '').join('')}</div>
        <span class="vg-badge ${x.base_precos === 'pesquisa' ? 'on' : ''}">${x.base_precos === 'pesquisa' ? 'Preços pesquisados agora' : 'Estimativa'}</span>
        ${x.oportunidade ? `<p class="px-txt vg-oport">${escH(x.oportunidade)}${x.fonte_url ? ` <a target="_blank" rel="noopener" href="${escH(x.fonte_url)}">ver fonte</a>` : ''}</p>` : ''}
        ${x.dicas.length ? `<ul class="px-lista">${x.dicas.map(d => `<li>${escH(d)}</li>`).join('')}</ul>` : ''}
        <div class="vg-acoes">${linksBusca(x.destino, j.inicio, j.fim, x.como_ir)}
          <button class="px-mini on" onclick="salvarVgSugestao(${i})">Salvar como plano</button></div>
      </div>`).join('')}
    ${s.observacao ? `<p class="px-txt">${escH(s.observacao)}</p>` : ''}
    <p class="px-nota">Preços mudam rápido. Confira nos links antes de reservar.</p>
    ${s.fontes && s.fontes.length ? `<details class="vg-fontes"><summary>Fontes pesquisadas (${s.fontes.length})</summary>${s.fontes.map(f => `<a target="_blank" rel="noopener" href="${escH(f.url)}">${escH(f.titulo)}</a>`).join('')}</details>` : ''}`)
}
async function salvarVgSugestao(i) {
  const x = vgSug.sugestoes[i], j = vgJanela
  const notas = [x.porque, x.hospedagem ? 'Hospedagem: ' + x.hospedagem : '', x.oportunidade, x.fonte_url].filter(Boolean).join('\n')
  try {
    const r = await vgPost('/viagem/viagens', { destino: x.destino, ida: j.inicio, volta: j.fim, custos: x.custos, status: 'ideia', notas })
    toast('✅ Viagem salva')
    vgPainel = await api('/viagem/painel')
    renderViagens()
    abrirViagemPlano(r.id)
  } catch (e) { toast('❌ ' + e.message, 'erro') }
}

// ── Plano de uma viagem: custos e como pagar ──
function abrirViagemPlano(id = null) {
  const v = id ? vgPainel.viagens.find(x => x.id === id) : null
  vgPlanoId = v ? v.id : null
  document.getElementById('vgm-titulo').textContent = v ? v.destino : 'Nova viagem'
  vgCorpo(`
    <label class="px-label">Destino</label>
    <input id="vgp-destino" class="px-input vg-input-txt" maxlength="80" value="${escH(v?.destino || '')}" placeholder="Ex.: Campos do Jordão, SP">
    <div class="vg-duas">
      <div><label class="px-label">Ida</label><input id="vgp-ida" class="px-input vg-input-txt" type="date" value="${v?.ida || ''}" onchange="pintarVgPagamento()"></div>
      <div><label class="px-label">Volta</label><input id="vgp-volta" class="px-input vg-input-txt" type="date" value="${v?.volta || ''}"></div>
    </div>
    <label class="px-label">Situação</label>
    <div class="px-chips px-chips-wrap" id="vgp-status">${Object.entries(VG_STATUS).map(([k, n]) => `<button class="px-chip ${(v?.status || 'ideia') === k ? 'on' : ''}" data-v="${k}" onclick="selVgStatus(this)">${n}</button>`).join('')}</div>
    <h4 class="px-h">Custos para ${v?.pessoas || 2} pessoas</h4>
    ${VG_CUSTOS.map(([k, n]) => `<div class="vg-custo-linha"><span>${n}</span><input class="px-input vg-input-txt" inputmode="decimal" data-custo="${k}" value="${v?.custos?.[k] ? fmtNum(v.custos[k]) : ''}" placeholder="R$ 0,00" oninput="pintarVgPagamento()"></div>`).join('')}
    <div id="vgp-pagamento"></div>
    <label class="px-label">Anotações</label>
    <textarea id="vgp-notas" class="px-input vg-input-txt vg-notas" maxlength="600">${escH(v?.notas || '')}</textarea>
    <button class="btn-confirm btn-verde px-btn" onclick="salvarViagemPlano()">Salvar</button>
    ${v && !v.meta_id ? `<button class="btn-cancel px-btn" onclick="criarMetaViagem(${v.id})">Criar meta para guardar o dinheiro</button>` : ''}
    ${v && v.meta_id ? '<p class="px-nota">Há uma meta para esta viagem na aba Metas.</p>' : ''}
    ${v ? `<button class="px-link vg-excluir" onclick="excluirViagemPlano(${v.id})">Excluir viagem</button>` : ''}`)
  document.getElementById('modal-viagem').style.display = 'flex'
  pintarVgPagamento()
}
function selVgStatus(btn) {
  document.querySelectorAll('#vgp-status .px-chip').forEach(b => b.classList.toggle('on', b === btn))
}
function lerVgCustos() {
  const c = {}
  document.querySelectorAll('[data-custo]').forEach(i => { c[i.dataset.custo] = parseBRL(i.value) || 0 })
  return c
}
function pintarVgPagamento() {
  const el = document.getElementById('vgp-pagamento')
  if (!el) return
  const cap = vgPainel.capacidade
  const total = vgTotal(lerVgCustos())
  const ida = document.getElementById('vgp-ida').value
  const hoje = hojeLocalBR()
  if (!(total > 0)) { el.innerHTML = '<p class="px-nota">Preencha os custos para ver quanto guardar por mês.</p>'; return }
  let meses = null
  if (ida && ida > hoje) {
    const [hy, hm] = hoje.split('-').map(Number), [iy, im] = ida.split('-').map(Number)
    meses = Math.max(1, (iy * 12 + im) - (hy * 12 + hm))
  }
  const porMes = meses ? total / meses : null
  const cabe = porMes != null && cap.sobraMensal > 0 && porMes <= cap.sobraMensal
  const parc = [3, 6, 10]
  const cartoes = cap.cartoes.filter(c => c.limite > 0)
  el.innerHTML = `
    <div class="px-destaque vg-total"><small>Total da viagem</small><b>${fmt(total)}</b></div>
    <h4 class="px-h">Guardando em dinheiro</h4>
    ${porMes ? `<div class="px-row"><span class="px-row-txt"><b>${fmt0(porMes)} por mês</b><small>${meses} ${meses === 1 ? 'mês' : 'meses'} até a ida${cabe ? ' · cabe na sobra' : cap.sobraMensal > 0 ? ` · a sobra é ${fmt0(cap.sobraMensal)}` : ''}</small></span>
      <span class="px-row-val ${cabe ? 'pos' : 'neg'}">${cabe ? 'Cabe' : 'Apertado'}</span></div>`
      : '<p class="px-nota">Coloque a data de ida para calcular quanto guardar por mês.</p>'}
    <h4 class="px-h">No cartão</h4>
    ${cartoes.length ? cartoes.map(c => `<div class="px-row"><span class="px-row-txt"><b>${escH(c.nome)}${vgPainel.viagens && c.usuario_nome ? ' · ' + escH(c.usuario_nome.split(' ')[0]) : ''}</b>
        <small>${fmt0(c.livre)} livres · ${parc.map(n => `${n}x de ${fmt0(total / n)}`).join(' · ')}</small></span>
      <span class="px-row-val ${c.livre >= total ? 'pos' : 'neg'}">${c.livre >= total ? 'Cabe' : 'Não cabe'}</span></div>`).join('') : '<p class="px-nota">Nenhum cartão cadastrado.</p>'}
    <p class="px-nota">Parcelar só faz sentido sem juros e se a parcela couber na sobra de todos os meses até acabar. Juntar antes costuma render desconto à vista.${cap.negativo > 0 ? ' Com a conta no negativo, guardar antes é o caminho mais seguro.' : ''}</p>`
}
async function salvarViagemPlano() {
  const destino = document.getElementById('vgp-destino').value.trim()
  if (!destino) { toast('Informe o destino', 'erro'); return }
  const body = {
    destino, ida: document.getElementById('vgp-ida').value || null, volta: document.getElementById('vgp-volta').value || null,
    status: document.querySelector('#vgp-status .px-chip.on')?.dataset.v || 'ideia', custos: lerVgCustos(),
    notas: document.getElementById('vgp-notas').value
  }
  try {
    const r = vgPlanoId ? await vgPost(`/viagem/viagens/${vgPlanoId}`, body, 'PUT') : await vgPost('/viagem/viagens', body)
    toast('✅ Viagem salva')
    vgPainel = await api('/viagem/painel')
    renderViagens()
    abrirViagemPlano(r.id)
  } catch (e) { toast('❌ ' + e.message, 'erro') }
}
async function criarMetaViagem(id) {
  try {
    await vgPost(`/viagem/viagens/${id}/meta`, {})
    toast('✅ Meta criada na aba Metas')
    vgPainel = await api('/viagem/painel')
    renderViagens()
    abrirViagemPlano(id)
  } catch (e) { toast('❌ ' + e.message, 'erro') }
}
async function excluirViagemPlano(id) {
  if (!confirm('Excluir esta viagem?')) return
  try {
    await api(`/viagem/viagens/${id}`, { method: 'DELETE' })
    fecharModal('modal-viagem')
    carregarViagens()
  } catch (e) { toast('❌ ' + e.message, 'erro') }
}

// ── START ──
init()
