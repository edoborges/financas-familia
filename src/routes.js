const express = require('express')
const router = express.Router()
const multer = require('multer')
const db = require('./database')
const { processarMensagem } = require('./processador')
const { gerarPlanoEconomia, analisarArquivoFinanceiro } = require('./ai')
const auth = require('./auth')

// Tudo daqui para baixo exige login (exceto as rotas públicas listadas em auth.js).
router.use(auth.exigirLogin)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB
})

// ── Parser CSV (Mobills e formatos similares) ──
function parseCSV(csvText) {
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l)
  if (lines.length < 2) return []

  const sep = lines[0].split(';').length > lines[0].split(',').length ? ';' : ','
  const limpar = s => s.trim().replace(/^["']|["']$/g, '')
  const headers = lines[0].split(sep).map(h => limpar(h).toLowerCase())

  const idx = {
    data:      headers.findIndex(h => h.includes('data') || h.includes('date')),
    descricao: headers.findIndex(h => h.includes('descri') || h.includes('memo') || h.includes('hist')),
    categoria: headers.findIndex(h => h.includes('categor')),
    valor:     headers.findIndex(h => h.includes('valor') || h.includes('amount') || h.includes('quantia')),
    tipo:      headers.findIndex(h => h === 'tipo' || h.includes('nature') || h.includes('tipo lancamento')),
    conta:     headers.findIndex(h => h.includes('conta') || h.includes('account')),
  }

  const registros = []
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(sep).map(limpar)
    if (parts.length < 2) continue

    const valorRaw = idx.valor >= 0 ? parts[idx.valor] : '0'
    const valor = Math.abs(parseFloat(valorRaw.replace(/\./g, '').replace(',', '.')) || 0)
    if (!valor) continue

    const tipoStr = (idx.tipo >= 0 ? parts[idx.tipo] : '').toLowerCase()
    const ehReceita = tipoStr.includes('receita') || tipoStr.includes('entrada') || tipoStr.includes('crédito') || tipoStr.includes('credito') || valorRaw.replace(/\s/g,'').startsWith('+')

    const dataRaw = idx.data >= 0 ? parts[idx.data] : ''
    let data = null
    const dm = dataRaw.match(/(\d{2})\/(\d{2})\/(\d{4})/)
    if (dm) data = `${dm[3]}-${dm[2]}-${dm[1]}`
    else if (/\d{4}-\d{2}-\d{2}/.test(dataRaw)) data = dataRaw.slice(0,10)

    registros.push({
      data,
      descricao: idx.descricao >= 0 ? parts[idx.descricao] : 'Importado',
      categoria: idx.categoria >= 0 ? parts[idx.categoria] : 'Outros',
      valor,
      tipo: ehReceita ? 'receita' : 'despesa',
      conta: idx.conta >= 0 ? parts[idx.conta] : '',
    })
  }
  return registros
}

// ── Setup de super_admin (chamado uma vez para criar o admin inicial) ──
router.post('/setup-admin', (req, res) => {
  try {
    const { nome, pin, senha } = req.body
    // Sem ADMIN_SECRET configurado no servidor, a rota fica desligada (a senha padrão
    // estava escrita no código, então não servia de proteção).
    if (!process.env.ADMIN_SECRET || senha !== process.env.ADMIN_SECRET) {
      return res.status(403).json({ erro: 'Senha de configuração incorreta' })
    }
    if (!nome || !pin || !/^\d{4}$/.test(String(pin))) {
      return res.status(400).json({ erro: 'Nome e PIN de 4 dígitos obrigatórios' })
    }
    const telefone = 'admin_' + nome.toLowerCase().replace(/\s+/g, '')
    db.criarUsuario(nome, telefone, 0, String(pin), 1, 'super_admin')
    res.json(db.semPin(db.obterUsuario(telefone)))
  } catch (e) {
    res.status(500).json({ erro: e.message })
  }
})

// Pública: alimenta a tela de login. Só o necessário para escolher quem vai entrar:
// nada de PIN, e do telefone só os 4 últimos dígitos.
router.get('/status', (req, res) => {
  const usuarios = db.listarUsuarios().map(u => ({
    id: u.id, nome: u.nome, familia_id: u.familia_id, role: u.role,
    telefone: /^\d{4,}$/.test(u.telefone || '') ? u.telefone.slice(-4) : ''
  }))
  res.json({ configurado: usuarios.length > 0, usuarios })
})

router.get('/usuarios', (req, res) => {
  const { familiaId } = req.query
  res.json(db.listarUsuarios(familiaId ? parseInt(familiaId) : null).map(db.semPin))
})

// Primeiro acesso: cria os dois usuários de uma vez. Só funciona com o banco vazio.
router.post('/setup', (req, res) => {
  try {
    if (db.listarUsuarios().length > 0) return res.status(403).json({ erro: 'App já configurado' })
    const lista = Array.isArray(req.body.usuarios) ? req.body.usuarios : []
    if (!lista.length || lista.some(u => !u.nome || !/^\d{4}$/.test(String(u.pin)))) {
      return res.status(400).json({ erro: 'Nome e PIN de 4 dígitos obrigatórios' })
    }
    for (const u of lista) {
      const telefone = (u.telefone && String(u.telefone).trim()) ? String(u.telefone).replace(/\D/g, '') : u.nome.toLowerCase().replace(/\s+/g, '')
      db.criarUsuario(u.nome, telefone, u.salario || 0, String(u.pin), 1, 'membro')
    }
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ erro: e.message })
  }
})

router.post('/usuarios', (req, res) => {
  try {
    const { nome, salario, telefone: tel, pin, familiaId, role } = req.body
    if (!nome) return res.status(400).json({ erro: 'Nome obrigatório' })
    // Membro comum só cria gente na própria família e não cria administrador.
    const admin = req.usuario.role === 'super_admin'
    const fam = admin ? (familiaId ? parseInt(familiaId) : 1) : req.usuario.familia_id
    const papel = admin ? (role || 'membro') : 'membro'
    const telefone = (tel && tel.trim()) ? tel.trim().replace(/\D/g, '') : nome.toLowerCase().replace(/\s+/g, '')
    db.criarUsuario(nome, telefone, salario || 0, pin || '0000', fam, papel)
    res.json(db.semPin(db.obterUsuario(telefone)))
  } catch (e) {
    console.error('POST /usuarios erro:', e.message)
    res.status(500).json({ erro: e.message })
  }
})

