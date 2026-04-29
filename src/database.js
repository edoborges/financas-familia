const { DatabaseSync } = require('node:sqlite')
const path = require('path')
const fs = require('fs')

const dataPath = process.env.DATA_PATH || './data'
if (!fs.existsSync(dataPath)) fs.mkdirSync(dataPath, { recursive: true })

const db = new DatabaseSync(path.join(dataPath, 'financeiro.db'))
db.exec('PRAGMA journal_mode = WAL')
// Migrações
try { db.exec("ALTER TABLE usuarios ADD COLUMN pin TEXT DEFAULT '0000'") } catch(e) {}
try { db.exec("ALTER TABLE gastos ADD COLUMN parcela_atual INTEGER DEFAULT 1") } catch(e) {}
try { db.exec("ALTER TABLE gastos ADD COLUMN grupo_parcela INTEGER") } catch(e) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    telefone TEXT UNIQUE NOT NULL,
    salario REAL DEFAULT 0,
    pin TEXT DEFAULT '0000',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS contas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER,
    nome TEXT NOT NULL,
    banco TEXT DEFAULT '',
    tipo TEXT DEFAULT 'corrente',
    saldo REAL DEFAULT 0,
    cor TEXT DEFAULT '#2980b9',
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );

  CREATE TABLE IF NOT EXISTS cartoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER,
    nome TEXT NOT NULL,
    bandeira TEXT DEFAULT 'Visa',
    limite REAL DEFAULT 0,
    gasto_atual REAL DEFAULT 0,
    dia_fechamento INTEGER DEFAULT 1,
    dia_vencimento INTEGER DEFAULT 10,
    cor1 TEXT DEFAULT '#1a1a2e',
    cor2 TEXT DEFAULT '#16213e',
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );

  CREATE TABLE IF NOT EXISTS gastos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    cartao_id INTEGER,
    conta_id INTEGER,
    descricao TEXT NOT NULL,
    valor REAL NOT NULL,
    categoria TEXT DEFAULT 'Outros',
    forma_pagamento TEXT DEFAULT 'dinheiro',
    data_gasto DATE DEFAULT (date('now','localtime')),
    parcelas INTEGER DEFAULT 1,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    FOREIGN KEY (cartao_id) REFERENCES cartoes(id),
    FOREIGN KEY (conta_id) REFERENCES contas(id)
  );

  CREATE TABLE IF NOT EXISTS metas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    categoria TEXT DEFAULT 'Outros',
    valor_alvo REAL NOT NULL,
    valor_atual REAL DEFAULT 0,
    prazo DATE,
    descricao TEXT,
    emoji TEXT DEFAULT '🎯',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS emprestimos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    tipo TEXT DEFAULT 'emprestimo',
    descricao TEXT NOT NULL,
    credor TEXT NOT NULL,
    valor_total REAL NOT NULL,
    valor_pago REAL DEFAULT 0,
    parcela_mensal REAL DEFAULT 0,
    total_parcelas INTEGER DEFAULT 1,
    parcelas_pagas INTEGER DEFAULT 0,
    taxa_juros REAL DEFAULT 0,
    data_vencimento DATE,
    status TEXT DEFAULT 'ativo',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );

  CREATE TABLE IF NOT EXISTS receitas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    valor REAL NOT NULL,
    descricao TEXT DEFAULT 'Salário',
    data_receita DATE DEFAULT (date('now','localtime')),
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );
`)

// ===== USUÁRIOS =====
function obterUsuario(telefone) {
  return db.prepare('SELECT * FROM usuarios WHERE telefone = ?').get(telefone)
}
function obterUsuarioPorId(id) {
  return db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id)
}
function criarUsuario(nome, telefone, salario = 0, pin = '0000') {
  return db.prepare('INSERT OR IGNORE INTO usuarios (nome, telefone, salario, pin) VALUES (?, ?, ?, ?)').run(nome, telefone, salario, pin)
}
function autenticarUsuario(usuarioId, pin) {
  return db.prepare('SELECT * FROM usuarios WHERE id = ? AND pin = ?').get(usuarioId, pin)
}
function atualizarSalario(telefone, salario) {
  return db.prepare('UPDATE usuarios SET salario = ? WHERE telefone = ?').run(salario, telefone)
}
function editarUsuario(id, nome, salario, telefone, pin) {
  return db.prepare('UPDATE usuarios SET nome=?, salario=?, telefone=?, pin=? WHERE id=?').run(nome, salario, telefone, pin, id)
}
function listarUsuarios() {
  return db.prepare('SELECT * FROM usuarios').all()
}

// ===== CONTAS =====
function criarConta(usuarioId, nome, banco, tipo, saldo, cor) {
  return db.prepare('INSERT INTO contas (usuario_id, nome, banco, tipo, saldo, cor) VALUES (?, ?, ?, ?, ?, ?)').run(usuarioId, nome, banco || '', tipo || 'corrente', saldo || 0, cor || '#2980b9')
}
function listarContas(usuarioId = null) {
  if (usuarioId) return db.prepare('SELECT c.*, u.nome as usuario_nome FROM contas c JOIN usuarios u ON c.usuario_id = u.id WHERE c.usuario_id = ?').all(usuarioId)
  return db.prepare('SELECT c.*, u.nome as usuario_nome FROM contas c JOIN usuarios u ON c.usuario_id = u.id').all()
}
function atualizarSaldoConta(id, saldo) {
  return db.prepare('UPDATE contas SET saldo = ? WHERE id = ?').run(saldo, id)
}
function atualizarConta(id, nome, banco, tipo, saldo) {
  return db.prepare('UPDATE contas SET nome=?, banco=?, tipo=?, saldo=? WHERE id=?').run(nome, banco, tipo, saldo, id)
}
function deletarConta(id) {
  return db.prepare('DELETE FROM contas WHERE id = ?').run(id)
}

// ===== CARTÕES =====
function criarCartao(usuarioId, nome, limite, diaFechamento = 1, diaVencimento = 10, bandeira = 'Visa', cor1, cor2) {
  const cores = gerarCoresCartao(nome)
  return db.prepare('INSERT INTO cartoes (usuario_id, nome, bandeira, limite, dia_fechamento, dia_vencimento, cor1, cor2) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(usuarioId, nome, bandeira, limite, diaFechamento, diaVencimento, cor1 || cores[0], cor2 || cores[1])
}
function gerarCoresCartao(nome) {
  const paletas = [
    ['#8A05BE','#4A0082'],['#003B6F','#1565C0'],['#CC092F','#8B0000'],
    ['#006400','#1a472a'],['#1a1a2e','#16213e'],['#FF6B35','#cc4400'],
  ]
  const idx = nome.charCodeAt(0) % paletas.length
  return paletas[idx]
}
function listarCartoes(usuarioId = null) {
  if (usuarioId) return db.prepare('SELECT c.*, u.nome as usuario_nome FROM cartoes c JOIN usuarios u ON c.usuario_id = u.id WHERE c.usuario_id = ?').all(usuarioId)
  return db.prepare('SELECT c.*, u.nome as usuario_nome FROM cartoes c JOIN usuarios u ON c.usuario_id = u.id').all()
}
function obterCartaoPorNome(nome, usuarioId) {
  return db.prepare('SELECT * FROM cartoes WHERE LOWER(nome) LIKE LOWER(?) AND usuario_id = ?').get(`%${nome}%`, usuarioId)
}
function atualizarGastoCartao(cartaoId, valor) {
  return db.prepare('UPDATE cartoes SET gasto_atual = gasto_atual + ? WHERE id = ?').run(valor, cartaoId)
}
function atualizarFaturaCartao(id, gastoAtual) {
  return db.prepare('UPDATE cartoes SET gasto_atual = ? WHERE id = ?').run(gastoAtual, id)
}
function deletarCartao(id) {
  return db.prepare('DELETE FROM cartoes WHERE id = ?').run(id)
}

// ===== GASTOS =====
function registrarGasto(usuarioId, descricao, valor, categoria, formaPagamento, cartaoId = null, parcelas = 1, contaId = null) {
  if (parcelas > 1) return registrarCompraParcelada(usuarioId, descricao, valor, categoria, formaPagamento, cartaoId, parcelas, contaId)
  const result = db.prepare(`INSERT INTO gastos (usuario_id, cartao_id, conta_id, descricao, valor, categoria, forma_pagamento, parcelas, parcela_atual) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`).run(usuarioId, cartaoId, contaId, descricao, valor, categoria, formaPagamento, 1)
  if (cartaoId) atualizarGastoCartao(cartaoId, valor)
  return result
}

function registrarCompraParcelada(usuarioId, descricao, valor, categoria, formaPagamento, cartaoId, numParcelas, contaId) {
  const valorParcela = +(valor / numParcelas).toFixed(2)
  const now = new Date()
  let grupoId = null
  for (let i = 0; i < numParcelas; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, now.getDate())
    const dataStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    const desc = `${descricao} (${i+1}/${numParcelas})`
    const result = db.prepare(`INSERT INTO gastos (usuario_id, cartao_id, conta_id, descricao, valor, categoria, forma_pagamento, data_gasto, parcelas, parcela_atual, grupo_parcela) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(usuarioId, cartaoId, contaId, desc, valorParcela, categoria, formaPagamento, dataStr, numParcelas, i+1, grupoId)
    if (i === 0) {
      grupoId = Number(result.lastInsertRowid)
      db.prepare('UPDATE gastos SET grupo_parcela = ? WHERE id = ?').run(grupoId, grupoId)
    }
  }
  // Só a parcela do mês atual conta na fatura do cartão
  if (cartaoId) atualizarGastoCartao(cartaoId, valorParcela)
  return grupoId
}
function listarGastosMes(mes = null, ano = null) {
  const now = new Date()
  const mesStr = `${ano || now.getFullYear()}-${String(mes || now.getMonth() + 1).padStart(2, '0')}`
  return db.prepare(`SELECT g.*, u.nome as usuario_nome, c.nome as cartao_nome FROM gastos g JOIN usuarios u ON g.usuario_id = u.id LEFT JOIN cartoes c ON g.cartao_id = c.id WHERE strftime('%Y-%m', g.data_gasto) = ? ORDER BY g.criado_em DESC`).all(mesStr)
}
function totalGastosMes(usuarioId = null) {
  const now = new Date()
  const mesStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  if (usuarioId) return db.prepare(`SELECT COALESCE(SUM(valor), 0) as total FROM gastos WHERE usuario_id = ? AND strftime('%Y-%m', data_gasto) = ?`).get(usuarioId, mesStr)
  return db.prepare(`SELECT COALESCE(SUM(valor), 0) as total FROM gastos WHERE strftime('%Y-%m', data_gasto) = ?`).get(mesStr)
}
function gastosPorCategoria(mes = null, ano = null) {
  const now = new Date()
  const mesStr = `${ano || now.getFullYear()}-${String(mes || now.getMonth() + 1).padStart(2, '0')}`
  return db.prepare(`SELECT categoria, SUM(valor) as total, COUNT(*) as quantidade FROM gastos WHERE strftime('%Y-%m', data_gasto) = ? GROUP BY categoria ORDER BY total DESC`).all(mesStr)
}
function ultimosGastos(limite = 10) {
  return db.prepare(`SELECT g.*, u.nome as usuario_nome, c.nome as cartao_nome FROM gastos g JOIN usuarios u ON g.usuario_id = u.id LEFT JOIN cartoes c ON g.cartao_id = c.id ORDER BY g.criado_em DESC LIMIT ?`).all(limite)
}
function gastosPorMes(meses = 6) {
  return db.prepare(`SELECT strftime('%Y-%m', data_gasto) as mes, SUM(valor) as total FROM gastos GROUP BY mes ORDER BY mes DESC LIMIT ?`).all(meses)
}

