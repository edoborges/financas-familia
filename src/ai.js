const Anthropic = require('@anthropic-ai/sdk')

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const CATEGORIAS = [
  'Alimentação', 'Mercado', 'Saúde', 'Farmácia', 'Transporte',
  'Combustível', 'Educação', 'Lazer', 'Vestuário', 'Casa',
  'Financiamento', 'Assinatura', 'Restaurante', 'Outros'
]

async function interpretarMensagem(mensagem, nomeUsuario, contexto = {}) {
  const { cartoes = [], contas = [], salario = 0, gastosMes = 0 } = contexto

  const listaCartoes = cartoes.map(c => `${c.nome} (limite R$${c.limite}, gasto R$${c.gasto_atual})`).join(', ') || 'nenhum cadastrado'
  const listaContas = contas.map(c => `${c.nome} - ${c.banco || c.tipo} (saldo R$${c.saldo})`).join(', ') || 'nenhuma cadastrada'

  const prompt = `Você é um assistente financeiro pessoal brasileiro. Analise a mensagem de ${nomeUsuario} e responda em JSON.

CONTEXTO DO USUÁRIO:
- Salário: R$${salario}
- Gastos este mês: R$${gastosMes}
- Cartões: ${listaCartoes}
- Contas bancárias: ${listaContas}

MENSAGEM: "${mensagem}"

CATEGORIAS DISPONÍVEIS: ${CATEGORIAS.join(', ')}

FORMAS DE PAGAMENTO: dinheiro, débito, crédito, pix

Identifique o tipo da mensagem e retorne APENAS um JSON válido:

Se for um GASTO:
{
  "tipo": "gasto",
  "descricao": "descrição do gasto",
  "valor": 0.00,
  "categoria": "categoria da lista",
  "forma_pagamento": "forma de pagamento",
  "cartao_nome": "nome do cartão ou null",
  "parcelas": 1,
  "resposta": "mensagem de confirmação amigável em português"
}

Se for uma CONSULTA (saldo, resumo, gastos, metas, cartões):
{
  "tipo": "consulta",
  "consulta": "saldo|resumo|gastos|metas|cartoes",
  "resposta": "aguardando dados"
}

Se for CADASTRO (cartão, salário, meta):
{
  "tipo": "cadastro",
  "subtipo": "cartao|salario|meta",
  "dados": {},
  "resposta": "mensagem explicando o que foi entendido"
}

Se for ATUALIZAÇÃO DE SALDO DE CONTA BANCÁRIA (ex: "meu Nubank tem R$2.300", "saldo Itaú R$1500", "conta poupança R$800"):
{
  "tipo": "conta",
  "acao": "atualizar_saldo",
  "banco": "nome do banco/conta",
  "valor": 0.00,
  "tipo_conta": "corrente|poupanca|investimento",
  "resposta": "mensagem de confirmação"
}

Se for CRIAÇÃO DE NOVA CONTA (ex: "abri conta no Itaú com R$1500", "nova conta Bradesco poupança R$300"):
{
  "tipo": "conta",
  "acao": "criar",
  "banco": "nome do banco",
  "nome": "nome da conta",
  "valor": 0.00,
  "tipo_conta": "corrente|poupanca|investimento",
  "resposta": "mensagem de confirmação"
}

Se for ATUALIZAÇÃO DE FATURA DE CARTÃO (ex: "fatura do Nubank R$1.200", "meu Bradesco tem R$800 de fatura"):
{
  "tipo": "cartao_fatura",
  "nome_cartao": "nome do cartão",
  "valor": 0.00,
  "resposta": "mensagem de confirmação"
}

Se for AJUDA ou não reconhecido:
{
  "tipo": "ajuda",
  "resposta": "mensagem de ajuda"
}

Regras:
- Valores com vírgula (1.500,00) converter para número (1500.00)
- Se mencionar cartão específico, colocar o nome em cartao_nome
- Parcelas: "3x", "em 3 vezes", "parcelado em 3" = parcelas 3
- Seja sempre amigável e use emojis nas respostas
- Responda SOMENTE o JSON, sem texto antes ou depois`

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }]
  })

  try {
    const texto = response.content[0].text.trim()
    return JSON.parse(texto)
  } catch {
    return {
      tipo: 'ajuda',
      resposta: '❓ Não entendi sua mensagem. Tente: "Mercado R$150" ou "Gasolina 80 reais débito"'
    }
  }
}

