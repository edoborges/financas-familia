const express = require('express')
const router = express.Router()
const db = require('./database')
const { processarMensagem } = require('./processador')
const { gerarPlanoEconomia } = require('./ai')

router.get('/status', (req, res) => {
  const usuarios = db.listarUsuarios()
  res.json({ configurado: usuarios.length > 0, usuarios })
})

router.get('/usuarios', (req, res) => res.json(db.listarUsuarios()))

router.post('/usuarios', (req, res) => {
  try {
    const { nome, salario, telefone: tel, pin } = req.body
    if (!nome) return res.status(400).json({ erro: 'Nome obrigatório' })
    // usa celular fornecido ou gera identificador pelo nome
    const telefone = (tel && tel.trim()) ? tel.trim().replace(/\D/g, '') : nome.toLowerCase().replace(/\s+/g, '')
    db.criarUsuario(nome, telefone, salario || 0, pin || '0000')
    res.json(db.obterUsuario(telefone))
  } catch (e) {
    console.error('POST /usuarios erro:', e.message)
    res.status(500).json({ erro: e.message })
  }
})

router.post('/login', (req, res) => {
  const { usuarioId, pin } = req.body
  if (!usuarioId || !pin) return res.status(400).json({ erro: 'Dados incompletos' })
  const usuario = db.autenticarUsuario(parseInt(usuarioId), String(pin))
  if (!usuario) return res.status(401).json({ erro: 'PIN incorreto' })
  res.json(usuario)
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
  res.json(db.obterUsuarioPorId(parseInt(req.params.id)))
})

router.get('/alertas', (req, res) => {
  res.json(db.alertasVencimento())
})

router.post('/chat', async (req, res) => {
  const { mensagem, usuarioId } = req.body
  if (!mensagem || !usuarioId) return res.status(400).json({ erro: 'Dados incompletos' })
  const resultado = await processarMensagem(usuarioId, mensagem)
  res.json(resultado)
})

router.get('/resumo', (req, res) => {
  try {
    res.json(db.resumoFinanceiro())
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
    const { mes, ano } = req.query
    res.json(db.listarGastosMes(mes ? parseInt(mes) : null, ano ? parseInt(ano) : null))
  } catch (e) {
    res.status(500).json({ erro: e.message })
  }
})

router.get('/gastos/recentes', (req, res) => {
  try {
    res.json(db.ultimosGastos(30))
  } catch (e) {
    res.status(500).json({ erro: e.message })
  }
})

router.get('/gastos/categorias', (req, res) => {
  const { mes, ano } = req.query
  res.json(db.gastosPorCategoria(mes ? parseInt(mes) : null, ano ? parseInt(ano) : null))
})

router.get('/gastos/evolucao', (req, res) => res.json(db.gastosPorMes(6)))

router.get('/cartoes', (req, res) => {
  const { usuarioId } = req.query
  res.json(db.listarCartoes(usuarioId ? parseInt(usuarioId) : null))
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
  const { usuarioId } = req.query
  res.json(db.listarContas(usuarioId ? parseInt(usuarioId) : null))
})

router.post('/contas', (req, res) => {
  try {
    const { usuarioId, nome, banco, tipo, saldo, cor } = req.body
    if (!usuarioId || !nome) return res.status(400).json({ erro: 'Dados incompletos' })
    const result = db.criarConta(usuarioId, nome, banco, tipo, saldo, cor)
    res.json({ id: Number(result.lastInsertRowid) })
  } catch (e) {
    console.error('POST /contas erro:', e.message)
    res.status(500).json({ erro: e.message })
  }
})

router.put('/contas/:id', (req, res) => {
  const { nome, banco, tipo, saldo } = req.body
  if (nome) db.atualizarConta(req.params.id, nome, banco, tipo, saldo)
  else db.atualizarSaldoConta(req.params.id, saldo)
  res.json({ ok: true })
})

router.delete('/contas/:id', (req, res) => {
  db.deletarConta(req.params.id)
  res.json({ ok: true })
})

router.get('/metas', (req, res) => res.json(db.listarMetas()))

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
  const { usuarioId } = req.query
  res.json(db.listarEmprestimos(usuarioId ? parseInt(usuarioId) : null))
})

router.post('/emprestimos', (req, res) => {
  try {
    const { usuarioId, tipo, descricao, credor, valorTotal, parcelaMensal, totalParcelas, taxaJuros, dataVencimento } = req.body
    if (!usuarioId || !descricao || !credor || !valorTotal) return res.status(400).json({ erro: 'Dados incompletos' })
    const result = db.criarEmprestimo(usuarioId, tipo, descricao, credor, valorTotal, parcelaMensal, totalParcelas, taxaJuros, dataVencimento)
    res.json({ id: Number(result.lastInsertRowid) })
  } catch (e) {
    console.error('POST /emprestimos erro:', e.message)
    res.status(500).json({ erro: e.message })
  }
})

router.put('/emprestimos/:id', (req, res) => {
  const { tipo, descricao, credor, valorTotal, parcelaMensal, totalParcelas, taxaJuros, dataVencimento, valorPago, parcelasPagas } = req.body
  db.editarEmprestimo(req.params.id, tipo, descricao, credor, valorTotal, parcelaMensal, totalParcelas, taxaJuros, dataVencimento, valorPago, parcelasPagas)
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

// Receitas
router.get('/receitas', (req, res) => {
  const { usuarioId } = req.query
  res.json(db.listarReceitas(usuarioId ? parseInt(usuarioId) : null))
})

router.post('/receitas', (req, res) => {
  try {
    const { usuarioId, valor, descricao, dataReceita } = req.body
    if (!usuarioId || !valor) return res.status(400).json({ erro: 'Dados incompletos' })
    const result = db.registrarReceita(usuarioId, valor, descricao || 'Receita', dataReceita || null)
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

router.get('/receitas/evolucao', (req, res) => {
  res.json(db.receitasPorMes(6))
})

router.get('/projecao', (req, res) => {
  try {
    res.json(db.projecaoGastosMeses(4))
  } catch (e) {
    res.status(500).json({ erro: e.message })
  }
})

router.get('/plano', async (req, res) => {
  const resumo = db.resumoFinanceiro()
  const plano = await gerarPlanoEconomia(resumo)
  res.json({ plano })
})

module.exports = router