// ===== FAMÍLIAS =====
router.get('/familias', (req, res) => {
  const todas = db.listarFamilias()
  if (req.usuario.role === 'super_admin') return res.json(todas)
  res.json(todas.filter(f => Number(f.id) === Number(req.usuario.familia_id)))
})

router.post('/familias', (req, res) => {
  try {
    const { nome } = req.body
    if (!nome) return res.status(400).json({ erro: 'Nome obrigatório' })
    const result = db.criarFamilia(nome)
    res.json({ id: Number(result.lastInsertRowid), nome })
  } catch (e) {
    res.status(500).json({ erro: e.message })
  }
})

router.put('/familias/:id', (req, res) => {
  const { nome } = req.body
  db.editarFamilia(req.params.id, nome)
  res.json({ ok: true })
})

router.post('/login', (req, res) => {
  const { usuarioId, pin } = req.body
  if (!usuarioId || !pin) return res.status(400).json({ erro: 'Dados incompletos' })
  const id = parseInt(usuarioId)
  const minutos = auth.loginBloqueado(id)
  if (minutos) return res.status(429).json({ erro: `Muitas tentativas. Tente de novo em ${minutos} min.` })
  const usuario = db.autenticarUsuario(id, String(pin))
  if (!usuario) {
    auth.registrarErroLogin(id)
    return res.status(401).json({ erro: 'PIN incorreto' })
  }
  auth.limparErrosLogin(id)
  res.json({ ...db.semPin(usuario), token: db.criarSessao(usuario.id) })
})

// Cópia de segurança do banco inteiro (todas as famílias): só o administrador.
router.get('/backup', (req, res) => {
  if (req.usuario.role !== 'super_admin') return res.status(403).json({ erro: 'Só o administrador pode baixar a cópia' })
  try {
    const arq = db.gerarBackup()
    res.download(arq, `financas-backup-${db.hojeBR()}.db`, () => require('fs').unlink(arq, () => {}))
  } catch (e) {
    res.status(500).json({ erro: e.message })
  }
})

// Recomeço: zera os números de uma família (ver db.zerarNumerosFamilia). Só o administrador,
// e só com a palavra de confirmação.
router.post('/admin/zerar', (req, res) => {
  if (req.usuario.role !== 'super_admin') return res.status(403).json({ erro: 'Só o administrador pode zerar' })
  const { familiaId, confirmacao } = req.body
  if (confirmacao !== 'ZERAR') return res.status(400).json({ erro: 'Confirmação incorreta' })
  if (!familiaId) return res.status(400).json({ erro: 'Família não informada' })
  try {
    const resultado = db.zerarNumerosFamilia(parseInt(familiaId))
    console.log(`Família ${familiaId} zerada por ${req.usuario.nome}:`, JSON.stringify(resultado))
    res.json({ ok: true, resultado })
  } catch (e) {
    res.status(500).json({ erro: e.message })
  }
})

router.post('/logout', (req, res) => {
  db.encerrarSessao(req.token)
  res.json({ ok: true })
})

router.put('/usuarios/:id/salario', (req, res) => {
  const { salario } = req.body
  const u = db.listarUsuarios().find(u => u.id === parseInt(req.params.id))
  if (!u) return res.status(404).json({ erro: 'Não encontrado' })
  db.atualizarSalario(u.telefone, salario)
  res.json({ ok: true })
})

router.put('/usuarios/:id', (req, res) => {
  const { nome, salario, telefone, pin, pinAtual } = req.body
  const u = db.obterUsuarioPorId(parseInt(req.params.id))
  if (!u) return res.status(404).json({ erro: 'Não encontrado' })
  // Se tentou trocar PIN, valida o atual primeiro
  if (pin && String(pinAtual) !== String(u.pin)) {
    return res.status(401).json({ erro: 'PIN atual incorreto' })
  }
  db.editarUsuario(parseInt(req.params.id), nome || u.nome, salario ?? u.salario, telefone || u.telefone, pin || u.pin)
  // PIN trocado: quem estava logado com o PIN antigo em outro aparelho sai.
  if (pin && String(pin) !== String(u.pin)) db.encerrarOutrasSessoes(u.id, req.token)
  res.json(db.semPin(db.obterUsuarioPorId(parseInt(req.params.id))))
})

router.get('/alertas', (req, res) => {
  const { familiaId } = req.query
  res.json(db.alertasVencimento(familiaId ? parseInt(familiaId) : null))
})

router.post('/chat', async (req, res) => {
  const { mensagem, usuarioId } = req.body
  if (!mensagem || !usuarioId) return res.status(400).json({ erro: 'Dados incompletos' })
  const resultado = await processarMensagem(usuarioId, mensagem)
  res.json(resultado)
})

router.get('/resumo', (req, res) => {
  try {
    const { familiaId, usuarioId } = req.query
    res.json(db.resumoFinanceiro(familiaId ? parseInt(familiaId) : null, usuarioId ? parseInt(usuarioId) : null))
  } catch (e) {
    console.error('GET /resumo erro:', e.message)
    res.status(500).json({ erro: e.message })
  }
})

router.post('/gastos', (req, res) => {
  try {
    const { usuarioId, descricao, valor, categoria, formaPagamento, cartaoId, parcelas, contaId } = req.body
    if (!usuarioId || !descricao || !valor) return res.status(400).json({ erro: 'Dados incompletos' })
    const result = db.registrarGasto(
      parseInt(usuarioId), descricao, valor,
      categoria || 'Outros', formaPagamento || 'debito',
      cartaoId ? parseInt(cartaoId) : null,
      parseInt(parcelas) || 1,
      contaId ? parseInt(contaId) : null
    )
    const id = typeof result === 'number' ? result : Number(result?.lastInsertRowid || 0)
    res.json({ ok: true, id })
  } catch (e) {
    console.error('POST /gastos erro:', e.message)
    res.status(500).json({ erro: e.message })
  }
})

