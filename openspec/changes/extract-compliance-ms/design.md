# Design Técnico: Extração do Microsserviço de Compliance

**Change ID:** extract-compliance-ms  
**Status:** PROPOSED  
**Autor:** Danilo Amaral  
**Data:** 2026-05-31  

---

## 1. Decisões Técnicas (Technical Decisions)

### DT-001: Escolha do Fastify como Framework HTTP
* **Contexto:** Precisamos de um framework para o runtime de microsserviço Node.js que seja leve, rápido, com excelente ecossistema e focado em APIs JSON de baixíssima latência.
* **Alternativas:** Express (antigo, lento, sem suporte nativo a promises), NestJS (muito pesado, boilerplate excessivo para um agente simples), Hono (excelente, mas possui ecossistema mais focado em Edge/Cloudflare Workers).
* **Decisão:** **Fastify**. Ele possui suporte nativo de altíssima performance para parsing e serialização de JSON, manipulação limpa de rotas assíncronas, sistema robusto de plugins para encapsulamento e baixo consumo de memória.
* **Consequências:** Inicialização ultra-rápida do servidor (~10-20ms), fácil isolamento de middlewares/plugins e adequação estrita aos requisitos de SLA (timeout de 5s).

---

### DT-002: Zod como Biblioteca de Validação de Schemas
* **Contexto:** Precisamos garantir que todas as entradas e saídas do microsserviço estejam rigorosamente alinhadas com o Agent Card (`compliance-agent-card.json`).
* **Alternativas:** JSON Schema puro, AJV (nativo do Fastify), Joi.
* **Decisão:** **Zod**. Fornece tipagem TypeScript estática forte de forma automática a partir dos esquemas de runtime, permitindo que a validação de formato de CPF (regex) e UUIDs (`request_id`, `trace_id`) seja extremamente declarativa e segura contra injeções.
* **Consequências:** Garantia em tempo de compilação de que as rotas respeitam as interfaces de dados, facilidade na formatação de erros amigáveis de validação (HTTP 422).

---

### DT-003: Idempotência In-Memory com Interface preparada para Redis
* **Contexto:** Para atender às regras de robustez, o microsserviço não deve reprocessar requests idênticos (mesmo `request_id`). Ele precisa persistir as respostas por 24 horas.
* **Decisão:** Criação de uma interface abstrata `IdempotencyStore` e implementação inicial baseada em um `Map` in-memory. Cada entrada armazena a resposta em formato JSON junto com o timestamp de expiração (timestamp do request + TTL). O método de verificação limpa de forma preguiçosa (*lazy deletion*) os registros expirados.
* **Consequências:** Ausência de dependência externa de infraestrutura para o ambiente de testes/sandbox, mantendo o microsserviço agnóstico. A interface limpa permite trocar a classe de implementação para um Redis real na fase de produção com apenas 1 linha de código de injeção de dependência.

---

### DT-004: Comportamento de Cenário Baseado no CPF Mascarado
* **Contexto:** No mock antigo em Python, o payload de entrada continha uma propriedade artificial `"scenario"`. Isso descaracteriza uma API de produção e confunde outros consumidores corporativos que não fazem parte do fluxo analítico de crédito.
* **Decisão:** **Remoção do parâmetro `scenario` do corpo obrigatório de produção**. O microsserviço agora determina as simulações de falha de forma totalmente transparente e determinística com base na composição do próprio CPF do proponente (dígitos centrais):
  * CPF contendo `111` ➔ KYC reprovado.
  * CPF contendo `222` ➔ PLD positivo (reprovado).
  * CPF contendo `333` ➔ Timeout induzido de 5.100ms (SLA excedido).
  * Outros CPFs válidos ➔ Sucesso (aprovado).
* **Consequências:** A API torna-se 100% aderente a um cenário real de produção. O parâmetro `scenario` ainda é suportado como propriedade opcional de sandbox no payload do request para manter retrocompatibilidade com testes antigos do Promptfoo do core de crédito, se necessário.

---

### DT-005: Autenticação Delegada (API Gateway Facade)
* **Contexto:** O microsserviço precisa de segurança robusta, mas implementar validações JWT/OAuth 2.0 locais aumenta a complexidade de chaveamento e o acoplamento do código.
* **Decisão:** A validação e a geração de tokens OAuth 2.0 são de responsabilidade do **Sensedia AI Gateway** no nível de rede. O microsserviço de compliance assume que qualquer requisição que chegue a ele já foi autenticada e autorizada pelo Gateway. O microsserviço apenas propaga os cabeçalhos de autorização e correlação.
* **Consequências:** Código limpo focado exclusivamente nas regras de conformidade regulatória.

---

## 2. Diagrama de Componentes (C4 Level 3)

```
┌────────────────────────────────────────────────────────────────────────┐
│                              compliance-agent                          │
│                                                                        │
│                ┌──────────────────────────────────────┐                │
│                │            server.ts (Fastify)       │                │
│                └──────────────────┬───────────────────┘                │
│                                   │                                    │
│                 HTTP Requests     ▼                                    │
│                ┌──────────────────────────────────────┐                │
│                │          Tracing Middleware          │ (X-Trace-Id)   │
│                └──────────────────┬───────────────────┘                │
│                                   │                                    │
│                                   ▼                                    │
│                ┌──────────────────────────────────────┐                │
│                │        Idempotency Middleware        │                │
│                └──────────┬─────────────────┬─────────┘                │
│                           │                 │                          │
│                Cache HIT  │                 │ Cache MISS               │
│                (HTTP 200) │                 ▼                          │
│                           │        ┌──────────────────┐                │
│                           │        │  Zod Validation  │ (Schemas Zod)  │
│                           │        └────────┬─────────┘                │
│                           │                 │                          │
│                           │                 ▼                          │
│                           │        ┌──────────────────┐                │
│                           │        │  Handler / Route │ (/v1/compl..)  │
│                           │        └────────┬─────────┘                │
│                           │                 │                          │
│                           │                 ▼                          │
│                           │        ┌──────────────────┐                │
│                           │        │ComplianceService │ (Lógica de CPF)│
│                           │        └────────┬─────────┘                │
│                           │                 │                          │
│                           ▼                 ▼                          │
│                ┌──────────────────────────────────────┐                │
│                │       IdempotencyStore (In-Memory)   │                │
│                └──────────────────────────────────────┘                │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Perguntas em Aberto Resolvidas

### Q1: Como simular o timeout regulatório (SLA 5s) de forma eficiente em Node.js?
* **Resolução:** Utilizaremos um helper de atraso assíncrono baseado em Promises e timers (`setTimeout`). Se o CPF contiver os dígitos `333`, o handler aguardará 5.100ms antes de processar e responder à requisição. Como o SLA configurado no Fastify e no Gateway para timeout de rede é de 5.000ms, isso garantirá que a conexão seja interrompida pelo lado do cliente simulando indisponibilidade/timeout real do serviço.

### Q2: Como gerenciar a limpeza de registros in-memory para evitar vazamentos de memória (Memory Leaks)?
* **Resolução:** A classe `InMemoryIdempotencyStore` implementará um agendador periódico simples (`setInterval`) que roda a cada 1 hora, iterando sobre o mapa de chaves de idempotência e removendo todas as chaves onde `expiryTimestamp <= Date.now()`. Isso garante que requisições de sandbox contínuas não saturem o consumo de memória RAM do container Node.js.
