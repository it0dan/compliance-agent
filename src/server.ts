import { buildApp } from './app';
import { idempotencyStore } from './middleware/idempotency';

const server = buildApp();

// ==========================================
// Tratamento de Encerramento Gracioso (Graceful Shutdown)
// ==========================================
const shutdown = async (signal: string) => {
  server.log.info(`Sinal de encerramento ${signal} recebido. Finalizando o servidor...`);
  
  // Limpa timers ativos do store de idempotência
  idempotencyStore.destroy();

  try {
    await server.close();
    server.log.info('Servidor Fastify finalizado com sucesso.');
    process.exit(0);
  } catch (error) {
    server.log.error(error, 'Erro durante a finalização do servidor.');
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ==========================================
// Inicialização do Servidor
// ==========================================
const start = async () => {
  const port = parseInt(process.env.PORT || '8085', 10);
  const host = '0.0.0.0'; // Necessário para Docker e redes internas de pods

  try {
    await server.listen({ port, host });
    server.log.info(`🚀 Agente Especializado de Compliance rodando em http://${host}:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