router.get('/gastos', (req, res) => {
  try {
    const { mes, ano, familiaId, usuarioId } = req.query
    res.json(db.listarGastosMes(mes ? parseInt(mes) : null, ano ? parseInt(ano) : null, familiaId ? parseInt(familiaId) : null, usuarioId ? parseInt(usuarioId) : null))
  } catch (e) {
    res.status(500).json({ erro: e.message })
  }
})

router.get('/gastos/recentes', (req, res) => {
  try {
    const { familiaId, usuarioId } = req.query
    res.json(db.ultimosGastos(30, familiaId ? parseInt(familiaId) : null, usuarioId ? parseInt(usuarioId) : null))
  } catch (e) {
    res.status(500).json({ erro: e.message })
  }
})

router.get('/gastos/categorias', (req, res) => {
  const { mes, ano, familiaId, usuarioId } = req.query
  res.json(db.gastosPorCategoria(mes ? parseInt(mes) : null, ano ? parseInt(ano) : null, familiaId ? parseInt(familiaId) : null, usuarioId ? parseInt(usuarioId) : null))
})

router.get('/gastos/evolucao', (req, res) => {
  const { familiaId, usuarioId } = req.query
  res.json(db.gastosPorMes(6, familiaId ? parseInt(familiaId) : null, usuarioId ? parseInt(usuarioId) : null))
})

router.get('/cartoes', (req, res) => {
  const { familiaId, usuarioId } = req.query
  res.json(db.listarCartoes(familiaId ? parseInt(familiaId) : null, usuarioId ? parseInt(usuarioId) : null))
})

router.post('/cartoes', (req, res) => {
  try {
    const { usuarioId, nome, limite, diaFechamento, diaVencimento, bandeira } = req.body
    if (!usuarioId || !nome || !limite) return res.status(400).json({ erro: 'Dados incompletos' })
    const result = db.criarCartao(usuarioId, nome, limite, diaFechamento, diaVencimento, bandeira)
    res.json({ id: Number(result.lastInsertRowid) })
  } catch (e) {
    console.error('POST /cartoes erro:', e.message)
    res.status(500).json({ erro: e.message })
  }
})

// Quanto dá para gastar até a próxima entrada + aviso de cheque especial.
router.get('/livre-para-gastar', (req, res) => {
  try {
    const { familiaId, usuarioId } = req.query
    res.json(db.livreParaGastar(familiaId ? parseInt(familiaId) : null, usuarioId ? parseInt(usuarioId) : null))
  } catch (e) { res.status(500).json({ erro: e.message }) }
})

// ===== TRANSFERÊNCIAS =====
router.get('/transferencias', (req, res) => {
  const { familiaId, usuarioId } = req.query
  res.json(db.listarTransferencias(familiaId ? parseInt(familiaId) : null, usuarioId ? parseInt(usuarioId) : null))
})
router.post('/transferencias', (req, res) => {
  try {
    const { usuarioId, deContaId, paraContaId, valor, data, descricao } = req.body
    if (!usuarioId || !(Number(valor) > 0) || (!deContaId && !paraContaId)) return res.status(400).json({ erro: 'Informe valor e pelo menos uma conta' })
    if (deContaId && paraContaId && Number(deContaId) === Number(paraContaId)) return res.status(400).json({ erro: 'Escolha contas diferentes' })
    const id = db.registrarTransferencia(parseInt(usuarioId), { deContaId: deContaId ? parseInt(deContaId) : null, paraContaId: paraContaId ? parseInt(paraContaId) : null, valor, data: dataOk(data) ? data : null, descricao: descricao ? String(descricao).slice(0, 80) : '' })
    res.json({ ok: true, id })
  } catch (e) { res.status(500).json({ erro: e.message }) }
})
router.delete('/transferencias/:id', (req, res) => {
  res.json({ ok: !!db.desfazerTransferencia(parseInt(req.params.id)) })
})

// ===== VALORES A RECEBER =====
const dataOk = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''))
router.get('/recebiveis', (req, res) => {
  const { familiaId, usuarioId } = req.query
  res.json(db.listarRecebiveis(familiaId ? parseInt(familiaId) : null, usuarioId ? parseInt(usuarioId) : null))
})
// Cria um ou vários de uma vez (ex.: as 31 entradas de uma venda parcelada).
router.post('/recebiveis', (req, res) => {
  try {
    const { usuarioId, grupo, itens } = req.body
    const lista = Array.isArray(itens) ? itens : []
    if (!usuarioId || !grupo || !lista.length || lista.length > 240) return res.status(400).json({ erro: 'Informe pessoa, nome e de 1 a 240 valores' })
    for (const [i, it] of lista.entries()) {
      if (!it.descricao || !(Number(it.valor) > 0) || !dataOk(it.data)) return res.status(400).json({ erro: `Valor ${i + 1} incompleto ou com data inválida` })
    }
    const n = db.criarRecebiveis(parseInt(usuarioId), String(grupo).slice(0, 80), lista.map(it => ({ ...it, valor: Math.round(Number(it.valor) * 100) / 100 })))
    res.json({ ok: true, criados: n })
  } catch (e) { res.status(500).json({ erro: e.message }) }
})
router.put('/recebiveis/:id', (req, res) => {
  const r = db.editarRecebivel(parseInt(req.params.id), req.body || {})
  if (!r) return res.status(404).json({ erro: 'Não encontrado' })
  res.json(r)
})
router.post('/recebiveis/:id/recebi', (req, res) => {
  try {
    const r = db.marcarRecebido(parseInt(req.params.id), req.body || {})
    if (!r) return res.status(404).json({ erro: 'Não encontrado' })
    res.json(r)
  } catch (e) { res.status(500).json({ erro: e.message }) }
})
router.delete('/recebiveis/:id/recebi', (req, res) => {
  res.json(db.desfazerRecebido(parseInt(req.params.id)) || {})
})
router.delete('/recebiveis/:id', (req, res) => {
  db.deletarRecebivel(parseInt(req.params.id))
  res.json({ ok: true })
})