// ===== RECEITAS =====
function registrarReceita(usuarioId, valor, descricao = 'Salário', dataReceita = null) {
  const data = dataReceita || new Date().toISOString().split('T')[0]
  return db.prepare('INSERT INTO receitas (usuario_id, valor, descricao, data_receita) VALUES (?, ?, ?, ?)').run(usuarioId, valor, descricao, data)
}
function listarReceitas(usuarioId = null) {
  if (usuarioId) return db.prepare('SELECT r.*, u.nome as usuario_nome FROM receitas r JOIN usuarios u ON r.usuario_id = u.id WHERE r.usuario_id = ? ORDER BY r.data_receita DESC').all(usuarioId)
  return db.prepare('SELECT r.*, u.nome as usuario_nome FROM receitas r JOIN usuarios u ON r.usuario_id = u.id ORDER BY r.data_receita DESC').all()
}
function totalReceitasMes(usuarioId = null) {
  const now = new Date()
  const mesStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  if (usuarioId) return db.prepare(`SELECT COALESCE(SUM(valor), 0) as total FROM receitas WHERE usuario_id = ? AND strftime('%Y-%m', data_receita) = ?`).get(usuarioId, mesStr)
  return db.prepare(`SELECT COALESCE(SUM(valor), 0) as total FROM receitas WHERE strftime('%Y-%m', data_receita) = ?`).get(mesStr)
}
function deletarReceita(id) {
  return db.prepare('DELETE FROM receitas WHERE id = ?').run(id)
}
function receitasPorMes(meses = 6) {
  return db.prepare(`SELECT strftime('%Y-%m', data_receita) as mes, SUM(valor) as total FROM receitas GROUP BY mes ORDER BY mes DESC LIMIT ?`).all(meses)
}

