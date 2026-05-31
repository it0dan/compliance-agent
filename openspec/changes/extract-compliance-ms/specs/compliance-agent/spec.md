# Delta Spec: Microsserviço de Compliance Regulatório (extract-compliance-ms)

**Change ID:** extract-compliance-ms  
**Tipo:** ADDED / EXTRACTION  
**Capability:** compliance / cross-domain  

---

## 1. Identidade e Papel

* **Nome:** compliance-agent
* **Papel:** Capability de Conformidade Regulatória Transversal (KYC, PLD/COAF, LGPD)
* **Runtime:** Node.js v20 (Alpine LTS)
* **Tecnologia Principal:** Fastify Framework com TypeScript (Strict Mode)
* **Ponto de Entrada Pública:** Sensedia AI Gateway (Autenticação OAuth 2.0 delegada, controle de tráfego, logging)

---

## 2. Responsabilidades e Limites

### O microsserviço DEVE:
1. Validar sintaticamente o formato do CPF mascarado proponente (`XXX.XXX.XXX-XX`) no payload recebido em `/v1/compliance`.
2. Assegurar idempotência estrita de processamento baseada no parâmetro `request_id` enviado no request, retornando o resultado cacheado instantaneamente caso a chave seja encontrada em menos de 24h de TTL.
3. Propagar obrigatoriamente o identificador de rastreabilidade `X-Trace-Id` recebido no cabeçalho da requisição para todos os cabeçalhos e corpos de resposta.
4. Seguir a esteira sequencial lógica de validação: KYC (Know Your Customer) ➔ PLD (Prevenção à Lavagem de Dinheiro) ➔ LGPD (Consentimento de Dados).
5. Interromper a esteira na primeira falha identificada (regra de curto-circuito / short-circuit).
6. Responder nos limites restritos de SLA (timeout contratual de 5.000ms).

### O microsserviço NÃO DEVE:
* Implementar validações ou integrações com chaves OAuth 2.0 locais (segurança tratada como responsabilidade exclusiva do API Gateway da Sensedia).
* Persistir registros permanentes ou dados pessoais sensíveis identificáveis sem mascaramento (atendimento estrito ao princípio de segurança por design e LGPD).
* Escalar qualquer erro técnico, indisponibilidade ou falha regulatória para revisão humana (HITL) dentro do seu contexto — falha de compliance resulta em rejeição direta e imediata.
* Executar chamadas externas a LLMs (processamento de regras determinísticas puras de conformidade).

---

## 3. Contrato HTTP v1 (POST /v1/compliance)

### Cabeçalhos Exigidos (Request Headers)
* `Content-Type: application/json` (Obrigatório)
* `X-Trace-Id: <UUID>` (Obrigatório — correlação e rastreabilidade distribuída)
* `Authorization: Bearer <Token>` (Obrigatório — validado previamente na camada do API Gateway)

### Schema de Validação de Input (Request Body)
```json
{
  "type": "object",
  "properties": {
    "applicant_masked_cpf": {
      "type": "string",
      "pattern": "^\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}$",
      "description": "CPF mascarado do solicitante. Formato rígido: XXX.XXX.XXX-XX."
    },
    "request_id": {
      "type": "string",
      "format": "uuid",
      "description": "UUID único do request para controle de idempotência regulatória."
    },
    "trace_id": {
      "type": "string",
      "description": "Trace ID opcional espelhado para compatibilidade operacional com o orquestrador."
    },
    "scenario": {
      "type": "string",
      "description": "Cenário opcional de simulação (compatibilidade legada do Promptfoo)."
    }
  },
  "required": ["applicant_masked_cpf", "request_id"]
}
```

### Cabeçalhos de Resposta (Response Headers)
* `Content-Type: application/json; charset=utf-8`
* `X-Trace-Id: <UUID>` (Propagado do request para auditoria rápida no Gateway)
* `X-Request-Id: <UUID>` (Identificador único do request gerado localmente)
* `X-Cache: HIT | MISS` (Sinalizador de hit de cache do middleware de idempotência)

### Schema de Output de Sucesso (HTTP 200 OK)
```json
{
  "type": "object",
  "properties": {
    "request_id": {
      "type": "string",
      "format": "uuid"
    },
    "kyc_approved": {
      "type": "boolean"
    },
    "pld_clear": {
      "type": "boolean"
    },
    "lgpd_consent": {
      "type": "boolean"
    },
    "status": {
      "type": "string",
      "enum": ["ok", "rejected", "error", "timeout"]
    },
    "reason": {
      "type": "string",
      "enum": [
        "kyc_failed", "kyc_unavailable", "kyc_timeout",
        "pld_positive", "pld_unavailable", "pld_timeout",
        "lgpd_no_consent", "lgpd_unavailable", "lgpd_timeout",
        "null"
      ],
      "nullable": true
    },
    "details": {
      "type": "string",
      "description": "Descrição textual da decisão."
    },
    "tools_called": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "processing_time_ms": {
      "type": "integer"
    },
    "trace_id": {
      "type": "string"
    }
  },
  "required": ["request_id", "kyc_approved", "pld_clear", "lgpd_consent", "status", "reason", "details", "tools_called", "processing_time_ms"]
}
```

### Schema de Erro Cadastral/Validação (HTTP 422 Unprocessable Entity)
Retornado em caso de CPF malformado, request_id inválido ou JSON corrompido:
```json
{
  "error": "validation_error",
  "details": [
    {
      "path": ["applicant_masked_cpf"],
      "message": "String must match pattern \"^\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}$\""
    }
  ]
}
```

---

## 4. Comportamento Determinístico por CPF (Cenários de Teste)