// ===== PATRIMÔNIO =====
router.get('/patrimonio', (req, res) => {
  try {
    const { familiaId, usuarioId } = req.query
    const f = familiaId ? parseInt(familiaId) : null
    const u = usuarioId ? parseInt(usuarioId) : null
    res.json({ itens: db.listarPatrimonio(f, u), resumo: db.resumoPatrimonio(f, u) })
  } catch (e) { res.status(500).json({ erro: e.message }) }
})
router.post('/patrimonio', (req, res) => {
  const { usuarioId, tipo, nome, valor, instituicao } = req.body
  if (!usuarioId || !nome) return res.status(400).json({ erro: 'Informe o nome' })
  res.json(db.salvarPatrimonio(parseInt(usuarioId), { tipo, nome: String(nome).slice(0, 80), valor, instituicao }))
})
router.put('/patrimonio/:id', (req, res) => {
  const { tipo, nome, valor, instituicao } = req.body
  if (!nome) return res.status(400).json({ erro: 'Informe o nome' })
  res.json(db.salvarPatrimonio(null, { id: parseInt(req.params.id), tipo, nome: String(nome).slice(0, 80), valor, instituicao }))
})
router.delete('/patrimonio/:id', (req, res) => {
  db.deletarPatrimonio(parseInt(req.params.id))
  res.json({ ok: true })
})

// Pagamento antecipado / estorno que abate uma fatura (cartão + data de vencimento).
router.post('/creditos-fatura', (req, res) => {
  const { cartaoId, vencimento, valor, data, descricao } = req.body
  const v = Math.round(Number(valor) * 100) / 100
  if (!cartaoId || !dataOk(vencimento) || !(v > 0)) return res.status(400).json({ erro: 'Informe cartão, vencimento e valor' })
  const id = db.registrarCreditoFatura(parseInt(cartaoId), vencimento, v, dataOk(data) ? data : null, descricao ? String(descricao).slice(0, 80) : null)
  if (!id) return res.status(404).json({ erro: 'Cartão não encontrado' })
  res.json({ ok: true, id })
})
router.delete('/creditos-fatura/:id', (req, res) => {
  db.removerCreditoFatura(parseInt(req.params.id))
  res.json({ ok: true })
})

// Editar cartão (nome, limite, dia de fechamento e de vencimento).
router.put('/cartoes/:id', (req, res) => {
  const c = db.editarCartao(parseInt(req.params.id), req.body || {})
  if (!c) return res.status(404).json({ erro: 'Cartão não encontrado' })
  res.json(c)
})

