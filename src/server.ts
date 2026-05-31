import fastify from 'fastify';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';

// Carrega variáveis de ambiente
dotenv.config();

import { tracingHook } from './middleware/tracing';
import { idempotencyPreHandler, idempotencyStore } from './middleware/idempotency';
import complianceRoutes from './routes/v1/compliance';

// Instancia o servidor Fastify com logger JSON Pino nativo configurado
const server = fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    formatters: {
      level: (label) => {
        return { level: label.toUpperCase() };
      }
    }
  }
});

// Registra Middlewares e Hooks Globais
server.addHook('onRequest', tracingHook);

// Adiciona o hook de verificação de idempotência antes de passar para os handlers de rota
server.addHook('preHandler', idempotencyPreHandler);

// Registra Rotas de Negócio com versão `/v1`
server.register(complianceRoutes, { prefix: '/v1' });

// ==========================================
// Rota de Monitoramento de Saúde (Healthcheck)
// ==========================================
server.get('/health', async (_request, reply) => {
  reply.status(200).send({ status: 'UP', timestamp: new Date().toISOString() });
});

// ==========================================
// Rota de Descoberta A2A (.well-known/agent.json)
// ==========================================
server.get('/.well-known/agent.json', async (_request, reply) => {
  try {
    const cardPath = path.join(__dirname, '..', '.well-known', 'agent.json');
    const content = await fs.readFile(cardPath, 'utf-8');
    
    reply
      .header('Content-Type', 'application/json; charset=utf-8')
      .status(200)
      .send(JSON.parse(content));
  } catch (error) {
    server.log.error(error, 'Erro ao carregar o Agent Card de .well-known/agent.json');
    reply.status(500).send({ error: 'internal_server_error', message: 'Falha ao recuperar o Agent Card' });
  }
});

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
    server.log.info(`🚀 Microsserviço de Compliance rodando em http://${host}:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
