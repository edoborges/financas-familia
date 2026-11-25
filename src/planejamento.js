// Planejamento: fechamento do mês, reserva de emergência, quem gastou, mesada e
// cobranças que se repetem (assinaturas). Tudo calculado a partir dos lançamentos.
const db = require('./database')
const { chaveRegra } = require('./openfinance')

const P = db.planDB
const somaMes = (mes, k) => {
  const [y, m] = mes.split('-').map(Number)
  const t = y * 12 + (m - 1) + k
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}
const mesAtual = () => db.hojeBR().slice(0, 7)
const r2 = v => Math.round(Number(v || 0) * 100) / 100
const mediana = arr => {
  const s = [...arr].sort((a, b) => a - b)
  const k = Math.floor(s.length / 2)
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2
}

// Categorias que continuam existindo numa emergência (perda de renda).
const ESSENCIAIS = ['Mercado', 'Alimentação', 'Casa', 'Saúde', 'Farmácia', 'Combustível', 'Transporte', 'Educação']
const MESADA_PADRAO = ['Lazer', 'Vestuário', 'Cuidados pessoais', 'Restaurante']

// Mesma regra do resumo da tela inicial: renda programada (ou salário, se não houver
// nenhuma programada) + entradas lançadas no mês.
function rendaDoMes(fam, usu, mes, receitasLancadas) {
  const [a, m] = mes.split('-').map(Number)
  const temProgramadas = db.listarReceitasProgramadas(fam, usu).some(r => r.ativa)
  let base
  if (temProgramadas) base = db.calcularRendaMes(fam, usu, m, a)
  else base = db.listarUsuarios(fam).filter(u => !usu || u.id === Number(usu)).reduce((acc, u) => acc + (Number(u.salario) || 0), 0)
  return r2(base + (receitasLancadas || 0))
}

function totaisPorMes(fam, usu, de, ate) {
  const porMes = {}
  for (const row of P.categoriasPorMes(fam, usu, de, ate)) {
    porMes[row.mes] = porMes[row.mes] || {}
    porMes[row.mes][row.categoria || 'Outros'] = Number(row.total) || 0
  }
  const receitas = Object.fromEntries(P.receitasPorMes(fam, usu, de, ate).map(r => [r.mes, Number(r.total) || 0]))
  return { porMes, receitas }
}
const somaCats = cats => Object.values(cats || {}).reduce((a, v) => a + v, 0)

// ── Fechamento de um mês (padrão: o mês passado) ──
function fechamento(fam, usu, mes = null) {
  const alvo = /^\d{4}-\d{2}$/.test(mes || '') ? mes : somaMes(mesAtual(), -1)
  const ant = somaMes(alvo, -1)
  const { porMes, receitas } = totaisPorMes(fam, usu, ant, alvo)
  const cats = porMes[alvo] || {}
  const catsAnt = porMes[ant] || {}
  const gastos = r2(somaCats(cats))
  const gastosAnterior = r2(somaCats(catsAnt))
  const renda = rendaDoMes(fam, usu, alvo, receitas[alvo])

  const todas = [...new Set([...Object.keys(cats), ...Object.keys(catsAnt)])]
  const variacoes = todas.map(c => ({
    categoria: c, atual: r2(cats[c] || 0), anterior: r2(catsAnt[c] || 0), diferenca: r2((cats[c] || 0) - (catsAnt[c] || 0))
  }))
  // Só conta como "subiu" o que mudou de verdade: mais de R$ 30 e mais de 10%.
  const relevante = v => Math.abs(v.diferenca) >= 30 && (v.anterior === 0 || Math.abs(v.diferenca) / v.anterior >= 0.1)
  const subiram = variacoes.filter(v => v.diferenca > 0 && relevante(v)).sort((a, b) => b.diferenca - a.diferenca).slice(0, 3)
  const cairam = variacoes.filter(v => v.diferenca < 0 && relevante(v)).sort((a, b) => a.diferenca - b.diferenca).slice(0, 2)
  const maiores = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([categoria, total]) => ({ categoria, total: r2(total) }))

  return {
    mes: alvo, mesAnterior: ant, renda, gastos, gastosAnterior,
    resultado: r2(renda - gastos), temDados: gastos > 0,
    subiram, cairam, maiores
  }
}

