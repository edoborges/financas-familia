const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const pino = require('pino')
const qrcode = require('qrcode-terminal')
const path = require('path')
const fs = require('fs')

const db = require('./database')
const { interpretarMensagem, gerarPlanoEconomia, gerarResumoDiario } = require('./ai')

const authPath = process.env.DATA_PATH ? path.join(process.env.DATA_PATH, 'auth_info') : './data/auth_info'
if (!fs.existsSync(authPath)) fs.mkdirSync(authPath, { recursive: true })

let sock = null

function telefoneAutorizado(telefone) {
  const numeros = [
    process.env.PHONE_EDMILSON,
    process.env.PHONE_LEIDE
  ].filter(Boolean)
  return numeros.some(n => telefone.includes(n))
}

async function processarMensagem(telefone, mensagem) {
  const usuario = db.obterUsuario(telefone)

  if (!usuario) {
    const nomes = {
      [process.env.PHONE_EDMILSON]: 'Edmilson',
      [process.env.PHONE_LEIDE]: 'Leide'
    }
    const nome = Object.entries(nomes).find(([n]) => telefone.includes(n))?.[1] || 'Usuário'
    db.criarUsuario(nome, telefone, 0)
    return `👋 Olá ${nome}! Bem-vindo ao seu controle financeiro!\n\nPrimeiro, me diga seu salário:\n*"Meu salário é R$3000"*\n\nPara ajuda, mande: *ajuda*`
  }

  const msgLower = mensagem.toLowerCase().trim()

  // Comandos diretos
  if (msgLower === 'ajuda' || msgLower === 'help') {
    return formatarAjuda()
  }

  if (msgLower === 'resumo' || msgLower === 'saldo') {
    return await formatarResumo(usuario)
  }

  if (msgLower === 'metas') {
    return formatarMetas()
  }

  if (msgLower === 'cartões' || msgLower === 'cartoes') {
    return formatarCartoes(usuario.id)
  }

  if (msgLower === 'gastos' || msgLower === 'gastos do mês') {
    return formatarGastosMes()
  }

  if (msgLower === 'plano' || msgLower === 'plano de economia') {
    const resumo = db.resumoFinanceiro()
    const plano = await gerarPlanoEconomia(resumo)
    return `📊 *Plano de Economia Personalizado*\n\n${plano}`
  }

  // Processar com IA
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
          cartaoId = cartao.id
          const saldoCartao = cartao.limite - cartao.gasto_atual - resultado.valor
          if (saldoCartao < 0) {
            return `⚠️ Limite insuficiente no cartão ${cartao.nome}!\nLimite: R$${cartao.limite} | Usado: R$${cartao.gasto_atual} | Gasto: R$${resultado.valor}`
          }
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
      const saldoMes = usuario.salario - gastosMes
      const alertaSaldo = saldoMes < usuario.salario * 0.2 ? '\n\n⚠️ *Atenção:* Você usou mais de 80% do seu salário este mês!' : ''

      return `${resultado.resposta}\n\n💰 Seu saldo este mês: R$${saldoMes.toFixed(2)}${alertaSaldo}`
    }

    case 'consulta': {
      switch (resultado.consulta) {
        case 'saldo':
        case 'resumo':
          return await formatarResumo(usuario)
        case 'gastos':
          return formatarGastosMes()
        case 'metas':
          return formatarMetas()
        case 'cartoes':
          return formatarCartoes(usuario.id)
        default:
          return resultado.resposta
      }
    }

    case 'cadastro': {
      if (resultado.subtipo === 'salario') {
        const valor = resultado.dados?.valor
        if (valor) {
          db.atualizarSalario(usuario.telefone, valor)
          return `✅ Salário de R$${valor} registrado com sucesso, ${usuario.nome}!`
        }
      }
      if (resultado.subtipo === 'cartao') {
        const { nome, limite, diaFechamento, diaVencimento } = resultado.dados || {}
        if (nome && limite) {
          db.criarCartao(usuario.id, nome, limite, diaFechamento || 1, diaVencimento || 10)
          return `✅ Cartão *${nome}* cadastrado!\nLimite: R$${limite}`
        }
      }
      if (resultado.subtipo === 'meta') {
        const { nome, valorAlvo, prazo, descricao } = resultado.dados || {}
        if (nome && valorAlvo) {
          db.criarMeta(nome, valorAlvo, prazo, descricao)
          return `🎯 Meta *${nome}* criada!\nValor: R$${valorAlvo}${prazo ? ` | Prazo: ${prazo}` : ''}`
        }
      }
      return resultado.resposta
    }

    default:
      return formatarAjuda()
  }
}

async function formatarResumo(usuario) {
  const { total: gastosMes } = db.totalGastosMes(usuario.id)
  const saldo = usuario.salario - gastosMes
  const percentual = usuario.salario > 0 ? ((gastosMes / usuario.salario) * 100).toFixed(0) : 0
  const categorias = db.gastosPorCategoria()
  const cartoes = db.listarCartoes(usuario.id)

  let msg = `📊 *Resumo de ${usuario.nome} — ${new Date().toLocaleString('pt-BR', { month: 'long' })}*\n\n`
  msg += `💼 Salário: R$${usuario.salario.toFixed(2)}\n`
  msg += `💸 Gastos: R$${gastosMes.toFixed(2)} (${percentual}%)\n`
  msg += `💚 Saldo: R$${saldo.toFixed(2)}\n`

  if (cartoes.length > 0) {
    msg += `\n💳 *Cartões:*\n`
    cartoes.forEach(c => {
      const disponivel = c.limite - c.gasto_atual
      msg += `• ${c.nome}: R$${c.gasto_atual.toFixed(2)} / R$${c.limite.toFixed(2)} (disponível R$${disponivel.toFixed(2)})\n`
    })
  }

  if (categorias.length > 0) {
    msg += `\n📂 *Top Categorias:*\n`
    categorias.slice(0, 5).forEach(c => {
      msg += `• ${c.categoria}: R$${c.total.toFixed(2)}\n`
    })
  }

  return msg
}

