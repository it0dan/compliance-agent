import { FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';

// Declaração do módulo Fastify para estender as propriedades de Request
declare module 'fastify' {
  interface FastifyRequest {
    traceId: string;
    requestId: string;
  }
}

// Hook global onRequest para Fastify
export async function tracingHook(request: FastifyRequest, reply: FastifyReply) {
  // 1. Extração do Trace ID (Header -> Body -> Novo UUID)
  const traceIdHeader = request.headers['x-trace-id'];
  let traceId = '';

  if (typeof traceIdHeader === 'string' && traceIdHeader.trim().length > 0) {
    traceId = traceIdHeader;
  } else {
    // Tenta ler do body se for JSON
    const body = request.body as any;
    if (body && typeof body === 'object') {
      traceId = body.trace_id || body.request_id || randomUUID();
    } else {
      traceId = randomUUID();
    }
  }

  // 2. Extração/Geração do Request ID
  const requestIdHeader = request.headers['x-request-id'];
  const requestId = (typeof requestIdHeader === 'string' && requestIdHeader.trim().length > 0)
    ? requestIdHeader
    : randomUUID();

  // 3. Vincula ao request context
  request.traceId = traceId;
  request.requestId = requestId;

  // 4. Injeta nos cabeçalhos de resposta
  reply.header('X-Trace-Id', traceId);
  reply.header('X-Request-Id', requestId);
}