// ── Reserva de emergência ──
const chaveReserva = (fam, usu) => `reserva_meses:${fam || 0}:${usu || 'familia'}`
function reserva(fam, usu) {
  const atual = mesAtual()
  const de = somaMes(atual, -3), ate = somaMes(atual, -1)
  const { porMes, receitas } = totaisPorMes(fam, usu, de, ate)
  const meses = [de, somaMes(atual, -2), ate].filter(m => porMes[m])
  const n = meses.length

  const media = cat => n ? meses.reduce((a, m) => a + (porMes[m][cat] || 0), 0) / n : 0
  const essenciais = ESSENCIAIS.map(c => ({ categoria: c, media: r2(media(c)) })).filter(c => c.media > 0)
  const somaEssenciais = essenciais.reduce((a, c) => a + c.media, 0)
  // Parcelas de dívidas continuam vencendo numa emergência. Se os pagamentos já aparecem
  // como gasto em "Financiamento", usa o maior dos dois para não contar duas vezes.
  const parcelas = db.listarEmprestimos(fam, usu).reduce((a, e) => a + (Number(e.parcela_mensal) || 0), 0)
  const financiamento = Math.max(media('Financiamento'), parcelas)
  const custoMensal = r2(somaEssenciais + financiamento)

  const metaMeses = Math.min(24, Math.max(1, parseInt(db.obterConfig(chaveReserva(fam, usu))) || 6))
  const alvo = r2(custoMensal * metaMeses)
  const itensReserva = db.listarPatrimonio(fam, usu).filter(p => p.tipo === 'reserva')
  const guardado = r2(itensReserva.reduce((a, p) => a + (Number(p.valor) || 0), 0))
  const falta = r2(Math.max(0, alvo - guardado))

  // Quanto sobrou por mês, em média, nos meses fechados.
  const sobras = meses.map(m => rendaDoMes(fam, usu, m, receitas[m]) - somaCats(porMes[m]))
  const sobraMedia = n ? r2(sobras.reduce((a, v) => a + v, 0) / n) : 0
  const mesesParaChegar = falta > 0 && sobraMedia > 0 ? Math.ceil(falta / sobraMedia) : null

  return {
    temDados: n > 0, mesesUsados: n, custoMensal, essenciais, financiamento: r2(financiamento),
    metaMeses, alvo, guardado, falta, pct: alvo > 0 ? Math.min(100, Math.round((guardado / alvo) * 100)) : 0,
    mesesCobertos: custoMensal > 0 ? Math.round((guardado / custoMensal) * 10) / 10 : 0,
    sobraMedia, mesesParaChegar, temItemReserva: itensReserva.length > 0
  }
}
function salvarMetaReserva(fam, usu, meses) {
  const n = Math.min(24, Math.max(1, parseInt(meses) || 6))
  db.salvarConfig(chaveReserva(fam, usu), n)
  return n
}

// ── Quem gastou o quê ──
function porPessoa(fam, mes = null) {
  const alvo = /^\d{4}-\d{2}$/.test(mes || '') ? mes : mesAtual()
  const pessoas = {}
  for (const row of P.porPessoa(fam, alvo)) {
    const p = pessoas[row.usuario_id] = pessoas[row.usuario_id] || { usuario_id: row.usuario_id, nome: row.nome, total: 0, qtd: 0, categorias: [] }
    p.total += Number(row.total) || 0
    p.qtd += Number(row.qtd) || 0
    p.categorias.push({ categoria: row.categoria || 'Outros', total: r2(row.total) })
  }
  const lista = Object.values(pessoas).map(p => ({ ...p, total: r2(p.total) })).sort((a, b) => b.total - a.total)
  const total = r2(lista.reduce((a, p) => a + p.total, 0))
  lista.forEach(p => { p.pct = total > 0 ? Math.round((p.total / total) * 100) : 0 })
  return { mes: alvo, total, pessoas: lista }
}

// ── Mesada pessoal ──
const CATS_VALIDAS = ['Mercado', 'Alimentação', 'Restaurante', 'Combustível', 'Transporte', 'Casa', 'Saúde', 'Farmácia', 'Educação', 'Lazer', 'Vestuário', 'Cuidados pessoais', 'Assinatura', 'Financiamento', 'Outros']
function lerCategorias(txt) {
  try {
    const arr = JSON.parse(txt || '[]')
    return Array.isArray(arr) ? arr.filter(c => CATS_VALIDAS.includes(c)) : []
  } catch (_) { return [] }
}
function mesadas(fam, eu) {
  const mes = mesAtual()
  const [y, m] = mes.split('-').map(Number)
  const diasNoMes = new Date(y, m, 0).getDate()
  const diaHoje = Number(db.hojeBR().slice(8, 10))
  return P.mesadas(fam).map(row => {
    const valor = r2(row.valor)
    const categorias = row.valor == null ? MESADA_PADRAO : lerCategorias(row.categorias)
    const gasto = valor > 0 ? r2(P.gastosMesadaMes(row.usuario_id, mes, categorias)) : 0
    const minha = Number(row.usuario_id) === Number(eu)
    return {
      usuario_id: row.usuario_id, nome: row.nome, minha, configurada: valor > 0,
      valor, resta: r2(valor - gasto), pct: valor > 0 ? Math.min(100, Math.round((gasto / valor) * 100)) : 0,
      // Do outro, só o que sobra: a ideia é não precisar prestar contas.
      gasto: minha ? gasto : null, categorias: minha ? categorias : null,
      diasRestantes: diasNoMes - diaHoje
    }
  })
}
function salvarMesada(usuarioId, valor, categorias) {
  const v = Math.max(0, Number(valor) || 0)
  const cats = (Array.isArray(categorias) ? categorias : []).filter(c => CATS_VALIDAS.includes(c))
  P.salvarMesada(usuarioId, v, cats)
  return { valor: v, categorias: cats }
}

