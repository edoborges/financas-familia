const express = require('express')
const router = express.Router()
const multer = require('multer')
const db = require('./database')
const { processarMensagem } = require('./processador')
const { gerarPlanoEconomia, analisarArquivoFinanceiro } = require('./ai')

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
  const { usuarioId } = req.query
  res.json(db.listarImportacoes(usuarioId ? parseInt(usuarioId) : null))
})

// Exportar CSV do mês
router.get('/exportar/csv', (req, res) => {
  try {
    const { mes, ano } = req.query
    const gastos = db.listarGastosExport(mes ? parseInt(mes) : null, ano ? parseInt(ano) : null)
    const receitas = db.listarReceitasExport(mes ? parseInt(mes) : null, ano ? parseInt(ano) : null)

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
    const { mes, ano } = req.query
    const gastos = db.listarGastosExport(mes ? parseInt(mes) : null, ano ? parseInt(ano) : null)
    const receitas = db.listarReceitasExport(mes ? parseInt(mes) : null, ano ? parseInt(ano) : null)
    const resumo = db.resumoFinanceiro()
    res.json({ gastos, receitas, resumo })
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
