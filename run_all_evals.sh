#!/bin/bash
# run_all_evals.sh — Executa as avaliações do Compliance Agent usando PromptFoo.

echo "=========================================================="
echo "   Iniciando Execução de Evals do Compliance Agent         "
echo "=========================================================="

# 1. Carregar variáveis de ambiente do .env se existir
if [ -f .env ]; then
  echo "Carregando variáveis do arquivo .env..."
  export $(grep -v '^#' .env | xargs)
fi

# Tentar carregar do src/.env ou do repo vizinho se necessário
if [ -z "$AI_GATEWAY_CLIENT_ID" ] && [ -f ../credit-analysis-agent/src/.env ]; then
  echo "Carregando variáveis do repositório vizinho credit-analysis-agent/src/.env..."
  export $(grep -v '^#' ../credit-analysis-agent/src/.env | xargs)
fi

if [ -z "$AI_GATEWAY_CLIENT_ID" ] || [ -z "$AI_GATEWAY_CLIENT_SECRET" ] || [ -z "$AI_GATEWAY_OAUTH_ENDPOINT" ]; then
  echo "❌ Erro: Variáveis de ambiente do Sensedia AI Gateway não estão configuradas."
  echo "Certifique-se de definir AI_GATEWAY_CLIENT_ID, AI_GATEWAY_CLIENT_SECRET e AI_GATEWAY_OAUTH_ENDPOINT."
  exit 1
fi

# 2. Obter Token do Sensedia AI Gateway
echo "Obtendo token de acesso do Sensedia AI Gateway via OAuth2..."
TOKEN_RESPONSE=$(curl -s -X POST "$AI_GATEWAY_OAUTH_ENDPOINT" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=$AI_GATEWAY_CLIENT_ID" \
  -d "client_secret=$AI_GATEWAY_CLIENT_SECRET")

# Extrai o token de acesso de forma resiliente
TOKEN=$(python3 -c "import sys, json; print(json.loads(sys.stdin.read()).get('access_token', ''))" <<< "$TOKEN_RESPONSE" 2>/dev/null)

if [ -z "$TOKEN" ] || [ ${#TOKEN} -lt 20 ]; then
  # Fallback simples usando grep se python falhar
  TOKEN=$(echo "$TOKEN_RESPONSE" | grep -o '"access_token":"[^"]*' | grep -o '[^"]*$')
fi

if [ -z "$TOKEN" ] || [ ${#TOKEN} -lt 20 ]; then
  echo "❌ Erro: Não foi possível obter o token do gateway."
  echo "Resposta do servidor de autorização:"
  echo "$TOKEN_RESPONSE"
  exit 1
fi

echo "✅ Token do Gateway obtido com sucesso!"
export AI_GATEWAY_TOKEN=$TOKEN

# 3. Execução do PromptFoo
CONFIG="evals/compliance.yaml"
echo ""
echo "----------------------------------------------------------"
echo "🚀 Executando eval para: $CONFIG"
echo "----------------------------------------------------------"

if [ ! -f "$CONFIG" ]; then
  echo "❌ Arquivo não encontrado: $CONFIG"
  exit 1
fi

npx promptfoo eval --config "$CONFIG"

if [ $? -eq 0 ]; then
  echo "✅ Sucesso na execução dos evals!"
else
  echo "❌ Falhas encontradas na execução dos evals!"
  exit 1
fi

echo ""
echo "=========================================================="
echo "🎉 Execuções concluídas!"
echo "Rode 'npx promptfoo view' para abrir o dashboard do PromptFoo."
echo "=========================================================="
