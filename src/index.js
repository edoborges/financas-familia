require('dotenv').config()

const express = require('express')
const path = require('path')
const routes = require('./routes')

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json())
app.use(express.static(path.join(__dirname, '..', 'public')))
app.use('/api', routes)

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`)
  console.log(`📱 Abra no navegador e instale como app no celular!`)
})
