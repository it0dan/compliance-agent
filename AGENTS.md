# compliance-agent — Agent Guide

Agente especializado de compliance regulatório (KYC / PLD / LGPD). Identidade
A2A independente com Agent Card (`.well-known/agent.json`). Consumido
exclusivamente via Sensedia AI Gateway — nunca diretamente.

Capability organizacional transversal: outros sistemas (onboarding, cobrança,
seguros) consumirão este agente pelo Gateway. Foi extraído do monorepo principal
porque é uma capability de domínio, não um componente interno do MAS de crédito.

## Stack

- Node.js 20 + TypeScript strict (`noUnusedParameters` habilitado)
- Fastify (DT-001) + Zod com tipagem automática (DT-002)
- Vitest + supertest para testes
- Docker multi-stage (node:20-alpine) — copia `.well-known/`

## Comandos essenciais

```bash
npm test                   # execução única
npm run test:watch         # modo watch
npm run test:coverage      # coverage com v8

docker build -t compliance-agent .
docker run -p 8085:8085 --env-file .env compliance-agent
```

## Variáveis de ambiente

```
PORT=8085
NODE_ENV=development
LOG_LEVEL=info
IDEMPOTENCY_TTL_HOURS=24
```

## Contrato vigente — POST /v1/compliance

**Headers obrigatórios:** `X-Trace-Id` (UUID), `Authorization: Bearer <token>`

**Body obrigatório:**
```json
{
  "applicant_masked_cpf": "XXX.XXX.XXX-XX",
  "request_id": "<UUID>",
  "trace_id": "<UUID>"
}
```

**Headers de resposta:** `X-Trace-Id`, `X-Request-Id`, `X-Cache: HIT|MISS`

**SLA:** 5000ms | **Idempotência:** por `request_id`, TTL 24h

**Comportamento determinístico por CPF — sem parâmetro `scenario`:**

| CPF contém | Resultado | `tools_called` |
|---|---|---|
| `111` | KYC fail → short-circuit | `["verify_kyc"]` |
| `222` | PLD fail → short-circuit | `["verify_kyc", "check_pld"]` |
| `333` | Timeout induzido 5100ms | `["verify_kyc"]` |
| outros | Aprovação total | `["verify_kyc", "check_pld", "verify_lgpd_consent"]` |

**Semântica de auditoria:**
- `false` = verificado e reprovado
- `null` = não verificado (short-circuit de etapa anterior impediu a verificação)

## Estrutura de arquivos relevante

```
compliance-agent/
├── src/
│   ├── app.ts                         ← buildApp() — instância Fastify reutilizável
│   ├── server.ts                      ← entry point + graceful shutdown
│   ├── routes/v1/compliance.ts        ← handler POST /v1/compliance
│   ├── schemas/compliance.ts          ← schemas Zod (input + output com nullable)
│   ├── services/complianceService.ts  ← lógica determinística por CPF
│   └── middleware/
│       ├── tracing.ts                 ← X-Trace-Id propagation
│       └── idempotency.ts             ← in-memory store com interface p/ Redis
├── tests/
│   ├── unit/complianceService.test.ts
│   └── integration/compliance.test.ts ← 10 casos ✓
├── openspec/
│   ├── specs/compliance-agent/spec.md ← MODELO CANÔNICO — ler antes de trabalho
│   ├── design.md                      ← DT-001 a DT-005
│   ├── prompt.md                      ← SPDD derivation guide
│   └── changes/archive/               ← histórico imutável
└── .well-known/
    └── agent.json                     ← Agent Card A2A (fonte de verdade do contrato A2A)
```

## Modelo canônico — ler antes de qualquer trabalho arquitetural

Antes de propor qualquer mudança, leia:

1. `openspec/specs/compliance-agent/spec.md` — contrato vigente completo
2. `openspec/design.md` — decisões técnicas DT-001 a DT-005
3. `.well-known/agent.json` — Agent Card A2A

## Invariantes arquiteturais — MUST / NEVER

**MUST:**
- Este serviço DEVE ser referenciado como **agente especializado** — nunca como microsserviço
- Autenticação DEVE ser delegada ao Sensedia AI Gateway (DT-005) — nunca implementada localmente
- `X-Trace-Id` DEVE ser propagado em todas as respostas
- Toda requisição POST DEVE ter idempotência verificada por `request_id`
- Toda mudança DEVE seguir o processo OpenSpec: `proposal.md → design.md → spec.md → tasks.md → prompt.md`

**NEVER:**
- NEVER aceitar parâmetro `scenario` no contrato público — foi removido deliberadamente no code review
- NEVER instanciar LLM internamente — lógica é determinística, não cognitiva
- NEVER expor a porta diretamente para consumidores — sempre via Gateway
- NEVER retornar `false` para campo não verificado — usar `null` (semântica de auditoria)

## Processo obrigatório para mudanças (OpenSpec)

Qualquer mudança DEVE gerar os artefatos abaixo em ordem:

```
openspec/changes/<nome-da-mudança>/
├── proposal.md    ← o quê e por quê
├── design.md      ← decisões técnicas DT-001..N
├── spec.md        ← contrato atualizado
├── tasks.md       ← tarefas atômicas
└── prompt.md      ← SPDD derivation guide para o agente executor
```

Após conclusão e validação → mover para `openspec/changes/archive/<nome-da-mudança>/`.

**Versionamento de contrato (ADR-005):**
- Non-breaking changes → `/v1` diretamente, sem nova versão
- Breaking changes → nova versão `/v2`, deprecation mínimo 90 dias com headers `Deprecation` e `Sunset`

## Contexto de sessão

**Ao iniciar:** leia `.agent/handoff.md`. Se não estiver vazio, o conteúdo
representa o estado exato de onde a última sessão parou — siga a partir daí.

**Ao encerrar:** atualize `.agent/handoff.md` com:
- O que foi implementado ou decidido nesta sessão
- Estado atual dos arquivos modificados
- Próximo passo concreto (ação específica, não direção genérica)
- Qualquer invariante nova que emergiu durante o trabalho
