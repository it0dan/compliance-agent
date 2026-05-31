import { FastifyReply, FastifyRequest } from 'fastify';

// Interface oficial prepared para integrações futuras (ex: Redis)
export interface IdempotencyStore {
  get(requestId: string): Promise<any | null>;
  set(requestId: string, response: any, ttlMs: number): Promise<void>;
  clearExpired(): Promise<void>;
}

// Implementação em-memória com Lazy Deletion e Scheduler de Limpeza
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private cache = new Map<string, { response: any; expiry: number }>();
  private cleanupInterval: NodeJS.Timeout;

  constructor(cleanupIntervalMs: number = 3600000) { // Default: 1 hora
    // Garante que o event loop não fique preso se o processo precisar encerrar
    this.cleanupInterval = setInterval(() => {
      this.clearExpired().catch(err => {
        console.error('Erro na limpeza de cache expirado:', err);
      });
    }, cleanupIntervalMs);
    this.cleanupInterval.unref();
  }

  async get(requestId: string): Promise<any | null> {
    const entry = this.cache.get(requestId);
    if (!entry) return null;

    if (Date.now() > entry.expiry) {
      this.cache.delete(requestId); // Lazy deletion
      return null;
    }

    return entry.response;
  }

  async set(requestId: string, response: any, ttlMs: number): Promise<void> {
    this.cache.set(requestId, {
      response,
      expiry: Date.now() + ttlMs
    });
  }

  async clearExpired(): Promise<void> {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        this.cache.delete(key);
      }
    }
  }

  // Helper para liberar recursos em caso de encerramento do servidor
  destroy() {
    clearInterval(this.cleanupInterval);
  }
}

// Instância global única do Store in-memory
export const idempotencyStore = new InMemoryIdempotencyStore();

// ==========================================
// Fastify Hook preHandler para Idempotência
// ==========================================
export async function idempotencyPreHandler(request: FastifyRequest, reply: FastifyReply) {
  // Apenas processa POST no fluxo de compliance
  if (request.method !== 'POST') return;

  const body = request.body as any;
  if (!body || typeof body !== 'object') return;

  const requestId = body.request_id;
  if (!requestId || typeof requestId !== 'string') return;

  try {
    const cachedResponse = await idempotencyStore.get(requestId);
    if (cachedResponse) {
      // Configura os cabeçalhos de resposta
      reply.header('X-Cache', 'HIT');
      
      // Garante que o trace_id retornado no corpo seja o trace_id atual do request
      const updatedResponse = {
        ...cachedResponse,
        trace_id: request.traceId
      };
      
      reply.status(200).send(updatedResponse);
      return; // Interrompe a execução (short-circuit)
    }

    // Configura o header informando o Cache MISS
    reply.header('X-Cache', 'MISS');
  } catch (error) {
    request.log.error(error, 'Erro ao verificar idempotência');
  }
}
