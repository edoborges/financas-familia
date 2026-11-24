// Dados de mercado para a área de investimentos: indicadores oficiais do Banco Central (SGS)
// e cotações (Yahoo Finance, sem chave). Tudo em cache para não martelar as fontes.
// Este módulo só busca e calcula — nenhuma recomendação de investimento sai daqui.
const cache = new Map()
async function emCache(chave, ttlMs, buscar) {
  const c = cache.get(chave)
  if (c && Date.now() - c.em < ttlMs) return c.valor
  try {
    const valor = await buscar()
    cache.set(chave, { valor, em: Date.now() })
    return valor
  } catch (e) {
    if (c) return c.valor // fonte fora do ar: usa o último valor bom
    throw e
  }
}

const HORA = 60 * 60 * 1000
const bcb = async (serie, ultimos = 1) => {
  const r = await fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados/ultimos/${ultimos}?formato=json`, { signal: AbortSignal.timeout(15000) })
  if (!r.ok) throw new Error(`Banco Central HTTP ${r.status}`)
  return r.json()
}
const numBR = v => Number(String(v).replace(',', '.'))

// Ticker da B3 (PETR4, ITUB4, BOVA11, MXRF11) → PETR4.SA; cripto (BTC) → BTC-BRL.
const CRIPTOS = ['BTC', 'ETH', 'SOL', 'USDT', 'USDC', 'XRP', 'ADA', 'DOGE', 'BNB', 'LTC']
function simboloYahoo(ticker) {
  const t = String(ticker || '').trim().toUpperCase()
  if (t.startsWith('^')) return t
  if (CRIPTOS.includes(t)) return `${t}-BRL`
  if (/^[A-Z]{4}\d{1,2}F?$/.test(t)) return `${t.replace(/F$/, '')}.SA`
  return t
}

async function cotacao(ticker) {
  const simbolo = simboloYahoo(ticker)
  return emCache('cot:' + simbolo, 15 * 60 * 1000, async () => {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?range=1y&interval=1mo`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000)
    })
    if (!r.ok) throw new Error(`Cotação de ${ticker} indisponível (HTTP ${r.status})`)
    const j = await r.json()
    const res = j.chart?.result?.[0]
    if (!res?.meta?.regularMarketPrice) throw new Error(`Não achei o ativo ${ticker}`)
    const fechamentos = (res.indicators?.quote?.[0]?.close || []).filter(v => v != null)
    const preco = Number(res.meta.regularMarketPrice)
    const anterior = Number(res.meta.chartPreviousClose || res.meta.previousClose || 0)
    const umAno = fechamentos[0]
    return {
      ticker: String(ticker).toUpperCase(), simbolo, preco,
      nome: res.meta.longName || res.meta.shortName || String(ticker).toUpperCase(),
      moeda: res.meta.currency || 'BRL',
      // variação do dia: o Yahoo manda o percentual pronto em alguns ativos; senão, calcula.
      variacaoDia: res.meta.regularMarketChangePercent != null ? Number(res.meta.regularMarketChangePercent)
        : (anterior ? (preco / anterior - 1) * 100 : null),
      variacao12m: umAno ? (preco / umAno - 1) * 100 : null,
      atualizadoEm: res.meta.regularMarketTime ? new Date(res.meta.regularMarketTime * 1000).toISOString() : null
    }
  })
}

async function indicadores() {
  return emCache('indicadores', 6 * HORA, async () => {
    const [selic, cdi, ipca] = await Promise.all([bcb(432), bcb(4389), bcb(13522)])
    let ibov = null
    try { ibov = await cotacao('^BVSP') } catch (e) { /* bolsa fora do ar não derruba os indicadores */ }
    return {
      selic: numBR(selic[0].valor), cdi: numBR(cdi[0].valor), ipca12m: numBR(ipca[0].valor),
      ipcaRef: ipca[0].data, cdiRef: cdi[0].data,
      ibov: ibov ? { pontos: ibov.preco, variacaoDia: ibov.variacaoDia, variacao12m: ibov.variacao12m } : null
    }
  })
}