Para simular com exatidão a lógica de um motor de conformidade regulatória robusto sem a necessidade de acoplar parâmetros artificiais no payload de produção, as respostas são derivadas de forma determinística analisando os **três dígitos iniciais** do CPF mascarado recebido:

| Dígitos Iniciais do CPF | Comportamento Lógico Simulador | Resposta de Sucesso Esperada (HTTP 200) |
| :--- | :--- | :--- |
| **`111`** (ex: `111.XXX.XXX-99`) | **Falha de KYC**: O proponente falha na validação cadastral inicial. A esteira para no primeiro passo. | `kyc_approved: false`, `pld_clear: false`, `lgpd_consent: false`, `status: "rejected"`, `reason: "kyc_failed"`, `tools_called: ["verify_kyc"]` |
| **`222`** (ex: `222.XXX.XXX-99`) | **Falha de PLD**: KYC aprovado, mas a verificação PLD retorna positiva para listas de restrição. A esteira para no segundo passo. | `kyc_approved: true`, `pld_clear: false`, `lgpd_consent: false`, `status: "rejected"`, `reason: "pld_positive"`, `tools_called: ["verify_kyc", "check_pld"]` |
| **`333`** (ex: `333.XXX.XXX-99`) | **Timeout de SLA**: O sistema induz uma lentidão de 5.100ms, disparando o timeout do Gateway/Orquestrador. | `status: "timeout"`, `reason: "kyc_timeout"` (Se capturado após expiração de SLA na aplicação) |
| **Qualquer outro CPF válido** (ex: `XXX.XXX.XXX-99`) | **Aprovação Total**: Todas as verificações passam com sucesso. | `kyc_approved: true`, `pld_clear: true`, `lgpd_consent: true`, `status: "ok"`, `reason: "null"`, `tools_called: ["verify_kyc", "check_pld", "verify_lgpd_consent"]` |

---

## 5. Regras de Idempotência
* A idempotência é ativada a cada requisição bem-sucedida em `/v1/compliance` usando o campo `request_id` como chave única.
* Se um request subsequente contendo o mesmo `request_id` for enviado em um intervalo menor que 24 horas:
  1. A lógica de negócios **não é executada**.
  2. A resposta correspondente em cache é recuperada imediatamente.
  3. O cabeçalho de resposta `X-Cache: HIT` é anexado.
  4. O cabeçalho `X-Trace-Id` original da requisição cacheada é preservado ou atualizado para o novo identificador de trace (dependendo das políticas de auditoria do Gateway). Por padrão, atualizamos para o novo trace recebido para assegurar rastreabilidade atual.

---

## 6. Guides (Diretrizes de Execução e Anti-Exemplos)

* **Anti-Exemplo 1: Permitir que falhas regulatórias prossigam**
  * *Errado:* CPF `111.XXX.XXX-99` falha no KYC, mas a esteira executa a chamada ao `check_pld` para retornar logs adicionais ao orquestrador.
  * *Correto:* O short-circuit é imediato. Ao falhar no KYC, a ferramenta `check_pld` **nunca** é acionada e não aparece em `tools_called`.

* **Anti-Exemplo 2: Retornar HTTP 500 para falhas regulatórias**
  * *Errado:* Retornar HTTP 500 Internal Server Error quando KYC reprova ou PLD dá positivo.
  * *Correto:* Falhas de negócios de compliance são respostas de negócios normativas. Devem retornar HTTP 200 OK com `status: "rejected"` e o devido `reason` preenchido. HTTP 500 deve ser reservado exclusivamente para falhas de runtime do servidor (falta de memória, bugs no event loop, indisponibilidade do banco).

---

## 7. Notas sobre Rastreabilidade e Semântica Contratual

### 7.1 Opcionalidade do `trace_id` no Request Body
* **Contexto:** Embora o payload enviado pelo orquestrador legador possa incluir a propriedade `trace_id` no corpo do JSON, a especificação A2A formalizada no Agent Card define o cabeçalho HTTP **`X-Trace-Id` como o canal obrigatório e primário** para correlação de telemetria distribuída.
* **Decisão:** No esquema Zod e Fastify do microsserviço, o campo `trace_id` no corpo do request é explicitamente tratado como **opcional (`.optional()`)**. A ausência dele no body não impede o processamento, desde que o cabeçalho `X-Trace-Id` esteja presente na requisição HTTP.

### 7.2 Semântica de Campos Não-Verificados em Falhas de Short-Circuit
* **Contexto:** Quando ocorre um curto-circuito (ex: KYC reprovado), as etapas seguintes de PLD e LGPD não são executadas. Semanticamente, retornar `pld_clear: false` e `lgpd_consent: false` é ambíguo, pois dá a entender que foram executados e falharam, quando o correto seria representá-los como não-avaliados (`null` ou omitidos).
* **Restrição de Retrocompatibilidade (v2):** O contrato especificado no Agent Card (`compliance-agent-card.json`) do core de crédito define `kyc_approved`, `pld_clear` e `lgpd_consent` como booleanos estritos **não-anuláveis (non-nullable)**. Alterar para `null` ou omitir esses campos quebraria a desserialização rígida de classes consumidoras legadas escritas em Python/Go/C#.
* **Decisão:** Para compatibilidade com a v2, o microsserviço mantém o comportamento de retornar `false` nas etapas não-executadas.
* **Proposta para a v3 (Evolução):** Fica documentada a recomendação de alterar o Agent Card na v3 para suportar tipos anuláveis (`boolean | null`) para expressar explicitamente que a validação foi pulada/não-executada por short-circuit.

