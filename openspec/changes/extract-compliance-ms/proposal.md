# Proposal: Extração do Agente Especializado de Compliance Independente

**Change ID:** extract-compliance-ms  
**Status:** PROPOSED  
**Autor:** Danilo Amaral  
**Data:** 2026-05-31  

---

## 1. Motivação

O `compliance_agent` (AgentCompliance) executa a verificação regulatória mais crítica do fluxo de análise de crédito: KYC (Know Your Customer), PLD/COAF (Prevenção à Lavagem de Dinheiro) e consentimento LGPD. No modelo v2 do monorepo `credit-analysis-agent`, ele está acoplado ao ecossistema do core de crédito como um script local contendo rotas de rede A2A simuladas na porta `8085` / `8080`.

Esta proposta visa extrair o `compliance_agent` do monorepo de crédito para seu próprio repositório isolado (`compliance-agent`), reescrevendo-o em uma stack robusta, moderna e de alta performance de backend (**Node.js, TypeScript, Fastify e Zod**).

### Razões Técnicas e Organizacionais:
1. **Capability Transversal de Domínio**: O domínio de compliance regulatório não pertence ao core de crédito. Processos de onboarding de clientes, seguros, recuperação de ativos e abertura de contas precisam validar KYC/PLD/LGPD dos proponentes sem herdar dependências ou infraestrutura do core de crédito.
2. **Ciclos de Evolução Desacoplados**: Alterações legislativas do BACEN, COAF ou diretrizes do DPO sobre a LGPD ocorrem em cronogramas independentes. O agente especializado precisa de deploy, testes de regressão e versionamento autônomos.
3. **Padrão A2A Corporativo**: Centralizar o acesso das requisições corporativas por meio do **Sensedia AI Gateway**, que gerenciará autenticação OAuth 2.0 inter-serviço, rate limiting e observabilidade centralizada, conforme estabelecido no **ADR-005**.

---

## 2. Escopo da Mudança

### Incluído:
* Criação da estrutura OpenSpec de change (`extract-compliance-ms`) dentro do novo repositório.
* Implementação do agente especializado em **TypeScript (strict mode)** com **Fastify** para o runtime HTTP.
* Validação rigorosa dos schemas de input e output utilizando **Zod**.
* Middlewares de rastreabilidade para propagação e validação obrigatória dos cabeçalhos `X-Trace-Id` (para OpenTelemetry) e geração interna do `X-Request-Id`.
* Middleware de idempotência in-memory com tempo de expiração configurável (padrão 24h), expondo a interface `IdempotencyStore` preparada para expansão futura com Redis.
* Comportamento determinístico simulado baseado nos blocos de CPF mascarado (sem acoplamento com LLM interna no agente especializado, que agora atua puramente como uma API de capability especializada).
* Publicação do Agent Card de descoberta em `.well-known/agent.json` (idêntico ao `compliance-agent-card.json` do core de crédito).
* Dockerfile multi-stage para construção de imagem leve (`node:20-alpine`) de produção.
* Testes locais e script de validação de endpoints cobrindo todos os cenários regulatórios de CPF.

### Excluído:
* Acoplamento com banco de dados de persistência físico permanente ou cache externo Redis (implementado em-memória nesta etapa).
* Configuração física ou credenciais do Sensedia AI Gateway (responsabilidade da infraestrutura do API Gateway).
* Integração com birôs de dados reais de KYC (Serasa, SPC) e barramentos do COAF.

---

## 3. Design de Alto Nível

O agente especializado de compliance atua de forma totalmente isolada em relação aos demais agentes especializados do MAS de crédito. O único ponto de entrada para o orquestrador é o gateway da Sensedia.

```
┌─────────────────────────────────┐
│     Orquestrador (Python)       │
└────────────────┬────────────────┘
                 │ HTTP POST /v1/compliance
                 │ Authorization: Bearer <Token>
                 │ X-Trace-Id: <UUID>
                 ▼
┌─────────────────────────────────┐
│    Sensedia AI Gateway          │ (Valida OAuth2, Rate Limits e Audita)
└────────────────┬────────────────┘
                 │ Roteamento por prefixo (/v1/*)
                 ▼
┌─────────────────────────────────┐
│       compliance-agent          │ (Porta 8085 / Fastify App)
│                                 │
│ 1. TracingMiddleware            │ ← Valida e propaga X-Trace-Id
│ 2. IdempotencyMiddleware        │ ← Deduplica por request_id in-memory
│ 3. Zod Schema Validation        │ ← Rejeita payloads inválidos com HTTP 422
│ 4. ComplianceService            │
│    ├─verify_kyc()               │ ➔ CPF com "111" -> kyc_approved: false
│    ├─check_pld()                │ ➔ CPF com "222" -> pld_clear: false
│    └─verify_lgpd_consent()      │ ➔ CPF com "333" -> Simula Timeout de 5.1s
└─────────────────────────────────┘
```

---

## 4. Diferencial em Relação ao Mock Local (`compliance_agent.py`)

| Característica | Mock no Core de Crédito (`compliance_agent.py`) | Novo Agente Especializado Independente (`compliance-agent`) |
| :--- | :--- | :--- |
| **Tecnologia** | Python (OpenAI SDK wrapper local + mock local) | Node.js + TypeScript (Strict Mode) + Fastify (High Performance) |
| **Gatilho de Cenário** | Dependia do parâmetro artificial `"scenario"` no JSON body do request. | **Totalmente determinístico por CPF**. O cenário é derivado do CPF mascarado enviado, simulando comportamento de produção. |
| **Validação** | Manual/Customizada em Python sem regras rígidas. | **Zod Schemas** com rejeição HTTP 422 padronizada em caso de erros cadastrais. |
| **Idempotência** | Inexistente (executa a cada turno). | **Middleware nativo de Idempotência** por `request_id` (TTL 24h) com interface extensível para Redis. |
| **Empacotamento** | Script executável simples. | **Dockerfile multi-stage** e pronto para Kubernetes (K8s). |

---

## 5. Impacto em Specs Existentes

| Spec / Contrato | Tipo de Impacto | Descrição |
| :--- | :--- | :--- |
| `compliance-agent-card.json` | NENHUM (Compatível) | O Agent Card especificado na v2 do core de crédito permanece como a fonte de verdade absoluta e única do contrato HTTP exposto na versão `/v1`. |
| `adr-005-compliance-versioning.md` | ALINHADO | A estratégia de versionamento via URL prefix e deprecation de 90 dias com cabeçalhos regulamentados é adotada 1:1. |

---

## 6. Critérios de Aceite do Proposal

* **C-01:** Agente especializado compilando sem erros em modo TypeScript Estrito (`tsc`).
* **C-02:** Validação Zod bloqueando qualquer CPF fora do formato mascarado `XXX.XXX.XXX-XX` com retorno HTTP `422 Unprocessable Entity` estruturado.
* **C-03:** Cenários de CPF implementados deterministicamente sem dependência de chaves de cenário no payload.
* **C-04:** Repetição de chamadas com o mesmo `request_id` retornando a resposta cacheada instantaneamente com o cabeçalho `X-Cache: HIT`.
* **C-05:** Cabeçalho `X-Trace-Id` propagado perfeitamente nas respostas de sucesso e erro.
* **C-06:** Ponto de descoberta `.well-known/agent.json` publicado e respondendo exatamente com os metadados do Agent Card oficial.
* **C-07:** Execução local bem-sucedida de todos os 8 curls de teste especificados no processo de validação.