function formatarGastosMes() {
  const gastos = db.listarGastosMes()
  if (gastos.length === 0) return '📭 Nenhum gasto registrado este mês.'

  let msg = `📋 *Gastos do Mês (${gastos.length} lançamentos):*\n\n`
  gastos.slice(0, 15).forEach(g => {
    const cartao = g.cartao_nome ? ` | ${g.cartao_nome}` : ''
    msg += `• *${g.usuario_nome}* — ${g.descricao}: R$${g.valor.toFixed(2)}${cartao}\n`
  })
  if (gastos.length > 15) msg += `\n_... e mais ${gastos.length - 15} lançamentos. Veja o app para detalhes._`
  return msg
}

function formatarMetas() {
  const metas = db.listarMetas()
  if (metas.length === 0) return '🎯 Nenhuma meta cadastrada.\n\nCadastre uma:\n*"Meta viagem R$5000 prazo 2025-12-31"*'

  let msg = `🎯 *Suas Metas:*\n\n`
  metas.forEach(m => {
    const percentual = m.valor_alvo > 0 ? ((m.valor_atual / m.valor_alvo) * 100).toFixed(0) : 0
    const barra = '█'.repeat(Math.floor(percentual / 10)) + '░'.repeat(10 - Math.floor(percentual / 10))
    msg += `*${m.nome}*\n`
    msg += `${barra} ${percentual}%\n`
    msg += `R$${m.valor_atual.toFixed(2)} / R$${m.valor_alvo.toFixed(2)}`
    if (m.prazo) msg += ` | Prazo: ${m.prazo}`
    msg += '\n\n'
  })
  return msg
}

function formatarCartoes(usuarioId) {
  const cartoes = db.listarCartoes(usuarioId)
  if (cartoes.length === 0) return '💳 Nenhum cartão cadastrado.\n\nCadastre um:\n*"Cartão Nubank limite R$3000"*'

  let msg = `💳 *Seus Cartões:*\n\n`
  cartoes.forEach(c => {
    const disponivel = c.limite - c.gasto_atual
    const percentual = c.limite > 0 ? ((c.gasto_atual / c.limite) * 100).toFixed(0) : 0
    const alerta = percentual > 80 ? ' ⚠️' : ''
    msg += `*${c.nome}*${alerta}\n`
    msg += `Limite: R$${c.limite.toFixed(2)}\n`
    msg += `Usado: R$${c.gasto_atual.toFixed(2)} (${percentual}%)\n`
    msg += `Disponível: R$${disponivel.toFixed(2)}\n\n`
  })
  return msg
}

function formatarAjuda() {
  return `🤖 *Controle Financeiro — Comandos:*

💸 *Registrar gasto:*
• "Mercado R$150"
• "Gasolina 80 reais débito"
• "Farmácia R$45 cartão Nubank"
• "Academia R$99 crédito 3x"

📊 *Consultas:*
• "saldo" — ver resumo do mês
• "gastos" — listar lançamentos
• "cartões" — ver limites
• "metas" — ver progresso

⚙️ *Configurar:*
• "Meu salário é R$3000"
• "Cartão Nubank limite R$5000"
• "Meta viagem R$8000"

📈 *Plano de economia:*
• "plano" — análise completa

_Mande qualquer gasto de forma natural que eu entendo! 😊_`
}

async function iniciarWhatsApp(onReady) {
  const { state, saveCreds } = await useMultiFileAuthState(authPath)
  const { version } = await fetchLatestBaileysVersion()

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['Controle Financeiro', 'Chrome', '1.0.0']
  })

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      console.log('\n📱 ESCANEIE O QR CODE ABAIXO COM SEU WHATSAPP:\n')
      qrcode.generate(qr, { small: true })
      console.log('\n')
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      console.log('❌ Conexão encerrada. Reconectando:', shouldReconnect)
      if (shouldReconnect) setTimeout(() => iniciarWhatsApp(onReady), 3000)
    }

    if (connection === 'open') {
      console.log('✅ WhatsApp conectado com sucesso!')
      if (onReady) onReady(sock)
    }
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (msg.key.fromMe || !msg.message) continue

      const telefone = msg.key.remoteJid.replace('@s.whatsapp.net', '')

      if (!telefoneAutorizado(telefone)) {
        console.log(`📵 Mensagem ignorada de número não autorizado: ${telefone}`)
        continue
      }

      const texto = msg.message?.conversation ||
                    msg.message?.extendedTextMessage?.text ||
                    msg.message?.imageMessage?.caption || ''

      if (!texto.trim()) continue

      console.log(`📩 Mensagem de ${telefone}: ${texto}`)

      try {
        await sock.sendPresenceUpdate('composing', msg.key.remoteJid)
        const resposta = await processarMensagem(telefone, texto)
        await sock.sendMessage(msg.key.remoteJid, { text: resposta })
        console.log(`✉️ Resposta enviada para ${telefone}`)
      } catch (err) {
        console.error('Erro ao processar mensagem:', err)
        await sock.sendMessage(msg.key.remoteJid, {
          text: '❌ Ocorreu um erro ao processar sua mensagem. Tente novamente.'
        })
      }
    }
  })

  return sock
}

async function enviarMensagem(telefone, mensagem) {
  if (!sock) throw new Error('WhatsApp não conectado')
  const jid = `${telefone}@s.whatsapp.net`
  await sock.sendMessage(jid, { text: mensagem })
}

module.exports = { iniciarWhatsApp, enviarMensagem }