// Lançamento em lote com data (ver db.registrarGastosLote). Os itens ficam dentro de uma
// lista, fora do alcance da checagem geral do auth.js, então a família é conferida aqui.
router.post('/gastos/lote', (req, res) => {
  try {
    const itens = Array.isArray(req.body.itens) ? req.body.itens : []
    if (!itens.length || itens.length > 500) return res.status(400).json({ erro: 'Envie de 1 a 500 itens' })
    const fam = Number(req.usuario.familia_id)
    const admin = req.usuario.role === 'super_admin'
    const limpos = []
    for (const [i, it] of itens.entries()) {
      const usuarioId = parseInt(it.usuarioId)
      const valor = Math.round(Number(it.valor) * 100) / 100
      if (!usuarioId || !it.descricao || !(valor > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(String(it.data || ''))) {
        return res.status(400).json({ erro: `Item ${i + 1} incompleto ou com data inválida` })
      }
      if (!admin) {
        if (db.familiaDoRegistro('usuarios', usuarioId) !== fam) return res.status(403).json({ erro: `Item ${i + 1}: pessoa de outra família` })
        for (const [campo, tabela] of [['cartaoId', 'cartoes'], ['contaId', 'contas']]) {
          if (it[campo] && db.familiaDoRegistro(tabela, parseInt(it[campo])) !== fam) return res.status(403).json({ erro: `Item ${i + 1}: ${campo} de outra família` })
        }
      }
      limpos.push({ ...it, usuarioId, valor, descricao: String(it.descricao).slice(0, 200),
        cartaoId: it.cartaoId ? parseInt(it.cartaoId) : null, contaId: it.contaId ? parseInt(it.contaId) : null,
        parcelas: parseInt(it.parcelas) || 1, parcelaAtual: parseInt(it.parcelaAtual) || 1 })
    }
    const r = db.registrarGastosLote(limpos)
    db.registrarImportacao(req.usuario.id, 'lote', String(req.body.origem || 'Lote').slice(0, 60), r.aplicados, r.duplicatas)
    res.json(r)
  } catch (e) {
    console.error('POST /gastos/lote erro:', e.message)
    res.status(500).json({ erro: e.message })
  }
})

router.put('/cartoes/:id/fatura', (req, res) => {
  const { gastoAtual } = req.body
  db.atualizarFaturaCartao(req.params.id, gastoAtual)
  res.json({ ok: true })
})

router.delete('/cartoes/:id', (req, res) => {
  db.deletarCartao(req.params.id)
  res.json({ ok: true })
})

router.get('/contas', (req, res) => {
  const { familiaId, usuarioId } = req.query
  res.json(db.listarContas(familiaId ? parseInt(familiaId) : null, usuarioId ? parseInt(usuarioId) : null))
})

router.post('/contas', (req, res) => {
  try {
    const { usuarioId, nome, banco, tipo, saldo, cor, limite } = req.body
    if (!usuarioId || !nome) return res.status(400).json({ erro: 'Dados incompletos' })
    const result = db.criarConta(usuarioId, nome, banco, tipo, saldo, cor, limite)
    res.json({ id: Number(result.lastInsertRowid) })
  } catch (e) {
    console.error('POST /contas erro:', e.message)
    res.status(500).json({ erro: e.message })
  }
})

router.put('/contas/:id', (req, res) => {
  const { nome, banco, tipo, saldo, limite } = req.body
  if (nome) db.atualizarConta(req.params.id, nome, banco, tipo, saldo, limite)
  else db.atualizarSaldoConta(req.params.id, saldo)
  res.json({ ok: true })
})

router.delete('/contas/:id', (req, res) => {
  db.deletarConta(req.params.id)
  res.json({ ok: true })
})

router.get('/metas', (req, res) => {
  const { familiaId } = req.query
  res.json(db.listarMetas(familiaId ? parseInt(familiaId) : null))
})

router.post('/metas', (req, res) => {
  try {
    const { nome, valorAlvo, prazo, descricao, categoria, emoji } = req.body
    if (!nome || !valorAlvo) return res.status(400).json({ erro: 'Dados incompletos' })
    const result = db.criarMeta(nome, valorAlvo, prazo, descricao, categoria, emoji)
    res.json({ id: Number(result.lastInsertRowid) })
  } catch (e) {
    console.error('POST /metas erro:', e.message)
    res.status(500).json({ erro: e.message })
  }
})

router.put('/metas/:id', (req, res) => {
  db.atualizarMeta(req.params.id, req.body.valorAtual)
  res.json({ ok: true })
})

// Empréstimos
router.get('/emprestimos', (req, res) => {
  const { familiaId, usuarioId } = req.query
  res.json(db.listarEmprestimos(familiaId ? parseInt(familiaId) : null, usuarioId ? parseInt(usuarioId) : null))
})

router.post('/emprestimos', (req, res) => {
  try {
    const { usuarioId, tipo, descricao, credor, valorTotal, parcelaMensal, totalParcelas, taxaJuros, dataVencimento, descontoFolha } = req.body
    if (!usuarioId || !descricao || !credor || !valorTotal) return res.status(400).json({ erro: 'Dados incompletos' })
    const result = db.criarEmprestimo(usuarioId, tipo, descricao, credor, valorTotal, parcelaMensal, totalParcelas, taxaJuros, dataVencimento, descontoFolha)
    res.json({ id: Number(result.lastInsertRowid) })
  } catch (e) {
    console.error('POST /emprestimos erro:', e.message)
    res.status(500).json({ erro: e.message })
  }
})

router.put('/emprestimos/:id', (req, res) => {
  const { tipo, descricao, credor, valorTotal, parcelaMensal, totalParcelas, taxaJuros, dataVencimento, valorPago, parcelasPagas, descontoFolha } = req.body
  db.editarEmprestimo(req.params.id, tipo, descricao, credor, valorTotal, parcelaMensal, totalParcelas, taxaJuros, dataVencimento, valorPago, parcelasPagas, descontoFolha)
  res.json({ ok: true })
})

router.post('/emprestimos/:id/pagar', (req, res) => {
  const { valorPago, parcelasPagas } = req.body
  db.atualizarEmprestimo(req.params.id, valorPago || 0, parcelasPagas || 1)
  res.json({ ok: true })
})

router.delete('/emprestimos/:id', (req, res) => {
  db.deletarEmprestimo(req.params.id)
  res.json({ ok: true })
})

// ===== RECEITAS PROGRAMADAS =====
router.get('/receitas-programadas', (req, res) => {
  const { familiaId, usuarioId } = req.query
  res.json(db.listarReceitasProgramadas(familiaId ? parseInt(familiaId) : null, usuarioId ? parseInt(usuarioId) : null))
})

router.post('/receitas-programadas', (req, res) => {
  try {
    const { usuarioId, descricao, valor, tipo, diaMes, diaSemana, observacao, estimada } = req.body
    if (!usuarioId || !descricao || !valor) return res.status(400).json({ erro: 'Dados incompletos' })
    const result = db.adicionarReceitaProgramada(parseInt(usuarioId), descricao, parseFloat(valor), tipo || 'mensal', diaMes != null ? parseInt(diaMes) : null, diaSemana != null ? parseInt(diaSemana) : null, observacao || null, estimada ? 1 : 0)
    res.json({ id: Number(result.lastInsertRowid) })
  } catch (e) {
    res.status(500).json({ erro: e.message })
  }
})

router.put('/receitas-programadas/:id', (req, res) => {
  try {
    const { descricao, valor, tipo, diaMes, diaSemana, observacao, ativa, estimada } = req.body
    db.atualizarReceitaProgramada(parseInt(req.params.id), descricao, parseFloat(valor), tipo, diaMes != null ? parseInt(diaMes) : null, diaSemana != null ? parseInt(diaSemana) : null, observacao || null, ativa ?? 1, estimada ? 1 : 0)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ erro: e.message })
  }
})

router.delete('/receitas-programadas/:id', (req, res) => {
  db.removerReceitaProgramada(parseInt(req.params.id))
  res.json({ ok: true })
})

// Receitas
router.get('/receitas', (req, res) => {
  const { familiaId, usuarioId } = req.query
  res.json(db.listarReceitas(familiaId ? parseInt(familiaId) : null, usuarioId ? parseInt(usuarioId) : null))
})

router.post('/receitas', (req, res) => {
  try {
    const { usuarioId, valor, descricao, dataReceita, tipo } = req.body
    if (!usuarioId || !valor) return res.status(400).json({ erro: 'Dados incompletos' })
    // Sem acento: 'Salário' tem de virar 'salario', que é o que tira a estimativa da previsão.
    const tipoNorm = String(tipo || 'outro').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    const result = db.registrarReceita(usuarioId, valor, descricao || 'Receita', dataReceita || null, tipoNorm)
    res.json({ id: Number(result.lastInsertRowid) })
  } catch (e) {
    console.error('POST /receitas erro:', e.message)
    res.status(500).json({ erro: e.message })
  }
})

router.delete('/receitas/:id', (req, res) => {
  db.deletarReceita(req.params.id)
  res.json({ ok: true })
})

// Limpar gastos importados (origem='importado') de um usuário ou família
router.delete('/gastos/importados', (req, res) => {
  try {
    const { familiaId, usuarioId } = req.body
    let result
    if (usuarioId) {
      result = db.limparGastosImportados(null, parseInt(usuarioId))
    } else if (familiaId) {
      result = db.limparGastosImportados(parseInt(familiaId), null)
    } else {
      return res.status(400).json({ erro: 'Informe familiaId ou usuarioId' })
    }
    res.json({ ok: true, removidos: result.changes })
  } catch (e) {
    res.status(500).json({ erro: e.message })
  }
})

