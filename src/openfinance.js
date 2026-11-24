// Open Finance via Pluggy (conector Meu Pluggy).
// O dono dos dados conecta os bancos no meu.pluggy.ai e autoriza este app uma vez por banco.
// Daqui: buscamos contas e movimentos todo dia, atualizamos saldos, lançamos compras de cartão
// e deixamos o resto (Pix, boletos, débitos) numa lista "para revisar" com uma sugestão.
const db = require('./database')

// PLUGGY_API_URL só existe para testes locais com um servidor falso.
const API = process.env.PLUGGY_API_URL || 'https://api.pluggy.ai'
const configurado = () => !!(process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_CLIENT_SECRET)

// A chave da API vale 2h; renovamos com folga.
let chave = null
let chaveAte = 0
async function apiKey() {
  if (!configurado()) throw new Error('Open Finance não configurado (faltam PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no servidor)')
  if (chave && Date.now() < chaveAte) return chave
  const r = await fetch(`${API}/auth`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: process.env.PLUGGY_CLIENT_ID, clientSecret: process.env.PLUGGY_CLIENT_SECRET })
  })
  if (!r.ok) throw new Error(`Pluggy recusou as credenciais (HTTP ${r.status})`)
  chave = (await r.json()).apiKey
  chaveAte = Date.now() + 100 * 60 * 1000
  return chave
}
async function pluggy(caminho, opts = {}) {
  const r = await fetch(API + caminho, { ...opts, headers: { 'Content-Type': 'application/json', 'X-API-KEY': await apiKey(), ...(opts.headers || {}) } })
  const corpo = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(corpo.message || `Pluggy HTTP ${r.status}`), { status: r.status, corpo })
  return corpo
}

async function connectToken(usuarioId) {
  const r = await pluggy('/connect_token', { method: 'POST', body: JSON.stringify({ options: { clientUserId: String(usuarioId), avoidDuplicates: true } }) })
  return r.accessToken
}

