// Ícones de traço fino no lugar dos emojis.
// O app inteiro continua escrevendo emojis nos textos; este arquivo troca cada emoji conhecido
// por um ícone desenhado (SVG) assim que ele aparece na tela. Emoji desconhecido fica como está.
;(function () {
  const P = {
    home: '<path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9v11h13V9"/><path d="M10 20v-5.5h4V20"/>',
    calendario: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    mais: '<circle cx="12" cy="12" r="8.75"/><path d="M12 8.25v7.5M8.25 12h7.5"/>',
    banco: '<path d="M3.5 9.25 12 4.5l8.5 4.75"/><path d="M5.5 10.5v7M10 10.5v7M14 10.5v7M18.5 10.5v7"/><path d="M3.5 20h17"/>',
    cartao: '<rect x="3" y="5.5" width="18" height="13" rx="2.75"/><path d="M3 10h18M6.5 14.75h3.5"/>',
    alvo: '<circle cx="12" cy="12" r="8.75"/><circle cx="12" cy="12" r="4.75"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/>',
    sobe: '<path d="M3.5 16.5 9 11l3.75 3.75L20.5 7"/><path d="M15 7h5.5v5.5"/>',
    desce: '<path d="M3.5 7.5 9 13l3.75-3.75L20.5 17"/><path d="M15 17h5.5v-5.5"/>',
    grafico: '<path d="M3.5 20h17"/><rect x="5.5" y="11" width="3" height="6" rx="1"/><rect x="10.5" y="6" width="3" height="11" rx="1"/><rect x="15.5" y="13" width="3" height="4" rx="1"/>',
    moedas: '<ellipse cx="9.5" cy="7.5" rx="5.75" ry="2.75"/><path d="M3.75 7.5v4c0 1.5 2.6 2.75 5.75 2.75M15.25 7.5v2.25"/><ellipse cx="14.5" cy="13.75" rx="5.75" ry="2.75"/><path d="M8.75 13.75v3.5c0 1.5 2.6 2.75 5.75 2.75s5.75-1.25 5.75-2.75v-3.5"/>',
    nota: '<rect x="2.75" y="6.25" width="18.5" height="11.5" rx="2.25"/><circle cx="12" cy="12" r="2.5"/><path d="M6.25 9.5v.01M17.75 14.5v.01"/>',
    saida: '<circle cx="12" cy="12" r="8.75"/><path d="M9.25 14.75l5.5-5.5M10 9.25h4.75V14"/>',
    caixa: '<path d="M20.5 7.75 12 3.25 3.5 7.75v8.5L12 20.75l8.5-4.5z"/><path d="M3.5 7.75 12 12.25l8.5-4.5M12 12.25v8.5"/>',
    lixo: '<path d="M4.5 6.75h15M10 11v5.5M14 11v5.5"/><path d="M6.5 6.75l.9 12.25a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.25M9.25 6.75V4.5h5.5v2.25"/>',
    pessoa: '<circle cx="12" cy="8.25" r="3.75"/><path d="M4.75 20c1.3-3.6 4-5.5 7.25-5.5s5.95 1.9 7.25 5.5"/>',
    pessoas: '<circle cx="9" cy="8.5" r="3.25"/><path d="M3 19.5c.9-3.2 3.2-5 6-5s5.1 1.8 6 5"/><path d="M15.5 5.4a3.25 3.25 0 0 1 0 6.2M17.5 14.7c1.7.6 2.9 2.2 3.5 4.8"/>',
    brilho: '<path d="M11 3.5l1.7 4.55L17.25 9.75 12.7 11.45 11 16l-1.7-4.55L4.75 9.75 9.3 8.05z"/><path d="M18 14.5l.75 2 2 .75-2 .75-.75 2-.75-2-2-.75 2-.75z"/>',
    sino: '<path d="M6.25 16.25v-5a5.75 5.75 0 0 1 11.5 0v5l1.5 2H4.75z"/><path d="M10 20.25a2 2 0 0 0 4 0"/>',
    sinoOff: '<path d="M6.25 16.25v-5c0-1 .25-2 .7-2.8M9.6 6a5.75 5.75 0 0 1 8.15 5.25v5l1.5 2H4.75"/><path d="M10 20.25a2 2 0 0 0 4 0M4 4l16 16"/>',
    celular: '<rect x="6.75" y="2.75" width="10.5" height="18.5" rx="2.5"/><path d="M11 18h2"/>',
    carro: '<path d="M4.5 13.5 6.4 8a1.5 1.5 0 0 1 1.4-1h8.4a1.5 1.5 0 0 1 1.4 1l1.9 5.5"/><rect x="3.25" y="13" width="17.5" height="4.75" rx="1.75"/><path d="M6.25 17.75v1.75M17.75 17.75v1.75"/><circle cx="7.5" cy="15.4" r=".9" fill="currentColor" stroke="none"/><circle cx="16.5" cy="15.4" r=".9" fill="currentColor" stroke="none"/>',
    carrinho: '<path d="M3 4.25h2.4l2.1 10.5h10.25l2-7.25H6.2"/><circle cx="9.25" cy="19" r="1.35"/><circle cx="16.75" cy="19" r="1.35"/>',
    remedio: '<path d="M9.4 4.6a4.6 4.6 0 0 1 6.5 6.5l-6.8 6.8a4.6 4.6 0 0 1-6.5-6.5z" transform="translate(1.5 .75)"/><path d="M7.5 9.25l6.25 6.25"/>',
    lapis: '<path d="M4.5 19.5l.9-3.9L15.6 5.4a1.9 1.9 0 0 1 2.7 0l.3.3a1.9 1.9 0 0 1 0 2.7L8.4 18.6z"/><path d="M13.75 7.25l3 3"/>',
    ok: '<path d="M5.5 12.5l4.25 4.25L18.5 7.5"/>',
    okCirculo: '<circle cx="12" cy="12" r="8.75"/><path d="M8.25 12.25l2.6 2.6 5-5.35"/>',
    x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    xCirculo: '<circle cx="12" cy="12" r="8.75"/><path d="M9.25 9.25l5.5 5.5M14.75 9.25l-5.5 5.5"/>',
    alerta: '<path d="M10.6 4.3a1.6 1.6 0 0 1 2.8 0l7.3 13.1a1.6 1.6 0 0 1-1.4 2.35H4.7a1.6 1.6 0 0 1-1.4-2.35z"/><path d="M12 9.75v4M12 16.6v.01"/>',
    livro: '<path d="M5 18.75V5.5A2 2 0 0 1 7 3.5h12v13.25H7a2 2 0 0 0-2 2zm0 0a2 2 0 0 0 2 2h12"/>',
    pasta: '<rect x="3.25" y="7" width="17.5" height="12.75" rx="2.5"/><path d="M9 7V5.25a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5.25V7M3.25 12.5h17.5"/>',
    relogio: '<circle cx="12" cy="12" r="8.75"/><path d="M12 7.5V12l3 2"/>',
    boia: '<circle cx="12" cy="12" r="8.75"/><circle cx="12" cy="12" r="3.75"/><path d="M5.8 5.8l3.55 3.55M14.65 14.65l3.55 3.55M18.2 5.8l-3.55 3.55M9.35 14.65 5.8 18.2"/>',
    doc: '<path d="M6.25 3.25h7.5l4 4v13.5H6.25z"/><path d="M13.5 3.25v4.25h4.25M9 12.25h6M9 16h6"/>',
    talher: '<path d="M7 3.5v7.5M5 3.5V8a2 2 0 0 0 4 0V3.5M7 11v9.5"/><path d="M17 20.5v-17c-2 .9-3.25 3.3-3.25 7H17"/>',
    chave: '<circle cx="8" cy="15.5" r="4"/><path d="M10.9 12.6 19.5 4M16.5 7l2.5 2.5M14 9.5l2 2"/>',
    cadeado: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.25 10.5V7.75a3.75 3.75 0 0 1 7.5 0v2.75M12 14.5v2"/>',
    bomba: '<path d="M4.75 20.5v-15a2 2 0 0 1 2-2h5.5a2 2 0 0 1 2 2v15M3.5 20.5h12M4.75 10h9.5"/><path d="M14.25 8h2.25a1.5 1.5 0 0 1 1.5 1.5v6.25a1.5 1.5 0 0 0 3 0V8.25L18.25 5.5"/>',
    camera: '<path d="M4.25 7.5h3l1.5-2.5h6.5l1.5 2.5h3a1 1 0 0 1 1 1v10.25a1 1 0 0 1-1 1H4.25a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.25" r="3.5"/>',
    tomada: '<path d="M9 3.5v4.5M15 3.5v4.5M6.25 8h11.5v3a5.75 5.75 0 0 1-11.5 0z"/><path d="M12 16.75v3.75"/>',
    tesoura: '<circle cx="6.5" cy="6.5" r="2.75"/><circle cx="6.5" cy="17.5" r="2.75"/><path d="M8.75 8.25 20 18M8.75 15.75 20 6"/>',
    camisa: '<path d="M8.5 3.75 4 6.25l1.75 3.75 2-.85v11.1h8.5V9.15l2 .85L20 6.25l-4.5-2.5c-.75 1.3-2 2-3.5 2s-2.75-.7-3.5-2z"/>',
    baixar: '<path d="M12 3.75v11M7.75 10.75 12 15l4.25-4.25"/><path d="M4.5 15.75v3.75h15v-3.75"/>',
    subir: '<path d="M12 15V4M7.75 8.25 12 4l4.25 4.25"/><path d="M4.5 15.75v3.75h15v-3.75"/>',
    lista: '<rect x="5.25" y="4.75" width="13.5" height="16.25" rx="2.25"/><path d="M9.25 4.75V3.25h5.5v1.5M9 10.5h6M9 14.25h6M9 18h3.5"/>',
    repetir: '<path d="M4.5 11V9.5a3 3 0 0 1 3-3h12M16.5 3.5l3 3-3 3"/><path d="M19.5 13v1.5a3 3 0 0 1-3 3h-12M7.5 20.5l-3-3 3-3"/>',
    olho: '<path d="M2.75 12S6.25 5.75 12 5.75 21.25 12 21.25 12 17.75 18.25 12 18.25 2.75 12 2.75 12z"/><circle cx="12" cy="12" r="2.9"/>',
    proibido: '<circle cx="12" cy="12" r="8.75"/><path d="M5.8 5.8l12.4 12.4"/>',
    busca: '<circle cx="10.75" cy="10.75" r="6.25"/><path d="M20 20l-4.6-4.6"/>',
    esteto: '<path d="M5.5 3.5v4.75a4.75 4.75 0 0 0 9.5 0V3.5"/><path d="M10.25 13v1.75a4.75 4.75 0 0 0 9.5 0V12.5"/><circle cx="19.75" cy="10.5" r="2"/>',
    borracha: '<path d="M8 20h12"/><path d="M4.6 15.4 13.9 6.1a1.5 1.5 0 0 1 2.1 0l2.9 2.9a1.5 1.5 0 0 1 0 2.1L11.5 18.5H7.7z"/>',
    ajustes: '<path d="M4 7h9.5M18.5 7H20M4 12h3.5M12.5 12H20M4 17h11.5M20.5 17H20"/><circle cx="16" cy="7" r="2.25"/><circle cx="10" cy="12" r="2.25"/><circle cx="18" cy="17" r="2.25"/>',
    menos: '<path d="M5.5 12h13"/>',
    recibo: '<path d="M6 3.25h12v17.5l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z"/><path d="M9 8h6M9 11.75h6M9 15.5h3.5"/>',
    salvar: '<path d="M5.25 3.75h10.5l3 3v13.5H5.25z"/><path d="M8.25 3.75v4.5h6.5v-4.5M8.25 20.25v-6.5h7.5v6.5"/>',
    coracao: '<path d="M12 19.75s-7.25-4.4-7.25-9.6A4.15 4.15 0 0 1 12 7.4a4.15 4.15 0 0 1 7.25 2.75c0 5.2-7.25 9.6-7.25 9.6z"/>',
    aviao: '<path d="M21 4.5 3.75 11.25l6.5 2.5 2.5 6.5z"/><path d="M10.25 13.75 21 4.5"/>',
    chama: '<path d="M12 20.75c-3.75 0-6.25-2.6-6.25-6.1 0-3.25 2.4-5.2 3.4-8.4 2.2 1.35 2.85 3.5 2.85 5 .95-.65 1.65-1.8 1.75-3.05 1.9 1.6 2.5 3.85 2.5 6.45 0 3.5-2.5 6.1-4.25 6.1z"/>',
    loja: '<path d="M4 9.5 5.6 4.25h12.8L20 9.5"/><path d="M4 9.5h16a2.65 2.65 0 0 1-5.3 0 2.65 2.65 0 0 1-5.4 0A2.65 2.65 0 0 1 4 9.5z"/><path d="M5.25 12v8.25h13.5V12M10 20.25v-4.75h4v4.75"/>',
    alfinete: '<path d="M12 20.5V15"/><path d="M8.5 3.5h7l-1 5.5 2.75 2.75V15H6.75v-3.25L9.5 9z"/>',
    escudo: '<path d="M12 3.25 5 6v5.25c0 4.3 3 7.6 7 9.1 4-1.5 7-4.8 7-9.1V6z"/>',
    lampada: '<path d="M9.25 17.75h5.5M10.25 20.75h3.5"/><path d="M12 3.25a5.75 5.75 0 0 0-3.4 10.4c.6.45.9 1.15.9 1.95v.4h5v-.4c0-.8.3-1.5.9-1.95A5.75 5.75 0 0 0 12 3.25z"/>',
    caixaEntrada: '<path d="M3.5 13.25 6.4 5.4a1.5 1.5 0 0 1 1.4-.9h8.4a1.5 1.5 0 0 1 1.4.9l2.9 7.85v5.25a1.5 1.5 0 0 1-1.5 1.5h-14a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M3.5 13.25h4.75l1.5 2.5h4.5l1.5-2.5h4.75"/>',
    impressora: '<path d="M7 8.75V3.75h10v5"/><rect x="3.25" y="8.75" width="17.5" height="7.75" rx="2"/><path d="M7 13.5h10v6.75H7z"/>',
    presente: '<rect x="3.75" y="8" width="16.5" height="4" rx="1"/><path d="M5.25 12v8.25h13.5V12M12 8v12.25"/><path d="M12 8C10.6 4.75 7.25 4.6 7.25 6.6 7.25 8 10 8 12 8zm0 0c1.4-3.25 4.75-3.4 4.75-1.4C16.75 8 14 8 12 8z"/>',
    sol: '<circle cx="12" cy="12" r="3.75"/><path d="M12 3v1.75M12 19.25V21M3 12h1.75M19.25 12H21M5.65 5.65l1.25 1.25M17.1 17.1l1.25 1.25M5.65 18.35l1.25-1.25M17.1 6.9l1.25-1.25"/>',
    calculadora: '<rect x="5.25" y="2.75" width="13.5" height="18.5" rx="2.5"/><path d="M8.25 6.75h7.5"/><path d="M8.75 11v.01M12 11v.01M15.25 11v.01M8.75 14.25v.01M12 14.25v.01M15.25 14.25v.01M8.75 17.5v.01M12 17.5v.01M15.25 17.5v.01" stroke-width="2.25"/>',
    notebook: '<rect x="4.25" y="5" width="15.5" height="10.75" rx="1.75"/><path d="M2.5 19h19"/>',
    pastaArq: '<path d="M3.25 7A1.75 1.75 0 0 1 5 5.25h4l2 2.25h8A1.75 1.75 0 0 1 20.75 9.25V17.5A1.75 1.75 0 0 1 19 19.25H5a1.75 1.75 0 0 1-1.75-1.75z"/>',
    imagem: '<rect x="3.25" y="4.25" width="17.5" height="15.5" rx="2.75"/><circle cx="9" cy="9.5" r="1.75"/><path d="M20.75 15.25l-4.75-4.75L5.25 19.75"/>',
    clipe: '<path d="M19.75 11.5l-7.9 7.9a4.85 4.85 0 0 1-6.85-6.85l8.2-8.2a3.2 3.2 0 0 1 4.55 4.55l-8.15 8.15a1.6 1.6 0 0 1-2.25-2.25l7.45-7.45"/>',
    info: '<circle cx="12" cy="12" r="8.75"/><path d="M12 11v5.25M12 7.9v.01"/>',
    globo: '<circle cx="12" cy="12" r="8.75"/><path d="M3.25 12h17.5M12 3.25c2.35 2.4 3.6 5.3 3.6 8.75S14.35 18.35 12 20.75C9.65 18.35 8.4 15.45 8.4 12S9.65 5.65 12 3.25z"/>',
    sair: '<path d="M14.5 4.25h3.75a1.5 1.5 0 0 1 1.5 1.5v12.5a1.5 1.5 0 0 1-1.5 1.5H14.5"/><path d="M9.75 16.25 5.5 12l4.25-4.25M5.5 12h9.75"/>',
    ponto: '<circle cx="12" cy="12" r="5" fill="currentColor" stroke="none"/>',
    enviar: '<path d="M4.5 12 3.75 4.6a.6.6 0 0 1 .85-.6L20.4 11.45a.6.6 0 0 1 0 1.1L4.6 20a.6.6 0 0 1-.85-.6z"/><path d="M4.5 12h7"/>',
    conversa: '<path d="M4.25 18.5V6.75a2.5 2.5 0 0 1 2.5-2.5h10.5a2.5 2.5 0 0 1 2.5 2.5v7.5a2.5 2.5 0 0 1-2.5 2.5H8.5z"/><path d="M8.5 9.25h7M8.5 12.25h4.5"/>',
    seta: '<path d="M9 5.5 15.5 12 9 18.5"/>',
    transferir: '<path d="M4 8.5h14.5M15 5l3.5 3.5L15 12"/><path d="M20 15.5H5.5M9 12l-3.5 3.5L9 19"/>',
    escola: '<path d="M2.75 9.25 12 4.75l9.25 4.5L12 13.75z"/><path d="M6.25 11v4.75c1.4 1.3 3.4 2 5.75 2s4.35-.7 5.75-2V11M21.25 9.25v5"/>',
    tv: '<rect x="3" y="5.5" width="18" height="12" rx="2.25"/><path d="M8.5 20.5h7"/>',
    pata: '<circle cx="7" cy="10" r="1.75"/><circle cx="10.25" cy="6.25" r="1.75"/><circle cx="13.75" cy="6.25" r="1.75"/><circle cx="17" cy="10" r="1.75"/><path d="M12 11.5c-2.6 0-5 3.4-5 5.75 0 1.6 1.4 2.25 2.75 2.25 1 0 1.5-.5 2.25-.5s1.25.5 2.25.5c1.35 0 2.75-.65 2.75-2.25 0-2.35-2.4-5.75-5-5.75z"/>',
  }

  // Emoji (com ou sem o seletor de variação) → [ícone, cor opcional]
  const MAPA = {
    '🏠': 'home', '🏡': 'home', '🏦': 'banco', '🏛': 'banco', '🏢': 'loja', '🏪': 'loja',
    '💳': 'cartao', '🎯': 'alvo', '📈': 'sobe', '📉': 'desce', '📊': 'grafico',
    '💰': 'moedas', '🪙': 'moedas', '🐷': 'moedas', '👛': 'moedas', '💵': 'nota', '💸': 'saida',
    '📦': 'caixa', '🗑': 'lixo', '👤': 'pessoa', '👨': 'pessoa', '👩': 'pessoa', '🧑': 'pessoa',
    '👦': 'pessoa', '👧': 'pessoa', '👴': 'pessoa', '👨‍👩‍👧': 'pessoas', '👨‍👩‍👧‍👦': 'pessoas',
    '🎉': 'brilho', '🤖': 'brilho', '✨': 'brilho', '🔔': 'sino', '🔕': 'sinoOff', '📱': 'celular',
    '🚗': 'carro', '🛒': 'carrinho', '🧺': 'carrinho', '💊': 'remedio', '✏': 'lapis', '📝': 'lista',
    '✓': 'ok', '✔': 'ok', '✅': ['okCirculo', 'var(--ok)'], '✕': 'x', '✖': 'x', '❌': ['xCirculo', 'var(--neg)'],
    '⚠': ['alerta', 'var(--aviso)'], '🚨': ['alerta', 'var(--neg)'], '📚': 'livro', '💼': 'pasta',
    '⏳': 'relogio', '⏰': 'relogio', '🕓': 'relogio', '🛟': 'boia', '📄': 'doc', '📰': 'doc',
    '🍽': 'talher', '🍕': 'talher', '🍔': 'talher', '🔑': 'chave', '🔐': 'cadeado', '🔒': 'cadeado',
    '⛽': 'bomba', '📸': 'camera', '📷': 'camera', '🔌': 'tomada', '👕': 'camisa', '💇': 'tesoura', '✂️': 'tesoura', '✂': 'tesoura',
    '📥': 'baixar', '⬇': 'baixar', '📤': 'subir', '⬆': 'subir', '📋': 'lista', '🔁': 'repetir', '🔄': 'repetir',
    '👀': 'olho', '👁': 'olho', '🚫': 'proibido', '🔍': 'busca', '🔎': 'busca', '🩺': 'esteto',
    '🧹': 'borracha', '⚙': 'ajustes', '➖': 'menos', '🧾': 'recibo', '💾': 'salvar',
    '💚': ['coracao', 'var(--ok)'], '❤': ['coracao', 'var(--neg)'], '✈': 'aviao', '🔥': 'chama',
    '📌': 'alfinete', '🛡': 'escudo', '💡': 'lampada', '📭': 'caixaEntrada', '🖨': 'impressora',
    '🎁': 'presente', '🎄': 'presente', '🏖': 'sol', '🧮': 'calculadora', '💻': 'notebook',
    '📁': 'pastaArq', '🖼': 'imagem', '📎': 'clipe', 'ⓘ': 'info', '❓': 'info', '🌎': 'globo', '🌍': 'globo',
    '📅': 'calendario', '📆': 'calendario', '🎓': 'escola', '📺': 'tv', '🐶': 'pata', '🐾': 'pata',
    '🔴': ['ponto', 'var(--neg)'], '🟠': ['ponto', '#E07A1F'], '🟡': ['ponto', '#E0A400'], '🟢': ['ponto', 'var(--ok)'],
    '↩': 'sair',
  }

  const NS = 'http://www.w3.org/2000/svg'
  function icone(nome, cor) {
    const s = document.createElementNS(NS, 'svg')
    s.setAttribute('viewBox', '0 0 24 24')
    s.setAttribute('class', 'ic ic-' + nome)
    s.setAttribute('aria-hidden', 'true')
    s.innerHTML = P[nome]
    if (cor) s.style.color = cor
    return s
  }
  // Para quem monta HTML em texto: ico('banco') devolve a marcação do ícone.
  window.ico = (nome, cls) => P[nome]
    ? `<svg viewBox="0 0 24 24" class="ic ic-${nome}${cls ? ' ' + cls : ''}" aria-hidden="true">${P[nome]}</svg>` : ''
  window.ICONES = P

  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const chaves = Object.keys(MAPA).sort((a, b) => b.length - a.length)
  // Família antes das pessoas soltas; o seletor de variação (FE0F) e um espaço depois são engolidos.
  const RE = new RegExp('(' + chaves.map(esc).join('|') + ')\\uFE0F?( ?)', 'g')
  const PULAR = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'TITLE', 'CANVAS', 'NOSCRIPT'])

  function trocarNo(t) {
    const txt = t.nodeValue
    if (!txt || !RE.test(txt)) { RE.lastIndex = 0; return }
    RE.lastIndex = 0
    const pai = t.parentNode
    if (!pai || PULAR.has(pai.nodeName) || pai.closest('svg,[data-emoji]')) return
    const frag = document.createDocumentFragment()
    let ult = 0, m
    while ((m = RE.exec(txt))) {
      if (m.index > ult) frag.appendChild(document.createTextNode(txt.slice(ult, m.index)))
      const v = MAPA[m[1]]
      const [nome, cor] = Array.isArray(v) ? v : [v]
      const ic = icone(nome, cor)
      // Ícone seguido de texto ganha um respiro; sozinho (num quadradinho) fica centrado.
      if (m[2] || (m.index + m[0].length < txt.length)) ic.classList.add('ic-txt')
      frag.appendChild(ic)
      ult = m.index + m[0].length
    }
    if (ult < txt.length) frag.appendChild(document.createTextNode(txt.slice(ult)))
    pai.replaceChild(frag, t)
  }
  function varrer(raiz) {
    if (raiz.nodeType === 3) return trocarNo(raiz)
    if (raiz.nodeType !== 1 || PULAR.has(raiz.nodeName)) return
    const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT)
    const nos = []
    while (w.nextNode()) nos.push(w.currentNode)
    nos.forEach(trocarNo)
  }
  window.trocarEmojis = varrer

  function iniciar() {
    varrer(document.body)
    new MutationObserver(lista => {
      for (const r of lista) {
        if (r.type === 'characterData') trocarNo(r.target)
        else r.addedNodes.forEach(varrer)
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true })
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar)
  else iniciar()
})()
