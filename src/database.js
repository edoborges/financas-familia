const { DatabaseSync } = require('node:sqlite')
const path = require('path')
const fs = require('fs')

const dataPath = process.env.DATA_PATH || './data'
if (!fs.existsSync(dataPath)) fs.mkdirSync(dataPath, { recursive: true })

const db = new DatabaseSync(path.join(dataPath, 'financeiro.db'))
db.exec('PRAGMA journal_mode = WAL')

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

  CREATE TABLE IF NOT EXISTS orcamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    familia_id INTEGER DEFAULT 1,
    categoria TEXT NOT NULL,
    valor_limite REAL NOT NULL,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );

  CREATE TABLE IF NOT EXISTS gastos_recorrentes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    descricao TEXT NOT NULL,
    valor REAL NOT NULL,
    categoria TEXT DEFAULT 'Outros',
    forma_pagamento TEXT DEFAULT 'debito',
    dia_mes INTEGER DEFAULT 1,
    ativa INTEGER DEFAULT 1,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );

  CREATE TABLE IF NOT EXISTS meta_renda (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    familia_id INTEGER NOT NULL UNIQUE,
    valor_alvo REAL NOT NULL DEFAULT 20000,
    ticket_medio REAL DEFAULT 0,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS config (
    chave TEXT PRIMARY KEY,
    valor TEXT
  );

  CREATE TABLE IF NOT EXISTS push_inscricoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    dispositivo TEXT,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );

  -- Uma conta (fatura, parcela, gasto fixo) num vencimento é identificada por 'chave',
  -- ex.: 'fatura:2:2026-12-05', 'recorrente:7:2026-12', 'emprestimo:3:2026-12'.
  CREATE TABLE IF NOT EXISTS pagamentos (
    chave TEXT PRIMARY KEY,
    usuario_id INTEGER,
    pago_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS notificacoes_enviadas (
    usuario_id INTEGER NOT NULL,
    chave TEXT NOT NULL,
    tipo TEXT NOT NULL,
    enviado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (usuario_id, chave, tipo)
  );

  -- Valores a receber (ex.: venda parcelada). Cada parcela é uma linha.
  CREATE TABLE IF NOT EXISTS recebiveis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    grupo TEXT NOT NULL,
    descricao TEXT NOT NULL,
    valor REAL NOT NULL,
    data_prevista DATE NOT NULL,
    destino TEXT DEFAULT 'investimento',
    recebido_em DATE,
    valor_recebido REAL,
    patrimonio_id INTEGER,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Patrimônio: reserva, investimentos, negócios, bens.
  CREATE TABLE IF NOT EXISTS patrimonio (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    nome TEXT NOT NULL,
    valor REAL DEFAULT 0,
    instituicao TEXT DEFAULT '',
    atualizado_em DATE,
    ativo INTEGER DEFAULT 1
  );

  -- Uma fotografia por pessoa por mês, para o gráfico de evolução.
  CREATE TABLE IF NOT EXISTS patrimonio_historico (
    usuario_id INTEGER NOT NULL,
    mes TEXT NOT NULL,
    ativos REAL DEFAULT 0,
    dividas REAL DEFAULT 0,
    a_receber REAL DEFAULT 0,
    PRIMARY KEY (usuario_id, mes)
  );

  -- Pagamento antecipado (ou estorno) que abate uma fatura específica do cartão.
  CREATE TABLE IF NOT EXISTS fatura_creditos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    cartao_id INTEGER NOT NULL,
    vencimento DATE NOT NULL,
    valor REAL NOT NULL,
    data DATE,
    descricao TEXT DEFAULT 'Pagamento antecipado',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Sessões de login. Guarda só o hash do token: quem ler o banco não consegue se passar
  -- por ninguém.
  CREATE TABLE IF NOT EXISTS sessoes (
    token_hash TEXT PRIMARY KEY,
    usuario_id INTEGER NOT NULL,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    usado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`)

// Migrações seguras. Precisam rodar DEPOIS do CREATE TABLE: num banco novo, um ALTER
// antes do CREATE falha calado (tabela inexistente) e a coluna nunca é criada.
// Em banco existente, a coluna já presente gera erro de duplicata, também ignorado.
try { db.exec("ALTER TABLE usuarios ADD COLUMN pin TEXT DEFAULT '0000'") } catch(e) {}
try { db.exec("ALTER TABLE gastos ADD COLUMN parcela_atual INTEGER DEFAULT 1") } catch(e) {}
try { db.exec("ALTER TABLE gastos ADD COLUMN grupo_parcela INTEGER") } catch(e) {}
try { db.exec("ALTER TABLE gastos ADD COLUMN origem TEXT DEFAULT 'manual'") } catch(e) {}
try { db.exec("ALTER TABLE gastos ADD COLUMN recorrente_id INTEGER") } catch(e) {}
try { db.exec("ALTER TABLE receitas ADD COLUMN origem TEXT DEFAULT 'manual'") } catch(e) {}
try { db.exec("ALTER TABLE receitas ADD COLUMN tipo TEXT DEFAULT 'outro'") } catch(e) {}
try { db.exec("ALTER TABLE usuarios ADD COLUMN familia_id INTEGER DEFAULT 1") } catch(e) {}
try { db.exec("ALTER TABLE usuarios ADD COLUMN role TEXT DEFAULT 'membro'") } catch(e) {}
try { db.exec("ALTER TABLE receitas_programadas ADD COLUMN estimada INTEGER DEFAULT 0") } catch(e) {}
try { db.exec("ALTER TABLE gastos_recorrentes ADD COLUMN cartao_id INTEGER") } catch(e) {}
// Consignado: a parcela sai do salário antes de cair na conta, então não vira conta a pagar.
try { db.exec("ALTER TABLE emprestimos ADD COLUMN desconto_folha INTEGER DEFAULT 0") } catch(e) {}

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
function editarCartao(id, { nome, limite, diaFechamento, diaVencimento }) {
  const c = db.prepare('SELECT * FROM cartoes WHERE id = ?').get(id)
  if (!c) return null
  db.prepare('UPDATE cartoes SET nome = ?, limite = ?, dia_fechamento = ?, dia_vencimento = ? WHERE id = ?').run(
    nome || c.nome, limite ?? c.limite,
    parseInt(diaFechamento) || c.dia_fechamento, parseInt(diaVencimento) || c.dia_vencimento, id)
  return db.prepare('SELECT * FROM cartoes WHERE id = ?').get(id)
}
// Lançamento em lote com a data de cada compra (faturas e extratos lidos pelo assistente).
// Cada parcela futura vem como um item próprio, já com a data do ciclo em que cai, para
// entrar na fatura certa. Itens iguais (pessoa, descrição, valor e data) são ignorados.
function registrarGastosLote(itens) {
  const r = { aplicados: 0, duplicatas: 0 }
  const existe = db.prepare('SELECT 1 FROM gastos WHERE usuario_id = ? AND descricao = ? AND ROUND(valor, 2) = ROUND(?, 2) AND date(data_gasto) = ?')
  const ins = db.prepare(`INSERT INTO gastos (usuario_id, cartao_id, conta_id, descricao, valor, categoria, forma_pagamento, data_gasto, parcelas, parcela_atual, origem)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'importado')`)
  db.exec('BEGIN')
  try {
    for (const it of itens) {
      if (existe.get(it.usuarioId, it.descricao, it.valor, it.data)) { r.duplicatas++; continue }
      ins.run(it.usuarioId, it.cartaoId || null, it.contaId || null, it.descricao, it.valor, it.categoria || 'Outros',
        it.formaPagamento || (it.cartaoId ? 'credito' : 'debito'), it.data, it.parcelas || 1, it.parcelaAtual || 1)
      r.aplicados++
    }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  return r
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
function registrarReceita(usuarioId, valor, descricao = 'Salário', dataReceita = null, tipo = 'outro') {
  const data = dataReceita || new Date().toISOString().split('T')[0]
  return db.prepare('INSERT INTO receitas (usuario_id, valor, descricao, data_receita, tipo) VALUES (?, ?, ?, ?, ?)').run(usuarioId, valor, descricao, data, tipo)
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

// Rendas programadas que valem para o mês. Uma estimativa (salário que só se sabe no dia)
// sai da conta assim que o dono lança uma receita do tipo 'salario' naquele mês: a partir
// daí vale o valor real, e as duas nunca somam juntas.
function programadasDoMes(familiaId = null, usuarioId = null, mes = null, ano = null) {
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
  const mesStr = `${a}-${String(m).padStart(2, '0')}`
  const salarioLancado = db.prepare(`SELECT 1 FROM receitas WHERE usuario_id = ? AND tipo = 'salario' AND strftime('%Y-%m', data_receita) = ? LIMIT 1`)
  return programadas.filter(rp => !(rp.estimada && salarioLancado.get(rp.usuario_id, mesStr)))
}

function valorProgramadaNoMes(rp, mes, ano) {
  const v = Number(rp.valor)
  if (rp.tipo === 'semanal') return v * contarDiasSemanaMes(ano, mes, rp.dia_semana != null ? Number(rp.dia_semana) : 1)
  if (rp.tipo === 'quinzenal') return v * 2
  return v
}

function calcularRendaMes(familiaId = null, usuarioId = null, mes = null, ano = null) {
  const now = new Date()
  const m = mes || (now.getMonth() + 1)
  const a = ano || now.getFullYear()
  return programadasDoMes(familiaId, usuarioId, m, a).reduce((acc, rp) => acc + valorProgramadaNoMes(rp, m, a), 0)
}

function listarReceitasProgramadas(familiaId = null, usuarioId = null) {
  if (usuarioId) return db.prepare('SELECT rp.*, u.nome as usuario_nome FROM receitas_programadas rp JOIN usuarios u ON rp.usuario_id = u.id WHERE rp.usuario_id = ? ORDER BY rp.dia_mes ASC, rp.criado_em').all(usuarioId)
  if (familiaId) return db.prepare('SELECT rp.*, u.nome as usuario_nome FROM receitas_programadas rp JOIN usuarios u ON rp.usuario_id = u.id WHERE u.familia_id = ? ORDER BY u.nome, rp.dia_mes ASC').all(familiaId)
  return db.prepare('SELECT rp.*, u.nome as usuario_nome FROM receitas_programadas rp JOIN usuarios u ON rp.usuario_id = u.id ORDER BY rp.criado_em').all()
}
function adicionarReceitaProgramada(usuarioId, descricao, valor, tipo, diaMes, diaSemana, observacao, estimada = 0) {
  return db.prepare('INSERT INTO receitas_programadas (usuario_id, descricao, valor, tipo, dia_mes, dia_semana, observacao, estimada) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(usuarioId, descricao, valor, tipo || 'mensal', diaMes || null, diaSemana != null ? diaSemana : null, observacao || null, estimada ? 1 : 0)
}
function atualizarReceitaProgramada(id, descricao, valor, tipo, diaMes, diaSemana, observacao, ativa, estimada = 0) {
  return db.prepare('UPDATE receitas_programadas SET descricao=?, valor=?, tipo=?, dia_mes=?, dia_semana=?, observacao=?, ativa=?, estimada=? WHERE id=?').run(descricao, valor, tipo, diaMes || null, diaSemana != null ? diaSemana : null, observacao || null, ativa ?? 1, estimada ? 1 : 0, id)
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
function criarEmprestimo(usuarioId, tipo, descricao, credor, valorTotal, parcelaMensal, totalParcelas, taxaJuros, dataVencimento, descontoFolha = 0) {
  return db.prepare(`INSERT INTO emprestimos (usuario_id, tipo, descricao, credor, valor_total, parcela_mensal, total_parcelas, taxa_juros, data_vencimento, desconto_folha)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(usuarioId, tipo || 'emprestimo', descricao, credor, valorTotal, parcelaMensal || 0, totalParcelas || 1, taxaJuros || 0, dataVencimento || null, descontoFolha ? 1 : 0)
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
function editarEmprestimo(id, tipo, descricao, credor, valorTotal, parcelaMensal, totalParcelas, taxaJuros, dataVencimento, valorPago, parcelasPagas, descontoFolha) {
  const status = valorPago >= valorTotal ? 'quitado' : 'ativo'
  // descontoFolha ausente (cliente antigo) mantém o valor gravado.
  return db.prepare('UPDATE emprestimos SET tipo=?, descricao=?, credor=?, valor_total=?, parcela_mensal=?, total_parcelas=?, taxa_juros=?, data_vencimento=?, valor_pago=?, parcelas_pagas=?, status=?, desconto_folha=COALESCE(?, desconto_folha) WHERE id=?')
    .run(tipo || 'emprestimo', descricao, credor, valorTotal, parcelaMensal, totalParcelas, taxaJuros, dataVencimento, valorPago, parcelasPagas, status, descontoFolha == null ? null : (descontoFolha ? 1 : 0), id)
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

// ===== META DE RENDA =====
function obterMetaRenda(familiaId = null) {
  const fid = familiaId || 1
  const row = db.prepare('SELECT * FROM meta_renda WHERE familia_id = ?').get(fid)
  return row || { familia_id: fid, valor_alvo: 20000, ticket_medio: 0 }
}

function salvarMetaRenda(familiaId, valorAlvo, ticketMedio) {
  const fid = familiaId || 1
  const ex = db.prepare('SELECT id FROM meta_renda WHERE familia_id = ?').get(fid)
  if (ex) return db.prepare('UPDATE meta_renda SET valor_alvo = ?, ticket_medio = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?').run(valorAlvo, ticketMedio || 0, ex.id)
  return db.prepare('INSERT INTO meta_renda (familia_id, valor_alvo, ticket_medio) VALUES (?, ?, ?)').run(fid, valorAlvo, ticketMedio || 0)
}

// Separa a renda programada em fixa (mensal/quinzenal) e semanal — a semanal varia
// com o número de ocorrências do dia da semana no mês.
function rendaProgramadaDetalhe(familiaId = null, usuarioId = null, mes = null, ano = null) {
  const now = new Date()
  const m = mes || (now.getMonth() + 1)
  const a = ano || now.getFullYear()
  let fixa = 0, semanal = 0
  for (const rp of programadasDoMes(familiaId, usuarioId, m, a)) {
    const v = valorProgramadaNoMes(rp, m, a)
    if (rp.tipo === 'semanal') semanal += v
    else fixa += v
  }
  return { fixa, semanal, total: fixa + semanal }
}

function receitasAgrupadasPorTipo(familiaId = null, usuarioId = null, mesStr) {
  if (usuarioId) {
    return db.prepare(`SELECT COALESCE(NULLIF(tipo, ''), 'outro') as tipo, COUNT(*) as qtd, COALESCE(SUM(valor), 0) as total FROM receitas WHERE usuario_id = ? AND strftime('%Y-%m', data_receita) = ? GROUP BY 1`).all(usuarioId, mesStr)
  }
  if (familiaId) {
    return db.prepare(`SELECT COALESCE(NULLIF(r.tipo, ''), 'outro') as tipo, COUNT(*) as qtd, COALESCE(SUM(r.valor), 0) as total FROM receitas r JOIN usuarios u ON r.usuario_id = u.id WHERE u.familia_id = ? AND strftime('%Y-%m', r.data_receita) = ? GROUP BY 1`).all(familiaId, mesStr)
  }
  return db.prepare(`SELECT COALESCE(NULLIF(tipo, ''), 'outro') as tipo, COUNT(*) as qtd, COALESCE(SUM(valor), 0) as total FROM receitas WHERE strftime('%Y-%m', data_receita) = ? GROUP BY 1`).all(mesStr)
}

function historicoAtendimentos(familiaId = null, usuarioId = null, meses = 6) {
  if (usuarioId) {
    return db.prepare(`SELECT strftime('%Y-%m', data_receita) as mes, COUNT(*) as qtd, COALESCE(SUM(valor), 0) as total FROM receitas WHERE usuario_id = ? AND tipo = 'atendimento' GROUP BY mes ORDER BY mes DESC LIMIT ?`).all(usuarioId, meses)
  }
  if (familiaId) {
    return db.prepare(`SELECT strftime('%Y-%m', r.data_receita) as mes, COUNT(*) as qtd, COALESCE(SUM(r.valor), 0) as total FROM receitas r JOIN usuarios u ON r.usuario_id = u.id WHERE u.familia_id = ? AND r.tipo = 'atendimento' GROUP BY mes ORDER BY mes DESC LIMIT ?`).all(familiaId, meses)
  }
  return db.prepare(`SELECT strftime('%Y-%m', data_receita) as mes, COUNT(*) as qtd, COALESCE(SUM(valor), 0) as total FROM receitas WHERE tipo = 'atendimento' GROUP BY mes ORDER BY mes DESC LIMIT ?`).all(meses)
}

// O núcleo do módulo: quanto falta para a meta e quantos atendimentos isso significa.
function calcularMetaRenda(familiaId = null, usuarioId = null, mes = null, ano = null) {
  const now = new Date()
  const m = mes || (now.getMonth() + 1)
  const a = ano || now.getFullYear()
  const mesStr = `${a}-${String(m).padStart(2, '0')}`
  const mesCorrente = m === (now.getMonth() + 1) && a === now.getFullYear()

  const meta = obterMetaRenda(familiaId)
  const alvo = Number(meta.valor_alvo) || 0
  const prog = rendaProgramadaDetalhe(familiaId, usuarioId, m, a)

  const grupos = receitasAgrupadasPorTipo(familiaId, usuarioId, mesStr)
  const at = grupos.find(g => g.tipo === 'atendimento') || { qtd: 0, total: 0 }
  const atendimentos = { qtd: Number(at.qtd), total: Number(at.total) }
  // Salário lançado entra como renda fixa: é ele que substitui a estimativa programada.
  const salarioLancado = grupos.filter(g => g.tipo === 'salario').reduce((acc, g) => acc + Number(g.total), 0)
  prog.fixa += salarioLancado
  const outras = grupos
    .filter(g => g.tipo !== 'atendimento' && g.tipo !== 'salario')
    .reduce((acc, g) => acc + Number(g.total), 0)

  // Ticket: o informado manualmente vence; senão a média real do histórico.
  const historico = historicoAtendimentos(familiaId, usuarioId, 6)
  const histQtd = historico.reduce((acc, h) => acc + Number(h.qtd), 0)
  const histTotal = historico.reduce((acc, h) => acc + Number(h.total), 0)
  const ticketReal = histQtd > 0 ? histTotal / histQtd : 0
  const ticket = Number(meta.ticket_medio) > 0 ? Number(meta.ticket_medio) : ticketReal

  const realizado = prog.fixa + prog.semanal + atendimentos.total + outras
  const gap = Math.max(0, alvo - realizado)
  const pct = alvo > 0 ? Math.min(100, (realizado / alvo) * 100) : 0

  const diasNoMes = new Date(a, m, 0).getDate()
  const diasRestantes = mesCorrente ? Math.max(0, diasNoMes - now.getDate()) : diasNoMes
  const semanasRestantes = Math.max(1, Math.ceil(diasRestantes / 7))

  const atendimentosNecessarios = ticket > 0 ? Math.ceil(gap / ticket) : null
  const porSemana = atendimentosNecessarios != null ? Math.ceil(atendimentosNecessarios / semanasRestantes) : null

  // Melhor mês do histórico serve de régua: a meta semanal é factível ou fantasia?
  const melhorMes = historico.reduce((max, h) => Math.max(max, Number(h.qtd)), 0)

  return {
    mes: mesStr, alvo, realizado, gap, pct,
    fontes: { fixa: prog.fixa, semanal: prog.semanal, atendimentos: atendimentos.total, outras },
    atendimentos, ticket, ticketReal, ticketManual: Number(meta.ticket_medio) || 0,
    atendimentosNecessarios, porSemana, diasRestantes, semanasRestantes,
    historico, melhorMes
  }
}

// Ranking de dívidas pelo que cada uma custa por mês em juros — qual atacar primeiro.
function custoDividas(familiaId = null, usuarioId = null) {
  const emps = listarEmprestimos(familiaId, usuarioId)
  return emps.map(e => {
    const saldo = Math.max(0, Number(e.valor_total) - Number(e.valor_pago))
    const taxa = Number(e.taxa_juros) || 0
    return {
      id: e.id, descricao: e.descricao, credor: e.credor, tipo: e.tipo,
      usuario_nome: e.usuario_nome, taxa_juros: taxa, saldo,
      parcela_mensal: Number(e.parcela_mensal) || 0,
      parcelas_restantes: Math.max(0, Number(e.total_parcelas) - Number(e.parcelas_pagas)),
      juros_mes: saldo * (taxa / 100)
    }
  }).sort((x, y) => y.juros_mes - x.juros_mes)
}

// ===== DATA, CONFIG, PAGAMENTOS E PUSH =====
// "Hoje" no fuso do Brasil. O servidor do Railway roda em UTC: entre 21h e meia-noite o
// "hoje" dele já é amanhã, o que adiantaria vencimentos e lembretes em um dia.
function hojeBR() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })  // AAAA-MM-DD
}
function somaDias(dataStr, n) {
  const [y, m, d] = dataStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

function obterConfig(chave) {
  return db.prepare('SELECT valor FROM config WHERE chave = ?').get(chave)?.valor ?? null
}
function salvarConfig(chave, valor) {
  return db.prepare('INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor').run(chave, String(valor))
}

// O "paguei" vale do dia em que o recurso entrou no ar em diante. Conta vencida antes disso
// conta como paga — senão o app começaria cobrando contas antigas que já foram quitadas.
if (!obterConfig('pagamentos_desde')) salvarConfig('pagamentos_desde', hojeBR())

function chavesPagas() {
  return new Set(db.prepare('SELECT chave FROM pagamentos').all().map(r => r.chave))
}
function marcarPago(chave, usuarioId = null) {
  return db.prepare('INSERT OR IGNORE INTO pagamentos (chave, usuario_id) VALUES (?, ?)').run(chave, usuarioId)
}
function desmarcarPago(chave) {
  return db.prepare('DELETE FROM pagamentos WHERE chave = ?').run(chave)
}

// O mesmo aparelho pode trocar de usuário (Ed sai, Leide entra): o endpoint é a identidade.
function salvarInscricaoPush(usuarioId, inscricao, dispositivo = null) {
  return db.prepare(`INSERT INTO push_inscricoes (usuario_id, endpoint, p256dh, auth, dispositivo) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET usuario_id = excluded.usuario_id, p256dh = excluded.p256dh, auth = excluded.auth, dispositivo = excluded.dispositivo`)
    .run(usuarioId, inscricao.endpoint, inscricao.keys.p256dh, inscricao.keys.auth, dispositivo)
}
function listarInscricoesPush(usuarioId) {
  return db.prepare('SELECT * FROM push_inscricoes WHERE usuario_id = ?').all(usuarioId)
}
function removerInscricaoPush(endpoint) {
  return db.prepare('DELETE FROM push_inscricoes WHERE endpoint = ?').run(endpoint)
}
function usuariosComPush() {
  return db.prepare('SELECT DISTINCT usuario_id FROM push_inscricoes').all().map(r => r.usuario_id)
}
function jaNotificado(usuarioId, chave, tipo) {
  return !!db.prepare('SELECT 1 FROM notificacoes_enviadas WHERE usuario_id = ? AND chave = ? AND tipo = ?').get(usuarioId, chave, tipo)
}
function registrarNotificacao(usuarioId, chave, tipo) {
  return db.prepare('INSERT OR IGNORE INTO notificacoes_enviadas (usuario_id, chave, tipo) VALUES (?, ?, ?)').run(usuarioId, chave, tipo)
}

// ===== CALENDÁRIO DO MÊS =====
function _porEscopo(sqlUsuario, sqlFamilia, sqlTodos, usuarioId, familiaId, ...params) {
  if (usuarioId) return db.prepare(sqlUsuario).all(usuarioId, ...params)
  if (familiaId) return db.prepare(sqlFamilia).all(familiaId, ...params)
  return db.prepare(sqlTodos).all(...params)
}

const _mesStr = (y, m) => `${y}-${String(m).padStart(2, '0')}`
const _somaMes = (y, m, k) => { const t = y * 12 + (m - 1) + k; return [Math.floor(t / 12), (t % 12) + 1] }

// Dia em que vence a fatura de uma compra no cartão. Compra no dia do fechamento ou
// depois cai na fatura seguinte (o "melhor dia de compra" é o próprio fechamento).
// Se o vencimento é um dia menor que o fechamento, ele cai no mês seguinte ao fechamento.
function vencimentoFatura(dataCompra, diaFechamento, diaVencimento) {
  const fech = Number(diaFechamento) || 1
  const venc = Number(diaVencimento) || 10
  const [y, m, d] = String(dataCompra).slice(0, 10).split('-').map(Number)
  const [cy, cm] = d >= fech ? _somaMes(y, m, 1) : [y, m]
  const [vy, vm] = venc <= fech ? _somaMes(cy, cm, 1) : [cy, cm]
  const ultimo = new Date(vy, vm, 0).getDate()
  return `${_mesStr(vy, vm)}-${String(Math.min(venc, ultimo)).padStart(2, '0')}`
}

function _gastosDoMes(familiaId, usuarioId, mesStr) {
  return _porEscopo(
    `SELECT g.* FROM gastos g WHERE g.usuario_id = ? AND strftime('%Y-%m', g.data_gasto) = ?`,
    `SELECT g.* FROM gastos g JOIN usuarios u ON g.usuario_id = u.id WHERE u.familia_id = ? AND strftime('%Y-%m', g.data_gasto) = ?`,
    `SELECT g.* FROM gastos g WHERE strftime('%Y-%m', g.data_gasto) = ?`,
    usuarioId, familiaId, mesStr)
}

function _recorrentesAtivos(familiaId, usuarioId) {
  return _porEscopo(
    `SELECT gr.* FROM gastos_recorrentes gr WHERE gr.usuario_id = ? AND gr.ativa = 1`,
    `SELECT gr.* FROM gastos_recorrentes gr JOIN usuarios u ON gr.usuario_id = u.id WHERE u.familia_id = ? AND gr.ativa = 1`,
    `SELECT gr.* FROM gastos_recorrentes gr WHERE gr.ativa = 1`,
    usuarioId, familiaId)
}

// Gastos fixos ainda não lançados no mês viram previsão — mas só do mês atual em diante:
// num mês passado, o que não foi lançado não foi cobrado.
function _recorrentesPendentes(familiaId, usuarioId, y, m, gastosDoMes) {
  const [hy, hm] = hojeBR().split('-').map(Number)
  if (y * 12 + m < hy * 12 + hm) return []
  const lancados = new Set(gastosDoMes.filter(g => g.recorrente_id).map(g => g.recorrente_id))
  const ultimo = new Date(y, m, 0).getDate()
  return _recorrentesAtivos(familiaId, usuarioId)
    .filter(r => !lancados.has(r.id))
    .map(r => ({ ...r, data: `${_mesStr(y, m)}-${String(Math.min(r.dia_mes || 1, ultimo)).padStart(2, '0')}` }))
}

// Faturas que vencem no mês: juntam as compras no cartão dos três meses que podem cair nele.
function _faturasDoMes(familiaId, usuarioId, y, m, cartoes) {
  const alvo = _mesStr(y, m)
  const grupos = new Map()
  for (const k of [-2, -1, 0]) {
    const [cy, cm] = _somaMes(y, m, k)
    const gastos = _gastosDoMes(familiaId, usuarioId, _mesStr(cy, cm))
    const compras = [
      ...gastos.filter(g => g.cartao_id).map(g => ({ cartao_id: g.cartao_id, data: String(g.data_gasto).slice(0, 10), descricao: g.descricao, valor: Number(g.valor) })),
      ..._recorrentesPendentes(familiaId, usuarioId, cy, cm, gastos).filter(r => r.cartao_id).map(r => ({ cartao_id: r.cartao_id, data: r.data, descricao: r.descricao, valor: Number(r.valor) }))
    ]
    for (const c of compras) {
      const cartao = cartoes.get(c.cartao_id)
      if (!cartao) continue
      const venc = vencimentoFatura(c.data, cartao.dia_fechamento, cartao.dia_vencimento)
      if (venc.slice(0, 7) !== alvo) continue
      const chave = `${c.cartao_id}|${venc}`
      if (!grupos.has(chave)) grupos.set(chave, { data: venc, cartao, compras: [] })
      grupos.get(chave).compras.push({ data: c.data, descricao: c.descricao, valor: c.valor })
    }
  }
  // Pagamentos antecipados/estornos entram como valor negativo na própria fatura.
  const creditos = db.prepare(`SELECT * FROM fatura_creditos WHERE strftime('%Y-%m', vencimento) = ?`).all(alvo)
  for (const cr of creditos) {
    const g = grupos.get(`${cr.cartao_id}|${String(cr.vencimento).slice(0, 10)}`)
    if (g) g.compras.push({ data: String(cr.data || cr.vencimento).slice(0, 10), descricao: `💵 ${cr.descricao}`, valor: -Number(cr.valor), creditoId: cr.id })
  }
  return [...grupos.values()].map(f => ({
    data: f.data, tipo: 'saida', descricao: `Fatura ${f.cartao.nome}`, cartaoId: f.cartao.id,
    valor: +Math.max(0, f.compras.reduce((acc, c) => acc + c.valor, 0)).toFixed(2),
    categoria: 'Fatura', fonte: 'fatura', conta: true, chave: `fatura:${f.cartao.id}:${f.data}`,
    compras: f.compras.sort((a, b) => a.data.localeCompare(b.data))
  }))
}

// Todas as entradas e saídas de um mês, realizadas e previstas, cada uma com sua data.
// Compra no cartão aparece no dia da compra só como informação (informativo: true);
// o dinheiro sai de verdade no vencimento da fatura.
function itensCalendario(familiaId, usuarioId, m, a) {
  const mesStr = _mesStr(a, m)
  const ultimoDia = new Date(a, m, 0).getDate()
  const dataDoDia = d => `${mesStr}-${String(Math.min(Math.max(1, d), ultimoDia)).padStart(2, '0')}`
  const itens = []
  const cartoes = new Map(db.prepare('SELECT * FROM cartoes').all().map(c => [c.id, c]))
  const infoCartao = (cartaoId, data) => {
    const c = cartoes.get(cartaoId)
    return c ? { informativo: true, cartao: c.nome, vencimentoFatura: vencimentoFatura(data, c.dia_fechamento, c.dia_vencimento) } : {}
  }

  // Contas a pagar (gasto fixo fora do cartão, fatura, parcela) levam uma chave estável:
  // é por ela que o "paguei" e os lembretes reconhecem a mesma conta, lançada ou não.
  const contaFixa = (recorrenteId) => ({ conta: true, chave: `recorrente:${recorrenteId}:${mesStr}` })

  const gastos = _gastosDoMes(familiaId, usuarioId, mesStr)
  for (const g of gastos) {
    const data = String(g.data_gasto).slice(0, 10)
    const extra = g.cartao_id ? infoCartao(g.cartao_id, data) : g.recorrente_id ? contaFixa(g.recorrente_id) : {}
    itens.push({ data, tipo: 'saida', descricao: g.descricao, valor: Number(g.valor), categoria: g.categoria || 'Outros', fonte: g.origem === 'recorrente' ? 'recorrente' : 'gasto', ...extra })
  }

  for (const r of _recorrentesPendentes(familiaId, usuarioId, a, m, gastos)) {
    const extra = r.cartao_id ? infoCartao(r.cartao_id, r.data) : contaFixa(r.id)
    itens.push({ data: r.data, tipo: 'saida', descricao: r.descricao, valor: Number(r.valor), categoria: r.categoria || 'Outros', fonte: 'recorrente', ...extra })
  }

  itens.push(..._faturasDoMes(familiaId, usuarioId, a, m, cartoes))

  // Parcela de empréstimo/financiamento no dia do vencimento cadastrado. Consignado
  // (desconto em folha) fica de fora: a parcela já sai do salário, que entra líquido.
  const emprestimos = _porEscopo(
    `SELECT e.* FROM emprestimos e WHERE e.usuario_id = ? AND e.status = 'ativo' AND COALESCE(e.desconto_folha, 0) = 0`,
    `SELECT e.* FROM emprestimos e JOIN usuarios u ON e.usuario_id = u.id WHERE u.familia_id = ? AND e.status = 'ativo' AND COALESCE(e.desconto_folha, 0) = 0`,
    `SELECT e.* FROM emprestimos e WHERE e.status = 'ativo' AND COALESCE(e.desconto_folha, 0) = 0`,
    usuarioId, familiaId)
  for (const e of emprestimos) {
    if (!(Number(e.parcela_mensal) > 0) || !e.data_vencimento) continue
    const dia = Number(String(e.data_vencimento).slice(8, 10)) || 1
    itens.push({ data: dataDoDia(dia), tipo: 'saida', descricao: `Parcela ${e.descricao}`, valor: Number(e.parcela_mensal), categoria: 'Financiamento', fonte: 'emprestimo', conta: true, chave: `emprestimo:${e.id}:${mesStr}` })
  }

  const receitas = _porEscopo(
    `SELECT r.* FROM receitas r WHERE r.usuario_id = ? AND strftime('%Y-%m', r.data_receita) = ?`,
    `SELECT r.* FROM receitas r JOIN usuarios u ON r.usuario_id = u.id WHERE u.familia_id = ? AND strftime('%Y-%m', r.data_receita) = ?`,
    `SELECT r.* FROM receitas r WHERE strftime('%Y-%m', r.data_receita) = ?`,
    usuarioId, familiaId, mesStr)
  for (const r of receitas) {
    itens.push({ data: String(r.data_receita).slice(0, 10), tipo: 'entrada', descricao: r.descricao, valor: Number(r.valor), categoria: r.tipo || 'outro', fonte: 'receita' })
  }

  for (const rp of programadasDoMes(familiaId, usuarioId, m, a)) {
    const base = { tipo: 'entrada', descricao: rp.descricao, valor: Number(rp.valor), categoria: 'programada', fonte: rp.estimada ? 'estimada' : 'programada' }
    if (rp.tipo === 'semanal') {
      const ds = rp.dia_semana != null ? Number(rp.dia_semana) : 1
      for (let d = 1; d <= ultimoDia; d++) {
        if (new Date(a, m - 1, d).getDay() === ds) itens.push({ ...base, data: dataDoDia(d) })
      }
    } else if (rp.tipo === 'quinzenal') {
      const d1 = rp.dia_mes || 1
      itens.push({ ...base, data: dataDoDia(d1) })
      itens.push({ ...base, data: dataDoDia(d1 + 15) })
    } else {
      itens.push({ ...base, data: dataDoDia(rp.dia_mes || 1) })
    }
  }

  // Valores a receber (venda parcelada etc.). O que já tem destino (investimento, reserva,
  // quitar dívida) aparece na Agenda mas não engorda o saldo para gastar: é informativo.
  const recebiveis = _porEscopo(
    `SELECT r.* FROM recebiveis r WHERE r.usuario_id = ? AND strftime('%Y-%m', r.data_prevista) = ?`,
    `SELECT r.* FROM recebiveis r JOIN usuarios u ON r.usuario_id = u.id WHERE u.familia_id = ? AND strftime('%Y-%m', r.data_prevista) = ?`,
    `SELECT r.* FROM recebiveis r WHERE strftime('%Y-%m', r.data_prevista) = ?`,
    usuarioId, familiaId, mesStr)
  for (const r of recebiveis) {
    itens.push({
      data: String(r.data_prevista).slice(0, 10), tipo: 'entrada', valor: Number(r.valor_recebido ?? r.valor),
      descricao: `${r.grupo} · ${r.descricao}`, categoria: 'A receber', fonte: 'recebivel',
      informativo: r.destino !== 'livre', destino: r.destino, recebido: !!r.recebido_em, recebivelId: r.id
    })
  }
  return itens
}

// ===== VALORES A RECEBER =====
const DESTINOS = ['investimento', 'reserva', 'divida', 'livre']
function listarRecebiveis(familiaId = null, usuarioId = null) {
  return _porEscopo(
    `SELECT r.*, u.nome AS usuario_nome, p.nome AS patrimonio_nome FROM recebiveis r JOIN usuarios u ON u.id = r.usuario_id LEFT JOIN patrimonio p ON p.id = r.patrimonio_id WHERE r.usuario_id = ? ORDER BY r.data_prevista, r.id`,
    `SELECT r.*, u.nome AS usuario_nome, p.nome AS patrimonio_nome FROM recebiveis r JOIN usuarios u ON u.id = r.usuario_id LEFT JOIN patrimonio p ON p.id = r.patrimonio_id WHERE u.familia_id = ? ORDER BY r.data_prevista, r.id`,
    `SELECT r.*, u.nome AS usuario_nome, p.nome AS patrimonio_nome FROM recebiveis r JOIN usuarios u ON u.id = r.usuario_id LEFT JOIN patrimonio p ON p.id = r.patrimonio_id ORDER BY r.data_prevista, r.id`,
    usuarioId, familiaId)
}
function criarRecebiveis(usuarioId, grupo, itens) {
  const ins = db.prepare('INSERT INTO recebiveis (usuario_id, grupo, descricao, valor, data_prevista, destino) VALUES (?, ?, ?, ?, ?, ?)')
  db.exec('BEGIN')
  try {
    for (const it of itens) {
      ins.run(usuarioId, grupo, it.descricao, it.valor, it.data, DESTINOS.includes(it.destino) ? it.destino : 'investimento')
    }
    db.exec('COMMIT')
  } catch (e) { db.exec('ROLLBACK'); throw e }
  return itens.length
}
function editarRecebivel(id, { grupo, descricao, valor, data, destino }) {
  const r = db.prepare('SELECT * FROM recebiveis WHERE id = ?').get(id)
  if (!r) return null
  db.prepare('UPDATE recebiveis SET grupo = ?, descricao = ?, valor = ?, data_prevista = ?, destino = ? WHERE id = ?').run(
    grupo || r.grupo, descricao || r.descricao, Number(valor) > 0 ? Number(valor) : r.valor,
    /^\d{4}-\d{2}-\d{2}$/.test(data || '') ? data : r.data_prevista,
    DESTINOS.includes(destino) ? destino : r.destino, id)
  return db.prepare('SELECT * FROM recebiveis WHERE id = ?').get(id)
}
// "Recebi": guarda quanto e quando chegou e, se foi para um item do patrimônio
// (investimento ou reserva), soma o valor nele.
function marcarRecebido(id, { valor, data, destino, patrimonioId }) {
  const r = db.prepare('SELECT * FROM recebiveis WHERE id = ?').get(id)
  if (!r) return null
  if (r.recebido_em) desfazerRecebido(id)
  const v = Number(valor) > 0 ? Number(valor) : Number(r.valor)
  const dest = DESTINOS.includes(destino) ? destino : r.destino
  const pid = patrimonioId ? Number(patrimonioId) : null
  db.exec('BEGIN')
  try {
    db.prepare('UPDATE recebiveis SET recebido_em = ?, valor_recebido = ?, destino = ?, patrimonio_id = ? WHERE id = ?')
      .run(/^\d{4}-\d{2}-\d{2}$/.test(data || '') ? data : hojeBR(), v, dest, pid, id)
    if (pid) db.prepare('UPDATE patrimonio SET valor = valor + ?, atualizado_em = ? WHERE id = ?').run(v, hojeBR(), pid)
    db.exec('COMMIT')
  } catch (e) { db.exec('ROLLBACK'); throw e }
  registrarHistoricoPatrimonio(r.usuario_id)
  return db.prepare('SELECT * FROM recebiveis WHERE id = ?').get(id)
}
function desfazerRecebido(id) {
  const r = db.prepare('SELECT * FROM recebiveis WHERE id = ?').get(id)
  if (!r || !r.recebido_em) return r
  if (r.patrimonio_id) db.prepare('UPDATE patrimonio SET valor = valor - ?, atualizado_em = ? WHERE id = ?').run(Number(r.valor_recebido || r.valor), hojeBR(), r.patrimonio_id)
  db.prepare('UPDATE recebiveis SET recebido_em = NULL, valor_recebido = NULL, patrimonio_id = NULL WHERE id = ?').run(id)
  registrarHistoricoPatrimonio(r.usuario_id)
  return db.prepare('SELECT * FROM recebiveis WHERE id = ?').get(id)
}
function deletarRecebivel(id) {
  desfazerRecebido(id)
  return db.prepare('DELETE FROM recebiveis WHERE id = ?').run(id)
}
// Previstos que já passaram da data e não foram marcados (para o aviso no celular).
function recebiveisAtrasados(usuarioId) {
  return db.prepare('SELECT * FROM recebiveis WHERE usuario_id = ? AND recebido_em IS NULL AND data_prevista < ? ORDER BY data_prevista').all(usuarioId, hojeBR())
}

// ===== PATRIMÔNIO =====
const TIPOS_PATRIMONIO = ['reserva', 'investimento', 'negocio', 'bem', 'outro']
function listarPatrimonio(familiaId = null, usuarioId = null) {
  return _porEscopo(
    `SELECT p.*, u.nome AS usuario_nome FROM patrimonio p JOIN usuarios u ON u.id = p.usuario_id WHERE p.usuario_id = ? AND p.ativo = 1 ORDER BY p.tipo, p.nome`,
    `SELECT p.*, u.nome AS usuario_nome FROM patrimonio p JOIN usuarios u ON u.id = p.usuario_id WHERE u.familia_id = ? AND p.ativo = 1 ORDER BY p.tipo, p.nome`,
    `SELECT p.*, u.nome AS usuario_nome FROM patrimonio p JOIN usuarios u ON u.id = p.usuario_id WHERE p.ativo = 1 ORDER BY p.tipo, p.nome`,
    usuarioId, familiaId)
}
function salvarPatrimonio(usuarioId, { id, tipo, nome, valor, instituicao }) {
  const t = TIPOS_PATRIMONIO.includes(tipo) ? tipo : 'outro'
  let pid = id
  if (id) {
    db.prepare('UPDATE patrimonio SET tipo = ?, nome = ?, valor = ?, instituicao = ?, atualizado_em = ? WHERE id = ?')
      .run(t, nome, Number(valor) || 0, instituicao || '', hojeBR(), id)
  } else {
    pid = Number(db.prepare('INSERT INTO patrimonio (usuario_id, tipo, nome, valor, instituicao, atualizado_em) VALUES (?, ?, ?, ?, ?, ?)')
      .run(usuarioId, t, nome, Number(valor) || 0, instituicao || '', hojeBR()).lastInsertRowid)
  }
  const dono = db.prepare('SELECT usuario_id FROM patrimonio WHERE id = ?').get(pid)?.usuario_id
  if (dono) registrarHistoricoPatrimonio(dono)
  return db.prepare('SELECT * FROM patrimonio WHERE id = ?').get(pid)
}
function deletarPatrimonio(id) {
  const p = db.prepare('SELECT usuario_id FROM patrimonio WHERE id = ?').get(id)
  db.prepare('UPDATE patrimonio SET ativo = 0 WHERE id = ?').run(id)
  db.prepare('UPDATE recebiveis SET patrimonio_id = NULL WHERE patrimonio_id = ?').run(id)
  if (p) registrarHistoricoPatrimonio(p.usuario_id)
}
// Fotografia do patrimônio de uma pessoa: o que tem, o que deve e o que ainda vai receber.
function _numerosPatrimonio(usuarioIds) {
  if (!usuarioIds.length) return { itens: 0, contas: 0, dividas: 0, aReceber: 0 }
  const em = `(${usuarioIds.map(() => '?').join(',')})`
  const um = sql => Number(db.prepare(sql).get(...usuarioIds).v || 0)
  return {
    itens: um(`SELECT COALESCE(SUM(valor), 0) v FROM patrimonio WHERE ativo = 1 AND usuario_id IN ${em}`),
    contas: um(`SELECT COALESCE(SUM(saldo), 0) v FROM contas WHERE usuario_id IN ${em}`),
    dividas: um(`SELECT COALESCE(SUM(valor_total - valor_pago), 0) v FROM emprestimos WHERE status = 'ativo' AND usuario_id IN ${em}`),
    aReceber: um(`SELECT COALESCE(SUM(valor), 0) v FROM recebiveis WHERE recebido_em IS NULL AND usuario_id IN ${em}`)
  }
}
function registrarHistoricoPatrimonio(usuarioId) {
  const n = _numerosPatrimonio([usuarioId])
  db.prepare(`INSERT INTO patrimonio_historico (usuario_id, mes, ativos, dividas, a_receber) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(usuario_id, mes) DO UPDATE SET ativos = excluded.ativos, dividas = excluded.dividas, a_receber = excluded.a_receber`)
    .run(usuarioId, hojeBR().slice(0, 7), n.itens + n.contas, n.dividas, n.aReceber)
}
function resumoPatrimonio(familiaId = null, usuarioId = null) {
  const ids = usuarioId ? [usuarioId]
    : db.prepare('SELECT id FROM usuarios WHERE familia_id = ?').all(familiaId).map(u => u.id)
  for (const id of ids) registrarHistoricoPatrimonio(id)
  const n = _numerosPatrimonio(ids)
  const porTipo = {}
  for (const p of listarPatrimonio(familiaId, usuarioId)) porTipo[p.tipo] = (porTipo[p.tipo] || 0) + Number(p.valor)
  const em = `(${ids.map(() => '?').join(',') || 'NULL'})`
  const historico = ids.length ? db.prepare(`SELECT mes, SUM(ativos) ativos, SUM(dividas) dividas, SUM(a_receber) a_receber
    FROM patrimonio_historico WHERE usuario_id IN ${em} GROUP BY mes ORDER BY mes DESC LIMIT 12`).all(...ids).reverse() : []
  const ativos = n.itens + n.contas
  return {
    ativos, itens: n.itens, contas: n.contas, dividas: n.dividas, aReceber: n.aReceber,
    liquido: ativos - n.dividas, liquidoComReceber: ativos - n.dividas + n.aReceber,
    porTipo, historico: historico.map(h => ({ ...h, liquido: h.ativos - h.dividas }))
  }
}

// Status de uma conta a pagar. Paga se marcada, ou se venceu antes do "paguei" existir.
function _statusConta(item, pagos, desde, hoje) {
  if (!item.conta) return {}
  const marcada = pagos.has(item.chave)
  const pago = marcada || item.data < desde
  return { pago, pagoAuto: pago && !marcada, atrasada: !pago && item.data < hoje }
}

// Contas (fatura, parcela, gasto fixo) que vencem até hoje + 'dias', com status de pagamento.
// Atrasadas entram até ~2 meses para trás (e nunca antes do "paguei" existir).
function contasAPagar(familiaId = null, usuarioId = null, dias = 7) {
  const hoje = hojeBR()
  const desde = obterConfig('pagamentos_desde') || hoje
  const doisMeses = somaDias(hoje, -62)
  const inicio = desde > doisMeses ? desde : doisMeses
  const limite = somaDias(hoje, dias)
  const pagos = chavesPagas()
  const out = []
  let [y, m] = inicio.split('-').map(Number)
  const [ly, lm] = limite.split('-').map(Number)
  while (y * 12 + m <= ly * 12 + lm) {
    for (const i of itensCalendario(familiaId, usuarioId, m, y)) {
      if (!i.conta || i.data < inicio || i.data > limite) continue
      out.push({ ...i, ..._statusConta(i, pagos, desde, hoje), venceHoje: i.data === hoje })
    }
    ;[y, m] = _somaMes(y, m, 1)
  }
  return out.sort((a, b) => a.data.localeCompare(b.data) || b.valor - a.valor)
}

// Monta a grade do mês e corre o saldo previsto dia a dia a partir do saldo de hoje.
// O saldo das contas é o de hoje: o que venceu e foi pago já saiu dele; o que vence depois
// de hoje mexe nele no dia; e conta vencida e NÃO paga ainda vai sair — entra hoje.
// Meses futuros começam do saldo final projetado do mês anterior.
function calendarioMes(familiaId = null, usuarioId = null, mes = null, ano = null) {
  const hojeStr = hojeBR()
  const [hy, hm] = hojeStr.split('-').map(Number)
  const m = mes || hm
  const a = ano || hy
  const idx = (y, mm) => y * 12 + (mm - 1)
  const distancia = idx(a, m) - idx(hy, hm)
  const pagos = chavesPagas()
  const desde = obterConfig('pagamentos_desde') || hojeStr

  // Compra no cartão (informativo) nunca mexe em saldo nem em total: quem mexe é a fatura.
  // Conta paga antes do vencimento já saiu da conta bancária: não sai de novo no dia.
  const movimenta = i => !i.informativo
  const saiNoDia = i => movimenta(i) && !(i.conta && _statusConta(i, pagos, desde, hojeStr).pago)
  const fluxoFuturo = (y, mm) => itensCalendario(familiaId, usuarioId, mm, y)
    .filter(i => saiNoDia(i) && i.data > hojeStr)
    .reduce((acc, i) => acc + (i.tipo === 'entrada' ? i.valor : -i.valor), 0)

  const pendentesHoje = contasAPagar(familiaId, usuarioId, 0).filter(c => !c.pago)
  const pendentes = { qtd: pendentesHoje.length, total: pendentesHoje.reduce((acc, c) => acc + c.valor, 0) }

  // Saldo de abertura: hoje para o mês corrente; projeção encadeada para até 6 meses à frente.
  let saldoAbertura = null
  if (distancia >= 0 && distancia <= 6) {
    saldoAbertura = listarContas(familiaId, usuarioId).reduce((acc, c) => acc + Number(c.saldo || 0), 0) - pendentes.total
    for (let k = 0; k < distancia; k++) {
      const [y, mm] = _somaMes(hy, hm, k)
      saldoAbertura += fluxoFuturo(y, mm)
    }
  }

  const itens = itensCalendario(familiaId, usuarioId, m, a)
    .map(i => ({ ...i, previsto: i.data > hojeStr, ..._statusConta(i, pagos, desde, hojeStr) }))
  const ultimoDia = new Date(a, m, 0).getDate()
  const mesStr = _mesStr(a, m)

  let saldo = saldoAbertura
  let menor = null
  const dias = []
  for (let d = 1; d <= ultimoDia; d++) {
    const data = `${mesStr}-${String(d).padStart(2, '0')}`
    const doDia = itens.filter(i => i.data === data)
    const entradas = doDia.filter(i => movimenta(i) && i.tipo === 'entrada').reduce((acc, i) => acc + i.valor, 0)
    const saidas = doDia.filter(i => movimenta(i) && i.tipo === 'saida').reduce((acc, i) => acc + i.valor, 0)
    let saldoDia = null
    if (saldo != null && data >= hojeStr) {
      if (data > hojeStr) {
        saldo += doDia.filter(i => saiNoDia(i)).reduce((acc, i) => acc + (i.tipo === 'entrada' ? i.valor : -i.valor), 0)
      }
      saldoDia = saldo
      if (!menor || saldo < menor.valor) menor = { valor: saldo, data }
    }
    dias.push({ dia: d, data, entradas, saidas, saldo: saldoDia, itens: doDia })
  }

  const totalEntradas = itens.filter(i => movimenta(i) && i.tipo === 'entrada').reduce((acc, i) => acc + i.valor, 0)
  const totalSaidas = itens.filter(i => movimenta(i) && i.tipo === 'saida').reduce((acc, i) => acc + i.valor, 0)
  return {
    mes: m, ano: a, hoje: hojeStr,
    primeiroDiaSemana: new Date(a, m - 1, 1).getDay(),
    dias, totalEntradas, totalSaidas, pendentes,
    saldoAbertura, saldoFinal: saldo, menorSaldo: menor
  }
}

// ===== RESUMO POR FAMÍLIA =====
function resumoFinanceiro(familiaId = null, usuarioId = null) {
  const todosUsuarios = listarUsuarios(familiaId)
  const usuarios = usuarioId ? todosUsuarios.filter(u => u.id === Number(usuarioId)) : todosUsuarios
  const salarioTotal = usuarios.reduce((acc, u) => acc + (u.salario || 0), 0)

  // Renda calculada das receitas programadas; cai no campo salario só se não houver nenhuma
  // cadastrada. Testar o total > 0 não serve: quando a estimativa de salário sai da conta
  // (salário real lançado), o total pode zerar e o salário seria somado duas vezes.
  const rendaProgramada = calcularRendaMes(familiaId, usuarioId)
  const { total: gastosMes } = totalGastosMes(familiaId, usuarioId)
  const { total: receitasExtras } = totalReceitasMes(familiaId, usuarioId)
  const receitasProgramadas = listarReceitasProgramadas(familiaId, usuarioId)
  const temProgramadas = receitasProgramadas.some(r => r.ativa)
  const rendaBase = temProgramadas ? rendaProgramada : salarioTotal
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

function deletarGasto(id) {
  const g = db.prepare('SELECT * FROM gastos WHERE id = ?').get(id)
  if (g?.cartao_id) db.prepare('UPDATE cartoes SET gasto_atual = MAX(0, gasto_atual - ?) WHERE id = ?').run(g.valor, g.cartao_id)
  return db.prepare('DELETE FROM gastos WHERE id = ?').run(id)
}

function limparGastosImportados(familiaId = null, usuarioId = null) {
  if (usuarioId) {
    return db.prepare("DELETE FROM gastos WHERE usuario_id = ? AND origem = 'importado'").run(usuarioId)
  }
  if (familiaId) {
    return db.prepare("DELETE FROM gastos WHERE usuario_id IN (SELECT id FROM usuarios WHERE familia_id = ?) AND origem = 'importado'").run(familiaId)
  }
  return { changes: 0 }
}

// ===== ORÇAMENTOS POR CATEGORIA =====
function listarOrcamentos(familiaId = null, usuarioId = null) {
  if (usuarioId) return db.prepare('SELECT * FROM orcamentos WHERE usuario_id = ? ORDER BY categoria').all(usuarioId)
  if (familiaId) return db.prepare('SELECT o.*, u.nome as usuario_nome FROM orcamentos o JOIN usuarios u ON o.usuario_id = u.id WHERE o.familia_id = ? ORDER BY o.categoria').all(familiaId)
  return db.prepare('SELECT * FROM orcamentos ORDER BY categoria').all()
}
function salvarOrcamento(usuarioId, familiaId, categoria, valorLimite) {
  const ex = db.prepare('SELECT id FROM orcamentos WHERE usuario_id = ? AND categoria = ?').get(usuarioId, categoria)
  if (ex) return db.prepare('UPDATE orcamentos SET valor_limite = ? WHERE id = ?').run(valorLimite, ex.id)
  return db.prepare('INSERT INTO orcamentos (usuario_id, familia_id, categoria, valor_limite) VALUES (?, ?, ?, ?)').run(usuarioId, familiaId || 1, categoria, valorLimite)
}
function deletarOrcamento(id) {
  return db.prepare('DELETE FROM orcamentos WHERE id = ?').run(id)
}

// ===== GASTOS RECORRENTES =====
function listarRecorrentes(familiaId = null, usuarioId = null) {
  const base = 'SELECT gr.*, u.nome as usuario_nome, c.nome as cartao_nome FROM gastos_recorrentes gr JOIN usuarios u ON gr.usuario_id = u.id LEFT JOIN cartoes c ON gr.cartao_id = c.id'
  if (usuarioId) return db.prepare(`${base} WHERE gr.usuario_id = ? ORDER BY gr.dia_mes, gr.descricao`).all(usuarioId)
  if (familiaId) return db.prepare(`${base} WHERE u.familia_id = ? ORDER BY u.nome, gr.dia_mes`).all(familiaId)
  return db.prepare(`${base} ORDER BY gr.criado_em`).all()
}
function salvarRecorrente(usuarioId, descricao, valor, categoria, formaPagamento, diaMes, cartaoId = null) {
  const cartao = formaPagamento === 'credito' ? (cartaoId || null) : null
  return db.prepare('INSERT INTO gastos_recorrentes (usuario_id, descricao, valor, categoria, forma_pagamento, dia_mes, cartao_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(usuarioId, descricao, valor, categoria || 'Outros', formaPagamento || 'debito', diaMes || 1, cartao)
}
function atualizarRecorrente(id, descricao, valor, categoria, formaPagamento, diaMes, ativa, cartaoId = null) {
  const cartao = formaPagamento === 'credito' ? (cartaoId || null) : null
  return db.prepare('UPDATE gastos_recorrentes SET descricao=?, valor=?, categoria=?, forma_pagamento=?, dia_mes=?, ativa=?, cartao_id=? WHERE id=?').run(descricao, valor, categoria, formaPagamento, diaMes, ativa ?? 1, cartao, id)
}
function setarAtivaRecorrente(id, ativa) {
  return db.prepare('UPDATE gastos_recorrentes SET ativa = ? WHERE id = ?').run(ativa ? 1 : 0, id)
}
function deletarRecorrente(id) {
  return db.prepare('DELETE FROM gastos_recorrentes WHERE id = ?').run(id)
}
function processarRecorrentes(familiaId = null, usuarioId = null) {
  const now = new Date()
  const diaHoje = now.getDate()
  const mesStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  let recorrentes
  if (usuarioId) {
    recorrentes = db.prepare('SELECT * FROM gastos_recorrentes WHERE usuario_id = ? AND ativa = 1').all(usuarioId)
  } else if (familiaId) {
    recorrentes = db.prepare('SELECT gr.* FROM gastos_recorrentes gr JOIN usuarios u ON gr.usuario_id = u.id WHERE u.familia_id = ? AND gr.ativa = 1').all(familiaId)
  } else {
    recorrentes = db.prepare('SELECT * FROM gastos_recorrentes WHERE ativa = 1').all()
  }

  let criados = 0
  for (const r of recorrentes) {
    if (diaHoje < r.dia_mes) continue // ainda não chegou o dia
    const existente = db.prepare("SELECT id FROM gastos WHERE recorrente_id = ? AND strftime('%Y-%m', data_gasto) = ?").get(r.id, mesStr)
    if (existente) continue
    const diaStr = String(Math.min(r.dia_mes, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate())).padStart(2, '0')
    const dataGasto = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${diaStr}`
    db.prepare("INSERT INTO gastos (usuario_id, cartao_id, descricao, valor, categoria, forma_pagamento, data_gasto, origem, recorrente_id, parcelas, parcela_atual) VALUES (?, ?, ?, ?, ?, ?, ?, 'recorrente', ?, 1, 1)").run(r.usuario_id, r.cartao_id || null, r.descricao, r.valor, r.categoria, r.forma_pagamento, dataGasto, r.id)
    if (r.cartao_id) atualizarGastoCartao(r.cartao_id, r.valor)
    criados++
  }
  return criados
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
    return db.prepare(`SELECT e.*, u.nome as usuario_nome FROM emprestimos e JOIN usuarios u ON e.usuario_id = u.id WHERE u.familia_id = ? AND e.status = 'ativo' AND COALESCE(e.desconto_folha, 0) = 0 AND e.data_vencimento IS NOT NULL AND e.data_vencimento <= ? ORDER BY e.data_vencimento ASC`).all(familiaId, em7diasStr)
  }
  return db.prepare(`SELECT e.*, u.nome as usuario_nome FROM emprestimos e JOIN usuarios u ON e.usuario_id = u.id WHERE e.status = 'ativo' AND e.data_vencimento IS NOT NULL AND e.data_vencimento <= ? ORDER BY e.data_vencimento ASC`).all(em7diasStr)
}

// ===== SESSÕES E PERMISSÕES =====
const _hashToken = t => require('crypto').createHash('sha256').update(String(t)).digest('hex')
const SESSAO_DIAS = 90

function criarSessao(usuarioId) {
  const token = require('crypto').randomBytes(32).toString('hex')
  db.prepare('INSERT INTO sessoes (token_hash, usuario_id) VALUES (?, ?)').run(_hashToken(token), usuarioId)
  return token
}
// Devolve o usuário dono do token (sem o PIN), ou null se o token não existe ou expirou.
// A validade é renovada a cada uso: quem usa o app pelo menos a cada 90 dias não precisa
// digitar o PIN de novo.
function usuarioDaSessao(token) {
  if (!token) return null
  const h = _hashToken(token)
  const s = db.prepare(`SELECT usuario_id, usado_em FROM sessoes WHERE token_hash = ?
    AND usado_em >= datetime('now', ?)`).get(h, `-${SESSAO_DIAS} days`)
  if (!s) return null
  db.prepare("UPDATE sessoes SET usado_em = CURRENT_TIMESTAMP WHERE token_hash = ? AND usado_em < datetime('now', '-1 hour')").run(h)
  return semPin(obterUsuarioPorId(s.usuario_id))
}
function encerrarSessao(token) {
  if (token) db.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(_hashToken(token))
}
// Ao trocar o PIN, derruba as sessões abertas em outros aparelhos.
function encerrarOutrasSessoes(usuarioId, tokenAtual) {
  db.prepare('DELETE FROM sessoes WHERE usuario_id = ? AND token_hash != ?').run(usuarioId, _hashToken(tokenAtual || ''))
}
function semPin(u) {
  if (!u) return u
  const { pin, ...resto } = u
  return resto
}
// Família dona de um registro, para impedir que alguém mexa no que é de outra família.
// undefined = registro não existe; null = registro antigo sem dono (liberado).
const _DONO = {
  gastos: 'usuario', cartoes: 'usuario', contas: 'usuario', emprestimos: 'usuario',
  receitas: 'usuario', receitas_programadas: 'usuario', orcamentos: 'usuario',
  gastos_recorrentes: 'usuario', recebiveis: 'usuario', patrimonio: 'usuario', fatura_creditos: 'usuario', metas: 'familia', usuarios: 'proprio', familias: 'id'
}
function familiaDoRegistro(tabela, id) {
  const tipo = _DONO[tabela]
  if (!tipo) return undefined
  if (tipo === 'id') return db.prepare('SELECT id AS f FROM familias WHERE id = ?').get(id)?.f
  if (tipo === 'proprio' || tipo === 'familia') {
    const r = db.prepare(`SELECT familia_id AS f FROM ${tabela} WHERE id = ?`).get(id)
    return r ? r.f : undefined
  }
  const r = db.prepare(`SELECT t.usuario_id AS u, us.familia_id AS f FROM ${tabela} t
    LEFT JOIN usuarios us ON us.id = t.usuario_id WHERE t.id = ?`).get(id)
  if (!r) return undefined
  return r.u == null ? null : r.f
}

function registrarCreditoFatura(cartaoId, vencimento, valor, data, descricao) {
  const c = db.prepare('SELECT usuario_id FROM cartoes WHERE id = ?').get(cartaoId)
  if (!c) return null
  return Number(db.prepare('INSERT INTO fatura_creditos (usuario_id, cartao_id, vencimento, valor, data, descricao) VALUES (?, ?, ?, ?, ?, ?)')
    .run(c.usuario_id, cartaoId, vencimento, valor, data || hojeBR(), descricao || 'Pagamento antecipado').lastInsertRowid)
}
function removerCreditoFatura(id) {
  return db.prepare('DELETE FROM fatura_creditos WHERE id = ?').run(id)
}

// Cópia consistente do banco inteiro num arquivo temporário (funciona com o app rodando).
function gerarBackup() {
  const arq = path.join(require('os').tmpdir(), `financeiro-backup-${Date.now()}.db`)
  db.exec(`VACUUM INTO '${arq.replace(/'/g, "''")}'`)
  return arq
}

// Recomeço "B": apaga os números da família e mantém a estrutura. Ficam usuários, PINs,
// sessões, avisos do celular, cartões (com dia de fechamento/vencimento) e contas, com
// saldo e fatura zerados. Sai todo lançamento, dívida, renda programada e gasto fixo.
function zerarNumerosFamilia(familiaId) {
  const ids = db.prepare('SELECT id FROM usuarios WHERE familia_id = ?').all(familiaId).map(u => u.id)
  if (!ids.length) return { usuarios: 0 }
  const em = `(${ids.map(() => '?').join(',')})`
  const idsDe = tabela => db.prepare(`SELECT id FROM ${tabela} WHERE usuario_id IN ${em}`).all(...ids).map(r => r.id)
  const r = {}
  db.exec('BEGIN')
  try {
    // Chaves de "Paguei" que apontam para itens desta família.
    const chaves = [
      ...idsDe('cartoes').map(id => `fatura:${id}:%`),
      ...idsDe('gastos_recorrentes').map(id => `recorrente:${id}:%`),
      ...idsDe('emprestimos').map(id => `emprestimo:${id}:%`)
    ]
    r.pagamentos = db.prepare(`DELETE FROM pagamentos WHERE usuario_id IN ${em}`).run(...ids).changes
    for (const c of chaves) r.pagamentos += db.prepare('DELETE FROM pagamentos WHERE chave LIKE ?').run(c).changes
    for (const t of ['gastos', 'receitas', 'emprestimos', 'receitas_programadas', 'gastos_recorrentes', 'orcamentos', 'importacoes', 'notificacoes_enviadas', 'recebiveis', 'patrimonio', 'patrimonio_historico', 'fatura_creditos']) {
      r[t] = db.prepare(`DELETE FROM ${t} WHERE usuario_id IN ${em}`).run(...ids).changes
    }
    r.metas = db.prepare('DELETE FROM metas WHERE familia_id = ?').run(familiaId).changes
    r.contasZeradas = db.prepare(`UPDATE contas SET saldo = 0 WHERE usuario_id IN ${em}`).run(...ids).changes
    r.cartoesZerados = db.prepare(`UPDATE cartoes SET gasto_atual = 0 WHERE usuario_id IN ${em}`).run(...ids).changes
    // Contas de antes de hoje não devem aparecer como atrasadas no recomeço.
    salvarConfig('pagamentos_desde', hojeBR())
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  return r
}

module.exports = {
  gerarBackup, zerarNumerosFamilia, registrarCreditoFatura, removerCreditoFatura,
  listarRecebiveis, criarRecebiveis, editarRecebivel, marcarRecebido, desfazerRecebido, deletarRecebivel, recebiveisAtrasados,
  listarPatrimonio, salvarPatrimonio, deletarPatrimonio, resumoPatrimonio,
  criarSessao, usuarioDaSessao, encerrarSessao, encerrarOutrasSessoes, semPin, familiaDoRegistro,
  criarFamilia, listarFamilias, obterFamilia, editarFamilia,
  obterUsuario, obterUsuarioPorId, criarUsuario, autenticarUsuario, atualizarSalario, editarUsuario, listarUsuarios,
  criarConta, listarContas, atualizarSaldoConta, atualizarConta, deletarConta,
  criarCartao, editarCartao, registrarGastosLote, listarCartoes, obterCartaoPorNome, atualizarGastoCartao, atualizarFaturaCartao, deletarCartao,
  criarEmprestimo, listarEmprestimos, atualizarEmprestimo, editarEmprestimo, deletarEmprestimo, totalDividas,
  registrarGasto, deletarGasto, limparGastosImportados, listarGastosMes, totalGastosMes, gastosPorCategoria, ultimosGastos, gastosPorMes,
  criarMeta, listarMetas, atualizarMeta,
  registrarReceita, listarReceitas, totalReceitasMes, deletarReceita, receitasPorMes,
  listarReceitasProgramadas, adicionarReceitaProgramada, atualizarReceitaProgramada, removerReceitaProgramada, calcularRendaMes,
  projecaoGastosMeses,
  registrarImportacao, listarImportacoes,
  verificarDuplicataGasto,
  listarGastosExport, listarReceitasExport,
  alertasVencimento,
  listarOrcamentos, salvarOrcamento, deletarOrcamento,
  listarRecorrentes, salvarRecorrente, atualizarRecorrente, setarAtivaRecorrente, deletarRecorrente, processarRecorrentes,
  obterMetaRenda, salvarMetaRenda, calcularMetaRenda, custoDividas,
  calendarioMes, contasAPagar,
  hojeBR, somaDias, obterConfig, salvarConfig, marcarPago, desmarcarPago,
  salvarInscricaoPush, listarInscricoesPush, removerInscricaoPush, usuariosComPush, jaNotificado, registrarNotificacao,
  resumoFinanceiro
}