// ===== PROJEÇÃO =====
function projecaoGastosMeses(meses = 4) {
  const now = new Date()
  const results = []
  for (let i = 1; i <= meses; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const mesStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const row = db.prepare(`SELECT COALESCE(SUM(valor), 0) as total FROM gastos WHERE strftime('%Y-%m', data_gasto) = ?`).get(mesStr)
    results.push({ mes: mesStr, total: Number(row.total) })
  }
  return results
}

// ===== METAS =====
function criarMeta(nome, valorAlvo, prazo = null, descricao = null, categoria = 'Outros', emoji = '🎯') {
  return db.prepare('INSERT INTO metas (nome, valor_alvo, prazo, descricao, categoria, emoji) VALUES (?, ?, ?, ?, ?, ?)').run(nome, valorAlvo, prazo, descricao, categoria, emoji)
}
function listarMetas() {
  return db.prepare('SELECT * FROM metas ORDER BY criado_em DESC').all()
}
function atualizarMeta(id, valorAtual) {
  return db.prepare('UPDATE metas SET valor_atual = ? WHERE id = ?').run(valorAtual, id)
}

// ===== EMPRÉSTIMOS =====
function criarEmprestimo(usuarioId, tipo, descricao, credor, valorTotal, parcelaMensal, totalParcelas, taxaJuros, dataVencimento) {
  return db.prepare(`INSERT INTO emprestimos (usuario_id, tipo, descricao, credor, valor_total, parcela_mensal, total_parcelas, taxa_juros, data_vencimento)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(usuarioId, tipo || 'emprestimo', descricao, credor, valorTotal, parcelaMensal || 0, totalParcelas || 1, taxaJuros || 0, dataVencimento || null)
}
function listarEmprestimos(usuarioId = null) {
  if (usuarioId) return db.prepare("SELECT e.*, u.nome as usuario_nome FROM emprestimos e JOIN usuarios u ON e.usuario_id = u.id WHERE e.usuario_id = ? AND e.status = 'ativo' ORDER BY e.criado_em DESC").all(usuarioId)
  return db.prepare("SELECT e.*, u.nome as usuario_nome FROM emprestimos e JOIN usuarios u ON e.usuario_id = u.id WHERE e.status = 'ativo' ORDER BY e.criado_em DESC").all()
}
function atualizarEmprestimo(id, valorPago, parcelasPagas) {
  const emp = db.prepare('SELECT * FROM emprestimos WHERE id = ?').get(id)
  if (!emp) return
  const novoValorPago = Number(emp.valor_pago) + valorPago
  const novasParcelas = Number(emp.parcelas_pagas) + parcelasPagas
  const status = novoValorPago >= Number(emp.valor_total) ? 'quitado' : 'ativo'
  return db.prepare('UPDATE emprestimos SET valor_pago=?, parcelas_pagas=?, status=? WHERE id=?').run(novoValorPago, novasParcelas, status, id)
}
function editarEmprestimo(id, tipo, descricao, credor, valorTotal, parcelaMensal, totalParcelas, taxaJuros, dataVencimento, valorPago, parcelasPagas) {
  const status = valorPago >= valorTotal ? 'quitado' : 'ativo'
  return db.prepare('UPDATE emprestimos SET tipo=?, descricao=?, credor=?, valor_total=?, parcela_mensal=?, total_parcelas=?, taxa_juros=?, data_vencimento=?, valor_pago=?, parcelas_pagas=?, status=? WHERE id=?')
    .run(tipo || 'emprestimo', descricao, credor, valorTotal, parcelaMensal, totalParcelas, taxaJuros, dataVencimento, valorPago, parcelasPagas, status, id)
}
function deletarEmprestimo(id) {
  return db.prepare('DELETE FROM emprestimos WHERE id = ?').run(id)
}
function totalDividas() {
  const result = db.prepare("SELECT COALESCE(SUM(valor_total - valor_pago), 0) as total FROM emprestimos WHERE status = 'ativo'").get()
  return Number(result.total)
}

// ===== RESUMO =====
function resumoFinanceiro() {
  const usuarios = listarUsuarios()
  const salarioTotal = usuarios.reduce((acc, u) => acc + u.salario, 0)
  const { total: gastosMes } = totalGastosMes()
  const { total: receitasExtras } = totalReceitasMes()
  const rendaTotal = salarioTotal + Number(receitasExtras || 0)
  const cartoes = listarCartoes()
  const contas = listarContas()
  const metas = listarMetas()
  const categorias = gastosPorCategoria()
  const evolucao = gastosPorMes(6)
  const saldoContas = contas.reduce((a, c) => a + c.saldo, 0)
  const emprestimos = listarEmprestimos()
  const totalEmDividas = totalDividas()
  const projecao = projecaoGastosMeses(4)
  return { salarioTotal, rendaTotal, receitasExtras: Number(receitasExtras || 0), gastosMes, saldoDisponivel: rendaTotal - gastosMes, saldoContas, cartoes, contas, metas, categorias, usuarios, evolucao, emprestimos, totalEmDividas, projecao }
}

// ===== ALERTAS =====
function alertasVencimento() {
  const hoje = new Date()
  const em7dias = new Date(hoje)
  em7dias.setDate(hoje.getDate() + 7)
  const em7diasStr = em7dias.toISOString().split('T')[0]
  return db.prepare(`
    SELECT e.*, u.nome as usuario_nome
    FROM emprestimos e JOIN usuarios u ON e.usuario_id = u.id
    WHERE e.status = 'ativo'
    AND e.data_vencimento IS NOT NULL
    AND e.data_vencimento <= ?
    ORDER BY e.data_vencimento ASC
  `).all(em7diasStr)
}

module.exports = {
  obterUsuario, obterUsuarioPorId, criarUsuario, autenticarUsuario, atualizarSalario, editarUsuario, listarUsuarios,
  criarConta, listarContas, atualizarSaldoConta, atualizarConta, deletarConta,
  criarCartao, listarCartoes, obterCartaoPorNome, atualizarGastoCartao, atualizarFaturaCartao, deletarCartao,
  criarEmprestimo, listarEmprestimos, atualizarEmprestimo, editarEmprestimo, deletarEmprestimo, totalDividas,
  registrarGasto, listarGastosMes, totalGastosMes, gastosPorCategoria, ultimosGastos, gastosPorMes,
  criarMeta, listarMetas, atualizarMeta,
  registrarReceita, listarReceitas, totalReceitasMes, deletarReceita, receitasPorMes,
  projecaoGastosMeses,
  alertasVencimento,
  resumoFinanceiro
}
