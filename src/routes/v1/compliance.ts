import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ComplianceRequestSchema } from '../../schemas/compliance';
import { complianceService } from '../../services/complianceService';
import { idempotencyStore } from '../../middleware/idempotency';

// Helper de atraso assíncrono para simular timeouts
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default async function complianceRoutes(fastify: FastifyInstance) {
  fastify.post('/compliance', async (request: FastifyRequest, reply: FastifyReply) => {
    // 1. Validação Sintática Rígida com Zod
    const validation = ComplianceRequestSchema.safeParse(request.body);
    if (!validation.success) {
      request.log.warn({ errors: validation.error.errors }, 'Falha de validação de schema');
      reply.status(422).send({
        error: 'validation_error',
        details: validation.error.errors.map(err => ({
          path: err.path,
          message: err.message
        }))
      });
      return;
    }

    // 1.1 Validar que trace_id está presente no body ou no header X-Trace-Id
    const hasTraceIdInHeader = typeof request.headers['x-trace-id'] === 'string' && request.headers['x-trace-id'].trim().length > 0;
    if (!validation.data.trace_id && !hasTraceIdInHeader) {
      request.log.warn('Falha de validação: trace_id ausente no corpo e cabeçalho X-Trace-Id ausente');
      reply.status(422).send({
        error: 'validation_error',
        details: [
          {
            path: ['trace_id'],
            message: 'trace_id é obrigatório no corpo se o header X-Trace-Id não for enviado'
          }
        ]
      });
      return;
    }

    const { applicant_masked_cpf, request_id } = validation.data;

    // 2. Simulação de Timeout de SLA (CPF contendo "333")
    const isTimeout = applicant_masked_cpf.includes('333');
                      
    if (isTimeout) {
      request.log.info({ applicant_masked_cpf, request_id }, 'Simulando atraso de timeout regulatório...');
      await sleep(5100); // 5.1 segundos (excede o SLA de 5s)
    }

    // 3. Execução da Lógica da Esteira (Comportamento Determinístico por CPF)
    const result = await complianceService.executeVerification(
      applicant_masked_cpf,
      request_id,
      request.traceId
    );

    // 4. Salva no cache de idempotência se a operação foi processada com sucesso
    // TTL: 24 horas (configurável via variável de ambiente)
    const ttlHours = parseInt(process.env.IDEMPOTENCY_TTL_HOURS || '24', 10);
    const ttlMs = ttlHours * 60 * 60 * 1000;
    
    await idempotencyStore.set(request_id, result, ttlMs);

    // 5. Retorna o resultado contratual HTTP 200 OK
    reply.status(200).send(result);
  });
}
