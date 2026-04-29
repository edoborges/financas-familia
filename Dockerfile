FROM node:22-slim
WORKDIR /app

# Instala dependências
COPY package*.json ./
RUN npm ci --omit=dev

# Copia o código
COPY . .

# Cria pasta de dados
RUN mkdir -p /app/data

# Porta padrão (Railway sobrescreve com $PORT)
EXPOSE 3000

# Inicia o servidor
CMD ["node", "src/index.js"]
