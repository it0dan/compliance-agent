# SPDD Prompt: Diretrizes de Implementação (extract-compliance-ms)

**Change ID:** extract-compliance-ms  
**Data:** 2026-05-31  

---

## 1. Diretrizes de Derivação (Spec-to-Code)

Este documento atua como a especificação SPDD (Spec-Driven Development) para orientar o desenvolvimento do microsserviço de compliance em TypeScript/Fastify. A estrutura e comportamento do código devem ser derivados estritamente dos seguintes pilares da especificação:

### A. Roteamento e Versionamento (Ref: `spec.md` - Seção 3 e `adr-005`):
* O endpoint principal deve ser registrado sob o prefixo de versão `/v1` resultando em `POST /v1/compliance`.
* Um endpoint estático de descoberta deve responder na rota pública raiz `GET /.well-known/agent.json` entregando o arquivo JSON do Agent Card.
* A rota de checagem de integridade deve responder em `GET /health` com status simplificado `{ "status": "UP" }`.

### B. Validação com Zod Schemas (Ref: `spec.md` - Seção 3):
* O payload de request de entrada deve ter validação Zod estrita para as chaves `applicant_masked_cpf` (regex `^\d{3}\.\d{3}\.\d{3}-\d{2}$`) e `request_id` (UUID format).
* Erros cadastrais ou de validação sintática capturados pelo Zod devem interceptar a requisição e retornar um status HTTP `422 Unprocessable Entity` contendo o payload estruturado:
  ```json
  { "error": "validation_error", "details": [...erros formatados Zod...] }
  ```

### C. Idempotência e Correlação de Rastreabilidade (Ref: `spec.md` - Seção 5):
* Implementar o barramento abstrato de idempotência mapeando chaves `request_id` para objetos cached contendo payload e cabeçalho.
* Retornar cabeçalho `X-Cache: HIT` em caso de requisição duplicada e `X-Cache: MISS` para nova análise.
* Injetar obrigatoriamente o cabeçalho `X-Trace-Id` do request para o response header de todas as respostas (incluindo sucessos, rejeições de negócios e validações 422).

### D. Regras Lógicas de Negócios e Short-Circuiting (Ref: `spec.md` - Seção 4):
* O motor de negócios em `complianceService.ts` deve validar a esteira em ordem sequencial estrita: KYC ➔ PLD ➔ LGPD.
* Executar curto-circuito imediato se qualquer etapa falhar.
* Mapear o comportamento do CPF de simulação:
  * CPF iniciando com `111` ➔ KYC aprovado: false ➔ tools_called: `["verify_kyc"]`
  * CPF iniciando com `222` ➔ PLD clear: false ➔ tools_called: `["verify_kyc", "check_pld"]`
  * CPF iniciando com `333` ➔ Timeout de 5.1s simulado ➔ `status: "timeout"`.
  * Outros CPFs válidos ➔ Aprovado total ➔ tools_called: `["verify_kyc", "check_pld", "verify_lgpd_consent"]`.

---

## 2. Decisões Estruturais e Boas Práticas (TypeScript)

* **Strict Mode Ativado:** O compilador TypeScript (`tsconfig.json`) deve rodar em `"strict": true`, garantindo tipagem forte e segura em todo o runtime, sem `any` implícito.
* **Logs Estruturados JSON:** O aplicativo Fastify deve configurar seu logger integrado (`pino`) para produzir saídas formatadas em JSON nativo no padrão de produção do ecossistema, incluindo campos `timestamp`, `level`, `request_id`, `trace_id` e `message`.
* **Ausência de Banco Físico:** A classe `InMemoryIdempotencyStore` atuará em-memória com rotinas de remoção periódica (*garbage collection* interna) para garantir isolamento e simplicidade sem comprometer a robustez técnica.
