// Lembretes por notificação push: contas a vencer e orçamento perto do limite.
// Roda dentro do servidor: a cada 30 minutos olha o que precisa ser avisado e manda
// só uma vez cada aviso (tabela notificacoes_enviadas), e só entre 8h e 21h de Brasília.
const webpush = require('web-push')
const db = require('./database')

const INTERVALO_MS = 30 * 60 * 1000
const HORA_INICIO = 8
const HORA_FIM = 21
const URL_APP = 'https://financas-familia-production-17fa.up.railway.app'

const fmt = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const ddmm = data => `${data.slice(8, 10)}/${data.slice(5, 7)}`

let chavePublica = null

// As chaves VAPID identificam este servidor para Apple/Google. Geradas uma vez e guardadas
// no banco (que fica no volume do Railway), para não exigir configuração manual.
// Se o banco for recriado, as inscrições somem junto e cada aparelho reativa os avisos.
function configurarVapid() {
  if (chavePublica) return chavePublica
  let pub = process.env.VAPID_PUBLIC_KEY || db.obterConfig('vapid_public')
  let priv = process.env.VAPID_PRIVATE_KEY || db.obterConfig('vapid_private')
  if (!pub || !priv) {
    const k = webpush.generateVAPIDKeys()
    pub = k.publicKey
    priv = k.privateKey
    db.salvarConfig('vapid_public', pub)
    db.salvarConfig('vapid_private', priv)
  }
  // A Apple exige um contato https: ou mailto: — usamos o endereço do próprio app.
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || URL_APP, pub, priv)
  chavePublica = pub
  return pub
}

async function enviarParaUsuario(usuarioId, payload) {
  configurarVapid()
  let enviados = 0
  for (const s of db.listarInscricoesPush(usuarioId)) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 12 * 3600, urgency: 'normal' }
      )
      enviados++
    } catch (e) {
      // 404/410: o aparelho desinstalou o app ou revogou a permissão — inscrição morta.
      if (e.statusCode === 404 || e.statusCode === 410) db.removerInscricaoPush(s.endpoint)
      else console.error('push falhou:', e.statusCode || '', e.body || e.message)
    }
  }
  return enviados
}

function horaBrasilia() {
  return Number(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hourCycle: 'h23' }))
}

// Junta as contas de um mesmo tipo num aviso só: "3 contas vencem hoje" em vez de três toques.
function montarAviso(tipo, contas) {
  const total = contas.reduce((acc, c) => acc + c.valor, 0)
  const nomes = contas.map(c => c.descricao)
  const lista = nomes.length <= 3 ? nomes.join(', ') : `${nomes.slice(0, 2).join(', ')} e mais ${nomes.length - 2}`
  const um = contas.length === 1
  const c = contas[0]
  const textos = {
    em2dias: {
      title: um ? '📅 Vence em 2 dias' : `📅 ${contas.length} contas vencem em 2 dias`,
      body: um ? `${c.descricao} — ${fmt(c.valor)} em ${ddmm(c.data)}` : `${lista} — total ${fmt(total)}`
    },
    hoje: {
      title: um ? '⏰ Vence hoje' : `⏰ ${contas.length} contas vencem hoje`,
      body: um ? `${c.descricao} — ${fmt(c.valor)}` : `${lista} — total ${fmt(total)}`
    },
    atraso: {
      title: um ? '⚠️ Conta em atraso' : `⚠️ ${contas.length} contas em atraso`,
      body: um ? `${c.descricao} venceu em ${ddmm(c.data)} e não está marcada como paga` : `${lista} — total ${fmt(total)}. Já pagou? Marque no app.`
    }
  }
  return { ...textos[tipo], url: `/?aba=agenda&dia=${c.data}`, tag: `contas-${tipo}` }
}

async function verificarContas(usuarioId, hoje) {
  const daqui2 = db.somaDias(hoje, 2)
  const grupos = { atraso: [], hoje: [], em2dias: [] }
  for (const c of db.contasAPagar(null, usuarioId, 2)) {
    if (c.pago) continue
    const tipo = c.data < hoje ? 'atraso' : c.data === hoje ? 'hoje' : c.data === daqui2 ? 'em2dias' : null
    if (!tipo || db.jaNotificado(usuarioId, c.chave, tipo)) continue
    grupos[tipo].push(c)
  }
  let enviados = 0
  for (const [tipo, contas] of Object.entries(grupos)) {
    if (!contas.length) continue
    const n = await enviarParaUsuario(usuarioId, montarAviso(tipo, contas))
    // Só registra se chegou em algum aparelho; senão tenta de novo na próxima rodada.
    if (n > 0) contas.forEach(c => db.registrarNotificacao(usuarioId, c.chave, tipo))
    enviados += n
  }
  return enviados
}

