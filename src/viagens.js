// Viagens: janelas para viajar (férias, datas do casal, feriadões), quanto cabe no
// orçamento e sugestões pesquisadas pela IA. Saída sempre de Cotia (SP).
const db = require('./database')
const V = db.viagemDB

const iso = d => d.toISOString().slice(0, 10)
const dt = s => new Date(s + 'T12:00:00Z')
const somaDias = (s, n) => iso(new Date(dt(s).getTime() + n * 86400000))
const diaSemana = s => dt(s).getUTCDay() // 0 = domingo
const difDias = (a, b) => Math.round((dt(b) - dt(a)) / 86400000)
const r2 = v => Math.round(Number(v || 0) * 100) / 100

// Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher).
function pascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

// Feriados nacionais + estaduais de SP. Carnaval e Corpus Christi são ponto facultativo
// em muitas empresas, mas costumam virar folga.
function feriados(ano) {
  const p = pascoa(ano)
  return [
    [`${ano}-01-01`, 'Confraternização Universal'],
    [somaDias(p, -47), 'Carnaval'],
    [somaDias(p, -2), 'Sexta-feira Santa'],
    [`${ano}-04-21`, 'Tiradentes'],
    [`${ano}-05-01`, 'Dia do Trabalho'],
    [somaDias(p, 60), 'Corpus Christi'],
    [`${ano}-07-09`, 'Revolução Constitucionalista (SP)'],
    [`${ano}-09-07`, 'Independência'],
    [`${ano}-10-12`, 'Nossa Senhora Aparecida'],
    [`${ano}-11-02`, 'Finados'],
    [`${ano}-11-15`, 'Proclamação da República'],
    [`${ano}-11-20`, 'Consciência Negra'],
    [`${ano}-12-25`, 'Natal']
  ].map(([data, nome]) => ({ data, nome }))
}

// Feriado que encosta no fim de semana vira janela de 3 ou 4 dias.
function feriadoes(desde, ate) {
  const out = []
  for (let ano = Number(desde.slice(0, 4)); ano <= Number(ate.slice(0, 4)); ano++) {
    for (const f of feriados(ano)) {
      if (f.data < desde || f.data > ate) continue
      const ds = diaSemana(f.data)
      let inicio = null, fim = null, ponte = false
      if (f.nome === 'Carnaval') { inicio = somaDias(f.data, -2); fim = somaDias(f.data, 1) } // sábado a terça
      else if (ds === 1) { inicio = somaDias(f.data, -2); fim = f.data }                       // sáb–seg
      else if (ds === 5) { inicio = f.data; fim = somaDias(f.data, 2) }                         // sex–dom
      else if (ds === 2) { inicio = somaDias(f.data, -3); fim = f.data; ponte = true }          // sáb–ter (ponte na segunda)
      else if (ds === 4) { inicio = f.data; fim = somaDias(f.data, 3); ponte = true }           // qui–dom (ponte na sexta)
      if (!inicio) continue
      out.push({ tipo: 'feriado', titulo: f.nome, inicio, fim, dias: difDias(inicio, fim) + 1, ponte })
    }
  }
  return out
}

