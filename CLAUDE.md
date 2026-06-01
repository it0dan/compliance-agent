@AGENTS.md

## Claude-specific

- Use plan mode antes de qualquer modificação em `src/routes/` or `src/schemas/`
- Ao gerar código TypeScript, respeite `strict` e `noUnusedParameters` do tsconfig
- Ao encerrar sessão, atualize `.agent/handoff.md` com estado atual antes de finalizar