// Valor a receber que passou da data sem ser marcado como recebido: avisa uma vez por item.
async function verificarRecebiveis(usuarioId) {
  const atrasados = db.recebiveisAtrasados(usuarioId).filter(r => !db.jaNotificado(usuarioId, 'receb:' + r.id, 'atraso'))
  if (!atrasados.length) return 0
  const fmt = v => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const total = atrasados.reduce((a, r) => a + Number(r.valor), 0)
  const r0 = atrasados[0]
  const n = await enviarParaUsuario(usuarioId, {
    title: atrasados.length === 1 ? '💰 Valor a receber atrasado' : `💰 ${atrasados.length} valores a receber atrasados`,
    body: atrasados.length === 1
      ? `${r0.grupo} · ${r0.descricao}: ${fmt(r0.valor)} era para ${r0.data_prevista.split('-').reverse().join('/')}. Já caiu? Marque "Recebi".`
      : `Total de ${fmt(total)}. Confira se já caíram e marque "Recebi".`,
    tag: 'recebiveis-atraso',
    url: '/?aba=metas'
  })
  if (n > 0) atrasados.forEach(r => db.registrarNotificacao(usuarioId, 'receb:' + r.id, 'atraso'))
  return n
}

// Saldo previsto passando do limite do cheque especial nos próximos 30 dias: avisa uma vez
// por mês do estouro (e de novo se a data prevista mudar de mês).
async function verificarChequeEspecial(usuarioId, hoje) {
  const r = db.livreParaGastar(null, usuarioId)
  if (!r || !r.estouro || r.estouro.data > db.somaDias(hoje, 30)) return 0
  const chave = 'cheque:' + r.estouro.data.slice(0, 7)
  if (db.jaNotificado(usuarioId, chave, 'estouro')) return 0
  const fmt = v => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const n = await enviarParaUsuario(usuarioId, {
    title: '🚨 Cheque especial vai estourar',
    body: `Pela previsão, em ${r.estouro.data.split('-').reverse().join('/')} o saldo chega a ${fmt(r.estouro.saldo)}, além do limite de ${fmt(r.limite)}. Veja na Agenda o que vence até lá.`,
    tag: 'cheque-especial',
    url: '/?aba=agenda&dia=' + r.estouro.data
  })
  if (n > 0) db.registrarNotificacao(usuarioId, chave, 'estouro')
  return n
}

// Avisa uma vez ao passar de 80% e outra ao estourar, por categoria e por mês.
async function verificarOrcamentos(usuarioId, hoje) {
  const [ano, mes] = hoje.split('-').map(Number)
  const mesStr = hoje.slice(0, 7)
  const gastos = Object.fromEntries(db.gastosPorCategoria(mes, ano, null, usuarioId).map(c => [c.categoria, Number(c.total)]))
  let enviados = 0
  for (const o of db.listarOrcamentos(null, usuarioId)) {
    const limite = Number(o.valor_limite)
    const gasto = gastos[o.categoria] || 0
    if (!(limite > 0)) continue
    const pct = (gasto / limite) * 100
    const chave = `orc:${o.categoria}:${mesStr}`
    let aviso = null, tipo = null
    if (pct >= 100 && !db.jaNotificado(usuarioId, chave, '100')) {
      tipo = '100'
      aviso = { title: `🚨 Orçamento de ${o.categoria} estourado`, body: `${fmt(gasto)} de ${fmt(limite)} — passou ${fmt(gasto - limite)}` }
    } else if (pct >= 80 && pct < 100 && !db.jaNotificado(usuarioId, chave, '80')) {
      tipo = '80'
      aviso = { title: `⚠️ ${o.categoria}: ${Math.floor(pct)}% do orçamento`, body: `Sobram ${fmt(limite - gasto)} até o fim do mês` }
    }
    if (!aviso) continue
    const n = await enviarParaUsuario(usuarioId, { ...aviso, url: '/', tag: `orc-${o.categoria}` })
    if (n > 0) {
      db.registrarNotificacao(usuarioId, chave, tipo)
      if (tipo === '100') db.registrarNotificacao(usuarioId, chave, '80')
    }
    enviados += n
  }
  return enviados
}

let rodando = false
async function verificarLembretes({ forcar = false } = {}) {
  const hora = horaBrasilia()
  if (!forcar && (hora < HORA_INICIO || hora >= HORA_FIM)) return { enviados: 0, motivo: 'fora do horário' }
  if (rodando) return { enviados: 0, motivo: 'já em execução' }
  rodando = true
  try {
    const hoje = db.hojeBR()
    let enviados = 0
    for (const uid of db.usuariosComPush()) {
      try {
        enviados += await verificarContas(uid, hoje)
        enviados += await verificarOrcamentos(uid, hoje)
        enviados += await verificarRecebiveis(uid)
        enviados += await verificarChequeEspecial(uid, hoje)
      } catch (e) {
        console.error(`lembretes do usuário ${uid} falharam:`, e.message)
      }
    }
    return { enviados }
  } finally {
    rodando = false
  }
}

function iniciar() {
  try {
    configurarVapid()
  } catch (e) {
    console.error('lembretes: não foi possível configurar o push —', e.message)
    return
  }
  const rodar = () => verificarLembretes().catch(e => console.error('lembretes:', e.message))
  setTimeout(rodar, 60 * 1000)
  setInterval(rodar, INTERVALO_MS)
  console.log('🔔 Lembretes ativos (verificação a cada 30 min, das 8h às 21h)')
}

module.exports = { iniciar, configurarVapid, enviarParaUsuario, verificarLembretes, montarAviso }
