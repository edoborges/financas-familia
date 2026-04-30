const { DatabaseSync } = require('node:sqlite')
const path = require('path')
const fs = require('fs')

const dataPath = process.env.DATA_PATH || './data'
if (!fs.existsSync(dataPath)) fs.mkdirSync(dataPath, { recursive: true })

const db = new DatabaseSync(path.join(dataPath, 'financeiro.db'))
db.exec('PRAGMA journal_mode = WAL')

// Migrações seguras
try { db.exec("ALTER TABLE usuarios ADD COLUMN pin TEXT DEFAULT '0000'") } catch(e) {}
try { db.exec("ALTER TABLE gastos ADD COLUMN parcela_atual INTEGER DEFAULT 1") } catch(e) {}
try { db.exec("ALTER TABLE gastos ADD COLUMN grupo_parcela INTEGER") } catch(e) {}
try { db.exec("ALTER TABLE gastos ADD COLUMN origem TEXT DEFAULT 'manual'") } catch(e) {}
try { db.exec("ALTER TABLE receitas ADD COLUMN origem TEXT DEFAULT 'manual'") } catch(e) {}
try { db.exec("ALTER TABLE usuarios ADD COLUMN familia_id INTEGER DEFAULT 1") } catch(e) {}
try { db.exec("ALTER TABLE usuarios ADD COLUMN role TEXT DEFAULT 'membro'") } catch(e) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS familias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    telefone TEXT UNIQUE NOT NULL,
    salario REAL DEFAULT 0,
    pin TEXT DEFAULT '0000',
    familia_id INTEGER DEFAULT 1,
    role TEXT DEFAULT 'membro',
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
    familia_id INTEGER DEFAULT 1,
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

  CREATE TABLE IF NOT EXISTS importacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    descricao TEXT,
    qtd_registros INTEGER DEFAULT 0,
    duplicatas_ignoradas INTEGER DEFAULT 0,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );

  CREATE TABLE IF NOT EXISTS receitas_programadas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    descricao TEXT NOT NULL,
    valor REAL NOT NULL,
    tipo TEXT DEFAULT 'mensal',
    dia_mes INTEGER,
    dia_semana INTEGER,
    observacao TEXT,
    ativa INTEGER DEFAULT 1,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );
`)

// Seed: garante que a família principal existe e usuários legados ficam nela
const famCount = db.prepare('SELECT COUNT(*) as n FROM familias').get()
if (famCount.n === 0) {
  db.exec("INSERT INTO familias (id, nome) VALUES (1, 'Família Principal')")
}
db.exec("UPDATE usuarios SET familia_id = 1 WHERE familia_id IS NULL OR familia_id = 0")
try { db.exec("ALTER TABLE metas ADD COLUMN familia_id INTEGER DEFAULT 1") } catch(e) {}

// ===== FAMÍLIAS =====
function criarFamilia(nome) {
  return db.prepare('INSERT INTO familias (nome) VALUES (?)').run(nome)
}
function listarFamilias() {
  return db.prepare(`
    SELECT f.*, COUNT(u.id) as total_membros
    FROM familias f LEFT JOIN usuarios u ON u.familia_id = f.id
    GROUP BY f.id ORDER BY f.id
  `).all()
}
function obterFamilia(id) {
  return db.prepare('SELECT * FROM familias WHERE id = ?').get(id)
}
function editarFamilia(id, nome) {
  return db.prepare('UPDATE familias SET nome = ? WHERE id = ?').run(nome, id)
}

// ===== USUÁRIOS =====
function obterUsuario(telefone) {
  return db.prepare('SELECT * FROM usuarios WHERE telefone = ?').get(telefone)
}
function obterUsuarioPorId(id) {
  return db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id)
}
function criarUsuario(nome, telefone, salario = 0, pin = '0000', familiaId = 1, role = 'membro') {
  return db.prepare('INSERT OR IGNORE INTO usuarios (nome, telefone, salario, pin, familia_id, role) VALUES (?, ?, ?, ?, ?, ?)').run(nome, telefone, salario, pin, familiaId, role)
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
function listarUsuarios(familiaId = null) {
  if (familiaId) return db.prepare('SELECT * FROM usuarios WHERE familia_id = ?').all(familiaId)
  return db.prepare('SELECT * FROM usuarios').all()
}

// ===== CONTAS =====
function criarConta(usuarioId, nome, banco, tipo, saldo, cor) {
  return db.prepare('INSERT INTO contas (usuario_id, nome, banco, tipo, saldo, cor) VALUES (?, ?, ?, ?, ?, ?)').run(usuarioId, nome, banco || '', tipo || 'corrente', saldo || 0, cor || '#2980b9')
}
function listarContas(familiaId = null, usuarioId = null) {
  if (usuarioId) return db.prepare('SELECT c.*, u.nome as usuario_nome FROM contas c JOIN usuarios u ON c.usuario_id = u.id WHERE c.usuario_id = ?').all(usuarioId)
  if (familiaId) return db.prepare('SELECT c.*, u.nome as usuario_nome FROM contas c JOIN usuarios u ON c.usuario_id = u.id WHERE u.familia_id = ?').all(familiaId)
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
function listarCartoes(familiaId = null, usuarioId = null) {
  if (usuarioId) return db.prepare('SELECT c.*, u.nome as usuario_nome FROM cartoes c JOIN usuarios u ON c.usuario_id = u.id WHERE c.usuario_id = ?').all(usuarioId)
  if (familiaId) return db.prepare('SELECT c.*, u.nome as usuario_nome FROM cartoes c JOIN usuarios u ON c.usuario_id = u.id WHERE u.familia_id = ?').all(familiaId)
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
  if (cartaoId) atualizarGastoCartao(cartaoId, valorParcela)
  return grupoId
}

function listarGastosMes(mes = null, ano = null, familiaId = null, usuarioId = null) {
  const now = new Date()
  const mesStr = `${ano || now.getFullYear()}-${String(mes || now.getMonth() + 1).padStart(2, '0')}`
  if (usuarioId) {
    return db.prepare(`SELECT g.*, u.nome as usuario_nome, c.nome as cartao_nome FROM gastos g JOIN usuarios u ON g.usuario_id = u.id LEFT JOIN cartoes c ON g.cartao_id = c.id WHERE strftime('%Y-%m', g.data_gasto) = ? AND g.usuario_id = ? ORDER BY g.criado_em DESC`).all(mesStr, usuarioId)
  }
  if (familiaId) {
    return db.prepare(`SELECT g.*, u.nome as usuario_nome, c.nome as cartao_nome FROM gastos g JOIN usuarios u ON g.usuario_id = u.id LEFT JOIN cartoes c ON g.cartao_id = c.id WHERE strftime('%Y-%m', g.data_gasto) = ? AND u.familia_id = ? ORDER BY g.criado_em DESC`).all(mesStr, familiaId)
  }
  return db.prepare(`SELECT g.*, u.nome as usuario_nome, c.nome as cartao_nome FROM gastos g JOIN usuarios u ON g.usuario_id = u.id LEFT JOIN cartoes c ON g.cartao_id = c.id WHERE strftime('%Y-%m', g.data_gasto) = ? ORDER BY g.criado_em DESC`).all(mesStr)
}

function totalGastosMes(familiaId = null, usuarioId = null) {
  const now = new Date()
  const mesStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  if (usuarioId) {
    return db.prepare(`SELECT COALESCE(SUM(valor), 0) as total FROM gastos WHERE usuario_id = ? AND strftime('%Y-%m', data_gasto) = ?`).get(usuarioId, mesStr)
  }
  if (familiaId) {
    return db.prepare(`SELECT COALESCE(SUM(g.valor), 0) as total FROM gastos g JOIN usuarios u ON g.usuario_id = u.id WHERE u.familia_id = ? AND strftime('%Y-%m', g.data_gasto) = ?`).get(familiaId, mesStr)
  }
  return db.prepare(`SELECT COALESCE(SUM(valor), 0) as total FROM gastos WHERE strftime('%Y-%m', data_gasto) = ?`).get(mesStr)
}

function gastosPorCategoria(mes = null, ano = null, familiaId = null, usuarioId = null) {
  const now = new Date()
  const mesStr = `${ano || now.getFullYear()}-${String(mes || now.getMonth() + 1).padStart(2, '0')}`
  if (usuarioId) {
    return db.prepare(`SELECT categoria, SUM(valor) as total, COUNT(*) as quantidade FROM gastos WHERE strftime('%Y-%m', data_gasto) = ? AND usuario_id = ? GROUP BY categoria ORDER BY total DESC`).all(mesStr, usuarioId)
  }
  if (familiaId) {
    return db.prepare(`SELECT g.categoria, SUM(g.valor) as total, COUNT(*) as quantidade FROM gastos g JOIN usuarios u ON g.usuario_id = u.id WHERE strftime('%Y-%m', g.data_gasto) = ? AND u.familia_id = ? GROUP BY g.categoria ORDER BY total DESC`).all(mesStr, familiaId)
  }
  return db.prepare(`SELECT categoria, SUM(valor) as total, COUNT(*) as quantidade FROM gastos WHERE strftime('%Y-%m', data_gasto) = ? GROUP BY categoria ORDER BY total DESC`).all(mesStr)
}

function ultimosGastos(limite = 10, familiaId = null, usuarioId = null) {
  if (usuarioId) {
    return db.prepare(`SELECT g.*, u.nome as usuario_nome, c.nome as cartao_nome FROM gastos g JOIN usuarios u ON g.usuario_id = u.id LEFT JOIN cartoes c ON g.cartao_id = c.id WHERE g.usuario_id = ? ORDER BY g.criado_em DESC LIMIT ?`).all(usuarioId, limite)
  }
  if (familiaId) {
    return db.prepare(`SELECT g.*, u.nome as usuario_nome, c.nome as cartao_nome FROM gastos g JOIN usuarios u ON g.usuario_id = u.id LEFT JOIN cartoes c ON g.cartao_id = c.id WHERE u.familia_id = ? ORDER BY g.criado_em DESC LIMIT ?`).all(familiaId, limite)
  }
  return db.prepare(`SELECT g.*, u.nome as usuario_nome, c.nome as cartao_nome FROM gastos g JOIN usuarios u ON g.usuario_id = u.id LEFT JOIN cartoes c ON g.cartao_id = c.id ORDER BY g.criado_em DESC LIMIT ?`).all(limite)
}

function gastosPorMes(meses = 6, familiaId = null, usuarioId = null) {
  if (usuarioId) {
    return db.prepare(`SELECT strftime('%Y-%m', data_gasto) as mes, SUM(valor) as total FROM gastos WHERE usuario_id = ? GROUP BY mes ORDER BY mes DESC LIMIT ?`).all(usuarioId, meses)
  }
  if (familiaId) {
    return db.prepare(`SELECT strftime('%Y-%m', g.data_gasto) as mes, SUM(g.valor) as total FROM gastos g JOIN usuarios u ON g.usuario_id = u.id WHERE u.familia_id = ? GROUP BY mes ORDER BY mes DESC LIMIT ?`).all(familiaId, meses)
  }
  return db.prepare(`SELECT strftime('%Y-%m', data_gasto) as mes, SUM(valor) as total FROM gastos GROUP BY mes ORDER BY mes DESC LIMIT ?`).all(meses)
}

// ===== RECEITAS =====
function registrarReceita(usuarioId, valor, descricao = 'Salário', dataReceita = null) {
  const data = dataReceita || new Date().toISOString().split('T')[0]
  return db.prepare('INSERT INTO receitas (usuario_id, valor, descricao, data_receita) VALUES (?, ?, ?, ?)').run(usuarioId, valor, descricao, data)
}
function listarReceitas(familiaId = null, usuarioId = null) {
  if (usuarioId) return db.prepare('SELECT r.*, u.nome as usuario_nome FROM receitas r JOIN usuarios u ON r.usuario_id = u.id WHERE r.usuario_id = ? ORDER BY r.data_receita DESC').all(usuarioId)
  if (familiaId) return db.prepare('SELECT r.*, u.nome as usuario_nome FROM receitas r JOIN usuarios u ON r.usuario_id = u.id WHERE u.familia_id = ? ORDER BY r.data_receita DESC').all(familiaId)
  return db.prepare('SELECT r.*, u.nome as usuario_nome FROM receitas r JOIN usuarios u ON r.usuario_id = u.id ORDER BY r.data_receita DESC').all()
}
function totalReceitasMes(familiaId = null, usuarioId = null) {
  const now = new Date()
  const mesStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  if (usuarioId) {
    return db.prepare(`SELECT COALESCE(SUM(valor), 0) as total FROM receitas WHERE usuario_id = ? AND strftime('%Y-%m', data_receita) = ?`).get(usuarioId, mesStr)
  }
  if (familiaId) {
    return db.prepare(`SELECT COALESCE(SUM(r.valor), 0) as total FROM receitas r JOIN usuarios u ON r.usuario_id = u.id WHERE u.familia_id = ? AND strftime('%Y-%m', r.data_receita) = ?`).get(familiaId, mesStr)
  }
  return db.prepare(`SELECT COALESCE(SUM(valor), 0) as total FROM receitas WHERE strftime('%Y-%m', data_receita) = ?`).get(mesStr)
}
function deletarReceita(id) {
  return db.prepare('DELETE FROM receitas WHERE id = ?').run(id)
}
function receitasPorMes(meses = 6, familiaId = null) {
  if (familiaId) {
    return db.prepare(`SELECT strftime('%Y-%m', r.data_receita) as mes, SUM(r.valor) as total FROM receitas r JOIN usuarios u ON r.usuario_id = u.id WHERE u.familia_id = ? GROUP BY mes ORDER BY mes DESC LIMIT ?`).all(familiaId, meses)
  }
  return db.prepare(`SELECT strftime('%Y-%m', data_receita) as mes, SUM(valor) as total FROM receitas GROUP BY mes ORDER BY mes DESC LIMIT ?`).all(meses)
}

// ===== RECEITAS PROGRAMADAS =====
function contarDiasSemanaMes(ano, mes, diaSemana) {
  // mes: 1-based. diaSemana: 0=Dom,1=Seg,...,6=Sab
  let count = 0
  const diasNoMes = new Date(ano, mes, 0).getDate()
  for (let d = 1; d <= diasNoMes; d++) {
    if (new Date(ano, mes - 1, d).getDay() === diaSemana) count++
  }
  return count
}

function calcularRendaMes(familiaId = null, usuarioId = null, mes = null, ano = null) {
  const now = new Date()
  const m = mes || (now.getMonth() + 1)
  const a = ano || now.getFullYear()
  let programadas
  if (usuarioId) {
    programadas = db.prepare('SELECT * FROM receitas_programadas WHERE usuario_id = ? AND ativa = 1').all(usuarioId)
  } else if (familiaId) {
    programadas = db.prepare(`SELECT rp.* FROM receitas_programadas rp JOIN usuarios u ON rp.usuario_id = u.id WHERE u.familia_id = ? AND rp.ativa = 1`).all(familiaId)
  } else {
    programadas = db.prepare('SELECT * FROM receitas_programadas WHERE ativa = 1').all()
  }
  let total = 0
  for (const rp of programadas) {
    const v = Number(rp.valor)
    if (rp.tipo === 'mensal') {
      total += v
    } else if (rp.tipo === 'semanal') {
      const ds = rp.dia_semana != null ? Number(rp.dia_semana) : 1
      total += v * contarDiasSemanaMes(a, m, ds)
    } else if (rp.tipo === 'quinzenal') {
      total += v * 2
    }
  }
  return total
}

function listarReceitasProgramadas(familiaId = null, usuarioId = null) {
  if (usuarioId) return db.prepare('SELECT rp.*, u.nome as usuario_nome FROM receitas_programadas rp JOIN usuarios u ON rp.usuario_id = u.id WHERE rp.usuario_id = ? ORDER BY rp.dia_mes ASC, rp.criado_em').all(usuarioId)
  if (familiaId) return db.prepare('SELECT rp.*, u.nome as usuario_nome FROM receitas_programadas rp JOIN usuarios u ON rp.usuario_id = u.id WHERE u.familia_id = ? ORDER BY u.nome, rp.dia_mes ASC').all(familiaId)
  return db.prepare('SELECT rp.*, u.nome as usuario_nome FROM receitas_programadas rp JOIN usuarios u ON rp.usuario_id = u.id ORDER BY rp.criado_em').all()
}
function adicionarReceitaProgramada(usuarioId, descricao, valor, tipo, diaMes, diaSemana, observacao) {
  return db.prepare('INSERT INTO receitas_programadas (usuario_id, descricao, valor, tipo, dia_mes, dia_semana, observacao) VALUES (?, ?, ?, ?, ?, ?, ?)').run(usuarioId, descricao, valor, tipo || 'mensal', diaMes || null, diaSemana != null ? diaSemana : null, observacao || null)
}
function atualizarReceitaProgramada(id, descricao, valor, tipo, diaMes, diaSemana, observacao, ativa) {
  return db.prepare('UPDATE receitas_programadas SET descricao=?, valor=?, tipo=?, dia_mes=?, dia_semana=?, observacao=?, ativa=? WHERE id=?').run(descricao, valor, tipo, diaMes || null, diaSemana != null ? diaSemana : null, observacao || null, ativa ?? 1, id)
}
function removerReceitaProgramada(id) {
  return db.prepare('DELETE FROM receitas_programadas WHERE id = ?').run(id)
}

// ===== PROJEÇÃO =====
function projecaoGastosMeses(meses = 4, familiaId = null, usuarioId = null) {
  const now = new Date()
  const results = []
  for (let i = 1; i <= meses; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const mesStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    let row
    if (usuarioId) {
      row = db.prepare(`SELECT COALESCE(SUM(valor), 0) as total FROM gastos WHERE strftime('%Y-%m', data_gasto) = ? AND usuario_id = ?`).get(mesStr, usuarioId)
    } else if (familiaId) {
      row = db.prepare(`SELECT COALESCE(SUM(g.valor), 0) as total FROM gastos g JOIN usuarios u ON g.usuario_id = u.id WHERE strftime('%Y-%m', g.data_gasto) = ? AND u.familia_id = ?`).get(mesStr, familiaId)
    } else {
      row = db.prepare(`SELECT COALESCE(SUM(valor), 0) as total FROM gastos WHERE strftime('%Y-%m', data_gasto) = ?`).get(mesStr)
    }
    results.push({ mes: mesStr, total: Number(row.total) })
  }
  return results
}

// ===== METAS =====
function criarMeta(nome, valorAlvo, prazo = null, descricao = null, categoria = 'Outros', emoji = '🎯', familiaId = 1) {
  return db.prepare('INSERT INTO metas (nome, valor_alvo, prazo, descricao, categoria, emoji, familia_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(nome, valorAlvo, prazo, descricao, categoria, emoji, familiaId)
}
function listarMetas(familiaId = null) {
  if (familiaId) return db.prepare('SELECT * FROM metas WHERE familia_id = ? ORDER BY criado_em DESC').all(familiaId)
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
function listarEmprestimos(familiaId = null, usuarioId = null) {
  if (usuarioId) return db.prepare("SELECT e.*, u.nome as usuario_nome FROM emprestimos e JOIN usuarios u ON e.usuario_id = u.id WHERE e.usuario_id = ? AND e.status = 'ativo' ORDER BY e.criado_em DESC").all(usuarioId)
  if (familiaId) return db.prepare("SELECT e.*, u.nome as usuario_nome FROM emprestimos e JOIN usuarios u ON e.usuario_id = u.id WHERE u.familia_id = ? AND e.status = 'ativo' ORDER BY e.criado_em DESC").all(familiaId)
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
function totalDividas(familiaId = null) {
  if (familiaId) {
    const result = db.prepare("SELECT COALESCE(SUM(e.valor_total - e.valor_pago), 0) as total FROM emprestimos e JOIN usuarios u ON e.usuario_id = u.id WHERE u.familia_id = ? AND e.status = 'ativo'").get(familiaId)
    return Number(result.total)
  }
  const result = db.prepare("SELECT COALESCE(SUM(valor_total - valor_pago), 0) as total FROM emprestimos WHERE status = 'ativo'").get()
  return Number(result.total)
}

// ===== RESUMO POR FAMÍLIA =====
function resumoFinanceiro(familiaId = null, usuarioId = null) {
  const todosUsuarios = listarUsuarios(familiaId)
  const usuarios = usuarioId ? todosUsuarios.filter(u => u.id === Number(usuarioId)) : todosUsuarios
  const salarioTotal = usuarios.reduce((acc, u) => acc + (u.salario || 0), 0)

  // Renda calculada das receitas programadas (prefere programadas; cai back no salario se não tiver)
  const rendaProgramada = calcularRendaMes(familiaId, usuarioId)
  const { total: gastosMes } = totalGastosMes(familiaId, usuarioId)
  const { total: receitasExtras } = totalReceitasMes(familiaId, usuarioId)
  const rendaBase = rendaProgramada > 0 ? rendaProgramada : salarioTotal
  const rendaTotal = rendaBase + Number(receitasExtras || 0)

  const cartoes = listarCartoes(familiaId, usuarioId)
  const contas = listarContas(familiaId, usuarioId)
  const metas = listarMetas(familiaId)
  const categorias = gastosPorCategoria(null, null, familiaId, usuarioId)
  const evolucao = gastosPorMes(6, familiaId, usuarioId)
  const saldoContas = contas.reduce((a, c) => a + c.saldo, 0)
  const emprestimos = listarEmprestimos(familiaId)
  const totalEmDividas = totalDividas(familiaId)
  const projecao = projecaoGastosMeses(4, familiaId, usuarioId)
  const receitasProgramadas = listarReceitasProgramadas(familiaId, usuarioId)
  return { salarioTotal, rendaProgramada, rendaTotal, receitasExtras: Number(receitasExtras || 0), gastosMes, saldoDisponivel: rendaTotal - gastosMes, saldoContas, cartoes, contas, metas, categorias, usuarios, evolucao, emprestimos, totalEmDividas, projecao, receitasProgramadas }
}

// ===== IMPORTAÇÕES =====
function registrarImportacao(usuarioId, tipo, descricao, qtd, duplicatas = 0) {
  return db.prepare('INSERT INTO importacoes (usuario_id, tipo, descricao, qtd_registros, duplicatas_ignoradas) VALUES (?, ?, ?, ?, ?)').run(usuarioId, tipo, descricao, qtd, duplicatas)
}
function listarImportacoes(familiaId = null) {
  if (familiaId) return db.prepare('SELECT i.* FROM importacoes i JOIN usuarios u ON i.usuario_id = u.id WHERE u.familia_id = ? ORDER BY i.criado_em DESC LIMIT 30').all(familiaId)
  return db.prepare('SELECT * FROM importacoes ORDER BY criado_em DESC LIMIT 30').all()
}

// ===== DUPLICATAS =====
function verificarDuplicataGasto(usuarioId, descricao, valor, data) {
  if (data) {
    const row = db.prepare(`SELECT id FROM gastos WHERE usuario_id = ? AND ABS(valor - ?) < 0.01 AND ABS(JULIANDAY(data_gasto) - JULIANDAY(?)) <= 1 AND LOWER(TRIM(descricao)) = LOWER(TRIM(?))`).get(usuarioId, valor, data, descricao)
    return !!row
  }
  const now = new Date()
  const mesStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
  const row = db.prepare(`SELECT id FROM gastos WHERE usuario_id = ? AND ABS(valor - ?) < 0.01 AND strftime('%Y-%m', data_gasto) = ? AND LOWER(TRIM(descricao)) = LOWER(TRIM(?))`).get(usuarioId, valor, mesStr, descricao)
  return !!row
}

// ===== EXPORTAÇÃO =====
function listarGastosExport(mes = null, ano = null, familiaId = null) {
  const now = new Date()
  const mesStr = `${ano || now.getFullYear()}-${String(mes || now.getMonth() + 1).padStart(2, '0')}`
  if (familiaId) {
    return db.prepare(`SELECT g.*, u.nome as usuario_nome, c.nome as cartao_nome FROM gastos g JOIN usuarios u ON g.usuario_id = u.id LEFT JOIN cartoes c ON g.cartao_id = c.id WHERE strftime('%Y-%m', g.data_gasto) = ? AND u.familia_id = ? ORDER BY g.data_gasto DESC, g.criado_em DESC`).all(mesStr, familiaId)
  }
  return db.prepare(`SELECT g.*, u.nome as usuario_nome, c.nome as cartao_nome FROM gastos g JOIN usuarios u ON g.usuario_id = u.id LEFT JOIN cartoes c ON g.cartao_id = c.id WHERE strftime('%Y-%m', g.data_gasto) = ? ORDER BY g.data_gasto DESC, g.criado_em DESC`).all(mesStr)
}
function listarReceitasExport(mes = null, ano = null, familiaId = null) {
  const now = new Date()
  const mesStr = `${ano || now.getFullYear()}-${String(mes || now.getMonth() + 1).padStart(2, '0')}`
  if (familiaId) {
    return db.prepare(`SELECT r.*, u.nome as usuario_nome FROM receitas r JOIN usuarios u ON r.usuario_id = u.id WHERE strftime('%Y-%m', r.data_receita) = ? AND u.familia_id = ? ORDER BY r.data_receita DESC`).all(mesStr, familiaId)
  }
  return db.prepare(`SELECT r.*, u.nome as usuario_nome FROM receitas r JOIN usuarios u ON r.usuario_id = u.id WHERE strftime('%Y-%m', r.data_receita) = ? ORDER BY r.data_receita DESC`).all(mesStr)
}

// ===== ALERTAS =====
function alertasVencimento(familiaId = null) {
  const hoje = new Date()
  const em7dias = new Date(hoje)
  em7dias.setDate(hoje.getDate() + 7)
  const em7diasStr = em7dias.toISOString().split('T')[0]
  if (familiaId) {
    return db.prepare(`SELECT e.*, u.nome as usuario_nome FROM emprestimos e JOIN usuarios u ON e.usuario_id = u.id WHERE u.familia_id = ? AND e.status = 'ativo' AND e.data_vencimento IS NOT NULL AND e.data_vencimento <= ? ORDER BY e.data_vencimento ASC`).all(familiaId, em7diasStr)
  }
  return db.prepare(`SELECT e.*, u.nome as usuario_nome FROM emprestimos e JOIN usuarios u ON e.usuario_id = u.id WHERE e.status = 'ativo' AND e.data_vencimento IS NOT NULL AND e.data_vencimento <= ? ORDER BY e.data_vencimento ASC`).all(em7diasStr)
}

module.exports = {
  criarFamilia, listarFamilias, obterFamilia, editarFamilia,
  obterUsuario, obterUsuarioPorId, criarUsuario, autenticarUsuario, atualizarSalario, editarUsuario, listarUsuarios,
  criarConta, listarContas, atualizarSaldoConta, atualizarConta, deletarConta,
  criarCartao, listarCartoes, obterCartaoPorNome, atualizarGastoCartao, atualizarFaturaCartao, deletarCartao,
  criarEmprestimo, listarEmprestimos, atualizarEmprestimo, editarEmprestimo, deletarEmprestimo, totalDividas,
  registrarGasto, listarGastosMes, totalGastosMes, gastosPorCategoria, ultimosGastos, gastosPorMes,
  criarMeta, listarMetas, atualizarMeta,
  registrarReceita, listarReceitas, totalReceitasMes, deletarReceita, receitasPorMes,
  listarReceitasProgramadas, adicionarReceitaProgramada, atualizarReceitaProgramada, removerReceitaProgramada, calcularRendaMes,
  projecaoGastosMeses,
  registrarImportacao, listarImportacoes,
  verificarDuplicataGasto,
  listarGastosExport, listarReceitasExport,
  alertasVencimento,
  resumoFinanceiro
}