// CDI acumulado desde uma data (fator multiplicativo), a partir da série diária oficial (12).
async function fatorCdiDesde(dataISO, percentual = 100) {
  const [a, m, d] = String(dataISO).slice(0, 10).split('-')
  const serie = await emCache('cdi-desde:' + dataISO, 6 * HORA, async () => {
    const r = await fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial=${d}/${m}/${a}`, { signal: AbortSignal.timeout(20000) })
    if (!r.ok) throw new Error(`Banco Central HTTP ${r.status}`)
    return r.json()
  })
  return serie.reduce((f, dia) => f * (1 + numBR(dia.valor) / 100 * (percentual / 100)), 1)
}

// Valor de hoje de uma posição: renda variável pela cotação; renda fixa pós (% do CDI) pelo
// CDI acumulado; o resto fica no valor informado.
async function valorAtual(inv) {
  const tipo = inv.tipo
  if (['acao', 'fii', 'etf', 'cripto', 'bdr'].includes(tipo) && inv.ticker) {
    const c = await cotacao(inv.ticker)
    return { valor: c.preco * Number(inv.quantidade || 0), preco: c.preco, variacaoDia: c.variacaoDia, nome: c.nome }
  }
  if (inv.percentual_cdi && inv.data_aplicacao) {
    const f = await fatorCdiDesde(inv.data_aplicacao, Number(inv.percentual_cdi))
    return { valor: Number(inv.valor_aplicado || 0) * f }
  }
  return { valor: Number(inv.valor_atual || inv.valor_aplicado || 0) }
}

// ── Monitor: maiores altas e quedas do dia entre as ações do Ibovespa ──
// Lista aproximada da carteira do índice (as mais negociadas). Código que deixar de existir
// simplesmente não volta cotação e fica de fora.
const IBOV = ['ABEV3', 'ALOS3', 'ASAI3', 'AXIA3', 'AXIA6', 'AZZA3', 'B3SA3', 'BBAS3', 'BBDC3', 'BBDC4', 'BBSE3', 'BEEF3', 'BPAC11',
  'BRAP4', 'BRAV3', 'BRKM5', 'CMIG4', 'CMIN3', 'COGN3', 'CPFE3', 'CPLE6', 'CSAN3', 'CSMG3', 'CSNA3', 'CURY3', 'CVCB3', 'CXSE3', 'CYRE3',
  'DIRR3', 'EGIE3', 'ELET3', 'ELET6', 'EMBR3', 'ENEV3', 'ENGI11', 'EQTL3', 'FLRY3', 'GGBR4', 'GOAU4', 'HAPV3', 'HYPE3', 'IGTI11',
  'IRBR3', 'ISAE4', 'ITSA4', 'ITUB4', 'KLBN11', 'LREN3', 'MBRF3', 'MGLU3', 'MOTV3', 'MRVE3', 'MULT3', 'NATU3', 'PCAR3', 'PETR3',
  'PETR4', 'POMO4', 'PRIO3', 'PSSA3', 'RADL3', 'RAIL3', 'RAIZ4', 'RDOR3', 'RECV3', 'RENT3', 'SANB11', 'SBSP3', 'SLCE3', 'SMFT3',
  'STBP3', 'SUZB3', 'TAEE11', 'TIMS3', 'TOTS3', 'UGPA3', 'USIM5', 'VALE3', 'VAMO3', 'VBBR3', 'VIVA3', 'VIVT3', 'WEGE3', 'YDUQ3']

async function lote(tickers) {
  const r = await fetch(`https://query1.finance.yahoo.com/v7/finance/spark?symbols=${tickers.map(t => t + '.SA').join(',')}&range=1d&interval=1d`, {
    headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000)
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const j = await r.json()
  return (j.spark?.result || []).map(x => {
    const m = x.response?.[0]?.meta
    if (!m?.regularMarketPrice) return null
    const anterior = Number(m.chartPreviousClose || m.previousClose || 0)
    const variacao = m.regularMarketChangePercent != null ? Number(m.regularMarketChangePercent)
      : (anterior ? (m.regularMarketPrice / anterior - 1) * 100 : null)
    if (variacao == null) return null
    return {
      ticker: String(x.symbol).replace('.SA', ''), nome: m.longName || m.shortName || x.symbol,
      preco: Number(m.regularMarketPrice), variacao,
      max52: m.fiftyTwoWeekHigh != null ? Number(m.fiftyTwoWeekHigh) : null,
      min52: m.fiftyTwoWeekLow != null ? Number(m.fiftyTwoWeekLow) : null,
      horario: m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString() : null
    }
  }).filter(Boolean)
}

async function monitor() {
  return emCache('monitor', 10 * 60 * 1000, async () => {
    const grupos = []
    for (let i = 0; i < IBOV.length; i += 15) grupos.push(IBOV.slice(i, i + 15))
    const todos = (await Promise.all(grupos.map(g => lote(g).catch(() => [])))).flat()
    if (!todos.length) throw new Error('Cotações indisponíveis agora')
    const ordenados = [...todos].sort((a, b) => b.variacao - a.variacao)
    return {
      altas: ordenados.filter(a => a.variacao > 0).slice(0, 10),
      quedas: ordenados.filter(a => a.variacao < 0).reverse().slice(0, 10),
      sobem: todos.filter(a => a.variacao > 0).length,
      caem: todos.filter(a => a.variacao < 0).length,
      total: todos.length,
      atualizadoEm: todos.map(a => a.horario).filter(Boolean).sort().pop() || null
    }
  })
}

// Manchetes recentes sobre a ação (Google Notícias, em português): só título, veículo, data e link.
async function noticias(ticker) {
  const t = String(ticker || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
  return emCache('news:' + t, 30 * 60 * 1000, async () => {
    const r = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(t + ' ações when:7d')}&hl=pt-BR&gl=BR&ceid=BR:pt-419`, { signal: AbortSignal.timeout(15000) })
    if (!r.ok) throw new Error(`Notícias indisponíveis (HTTP ${r.status})`)
    const xml = await r.text()
    const tira = s => String(s || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()
    const itens = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 5).map(m => {
      const b = m[1]
      const campo = n => tira((b.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)<\\/${n}>`)) || [])[1])
      const fonte = campo('source')
      let titulo = campo('title')
      if (fonte && titulo.endsWith(' - ' + fonte)) titulo = titulo.slice(0, -(fonte.length + 3))
      return { titulo, fonte, link: campo('link'), data: campo('pubDate') ? new Date(campo('pubDate')).toISOString() : null }
    })
    return itens.filter(n => n.titulo && /^https?:\/\//.test(n.link))
  })
}

module.exports = { cotacao, indicadores, valorAtual, simboloYahoo, monitor, noticias }
