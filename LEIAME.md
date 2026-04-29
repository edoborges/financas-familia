# Controle Financeiro — Ed & Leide

## Instalação local (primeiro teste)

1. Copie o arquivo de variáveis:
   - Renomeie `.env.example` para `.env`
   - Preencha sua chave Claude API e os números de telefone

2. Instale as dependências:
```
npm install
```

3. Rode o projeto:
```
npm start
```

4. Escaneie o QR Code que aparecer no terminal com o WhatsApp do número do bot

5. Acesse o dashboard em: http://localhost:3000

---

## Variáveis do .env

```
ANTHROPIC_API_KEY=sua-chave-aqui
PHONE_EDMILSON=5511999998888   (seu número com DDI+DDD, sem + ou espaços)
PHONE_LEIDE=5511999997777      (número da Leide)
PORT=3000
DATA_PATH=./data
```

---

## Deploy no Railway

1. Crie conta em railway.app
2. Crie um novo projeto > Deploy from GitHub (ou faça upload da pasta)
3. Adicione as variáveis de ambiente no painel do Railway
4. O projeto sobe automaticamente

---

## Comandos do WhatsApp

| Mensagem | Ação |
|---|---|
| `Mercado R$150` | Registra gasto em dinheiro |
| `Gasolina 80 reais débito` | Gasto no débito |
| `Farmácia R$45 cartão Nubank` | Gasto no cartão |
| `Academia R$99 crédito 3x` | Gasto parcelado |
| `saldo` | Resumo do mês |
| `gastos` | Lista lançamentos |
| `cartões` | Ver limites dos cartões |
| `metas` | Ver progresso das metas |
| `plano` | Gerar plano de economia com IA |
| `Meu salário é R$3000` | Cadastrar salário |
| `Cartão Nubank limite R$5000` | Cadastrar cartão |
| `Meta viagem R$8000` | Criar meta |
| `ajuda` | Ver todos os comandos |
