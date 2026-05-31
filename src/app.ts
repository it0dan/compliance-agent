import fastify from 'fastify';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';

// Carrega variáveis de ambiente
dotenv.config();

import { tracingHook } from './middleware/tracing';
import { idempotencyPreHandler } from './middleware/idempotency';
import complianceRoutes from './routes/v1/compliance';

export function buildApp() {
  const app = fastify({
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
  app.addHook('onRequest', tracingHook);

  // Adiciona o hook de verificação de idempotência antes de passar para os handlers de rota
  app.addHook('preHandler', idempotencyPreHandler);

  // Registra Rotas de Negócio com versão `/v1`
  app.register(complianceRoutes, { prefix: '/v1' });

  // ==========================================
  // Rota de Monitoramento de Saúde (Healthcheck)
  // ==========================================
  app.get('/health', async (_request, reply) => {
    reply.status(200).send({ status: 'UP', timestamp: new Date().toISOString() });
  });

  // ==========================================
  // Rota de Descoberta A2A (.well-known/agent.json)
  // ==========================================
  app.get('/.well-known/agent.json', async (_request, reply) => {
    try {
      const cardPath = path.join(__dirname, '..', '.well-known', 'agent.json');
      const content = await fs.readFile(cardPath, 'utf-8');
      
      reply
        .header('Content-Type', 'application/json; charset=utf-8')
        .status(200)
        .send(JSON.parse(content));
    } catch (error) {
      app.log.error(error, 'Erro ao carregar o Agent Card de .well-known/agent.json');
      reply.status(500).send({ error: 'internal_server_error', message: 'Falha ao recuperar o Agent Card' });
    }
  });

  return app;
}