// Deletar gasto individual
router.delete('/gastos/:id', (req, res) => {
  try {
    const result = db.deletarGasto(parseInt(req.params.id))
    res.json({ ok: true, changes: result.changes })
  } catch (e) {
    res.status(500).json({ erro: e.message })
  }
})

router.get('/receitas/evolucao', (req, res) => {
  const { familiaId } = req.query
  res.json(db.receitasPorMes(6, familiaId ? parseInt(familiaId) : null))
})

router.get('/projecao', (req, res) => {
  try {
    const { familiaId, usuarioId } = req.query
    res.json(db.projecaoGastosMeses(4, familiaId ? parseInt(familiaId) : null, usuarioId ? parseInt(usuarioId) : null))
  } catch (e) {
    res.status(500).json({ erro: e.message })
  }
})

// ── Análise de múltiplos arquivos (até 6) com IA ──
router.post('/analisar-arquivo', upload.array('arquivos', 6), async (req, res) => {
  try {
    const arquivos = req.files || []
    if (!arquivos.length) return res.status(400).json({ erro: 'Nenhum arquivo enviado' })
    const tipos = ['image/jpeg','image/png','image/webp','image/gif','application/pdf']
    for (const f of arquivos) {
      if (!tipos.includes(f.mimetype)) return res.status(400).json({ erro: `Formato não suportado: ${f.originalname}. Use JPG, PNG, WebP ou PDF.` })
    }
    // Processa todos em paralelo
    const resultados = await Promise.all(
      arquivos.map(f => analisarArquivoFinanceiro(f.buffer.toString('base64'), f.mimetype, f.originalname))
    )
    res.json({ resultados, total: resultados.length })
  } catch (e) {
    console.error('POST /analisar-arquivo erro:', e.message)
    res.status(500).json({ erro: e.message })
  }
})

// ── Aplicar resultado da análise no banco (com verificação de duplicatas) ──
router.post('/aplicar-analise', (req, res) => {
  try {
    const { usuarioId, analise, cartaoId, contaId } = req.body
    if (!usuarioId || !analise) return res.status(400).json({ erro: 'Dados incompletos' })

    const resultado = { aplicados: 0, duplicatas: 0, tipo: analise.tipo }

    if (analise.tipo === 'extrato') {
      if (contaId && analise.saldo != null) {
        db.atualizarSaldoConta(contaId, analise.saldo)
        resultado.saldoAtualizado = analise.saldo
      }
      for (const tx of (analise.transacoes || [])) {
        if (!tx.valor) continue
        if (db.verificarDuplicataGasto(usuarioId, tx.descricao, tx.valor, tx.data)) {
          resultado.duplicatas++; continue
        }
        if (tx.tipo_tx === 'credito') {
          db.registrarReceita(usuarioId, tx.valor, tx.descricao, tx.data)
        } else {
          db.registrarGasto(usuarioId, tx.descricao, tx.valor, 'Outros', 'pix', null, 1, contaId || null)
        }
        resultado.aplicados++
      }
      const banco = analise.banco || 'Extrato'
      db.registrarImportacao(usuarioId, 'imagem_extrato', banco, resultado.aplicados, resultado.duplicatas)
    }

    if (analise.tipo === 'contrato') {
      const r = db.criarEmprestimo(
        usuarioId,
        analise.subtipo || 'emprestimo',
        analise.descricao || 'Contrato importado',
        analise.credor || 'Desconhecido',
        analise.valor_total || 0,
        analise.parcela_mensal || 0,
        analise.total_parcelas || 1,
        analise.taxa_juros || 0,
        analise.data_vencimento || null
      )
      if (analise.valor_pago > 0) {
        db.atualizarEmprestimo(Number(r.lastInsertRowid), analise.valor_pago, analise.parcelas_pagas || 0)
      }
      resultado.aplicados = 1
      db.registrarImportacao(usuarioId, 'imagem_contrato', analise.credor || 'Contrato', 1, 0)
    }

    if (analise.tipo === 'fatura_cartao') {
      if (cartaoId && analise.valor_total) {
        db.atualizarFaturaCartao(cartaoId, analise.valor_total)
        resultado.faturaAtualizada = analise.valor_total
      }
      for (const item of (analise.itens || [])) {
        if (!item.valor) continue
        const parcelas = item.total_parcelas || 1
        const valorTotal = item.valor * parcelas
        if (db.verificarDuplicataGasto(usuarioId, item.descricao, item.valor, item.data)) {
          resultado.duplicatas++; continue
        }
        db.registrarGasto(usuarioId, item.descricao, valorTotal, item.categoria || 'Outros', 'crédito', cartaoId || null, parcelas, null)
        resultado.aplicados++
      }
      const banco = analise.banco || 'Fatura'
      db.registrarImportacao(usuarioId, 'imagem_fatura', banco, resultado.aplicados, resultado.duplicatas)
    }

    res.json(resultado)
  } catch (e) {
    console.error('POST /aplicar-analise erro:', e.message)
    res.status(500).json({ erro: e.message })
  }
})

// ── Importar CSV (Mobills e similares) ──
router.post('/importar-csv', upload.single('arquivo'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo enviado' })
    const texto = req.file.buffer.toString('utf-8')
    const registros = parseCSV(texto)
    if (!registros.length) return res.status(400).json({ erro: 'Nenhum lançamento encontrado no CSV. Verifique o formato.' })
    const receitas = registros.filter(r => r.tipo === 'receita')
    const despesas = registros.filter(r => r.tipo === 'despesa')
    res.json({ total: registros.length, receitas: receitas.length, despesas: despesas.length, preview: registros.slice(0, 5), registros })
  } catch (e) {
    console.error('POST /importar-csv erro:', e.message)
    res.status(500).json({ erro: e.message })
  }
})

