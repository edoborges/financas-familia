const db = require('./database')
const { interpretarMensagem, gerarPlanoEconomia } = require('./ai')

async function processarMensagem(usuarioId, mensagem) {
  const usuario = db.listarUsuarios().find(u => u.id === parseInt(usuarioId))
  if (!usuario) return { resposta: '❌ Usuário não encontrado.', tipo: 'erro' }

  const msgLower = mensagem.toLowerCase().trim()

  if (msgLower === 'ajuda' || msgLower === 'help') {
    return { resposta: formatarAjuda(), tipo: 'info' }
  }
  if (msgLower === 'saldo' || msgLower === 'resumo') {
    return { resposta: formatarResumo(usuario), tipo: 'info' }
  }
  if (msgLower === 'metas') {
    return { resposta: formatarMetas(), tipo: 'info' }
  }
  if (msgLower === 'cartões' || msgLower === 'cartoes') {
    return { resposta: formatarCartoes(usuario.id), tipo: 'info' }
  }
  if (msgLower === 'gastos') {
    return { resposta: formatarGastosMes(), tipo: 'info' }
  }
  if (msgLower === 'plano') {
    const resumo = db.resumoFinanceiro()
    const plano = await gerarPlanoEconomia(resumo)
    return { resposta: `📈 *Plano de Economia*\n\n${plano}`, tipo: 'plano' }
  }

  // Detectar receita/entrada manual (ex: "Recebi R$500 de freela", "Entrada R$200 aluguel")
  const receitaMatch = msgLower.match(/(?:recebi|entrada|renda|freela|salário|salario|bônus|bonus|extra|recebimento|depositaram|caiu na conta)\s+(?:de\s+)?r?\$?\s*([\d.,]+)/i)
    || msgLower.match(/r?\$?\s*([\d.,]+)\s+(?:de\s+)?(?:receita|entrada|renda|freela|bônus|bonus|extra)/i)
  if (receitaMatch) {
    const valorStr = receitaMatch[1].replace(/\./g, '').replace(',', '.')
    const valor = parseFloat(valorStr)
    if (valor > 0) {
      const descricao = mensagem.length < 80 ? mensagem : 'Receita extra'
      db.registrarReceita(usuario.id, valor, descricao)
      return {
        resposta: `💰 Receita de R$${valor.toFixed(2)} registrada!\n\n✅ ${descricao}`,
        tipo: 'receita',
        valor
      }
    }
  }

  const cartoes = db.listarCartoes(usuario.id)
  const { total: gastosMes } = db.totalGastosMes(usuario.id)

  const resultado = await interpretarMensagem(mensagem, usuario.nome, {
    cartoes,
    salario: usuario.salario,
    gastosMes
  })

  return await executarAcao(resultado, usuario)
}

async function executarAcao(resultado, usuario) {
  switch (resultado.tipo) {
    case 'gasto': {
      let cartaoId = null

      if (resultado.cartao_nome) {
        const cartao = db.obterCartaoPorNome(resultado.cartao_nome, usuario.id)
        if (cartao) {
          const saldoCartao = cartao.limite - cartao.gasto_atual - resultado.valor
          if (saldoCartao < 0) {
            return {
              resposta: `⚠️ Limite insuficiente no cartão ${cartao.nome}!\nLimite: R$${cartao.limite} | Usado: R$${cartao.gasto_atual}`,
              tipo: 'alerta'
            }
          }
          cartaoId = cartao.id
        }
      }

      db.registrarGasto(
        usuario.id,
        resultado.descricao,
        resultado.valor,
        resultado.categoria,
        resultado.forma_pagamento,
        cartaoId,
        resultado.parcelas || 1
      )

      const { total: gastosMes } = db.totalGastosMes(usuario.id)
      const saldo = usuario.salario - gastosMes
      const alerta = saldo < usuario.salario * 0.2 && usuario.salario > 0
        ? '\n\n⚠️ Atenção: mais de 80% do salário usado este mês!' : ''

      return {
        resposta: `${resultado.resposta}\n\n💰 Saldo restante: R$${saldo.toFixed(2)}${alerta}`,
        tipo: 'gasto',
        valor: resultado.valor,
        categoria: resultado.categoria
      }
    }

    case 'receita': {
      const valor = resultado.valor || 0
      const descricao = resultado.descricao || 'Receita extra'
      if (valor > 0) {
        db.registrarReceita(usuario.id, valor, descricao)
        return { resposta: `💰 Receita de R$${valor.toFixed(2)} registrada!\n✅ ${descricao}`, tipo: 'receita' }
      }
      return { resposta: resultado.resposta || 'Receita não identificada.', tipo: 'info' }
    }

    case 'consulta': {
      const textos = {
        saldo: formatarResumo(usuario),
        resumo: formatarResumo(usuario),
        gastos: formatarGastosMes(),
        metas: formatarMetas(),
        cartoes: formatarCartoes(usuario.id)
      }
      return { resposta: textos[resultado.consulta] || resultado.resposta, tipo: 'info' }
    }

    case 'cadastro': {
      if (resultado.subtipo === 'salario' && resultado.dados?.valor) {
        db.atualizarSalario(usuario.telefone, resultado.dados.valor)
        return { resposta: `✅ Salário de R$${resultado.dados.valor} atualizado!`, tipo: 'sucesso' }
      }
      if (resultado.subtipo === 'cartao') {
        const { nome, limite, diaFechamento, diaVencimento } = resultado.dados || {}
        if (nome && limite) {
          db.criarCartao(usuario.id, nome, limite, diaFechamento || 1, diaVencimento || 10)
          return { resposta: `✅ Cartão *${nome}* cadastrado com limite R$${limite}!`, tipo: 'sucesso' }
        }
      }
      if (resultado.subtipo === 'meta') {
        const { nome, valorAlvo, prazo, descricao } = resultado.dados || {}
        if (nome && valorAlvo) {
          db.criarMeta(nome, valorAlvo, prazo, descricao)
          return { resposta: `🎯 Meta *${nome}* criada! Valor: R$${valorAlvo}`, tipo: 'sucesso' }
        }
      }
      return { resposta: resultado.resposta, tipo: 'info' }
    }

    default:
      return { resposta: formatarAjuda(), tipo: 'ajuda' }
  }
}