// ── Cobranças que se repetem todo mês ──
// "ignoradas": não é mensalidade (some da lista). "mantidas": é, e vocês decidiram manter.
const chaveLista = (tipo, fam) => `assin_${tipo}:${fam || 0}`
const lerLista = (tipo, fam) => {
  try { const a = JSON.parse(db.obterConfig(chaveLista(tipo, fam)) || '[]'); return Array.isArray(a) ? a : [] } catch (_) { return [] }
}
const lerIgnoradas = fam => lerLista('ignoradas', fam)
const semParcela = s => String(s || '').replace(/\s*\(\d+\/\d+\)\s*$/, '')
const NAO_ASSINATURA = ['Mercado', 'Combustível']

function assinaturas(fam, usu) {
  const hoje = db.hojeBR()
  const desde = somaMes(hoje.slice(0, 7), -6) + '-01'
  const recentes = db.somaDias(hoje, -45)
  const ignoradas = new Set(lerIgnoradas(fam))
  const mantidas = new Set(lerLista('mantidas', fam))
  const recorrentes = db.listarRecorrentes(fam, usu).filter(r => r.ativa)
  // "Spotify" cadastrado como conta fixa cobre o "SPOTIFY BR" que vem do banco.
  const chavesFixas = recorrentes.map(r => chaveRegra(r.descricao)).filter(k => k.length >= 4)
  const ehFixa = chave => chavesFixas.some(k => chave.includes(k) || k.includes(chave))

  const grupos = {}
  for (const g of P.gastosDesde(fam, usu, desde, hoje)) {
    if (g.recorrente_id) continue
    const chave = chaveRegra(semParcela(g.descricao))
    if (chave.length < 3 || ignoradas.has(chave) || ehFixa(chave)) continue
    ;(grupos[chave] = grupos[chave] || []).push(g)
  }

  const achadas = []
  for (const [chave, itens] of Object.entries(grupos)) {
    const porMes = {}
    for (const g of itens) {
      const m = String(g.data_gasto).slice(0, 7)
      porMes[m] = (porMes[m] || 0) + 1
    }
    const meses = Object.keys(porMes)
    if (meses.length < 3) continue
    if (Object.values(porMes).some(q => q > 2)) continue  // várias vezes no mês: é consumo, não mensalidade
    const valores = itens.map(g => Number(g.valor))
    const med = mediana(valores)
    if (!(med > 0)) continue
    const parecidos = valores.filter(v => Math.abs(v - med) / med <= 0.2).length
    if (parecidos / valores.length < 0.8) continue
    const ultimo = itens.reduce((a, g) => (g.data_gasto > a.data_gasto ? g : a))
    if (ultimo.data_gasto < recentes) continue  // parou de cobrar
    if (NAO_ASSINATURA.includes(ultimo.categoria)) continue
    achadas.push({
      chave, mantida: mantidas.has(chave), descricao: semParcela(ultimo.descricao), categoria: ultimo.categoria || 'Outros',
      valor: r2(med), anual: r2(med * 12), meses: meses.length, ultimo: ultimo.data_gasto,
      dia: Number(String(ultimo.data_gasto).slice(8, 10)) || 1,
      usuario_id: ultimo.usuario_id, usuario_nome: ultimo.usuario_nome,
      cartao_id: ultimo.cartao_id || null, forma_pagamento: ultimo.forma_pagamento || (ultimo.cartao_id ? 'credito' : 'debito')
    })
  }
  achadas.sort((a, b) => b.anual - a.anual)

  const fixas = recorrentes.map(r => ({
    id: r.id, descricao: r.descricao, categoria: r.categoria, valor: r2(r.valor), anual: r2(Number(r.valor) * 12), usuario_nome: r.usuario_nome
  })).sort((a, b) => b.anual - a.anual)
  const fixasAssinatura = fixas.filter(f => f.categoria === 'Assinatura')

  return {
    achadas, fixas, totalAchadasAno: r2(achadas.reduce((a, x) => a + x.anual, 0)),
    paraRevisar: achadas.filter(a => !a.mantida).length,
    totalAssinaturasAno: r2(fixasAssinatura.reduce((a, x) => a + x.anual, 0)),
    qtdIgnoradas: ignoradas.size
  }
}
// acao: 'ignorar' (não é mensalidade), 'manter' (é e fica) ou 'revisar' (volta a ficar pendente).
function marcarAssinatura(fam, chave, acao) {
  const c = String(chave).slice(0, 60)
  for (const tipo of ['ignoradas', 'mantidas']) {
    const lista = new Set(lerLista(tipo, fam))
    lista.delete(c)
    if ((tipo === 'ignoradas' && acao === 'ignorar') || (tipo === 'mantidas' && acao === 'manter')) lista.add(c)
    db.salvarConfig(chaveLista(tipo, fam), JSON.stringify([...lista]))
  }
}
function restaurarIgnoradas(fam) {
  db.salvarConfig(chaveLista('ignoradas', fam), '[]')
}

module.exports = {
  fechamento, reserva, salvarMetaReserva, porPessoa, mesadas, salvarMesada,
  assinaturas, marcarAssinatura, restaurarIgnoradas, somaMes, CATS_VALIDAS
}
