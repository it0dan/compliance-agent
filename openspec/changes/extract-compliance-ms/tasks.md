# Tasks: Extração do Microsserviço de Compliance Independente

**Change ID:** extract-compliance-ms  
**Derivado de:** proposal.md  

---

## 🟩 Fase 1 — Spec Definition (Concluída)

- [x] **proposal.md**: Motivação, escopo, C4 diagram de contexto, diferenciais de produção e critérios de aceite.
- [x] **design.md**: Decisões técnicas DT-001 (Fastify), DT-002 (Zod), DT-003 (Idempotência In-Memory), DT-004 (Cenários por CPF), DT-005 (Autenticação no Gateway) e resolução de perguntas em aberto.
- [x] **specs/compliance-agent/spec.md**: Contrato da v1, esquemas estritos, mapeamentos determinísticos de CPF (111, 222, 333), short-circuiting, regras de idempotência e propagação de headers de trace.
- [x] **tasks.md**: Checklist atômico de acompanhamento das fases do ciclo de desenvolvimento.
- [x] **prompt.md**: Derivações contratuais no padrão SPDD de implementação do projeto.

---

## 🟨 Fase 2 — Implementação (Pendente de Início)

### 2.1 Estrutura de Infraestrutura e Setup
- [ ] Criar `package.json` com dependências mínimas (`fastify`, `zod`, `@fastify/cors`) e devDependencies (`typescript`, `@types/node`, `ts-node-dev`).
- [ ] Configurar `tsconfig.json` em modo estrito (`"strict": true`, sem `any` implícito, target `ES2022`).
- [ ] Criar `.env.example` contendo variáveis básicas de porta e TTL de idempotência.
- [ ] Criar `Dockerfile` multi-stage funcional para build e execução segura (`node:20-alpine`).

### 2.2 Componentes e Lógica Interna (TypeScript)
- [ ] **src/schemas/compliance.ts**: Definir esquemas Zod rígidos de validação para input e output, incluindo validação regex de CPF mascarado.
- [ ] **src/middleware/tracing.ts**: Implementar middleware para capturar, propagar e gerar `X-Trace-Id` e `X-Request-Id`.
- [ ] **src/middleware/idempotency.ts**: Implementar barramento de cache in-memory baseado na interface `IdempotencyStore` com tempo de expiração padrão (TTL 24h) e scheduler de limpeza automática de vazamentos.
- [ ] **src/services/complianceService.ts**: Desenvolver motor determinístico de análise mapeando os blocos centrais de CPF (111 -> KYC fail, 222 -> PLD fail, 333 -> timeout induzido de 5.1s) e aplicando regras rígidas de short-circuiting sequencial.
- [ ] **src/routes/v1/compliance.ts**: Criar rota Fastify `/v1/compliance` que intercepta o payload, executa validação, valida a idempotência e retorna o payload contratual.
- [ ] **src/server.ts**: Ponto de entrada da aplicação Fastify registrando middlewares, injetando CORS, configurando a rota de healthcheck `/health` e servindo o manifesto estático `.well-known/agent.json`.
- [ ] **.well-known/agent.json**: Criar manifesto idêntico ao `compliance-agent-card.json` oficial do core de crédito para descoberta de agentes.
- [ ] **README.md**: Escrever guia completo de setup local, testes, comandos npm e Docker.

---

## 🟨 Fase 3 — Validação (Pendente de Início)

### 3.1 Execução de Testes Operacionais (Curls de Verificação)
- [ ] **C-01 Health**: Validar endpoint `/health` retornando HTTP 200 `{ "status": "UP" }`.
- [ ] **C-02 Sucesso**: Validar request padrão com CPF comum retornando aprovação em todas as etapas com HTTP 200.
- [ ] **C-03 Validação**: Validar requisição com CPF em formato inválido retornando HTTP 422 e erros descritivos do Zod.
- [ ] **C-04 KYC Fail**: Validar proponente com CPF contendo "111" retornando `kyc_approved: false` e short-circuit (PLD/LGPD não chamados).
- [ ] **C-05 PLD Fail**: Validar proponente com CPF contendo "222" retornando `pld_clear: false` e short-circuit (LGPD não chamado).
- [ ] **C-06 Idempotência**: Validar duas chamadas idênticas consecutivas com mesmo `request_id`, garantindo resposta imediata com o header `X-Cache: HIT` e tempo de execução zerado.
- [ ] **C-07 Rastreamento**: Confirmar que o cabeçalho `X-Trace-Id` do request é retornado 1:1 no cabeçalho e corpo da resposta.
- [ ] **C-08 Manifesto**: Validar acesso público em `/.well-known/agent.json` retornando o metadado A2A do Agent Card.

---

## 🟨 Fase 4 — Archive

- [ ] Arquivar pasta do change `openspec/changes/extract-compliance-ms` para `openspec/changes/archive/extract-compliance-ms` após validação bem-sucedida em produção.
