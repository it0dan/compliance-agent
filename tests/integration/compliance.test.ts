import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../helpers/app';

const app = getTestApp();

beforeAll(async () => {
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('Compliance Agent Integration Tests', () => {
  // 1. GET /health → 200, body { status: "UP" }
  it('GET /health should return 200 and UP status', async () => {
    const res = await request(app.server).get('/health');
    
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('UP');
    expect(res.body.timestamp).toBeDefined();
  });

  // 2. POST /v1/compliance — aprovação completa
  it('POST /v1/compliance should approve completely with standard valid CPF', async () => {
    const reqBody = {
      applicant_masked_cpf: 'XXX.XXX.XXX-99',
      request_id: 'e1d2c3b4-a5f6-7890-1234-567890abcdef',
      trace_id: 'e1d2c3b4-a5f6-7890-1234-567890abcdef'
    };

    const res = await request(app.server)
      .post('/v1/compliance')
      .set('X-Trace-Id', 'trace-integration-002')
      .send(reqBody);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.kyc_approved).toBe(true);
    expect(res.body.pld_clear).toBe(true);
    expect(res.body.lgpd_consent).toBe(true);
    expect(res.body.reason).toBeNull();
    expect(res.body.tools_called).toEqual(['verify_kyc', 'check_pld', 'verify_lgpd_consent']);
  });

  // 3. POST /v1/compliance — CPF inválido
  it('POST /v1/compliance should fail with 422 when CPF is invalid', async () => {
    const reqBody = {
      applicant_masked_cpf: 'cpf-invalido',
      request_id: 'e1d2c3b4-a5f6-7890-1234-567890abcde1',
      trace_id: 'e1d2c3b4-a5f6-7890-1234-567890abcde1'
    };

    const res = await request(app.server)
      .post('/v1/compliance')
      .send(reqBody);

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.details).toBeDefined();
    expect(res.body.details[0].path).toContain('applicant_masked_cpf');
  });

  // 4. POST /v1/compliance — KYC fail
  it('POST /v1/compliance should fail KYC with null for other fields when CPF starts with "111"', async () => {
    const reqBody = {
      applicant_masked_cpf: '111.XXX.XXX-99',
      request_id: 'e1d2c3b4-a5f6-7890-1234-567890abcde2',
      trace_id: 'e1d2c3b4-a5f6-7890-1234-567890abcde2'
    };

    const res = await request(app.server)
      .post('/v1/compliance')
      .send(reqBody);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('rejected');
    expect(res.body.kyc_approved).toBe(false);
    expect(res.body.pld_clear).toBeNull();
    expect(res.body.lgpd_consent).toBeNull();
    expect(res.body.reason).toBe('kyc_failed');
    expect(res.body.tools_called).toHaveLength(1);
    expect(res.body.tools_called[0]).toBe('verify_kyc');
  });

  // 5. POST /v1/compliance — PLD fail
  it('POST /v1/compliance should fail PLD with null for LGPD when CPF starts with "222"', async () => {
    const reqBody = {
      applicant_masked_cpf: '222.XXX.XXX-99',
      request_id: 'e1d2c3b4-a5f6-7890-1234-567890abcde3',
      trace_id: 'e1d2c3b4-a5f6-7890-1234-567890abcde3'
    };

    const res = await request(app.server)
      .post('/v1/compliance')
      .send(reqBody);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('rejected');
    expect(res.body.kyc_approved).toBe(true);
    expect(res.body.pld_clear).toBe(false);
    expect(res.body.lgpd_consent).toBeNull();
    expect(res.body.reason).toBe('pld_positive');
    expect(res.body.tools_called).toHaveLength(2);
    expect(res.body.tools_called).toEqual(['verify_kyc', 'check_pld']);
  });

  // 6. POST /v1/compliance — idempotência (HIT)
  it('POST /v1/compliance should return cache HIT and identical body on duplicate request_id', async () => {
    const reqBody = {
      applicant_masked_cpf: 'XXX.XXX.XXX-99',
      request_id: '99d2c3b4-a5f6-7890-1234-567890abcdef',
      trace_id: '99d2c3b4-a5f6-7890-1234-567890abcdef'
    };

    // Primeira chamada: Cache MISS
    const res1 = await request(app.server)
      .post('/v1/compliance')
      .send(reqBody);

    expect(res1.status).toBe(200);
    expect(res1.header['x-cache']).toBe('MISS');

    // Segunda chamada: Cache HIT
    const res2 = await request(app.server)
      .post('/v1/compliance')
      .send(reqBody);

    expect(res2.status).toBe(200);
    expect(res2.header['x-cache']).toBe('HIT');
    expect(res2.body.request_id).toBe(res1.body.request_id);
    expect(res2.body.kyc_approved).toBe(res1.body.kyc_approved);
    expect(res2.body.pld_clear).toBe(res1.body.pld_clear);
    expect(res2.body.lgpd_consent).toBe(res1.body.lgpd_consent);
  });

  // 7. POST /v1/compliance — propagação de X-Trace-Id
  it('POST /v1/compliance should propagate trace ID into response header and body', async () => {
    const traceId = 'trace-vitest-007';
    const validBodyTraceId = 'f1a2b3c4-d5e6-7f8a-9b0c-1d2e3f4a5b67';
    const reqBody = {
      applicant_masked_cpf: 'XXX.XXX.XXX-99',
      request_id: '11d2c3b4-a5f6-7890-1234-567890abcdef',
      trace_id: validBodyTraceId
    };

    const res = await request(app.server)
      .post('/v1/compliance')
      .set('X-Trace-Id', traceId)
      .send(reqBody);

    expect(res.status).toBe(200);
    expect(res.header['x-trace-id']).toBe(traceId);
    expect(res.body.trace_id).toBe(traceId);
  });

  // 8. GET /.well-known/agent.json
  it('GET /.well-known/agent.json should return A2A card metadata', async () => {
    const res = await request(app.server).get('/.well-known/agent.json');
    
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('compliance-agent');
    expect(res.body.version).toBe('1.0.0');
    expect(res.body.skills).toBeInstanceOf(Array);
    expect(res.body.skills.length).toBeGreaterThan(0);
  });

  // 9. POST /v1/compliance — trace_id ausente no body → 422
  it('POST /v1/compliance should fail with 422 if trace_id is missing in request body', async () => {
    const reqBody = {
      applicant_masked_cpf: 'XXX.XXX.XXX-99',
      request_id: 'e1d2c3b4-a5f6-7890-1234-567890abcde4'
    };

    const res = await request(app.server)
      .post('/v1/compliance')
      .send(reqBody);

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.details[0].path).toContain('trace_id');
  });

  // 10. POST /v1/compliance — request_id inválido (não-UUID) → 422
  it('POST /v1/compliance should fail with 422 if request_id is not a valid UUID', async () => {
    const reqBody = {
      applicant_masked_cpf: 'XXX.XXX.XXX-99',
      request_id: 'nao-e-um-uuid',
      trace_id: 'e1d2c3b4-a5f6-7890-1234-567890abcde5'
    };

    const res = await request(app.server)
      .post('/v1/compliance')
      .send(reqBody);

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.details[0].path).toContain('request_id');
  });
});
