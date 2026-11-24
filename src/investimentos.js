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

module.exports = { cotacao, indicadores, valorAtual, simboloYahoo }