// Próxima vez que a data do casal acontece, a partir de hoje.
function proximaOcorrencia(data, hoje) {
  const md = data.slice(5)
  let ano = Number(hoje.slice(0, 4))
  if (`${ano}-${md}` < hoje) ano++
  if (md === '02-29' && !((ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0)) return { quando: `${ano}-02-28`, ano }
  return { quando: `${ano}-${md}`, ano }
}

// Janelas dos próximos 12 meses, em ordem de data.
function janelas(fam) {
  const hoje = db.hojeBR()
  const ate = somaDias(hoje, 366)
  const lista = []

  for (const f of V.ferias(fam)) {
    if (f.fim < hoje || f.inicio > ate) continue
    lista.push({ tipo: 'ferias', titulo: `Férias${f.usuario_nome ? ' de ' + f.usuario_nome.split(' ')[0] : ''}`, inicio: f.inicio, fim: f.fim, dias: difDias(f.inicio, f.fim) + 1, detalhe: f.obs || '' })
  }

  for (const d of V.datas(fam)) {
    const { quando, ano } = proximaOcorrencia(d.data, hoje)
    if (quando > ate) continue
    const anos = ano - Number(d.data.slice(0, 4))
    // Fim de semana mais perto da data (sexta a domingo).
    const ds = diaSemana(quando)
    let sexta
    if (ds === 5) sexta = quando
    else if (ds === 6) sexta = somaDias(quando, -1)
    else if (ds === 0) sexta = somaDias(quando, -2)
    else sexta = ds <= 2 ? somaDias(quando, -(ds + 2)) : somaDias(quando, 5 - ds) // seg/ter: anterior; qua/qui: seguinte
    if (sexta < hoje) sexta = somaDias(sexta, 7)
    lista.push({
      tipo: 'data', titulo: d.titulo + (anos > 0 && anos < 100 ? ` · ${anos} ${anos === 1 ? 'ano' : 'anos'}` : ''),
      inicio: sexta, fim: somaDias(sexta, 2), dias: 3, data: quando,
      detalhe: `A data cai em ${['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][ds]}, ${quando.slice(8, 10)}/${quando.slice(5, 7)}`
    })
  }

  for (const f of feriadoes(hoje, ate)) {
    if (f.fim < hoje) continue
    lista.push({ ...f, detalhe: f.ponte ? 'Precisa de um dia de folga para emendar' : '' })
  }

  // Marca quando uma janela coincide com outra (ex.: aniversário dentro das férias).
  for (const j of lista) {
    j.combina = lista.filter(o => o !== j && o.inicio <= j.fim && o.fim >= j.inicio).map(o => o.titulo)
  }
  return lista.sort((a, b) => a.inicio.localeCompare(b.inicio))
}

// Quanto cabe: sobra do mês, conta negativa e limite livre de cada cartão.
function capacidade(fam) {
  const plan = require('./planejamento')
  const r = plan.reserva(fam, null)
  const cartoes = db.enriquecerCartoes(db.listarCartoes(fam)).map(c => ({
    id: c.id, nome: c.nome, usuario_nome: c.usuario_nome, limite: r2(c.limite),
    livre: r2(Math.max(0, Number(c.limite || 0) - Number(c.limite_usado || 0)))
  }))
  return { sobraMensal: r.sobraMedia, sobraBaseMesAtual: r.baseMesAtual, negativo: r.negativo, reservaGuardada: r.guardado, cartoes }
}

function custosTotal(custos) {
  return r2(Object.values(custos || {}).reduce((a, v) => a + (Number(v) || 0), 0))
}

// Plano: quanto guardar por mês até a ida e como fica no cartão.
function planoPagamento(v, cap) {
  const total = custosTotal(v.custos)
  const hoje = db.hojeBR()
  let meses = null
  if (v.ida && v.ida > hoje) {
    // Meses inteiros até o mês anterior à ida (o dinheiro precisa estar lá antes).
    const [hy, hm] = hoje.split('-').map(Number)
    const [iy, im] = v.ida.split('-').map(Number)
    meses = Math.max(1, (iy * 12 + im) - (hy * 12 + hm))
  }
  const porMes = meses ? r2(total / meses) : null
  return {
    total, meses, porMes,
    cabeNaSobra: porMes != null && cap.sobraMensal > 0 ? porMes <= cap.sobraMensal : false,
    cartoes: cap.cartoes.map(c => ({ ...c, cabe: c.livre >= total }))
  }
}

// Viagem salva antes de os detalhes serem guardados: busca na pesquisa que a originou.
function detalhesDaPesquisa(fam) {
  const mapa = new Map()
  for (const row of V.sugestoesRecentes(fam)) {
    try {
      for (const s of JSON.parse(row.conteudo).sugestoes || []) {
        const k = String(s.destino || '').toLowerCase()
        if (k && !mapa.has(k)) mapa.set(k, s)
      }
    } catch (_) {}
  }
  return mapa
}

function listarViagens(fam) {
  const cap = capacidade(fam)
  let pesquisas = null
  return V.viagens(fam).map(v => {
    let custos = {}, detalhes = null
    try { custos = JSON.parse(v.custos || '{}') } catch (_) {}
    try { detalhes = v.detalhes ? JSON.parse(v.detalhes) : null } catch (_) {}
    if (!detalhes) {
      pesquisas = pesquisas || detalhesDaPesquisa(fam)
      const s = pesquisas.get(String(v.destino).toLowerCase())
      if (s) detalhes = { porque: s.porque, hospedagem: s.hospedagem, deslocamento: s.deslocamento, como_ir: s.como_ir, oportunidade: s.oportunidade, fonte_url: s.fonte_url, base_precos: s.base_precos, dicas: s.dicas || [] }
    }
    const item = { ...v, custos, detalhes }
    return { ...item, pagamento: planoPagamento(item, cap) }
  })
}

// Sugestões da IA para uma janela. Guardadas por 24 h para não pesquisar de novo à toa.
async function sugerir(fam, { inicio, fim, motivo, foco }, forcar = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio || '') || !/^\d{4}-\d{2}-\d{2}$/.test(fim || '') || fim < inicio) throw new Error('Datas inválidas')
  const destinos = V.destinos(fam).map(d => d.nome + (d.obs ? ` (${d.obs})` : ''))
  const focoTxt = String(foco || '').slice(0, 80)
  const chave = [inicio, fim, focoTxt, destinos.join('|')].join('#')
  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19)
  if (!forcar) {
    const c = V.sugestao(fam, chave, desde)
    if (c) return { ...JSON.parse(c.conteudo), emCache: true, geradoEm: c.criado_em }
  }
  const cap = capacidade(fam)
  const { sugerirViagens } = require('./ai')
  const r = await sugerirViagens({
    inicio, fim, noites: difDias(inicio, fim), motivo: String(motivo || '').slice(0, 120), foco: focoTxt,
    destinos, hoje: db.hojeBR(), capacidade: cap
  })
  V.salvarSugestao(fam, chave, JSON.stringify(r))
  return { ...r, emCache: false }
}

module.exports = { janelas, feriados, capacidade, planoPagamento, listarViagens, custosTotal, sugerir }
