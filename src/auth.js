// Tranca da API: todo pedido precisa do token de sessão recebido no login, e só enxerga
// dados da própria família. O super_admin enxerga todas as famílias.
const db = require('./database')

// Rotas liberadas sem login (método + caminho dentro de /api).
const PUBLICAS = new Set([
  'GET /status',      // tela de login: só nome e final do telefone
  'POST /login',
  'POST /setup',       // primeiro acesso; a rota recusa se já existe usuário
  'POST /setup-admin', // protegida pela senha de configuração (ADMIN_SECRET)
  'GET /push/chave'    // chave pública do push, não é segredo
])

// Prefixo da rota → tabela, para conferir o dono de /recurso/:id.
const TABELAS = {
  gastos: 'gastos', cartoes: 'cartoes', contas: 'contas', metas: 'metas',
  emprestimos: 'emprestimos', 'receitas-programadas': 'receitas_programadas',
  receitas: 'receitas', orcamentos: 'orcamentos', recorrentes: 'gastos_recorrentes',
  usuarios: 'usuarios', familias: 'familias'
}
// Chave de pagamento ('fatura:2:2026-12-05') → tabela do item pago.
const CHAVES = { fatura: 'cartoes', recorrente: 'gastos_recorrentes', emprestimo: 'emprestimos' }

function tokenDoPedido(req) {
  const h = req.get('Authorization') || ''
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null
}

function negar(res, status, erro) { return res.status(status).json({ erro }) }

function exigirLogin(req, res, next) {
  const rota = req.method + ' ' + req.path
  if (PUBLICAS.has(rota)) return next()

  const token = tokenDoPedido(req)
  const usuario = db.usuarioDaSessao(token)
  if (!usuario) return negar(res, 401, 'Sessão expirada. Entre de novo com seu PIN.')
  req.usuario = usuario
  req.token = token
  if (usuario.role === 'super_admin') return next()

  const fam = Number(usuario.familia_id)
  const corpo = req.body && typeof req.body === 'object' ? req.body : {}
  const vazio = v => v === undefined || v === null || v === ''

  // Família pedida tem que ser a do usuário. Sem família na consulta, assume a dele:
  // várias rotas devolvem tudo de todas as famílias quando o filtro falta.
  for (const fonte of [req.query, corpo]) {
    if (!vazio(fonte.familiaId) && Number(fonte.familiaId) !== fam) return negar(res, 403, 'Sem permissão')
  }
  if (vazio(req.query.familiaId)) req.query.familiaId = String(fam)

  // Pessoa, conta e cartão citados no pedido têm que ser da mesma família.
  const referencias = [['usuarioId', 'usuarios'], ['contaId', 'contas'], ['cartaoId', 'cartoes']]
  for (const fonte of [req.query, corpo]) {
    for (const [campo, tabela] of referencias) {
      if (vazio(fonte[campo])) continue
      const f = db.familiaDoRegistro(tabela, Number(fonte[campo]))
      if (f !== null && f !== fam) return negar(res, 403, 'Sem permissão')
    }
  }

  // /recurso/:id
  const m = req.path.match(/^\/([a-z-]+)\/(\d+)(\/|$)/)
  if (m && TABELAS[m[1]]) {
    const tabela = TABELAS[m[1]]
    if (tabela === 'familias') return negar(res, 403, 'Sem permissão')
    // Cada um só altera o próprio perfil.
    if (tabela === 'usuarios' && Number(m[2]) !== Number(usuario.id)) return negar(res, 403, 'Sem permissão')
    const f = db.familiaDoRegistro(tabela, Number(m[2]))
    if (f !== undefined && f !== null && f !== fam) return negar(res, 403, 'Sem permissão')
  }

  // Criar família ou gente de outra família é coisa do administrador.
  if (rota === 'POST /familias') return negar(res, 403, 'Sem permissão')

  // Paguei / desfazer: o item da chave tem que ser da família.
  if (req.path === '/pagamentos' && typeof corpo.chave === 'string') {
    const [tipo, id] = corpo.chave.split(':')
    const tabela = CHAVES[tipo]
    if (!tabela) return negar(res, 400, 'Chave inválida')
    const f = db.familiaDoRegistro(tabela, Number(id))
    if (f !== undefined && f !== null && f !== fam) return negar(res, 403, 'Sem permissão')
  }

  next()
}

// PIN tem só 4 dígitos: sem limite, dá para testar todos em minutos. Depois de 5 erros
// seguidos, aquele usuário fica bloqueado por 15 minutos.
const TENTATIVAS = new Map()
const MAX_ERROS = 5
const BLOQUEIO_MS = 15 * 60 * 1000

function loginBloqueado(usuarioId) {
  const t = TENTATIVAS.get(usuarioId)
  if (!t || !t.ate) return 0
  const resta = t.ate - Date.now()
  if (resta <= 0) { TENTATIVAS.delete(usuarioId); return 0 }
  return Math.ceil(resta / 60000)
}
function registrarErroLogin(usuarioId) {
  const t = TENTATIVAS.get(usuarioId) || { erros: 0, ate: 0 }
  t.erros++
  if (t.erros >= MAX_ERROS) { t.ate = Date.now() + BLOQUEIO_MS; t.erros = 0 }
  TENTATIVAS.set(usuarioId, t)
}
function limparErrosLogin(usuarioId) { TENTATIVAS.delete(usuarioId) }

module.exports = { exigirLogin, tokenDoPedido, loginBloqueado, registrarErroLogin, limparErrosLogin }