// ── Classificação ──
const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
// Chave da regra aprendida: descrição sem números, acentos e espaços repetidos.
const chaveRegra = s => semAcento(s).replace(/[0-9*#/\\.-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)

const CATEGORIAS = [
  [/mercad|supermerc|atacad|hortifrut|padaria|acougue|grocer/, 'Mercado'],
  [/posto|combust|gasolin|shell|ipiranga|petrobras|\bbr\b|gas station|fuel/, 'Combustível'],
  [/farmac|drogar|raia|pague menos|pharma/, 'Farmácia'],
  [/restaur|lanchon|ifood|burger|pizza|eating|food|bar\b|cafe/, 'Restaurante'],
  [/uber|99app|99 |pedagio|estacion|metro|onibus|transport|parking|toll/, 'Transporte'],
  [/netflix|spotify|apple|google|youtube|amazon prime|disney|hbo|chatgpt|openai|anthropic|adobe|railway|hostgator|digital service|subscription|assinatura/, 'Assinatura'],
  [/escola|faculd|curso|educa|livrar/, 'Educação'],
  [/medic|clinic|hospital|laborat|odonto|saude|health/, 'Saúde'],
  [/roupa|calcad|renner|riachuelo|cea\b|zara|clothing|vestu/, 'Vestuário'],
  [/enel|sabesp|luz|energia|agua|aluguel|condomin|casa|reforma|construc|housing|electricity|water/, 'Casa'],
  [/cinema|show|ingresso|lazer|leisure|entertainment|viagem|hotel|travel/, 'Lazer'],
  [/financ|emprestimo|loan|parcela do carro|andbank|creditas/, 'Financiamento']
]
function categoriaSugerida(descricao, categoriaPluggy) {
  const texto = semAcento(`${descricao} ${categoriaPluggy || ''}`)
  for (const [re, cat] of CATEGORIAS) if (re.test(texto)) return cat
  return 'Outros'
}
// Pagamento de fatura de cartão saindo da conta.
const ehPagamentoFatura = (t) => /pagamento de fatura|fatura|cartoes caixa|credit card payment|pagamento cartao/.test(semAcento(`${t.descricao} ${t.categoriaPluggy || ''} ${t.operacao || ''}`))
  || /nu pagamentos|picpay|neon pagamentos|mercado pago|cartoes caixa/.test(semAcento(t.contraparte || ''))
const ehTransferenciaPropria = (t, nomesFamilia) => {
  const cp = semAcento(`${t.contraparte || ''} ${String(t.descricao || '').split('|').slice(1).join(' ')}`)
  if (/same person|mesma titularidade|transferencia entre contas/.test(semAcento(`${t.categoriaPluggy || ''} ${t.descricao}`))) return true
  // Nome completo (2+ palavras) ou o primeiro nome do cadastro, quando tem 4+ letras.
  return nomesFamilia.some(n => n.length >= 4 && cp.includes(n))
}

// Sugere o que um movimento de CONTA é. (Compras de cartão não passam por aqui.)
function sugerir(t, nomesFamilia) {
  if (t.direcao === 'saida' && ehPagamentoFatura(t)) return { sugestao: 'pagamento' }
  if (ehTransferenciaPropria(t, nomesFamilia)) return { sugestao: 'transferencia' }
  if (t.direcao === 'entrada') return { sugestao: 'receita', sugestaoCategoria: /salario|salary|folha/.test(semAcento(t.descricao)) ? 'salario' : null }
  return { sugestao: 'gasto', sugestaoCategoria: categoriaSugerida(t.descricao, t.categoriaPluggy) }
}

// Data em que a parcela entra na fatura: se o banco manda a data da compra original,
// empurra (n-1) meses para cair no ciclo certo.
function dataDaParcela(data, meta) {
  const n = Number(meta?.installmentNumber) || 1
  const compra = meta?.purchaseDate ? String(meta.purchaseDate).slice(0, 10) : null
  if (n <= 1 || !compra || compra !== data) return data
  const [a, m, d] = data.split('-').map(Number)
  const alvo = new Date(a, m - 1 + (n - 1), 1)
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate()
  return `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`
}

// ── Aplicar decisão (automática ou do usuário) ──
function aplicar(txId, { acao, categoria, chavePagamento, tipoReceita }) {
  const t = db.ofDB.tx(txId)
  if (!t) throw new Error('Movimento não encontrado')
  if (t.status !== 'revisar') return t
  const valor = Math.abs(Number(t.valor))
  if (acao === 'gasto') {
    // Gasto fixo do mês já lançado pelo app com valor parecido: é o mesmo, só confirma.
    const fixo = t.conta_tipo === 'BANK' ? db.ofDB.gastoFixoParecido(t.usuario_id, t.data, valor) : null
    if (fixo) {
      db.ofDB.confirmarGastoFixo(fixo.id, valor, t.data, null)
      db.ofDB.marcarTx(txId, { status: 'aplicada', aplicadaComo: 'gasto_fixo', gastoId: fixo.id })
    } else {
      const recorrente = db.ofDB.recorrenteParecido(t.usuario_id, t.conta_tipo === 'CREDIT' ? t.cartao_id : null, t.data, valor)
      const gastoId = db.ofDB.inserirGasto({
        usuarioId: t.usuario_id, cartaoId: t.conta_tipo === 'CREDIT' ? t.cartao_id : null, contaId: t.conta_tipo === 'BANK' ? t.conta_id : null,
        descricao: t.descricao, valor, categoria: categoria || t.sugestao_categoria || 'Outros', data: t.data,
        formaPagamento: t.conta_tipo === 'CREDIT' ? 'credito' : (t.metodo === 'PIX' ? 'pix' : t.metodo === 'BOLETO' ? 'boleto' : 'debito'),
        parcelas: t.parcelas || 1, parcelaAtual: t.parcela_atual || 1
      })
      if (recorrente) db.ofDB.ligarRecorrente(gastoId, recorrente.id)
      db.ofDB.marcarTx(txId, { status: 'aplicada', aplicadaComo: recorrente ? 'gasto_fixo' : 'gasto', gastoId })
    }
  } else if (acao === 'receita') {
    const r = db.registrarReceita(t.usuario_id, valor, t.descricao, t.data, tipoReceita || t.sugestao_categoria || 'outro')
    db.ofDB.marcarTx(txId, { status: 'aplicada', aplicadaComo: 'receita', receitaId: Number(r?.lastInsertRowid || 0) })
  } else if (acao === 'pagamento') {
    // O saldo vem do banco, então só marca a conta como paga (sem descontar de novo).
    if (chavePagamento) db.marcarPago(String(chavePagamento), t.usuario_id)
    db.ofDB.marcarTx(txId, { status: 'aplicada', aplicadaComo: 'pagamento' })
  } else if (acao === 'transferencia') {
    db.ofDB.marcarTx(txId, { status: 'aplicada', aplicadaComo: 'transferencia' })
  } else if (acao === 'ignorar') {
    db.ofDB.marcarTx(txId, { status: 'ignorada', aplicadaComo: 'ignorada' })
  } else {
    throw new Error('Ação inválida')
  }
  return db.ofDB.tx(txId)
}

// ── Sincronização ──
async function transacoes(accountId, desde) {
  const todas = []
  let caminho = `/v2/transactions?accountId=${encodeURIComponent(accountId)}&dateFrom=${desde}`
  for (let i = 0; i < 20 && caminho; i++) {
    const r = await pluggy(caminho)
    todas.push(...(r.results || []))
    const n = r.next
    caminho = !n ? null
      : n.startsWith('http') ? n.replace(API, '')
      : n.startsWith('/') ? n
      : n.startsWith('?') ? `/v2/transactions${n}`
      : `/v2/transactions?accountId=${encodeURIComponent(accountId)}&dateFrom=${desde}&after=${encodeURIComponent(n)}`
  }
  return todas
}

async function sincronizarItem(itemId) {
  const item = db.ofDB.item(itemId)
  if (!item) throw new Error('Conexão não encontrada')
  const resumo = { contas: 0, novos: 0, automaticos: 0, revisar: 0 }
  try {
    const info = await pluggy(`/items/${itemId}`)
    const contas = (await pluggy(`/accounts?itemId=${itemId}`)).results || []
    const familia = db.obterUsuarioPorId(item.usuario_id)?.familia_id
    const nomesFamilia = db.ofDB.usuariosDaFamilia(familia).map(u => semAcento(u.nome))
    // O nome completo do titular (vem nas contas) também conta como "eu mesmo".
    for (const c of contas) if (c.owner) nomesFamilia.push(semAcento(c.owner))

    for (const c of contas) {
      db.ofDB.salvarConta({
        accountId: c.id, itemId, usuarioId: item.usuario_id, tipo: c.type, subtipo: c.subtype,
        nome: c.marketingName || c.name || info.connector?.name, numero: c.number, saldo: Number(c.balance)
      })
      resumo.contas++
      const oc = db.ofDB.conta(c.id)
      if (oc.ignorar) continue
      if (c.type === 'BANK' && oc.conta_id) {
        const limite = Number(c.bankData?.overdraftContractedLimit) || 0
        db.ofDB.atualizarSaldoConta(oc.conta_id, Number(c.balance), limite)
      }
      // Sem conta/cartão do app ligado, ainda não importa movimentos.
      if (!(oc.conta_id || oc.cartao_id)) continue

      for (const tx of await transacoes(c.id, oc.importar_desde)) {
        if (db.ofDB.existeTx(tx.id)) continue
        // A data vem em UTC; o dia que vale é o de Brasília.
        const data = new Date(tx.date).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
        if (data < oc.importar_desde) continue
        const ehCartao = c.type === 'CREDIT'
        const valor = Math.abs(Number(tx.amount))
        if (!(valor > 0)) continue
        // Cartão: compra é positiva; pagamento da fatura/estorno é negativo.
        const direcao = ehCartao ? (Number(tx.amount) > 0 ? 'saida' : 'entrada') : (tx.type === 'CREDIT' ? 'entrada' : 'saida')
        const pd = tx.paymentData || {}
        const contraparte = direcao === 'saida' ? pd.receiver?.name : pd.payer?.name
        const meta = tx.creditCardMetadata || {}
        const base = {
          txId: tx.id, accountId: c.id, usuarioId: item.usuario_id,
          data: ehCartao ? dataDaParcela(data, meta) : data,
          descricao: tx.description || tx.descriptionRaw || 'Movimento', valor, direcao,
          categoriaPluggy: tx.category, contraparte, metodo: pd.paymentMethod, operacao: tx.operationType,
          parcelaAtual: meta.installmentNumber, parcelas: meta.totalInstallments
        }
        if (base.parcelas > 1 && base.parcelaAtual && !base.descricao.includes(`${base.parcelaAtual}/${base.parcelas}`)) base.descricao = `${base.descricao} (${base.parcelaAtual}/${base.parcelas})`

        let decisao
        if (ehCartao) {
          // Pagamento da fatura dentro do cartão: não é gasto nem receita.
          if (direcao === 'entrada' && (tx.operationType === 'PAGAMENTO_FATURA' || /pagamento|payment/.test(semAcento(tx.description)))) {
            db.ofDB.inserirTx({ ...base, status: 'ignorada', sugestao: 'pagamento' })
            resumo.novos++
            continue
          }
          decisao = direcao === 'saida'
            ? { sugestao: 'gasto', sugestaoCategoria: categoriaSugerida(base.descricao, tx.category) }
            : { sugestao: 'ignorar' } // estorno: o usuário decide
        } else {
          decisao = sugerir(base, nomesFamilia)
        }
        const regra = db.ofDB.regra(item.usuario_id, chaveRegra(tx.description))
        if (regra) decisao = { sugestao: regra.acao, sugestaoCategoria: regra.categoria || decisao.sugestaoCategoria }
        db.ofDB.inserirTx({ ...base, ...decisao, status: 'revisar' })
        resumo.novos++

        // Compra de cartão já lançada à mão (mesmo cartão, data e valor): não duplica.
        const igual = ehCartao && direcao === 'saida' ? db.ofDB.gastoMesmaFatura(item.usuario_id, oc.cartao_id, base.data, valor) : null
        const duplicada = !!igual
        // Automático: compra no cartão, ou qualquer movimento que já tem regra aprendida.
        const automatico = !duplicada && ((ehCartao && direcao === 'saida') || (regra && regra.acao !== 'pagamento'))
        if (duplicada) {
          db.ofDB.marcarTx(tx.id, { status: 'ignorada', aplicadaComo: 'duplicada', gastoId: igual.id })
        } else if (automatico) {
          aplicar(tx.id, { acao: decisao.sugestao, categoria: decisao.sugestaoCategoria })
          resumo.automaticos++
        } else {
          resumo.revisar++
        }
      }
    }
    db.ofDB.statusItem(itemId, info.status || 'OK', null)
  } catch (e) {
    db.ofDB.statusItem(itemId, 'ERRO', e.message)
    throw e
  }
  return resumo
}

async function sincronizarUsuarios(usuarioIds) {
  const out = []
  for (const it of db.ofDB.itens(usuarioIds)) {
    try { out.push({ itemId: it.item_id, ok: true, ...(await sincronizarItem(it.item_id)) }) }
    catch (e) { out.push({ itemId: it.item_id, ok: false, erro: e.message }) }
  }
  return out
}

// O Meu Pluggy atualiza cada banco uma vez por dia; buscamos a cada 6h para pegar logo.
let rodando = false
function iniciar() {
  if (!configurado()) { console.log('Open Finance: sem credenciais da Pluggy, sincronização desligada'); return }
  const rodar = async () => {
    if (rodando) return
    rodando = true
    try {
      for (const it of db.ofDB.todosItens()) {
        try { await sincronizarItem(it.item_id) } catch (e) { console.error('Open Finance', it.item_id, e.message) }
      }
    } finally { rodando = false }
  }
  setTimeout(rodar, 2 * 60 * 1000)
  setInterval(rodar, 6 * 60 * 60 * 1000)
}

module.exports = { configurado, connectToken, pluggy, sincronizarItem, sincronizarUsuarios, aplicar, chaveRegra, iniciar }