async function gerarPlanoEconomia(dados) {
  const { salarioTotal, gastosMes, metas, cartoes, categorias } = dados

  const metasTexto = metas.map(m =>
    `- ${m.nome}: meta R$${m.valor_alvo}, economizado R$${m.valor_atual}${m.prazo ? `, prazo ${m.prazo}` : ''}`
  ).join('\n') || 'Nenhuma meta cadastrada'

  const categoriasTexto = categorias.map(c =>
    `- ${c.categoria}: R$${c.total.toFixed(2)} (${c.quantidade}x)`
  ).join('\n') || 'Sem gastos registrados'

  const prompt = `Você é um consultor financeiro pessoal. Analise os dados financeiros do casal e crie um plano de economia personalizado.

DADOS FINANCEIROS:
- Renda total do casal: R$${salarioTotal.toFixed(2)}/mês
- Total gasto este mês: R$${gastosMes.toFixed(2)}
- Saldo disponível: R$${(salarioTotal - gastosMes).toFixed(2)}

GASTOS POR CATEGORIA ESTE MÊS:
${categoriasTexto}

METAS DO CASAL:
${metasTexto}

Crie um plano financeiro prático com:
1. Análise dos gastos atuais (pontos de atenção)
2. Sugestão de orçamento mensal por categoria
3. Quanto poupar por mês para cada meta
4. Dicas de economia específicas para o perfil deles
5. Prazo estimado para atingir cada meta

Seja direto, use números reais e emojis. Máximo 500 palavras.`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }]
  })

  return response.content[0].text
}

async function analisarArquivoFinanceiro(base64Data, mediaType, nomeArquivo = '') {
  const isPDF = mediaType === 'application/pdf'
  const contentBlock = isPDF
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } }

  const prompt = `Analise este documento financeiro brasileiro${nomeArquivo ? ` (arquivo: ${nomeArquivo})` : ''} e extraia as informações com precisão.
Retorne APENAS um JSON válido, sem texto antes ou depois.

Se for um EXTRATO BANCÁRIO, tela de conta ou saldo:
{
  "tipo": "extrato",
  "banco": "nome do banco",
  "conta_tipo": "corrente|poupanca|investimento",
  "saldo": 0.00,
  "transacoes": [
    { "data": "YYYY-MM-DD", "descricao": "descrição", "valor": 0.00, "tipo_tx": "debito|credito" }
  ]
}

Se for uma FATURA DE CARTÃO DE CRÉDITO:
{
  "tipo": "fatura_cartao",
  "banco": "nome do banco ou cartão",
  "valor_total": 0.00,
  "vencimento": "YYYY-MM-DD",
  "fechamento": "YYYY-MM-DD",
  "itens": [
    {
      "descricao": "nome da compra",
      "valor": 0.00,
      "parcela_atual": 1,
      "total_parcelas": 1,
      "data": "YYYY-MM-DD",
      "categoria": "Alimentação|Transporte|Saúde|Lazer|Outros"
    }
  ]
}

Se for um CONTRATO ou PROPOSTA DE EMPRÉSTIMO / FINANCIAMENTO (imobiliário, veicular, pessoal, consignado, etc.):
{
  "tipo": "contrato",
  "subtipo": "emprestimo|casa|carro|outro",
  "credor": "nome do banco ou instituição financeira",
  "descricao": "descrição resumida (ex: Financiamento Imobiliário, Crédito Pessoal Caixa)",
  "valor_total": 0.00,
  "parcela_mensal": 0.00,
  "total_parcelas": 0,
  "taxa_juros": 0.00,
  "data_vencimento": "YYYY-MM-DD da próxima parcela ou vencimento",
  "valor_pago": 0.00,
  "parcelas_pagas": 0
}

Regras importantes:
- Valores sempre positivos (sem sinal negativo)
- Para parcelas identifique padrões como "3/12", "Parcela 3 de 12", "03/12x"
- Se não conseguir identificar parcelas, use parcela_atual:1 total_parcelas:1
- Datas sempre no formato YYYY-MM-DD
- Se a data não aparecer claramente, use null
- Extraia TODOS os itens visíveis na fatura
- Para contratos: taxa_juros em % ao mês (ex: 1.99 para 1,99% a.m.)
- Para contratos: se houver parcelas já pagas, informe valor_pago e parcelas_pagas`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: prompt }] }],
    betas: isPDF ? ['pdfs-2024-09-25'] : undefined
  })

  try {
    const texto = response.content[0].text.trim()
    const jsonStr = texto.replace(/^```json\n?/, '').replace(/\n?```$/, '')
    return JSON.parse(jsonStr)
  } catch {
    return { tipo: 'erro', mensagem: 'Não foi possível extrair dados do arquivo.' }
  }
}

async function gerarResumoDiario(dados) {
  const { usuarios, gastosMes, salarioTotal, ultimosGastos } = dados

  const gastosTexto = ultimosGastos.slice(0, 5).map(g =>
    `${g.usuario_nome}: ${g.descricao} R$${g.valor}`
  ).join('\n')

  const prompt = `Crie um resumo financeiro diário curto e amigável para o casal.

Dados:
- Renda: R$${salarioTotal}
- Gasto no mês: R$${gastosMes}
- Saldo: R$${(salarioTotal - gastosMes).toFixed(2)}
- Últimos gastos: ${gastosTexto}

Resumo em 3-4 linhas com emojis, tom animado e uma dica rápida. Máximo 100 palavras.`

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }]
  })

  return response.content[0].text
}

module.exports = { interpretarMensagem, gerarPlanoEconomia, gerarResumoDiario, analisarArquivoFinanceiro }