// ── Confirmar importação CSV (com verificação de duplicatas) ──
router.post('/importar-csv/confirmar', (req, res) => {
  try {
    const { usuarioId, registros } = req.body
    if (!usuarioId || !registros?.length) return res.status(400).json({ erro: 'Dados incompletos' })

    let gastos = 0, receitas = 0, duplicatas = 0
    for (const r of registros) {
      if (!r.valor) continue
      if (r.tipo === 'receita') {
        db.registrarReceita(usuarioId, r.valor, r.descricao, r.data)
        receitas++
      } else {
        if (db.verificarDuplicataGasto(usuarioId, r.descricao, r.valor, r.data)) {
          duplicatas++; continue
        }
        const cat = mapearCategoriaCSV(r.categoria)
        db.registrarGasto(usuarioId, r.descricao, r.valor, cat, 'pix', null, 1, null)
        gastos++
      }
    }
    db.registrarImportacao(usuarioId, 'csv', `CSV — ${registros.length} registros`, gastos + receitas, duplicatas)
    res.json({ ok: true, gastos, receitas, duplicatas, total: gastos + receitas })
  } catch (e) {
    console.error('POST /importar-csv/confirmar erro:', e.message)
    res.status(500).json({ erro: e.message })
  }
})

function mapearCategoriaCSV(cat) {
  if (!cat) return 'Outros'
  const c = cat.toLowerCase()
  if (/alimenta|mercado|supermerc|restaur|lanche|comida/.test(c)) return 'Alimentação'
  if (/saúde|saude|médic|medic|farmá|farma|hospital/.test(c)) return 'Saúde'
  if (/transport|combustív|gasolina|uber|taxi|onibus/.test(c)) return 'Transporte'
  if (/educa|escola|curso|livro/.test(c)) return 'Educação'
  if (/lazer|entretenimento|cinema|viagem|hotel/.test(c)) return 'Lazer'
  if (/vestuário|vestuario|roupa|calçado/.test(c)) return 'Vestuário'
  if (/casa|aluguel|condomin|água|luz|internet|gás/.test(c)) return 'Casa'
  if (/assinatura|netflix|spotify|amazon/.test(c)) return 'Assinatura'
  return 'Outros'
}

// Histórico de importações
router.get('/importacoes', (req, res) => {
  const { familiaId } = req.query
  res.json(db.listarImportacoes(familiaId ? parseInt(familiaId) : null))
})

