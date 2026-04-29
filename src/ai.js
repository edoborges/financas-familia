const Anthropic = require('@anthropic-ai/sdk')

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const CATEGORIAS = [
  'Alimentação', 'Mercado', 'Saúde', 'Farmácia', 'Transporte',
  'Combustível', 'Educação', 'Lazer', 'Vestuário', 'Casa',
  'Financiamento', 'Assinatura', 'Restaurante', 'Outros'
]

async function interpretarMensagem(mensagem, nomeUsuario, contexto = {}) {
  const { cartoes = [], salario = 0, gastosMes = 0 } = contexto

  const listaCartoes = cartoes.map(c => `${c.nome} (limite R$${c.limite}, gasto R$${c.gasto_atual})`).join(', ') || 'nenhum cadastrado'

  const prompt = `Você é um assistente financeiro pessoal brasileiro. Analise a mensagem de ${nomeUsuario} e responda em JSON.

CONTEXTO DO USUÁRIO:
- Salário: R$${salario}
- Gastos este mês: R$${gastosMes}
- Cartões: ${listaCartoes}

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

module.exports = { interpretarMensagem, gerarPlanoEconomia, gerarResumoDiario }
