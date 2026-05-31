# Agente Especializado de Compliance Regulatório (AgentCompliance)

Este repositório contém o agente especializado independente **`compliance-agent`**, extraído do monorepo principal como parte da evolução para a arquitetura de agentes especializados distribuídos (v3). 

A aplicação foi reescrita do zero utilizando **Node.js**, **TypeScript (Strict Mode)**, **Fastify** (framework HTTP de altíssima performance) e **Zod** para validações estruturais de dados em tempo de execução.

---

## 🏛️ Recursos Implementados

1. **Rastreabilidade e Correlação (Tracing)**: Middleware que extrai, propaga e gera cabeçalhos de OpenTelemetry (`X-Trace-Id` e `X-Request-Id`) para correlação de logs.
2. **Idempotência Robusta**: Middleware baseado em tokens `request_id` que impede reprocessamento de solicitações idênticas em um ciclo de 24h, economizando tokens e latência.
3. **Validação de Payload (Zod)**: Validação sintática forte com Zod, com respostas HTTP `422 Unprocessable Entity` estruturadas para inputs fora do padrão.
4. **Comportamento Determinístico por CPF**: Os cenários regulatórios de KYC e PLD são deduzidos a partir do próprio CPF mascarado do proponente, sem expor chaves artificiais no JSON de produção.
5. **Agent Card A2A**: Manifesto publicado em `/.well-known/agent.json` em estrita conformidade com o padrão de descoberta A2A do Google.
6. **Dockerfile de Produção**: Multi-stage build empacotado em cima da imagem segura e leve `node:20-alpine`.

---

## ⚙️ Variáveis de Ambiente (`.env`)

Configure o arquivo `.env` a partir do modelo de variáveis:
```ini
PORT=8085                    # Porta do servidor (Default: 8085)
NODE_ENV=development         # Ambiente de execução (development | production)
LOG_LEVEL=info               # Nível de logging (info | warn | error | debug)
IDEMPOTENCY_TTL_HOURS=24     # TTL do cache de idempotência
```

---

## 🚀 Setup e Execução Local

### 1. Instalar dependências
```bash
npm install
```

### 2. Rodar em Modo de Desenvolvimento (Live Reload)
```bash
npm run dev
```

### 3. Compilar para Produção (TypeScript ➔ JavaScript)
```bash
npm run build
```

### 4. Iniciar Servidor de Produção Compilado
```bash
npm start
```

---

## 🐳 Rodando via Docker (Recomendado para Produção)

### 1. Construir a Imagem
```bash
docker build -t compliance-agent:latest .
```

### 2. Executar o Container
```bash
docker run -d -p 8085:8085 --name compliance-agent --env-file .env compliance-agent:latest
```

---

## 🧪 Validação dos Cenários (Curls de Teste)

Com o servidor rodando na porta `8085`, execute os comandos abaixo para homologar todos os critérios de aceitação regulatórios:

### 1. Health check
```bash
curl -s http://localhost:8085/health | jq
```

### 2. Cenário de Aprovação Completa
```bash
curl -s -X POST http://localhost:8085/v1/compliance \
  -H "Content-Type: application/json" \
  -H "X-Trace-Id: trace-test-001" \
  -d '{"applicant_masked_cpf":"XXX.XXX.XXX-99","request_id":"c1a2b3c4-d5e6-7f8a-9b0c-1d2e3f4a5b6c"}' | jq
```

### 3. CPF Inválido (Deves retornar HTTP 422)
```bash
curl -s -X POST http://localhost:8085/v1/compliance \
  -H "Content-Type: application/json" \
  -H "X-Trace-Id: trace-test-002" \
  -d '{"applicant_masked_cpf":"cpf-invalido","request_id":"d1a2b3c4-d5e6-7f8a-9b0c-1d2e3f4a5b6d"}' | jq
```

### 4. Cenário KYC Reprovado (CPF contendo "111")
```bash
curl -s -X POST http://localhost:8085/v1/compliance \
  -H "Content-Type: application/json" \
  -H "X-Trace-Id: trace-test-003" \
  -d '{"applicant_masked_cpf":"111.XXX.XXX-99","request_id":"e1a2b3c4-d5e6-7f8a-9b0c-1d2e3f4a5b6e"}' | jq
```

### 5. Cenário PLD Positivo (CPF contendo "222")
```bash
curl -s -X POST http://localhost:8085/v1/compliance \
  -H "Content-Type: application/json" \
  -H "X-Trace-Id: trace-test-004" \
  -d '{"applicant_masked_cpf":"222.XXX.XXX-99","request_id":"f1a2b3c4-d5e6-7f8a-9b0c-1d2e3f4a5b6f"}' | jq
```

### 6. Idempotência (Retorna cache instantâneo e cabeçalho `X-Cache: HIT`)
```bash
# Primeira chamada (MISS)
curl -si -X POST http://localhost:8085/v1/compliance \
  -H "Content-Type: application/json" \
  -H "X-Trace-Id: trace-test-005" \
  -d '{"applicant_masked_cpf":"XXX.XXX.XXX-99","request_id":"a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"}' | grep -i "x-cache"

# Segunda chamada com o mesmo request_id (HIT)
curl -si -X POST http://localhost:8085/v1/compliance \
  -H "Content-Type: application/json" \
  -H "X-Trace-Id: trace-test-005" \
  -d '{"applicant_masked_cpf":"XXX.XXX.XXX-99","request_id":"a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"}' | grep -i "x-cache"
```

### 7. Rastreabilidade (X-Trace-Id propagado nos cabeçalhos de resposta)
```bash
curl -si -X POST http://localhost:8085/v1/compliance \
  -H "Content-Type: application/json" \
  -H "X-Trace-Id: trace-test-006" \
  -d '{"applicant_masked_cpf":"XXX.XXX.XXX-99","request_id":"b1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6e"}' | grep -i "x-trace"
```

### 8. Manifesto de Descoberta A2A (.well-known/agent.json)
```bash
curl -s http://localhost:8085/.well-known/agent.json | jq '.name, .version, .skills'
```