// Exportar CSV do mês
router.get('/exportar/csv', (req, res) => {
  try {
    const { mes, ano, familiaId } = req.query
    const gastos = db.listarGastosExport(mes ? parseInt(mes) : null, ano ? parseInt(ano) : null, familiaId ? parseInt(familiaId) : null)
    const receitas = db.listarReceitasExport(mes ? parseInt(mes) : null, ano ? parseInt(ano) : null, familiaId ? parseInt(familiaId) : null)

    const linhas = ['Data;Descrição;Categoria;Valor;Tipo;Pessoa;Cartão;Forma Pagamento']
    for (const r of receitas) {
      linhas.push(`${r.data_receita};${r.descricao};Receita;${Number(r.valor).toFixed(2)};Receita;${r.usuario_nome};;`)
    }
    for (const g of gastos) {
      linhas.push(`${g.data_gasto};${g.descricao};${g.categoria};${Number(g.valor).toFixed(2)};Despesa;${g.usuario_nome};${g.cartao_nome||''};${g.forma_pagamento||''}`)
    }

    const now = new Date()
    const nomeMes = String(mes || now.getMonth() + 1).padStart(2, '0')
    const nomeAno = ano || now.getFullYear()
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="financas-${nomeAno}-${nomeMes}.csv"`)
    res.send('﻿' + linhas.join('\r\n')) // BOM para Excel pt-BR
  } catch (e) {
    res.status(500).json({ erro: e.message })
  }
})

// Dados para relatório HTML (exportação visual)
router.get('/exportar/dados', (req, res) => {
  try {
    const { mes, ano, familiaId } = req.query
    const fid = familiaId ? parseInt(familiaId) : null
    const gastos = db.listarGastosExport(mes ? parseInt(mes) : null, ano ? parseInt(ano) : null, fid)
    const receitas = db.listarReceitasExport(mes ? parseInt(mes) : null, ano ? parseInt(ano) : null, fid)
    const resumo = db.resumoFinanceiro(fid)
    res.json({ gastos, receitas, resumo })
  } catch (e) {
    res.status(500).json({ erro: e.message })
  }
})

router.get('/plano', async (req, res) => {
  const { familiaId } = req.query
  const resumo = db.resumoFinanceiro(familiaId ? parseInt(familiaId) : null)
  const plano = await gerarPlanoEconomia(resumo)
  res.json({ plano })
})

// ── ORÇAMENTOS POR CATEGORIA ──
router.get('/orcamentos', (req, res) => {
  try {
    const { familiaId, usuarioId } = req.query
    res.json(db.listarOrcamentos(familiaId ? parseInt(familiaId) : null, usuarioId ? parseInt(usuarioId) : null))
  } catch(e) { res.status(500).json({ erro: e.message }) }
})
router.post('/orcamentos', (req, res) => {
  try {
    const { usuarioId, familiaId, categoria, valorLimite } = req.body
    res.json(db.salvarOrcamento(parseInt(usuarioId), familiaId ? parseInt(familiaId) : 1, categoria, parseFloat(valorLimite)))
  } catch(e) { res.status(500).json({ erro: e.message }) }
})
router.delete('/orcamentos/:id', (req, res) => {
  try {
    res.json(db.deletarOrcamento(parseInt(req.params.id)))
  } catch(e) { res.status(500).json({ erro: e.message }) }
})

// ── GASTOS RECORRENTES ──
router.get('/recorrentes', (req, res) => {
  try {
    const { familiaId, usuarioId } = req.query
    res.json(db.listarRecorrentes(familiaId ? parseInt(familiaId) : null, usuarioId ? parseInt(usuarioId) : null))
  } catch(e) { res.status(500).json({ erro: e.message }) }
})
router.post('/recorrentes', (req, res) => {
  try {
    const { usuarioId, descricao, valor, categoria, formaPagamento, diaMes, cartaoId } = req.body
    res.json(db.salvarRecorrente(parseInt(usuarioId), descricao, parseFloat(valor), categoria, formaPagamento, parseInt(diaMes) || 1, parseInt(cartaoId) || null))
  } catch(e) { res.status(500).json({ erro: e.message }) }
})
router.put('/recorrentes/:id', (req, res) => {
  try {
    const { descricao, valor, categoria, formaPagamento, diaMes, ativa, cartaoId } = req.body
    res.json(db.atualizarRecorrente(parseInt(req.params.id), descricao, parseFloat(valor), categoria, formaPagamento, parseInt(diaMes) || 1, ativa ?? 1, parseInt(cartaoId) || null))
  } catch(e) { res.status(500).json({ erro: e.message }) }
})
router.delete('/recorrentes/:id', (req, res) => {
  try {
    res.json(db.deletarRecorrente(parseInt(req.params.id)))
  } catch(e) { res.status(500).json({ erro: e.message }) }
})
// Cancelar / reativar uma assinatura sem precisar reenviar o cadastro inteiro.
router.patch('/recorrentes/:id/ativa', (req, res) => {
  try {
    db.setarAtivaRecorrente(parseInt(req.params.id), req.body.ativa ? 1 : 0)
    res.json({ ok: true })
  } catch(e) { res.status(500).json({ erro: e.message }) }
})
router.post('/recorrentes/processar', (req, res) => {
  try {
    const { familiaId, usuarioId } = req.body
    const criados = db.processarRecorrentes(familiaId ? parseInt(familiaId) : null, usuarioId ? parseInt(usuarioId) : null)
    res.json({ criados })
  } catch(e) { res.status(500).json({ erro: e.message }) }
})

// ===== META DE RENDA =====
router.get('/meta-renda', (req, res) => {
  try {
    const { familiaId, usuarioId, mes, ano } = req.query
    res.json(db.calcularMetaRenda(
      familiaId ? parseInt(familiaId) : null,
      usuarioId ? parseInt(usuarioId) : null,
      mes ? parseInt(mes) : null,
      ano ? parseInt(ano) : null
    ))
  } catch(e) { res.status(500).json({ erro: e.message }) }
})

router.post('/meta-renda', (req, res) => {
  try {
    const { familiaId, valorAlvo, ticketMedio } = req.body
    if (!valorAlvo) return res.status(400).json({ erro: 'Informe o valor da meta' })
    db.salvarMetaRenda(familiaId ? parseInt(familiaId) : 1, parseFloat(valorAlvo), parseFloat(ticketMedio) || 0)
    res.json({ ok: true })
  } catch(e) { res.status(500).json({ erro: e.message }) }
})

router.get('/calendario', (req, res) => {
  try {
    const { familiaId, usuarioId, mes, ano } = req.query
    res.json(db.calendarioMes(
      familiaId ? parseInt(familiaId) : null,
      usuarioId ? parseInt(usuarioId) : null,
      mes ? parseInt(mes) : null,
      ano ? parseInt(ano) : null
    ))
  } catch(e) { res.status(500).json({ erro: e.message }) }
})

// ===== CONTAS A PAGAR E "PAGUEI" =====
router.get('/contas-a-pagar', (req, res) => {
  try {
    const { familiaId, usuarioId, dias } = req.query
    res.json(db.contasAPagar(familiaId ? parseInt(familiaId) : null, usuarioId ? parseInt(usuarioId) : null, dias ? Math.min(parseInt(dias), 60) : 7))
  } catch(e) { res.status(500).json({ erro: e.message }) }
})

router.post('/pagamentos', (req, res) => {
  try {
    const { chave, usuarioId, contaId, valor } = req.body
    if (!chave) return res.status(400).json({ erro: 'Informe a conta' })
    db.marcarPago(String(chave), usuarioId ? parseInt(usuarioId) : null, contaId ? parseInt(contaId) : null, valor)
    res.json({ ok: true })
  } catch(e) { res.status(500).json({ erro: e.message }) }
})

router.delete('/pagamentos', (req, res) => {
  try {
    const { chave } = req.body
    if (!chave) return res.status(400).json({ erro: 'Informe a conta' })
    db.desmarcarPago(String(chave))
    res.json({ ok: true })
  } catch(e) { res.status(500).json({ erro: e.message }) }
})

// ===== NOTIFICAÇÕES PUSH =====
router.get('/push/chave', (req, res) => {
  try {
    res.json({ chave: require('./lembretes').configurarVapid() })
  } catch(e) { res.status(500).json({ erro: e.message }) }
})

router.post('/push/inscrever', (req, res) => {
  try {
    const { usuarioId, inscricao, dispositivo } = req.body
    if (!usuarioId || !inscricao?.endpoint || !inscricao?.keys?.p256dh || !inscricao?.keys?.auth) {
      return res.status(400).json({ erro: 'Inscrição incompleta' })
    }
    db.salvarInscricaoPush(parseInt(usuarioId), inscricao, dispositivo ? String(dispositivo).slice(0, 120) : null)
    res.json({ ok: true })
  } catch(e) { res.status(500).json({ erro: e.message }) }
})

router.post('/push/cancelar', (req, res) => {
  try {
    if (req.body.endpoint) db.removerInscricaoPush(String(req.body.endpoint))
    res.json({ ok: true })
  } catch(e) { res.status(500).json({ erro: e.message }) }
})

router.post('/push/teste', async (req, res) => {
  try {
    const { usuarioId } = req.body
    if (!usuarioId) return res.status(400).json({ erro: 'Usuário não informado' })
    const enviados = await require('./lembretes').enviarParaUsuario(parseInt(usuarioId), {
      title: '🔔 Lembretes ativados',
      body: 'Você vai ser avisado 2 dias antes de cada conta vencer, no dia, e se o orçamento apertar.',
      url: '/?aba=agenda', tag: 'teste'
    })
    res.json({ enviados })
  } catch(e) { res.status(500).json({ erro: e.message }) }
})

router.get('/dividas/custo', (req, res) => {
  try {
    const { familiaId, usuarioId } = req.query
    res.json(db.custoDividas(familiaId ? parseInt(familiaId) : null, usuarioId ? parseInt(usuarioId) : null))
  } catch(e) { res.status(500).json({ erro: e.message }) }
})

module.exports = router