function formatarResumo(usuario) {
  const { total: gastosMes } = db.totalGastosMes(usuario.id)
  const saldo = usuario.salario - gastosMes
  const pct = usuario.salario > 0 ? ((gastosMes / usuario.salario) * 100).toFixed(0) : 0
  const cartoes = db.listarCartoes(usuario.id)
  const categorias = db.gastosPorCategoria()

  let msg = `📊 *Resumo de ${usuario.nome}*\n`
  msg += `Mês: ${new Date().toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}\n\n`
  msg += `💼 Salário: R$${usuario.salario.toFixed(2)}\n`
  msg += `💸 Gastos: R$${gastosMes.toFixed(2)} (${pct}%)\n`
  msg += `💚 Saldo: R$${saldo.toFixed(2)}\n`

  if (cartoes.length > 0) {
    msg += `\n💳 Cartões:\n`
    cartoes.forEach(c => {
      msg += `• ${c.nome}: R$${c.gasto_atual.toFixed(2)} / R$${c.limite.toFixed(2)}\n`
    })
  }

  if (categorias.length > 0) {
    msg += `\n📂 Top Gastos:\n`
    categorias.slice(0, 4).forEach(c => {
      msg += `• ${c.categoria}: R$${c.total.toFixed(2)}\n`
    })
  }

  return msg
}

function formatarGastosMes() {
  const gastos = db.listarGastosMes()
  if (!gastos.length) return '📭 Nenhum gasto registrado este mês.'

  let msg = `📋 *Gastos do Mês (${gastos.length})*\n\n`
  gastos.slice(0, 15).forEach(g => {
    const cartao = g.cartao_nome ? ` | ${g.cartao_nome}` : ''
    msg += `• ${g.usuario_nome} — ${g.descricao}: R$${g.valor.toFixed(2)}${cartao}\n`
  })
  if (gastos.length > 15) msg += `\n_...e mais ${gastos.length - 15} lançamentos_`
  return msg
}

function formatarMetas() {
  const metas = db.listarMetas()
  if (!metas.length) return '🎯 Nenhuma meta ainda.\n\nCrie uma:\n"Meta viagem R$5000"'

  let msg = `🎯 *Suas Metas:*\n\n`
  metas.forEach(m => {
    const pct = m.valor_alvo > 0 ? ((m.valor_atual / m.valor_alvo) * 100).toFixed(0) : 0
    msg += `*${m.nome}* — ${pct}%\n`
    msg += `R$${m.valor_atual.toFixed(2)} / R$${m.valor_alvo.toFixed(2)}`
    if (m.prazo) msg += ` | Prazo: ${m.prazo}`
    msg += '\n\n'
  })
  return msg
}

function formatarCartoes(usuarioId) {
  const cartoes = db.listarCartoes(usuarioId)
  if (!cartoes.length) return '💳 Nenhum cartão.\n\nCadastre um:\n"Cartão Nubank limite R$3000"'

  let msg = `💳 *Seus Cartões:*\n\n`
  cartoes.forEach(c => {
    const disponivel = c.limite - c.gasto_atual
    const pct = c.limite > 0 ? ((c.gasto_atual / c.limite) * 100).toFixed(0) : 0
    msg += `*${c.nome}* (${pct}% usado)\n`
    msg += `Disponível: R$${disponivel.toFixed(2)} / R$${c.limite.toFixed(2)}\n\n`
  })
  return msg
}

function formatarAjuda() {
  return `🤖 *Como usar:*

💸 Registrar gasto:
• "Mercado R$150"
• "Gasolina 80 débito"
• "Farmácia R$45 Nubank"
• "Academia R$99 crédito 3x"

💰 Registrar receita:
• "Recebi R$500 de freela"
• "Entrada R$200 aluguel"
• "Bônus R$1000"

📊 Consultas:
• "saldo" — resumo do mês
• "gastos" — ver lançamentos
• "cartões" — limites
• "metas" — progresso

⚙️ Configurar:
• "Meu salário é R$3000"
• "Cartão Nubank limite R$5000"
• "Meta viagem R$8000"

📈 "plano" — análise com IA`
}

module.exports = { processarMensagem }
