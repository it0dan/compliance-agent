import { describe, it, expect } from 'vitest';
import { complianceService } from '../../src/services/complianceService';

describe('ComplianceService Unit Tests', () => {
  // 1. CPF padrão → aprovação completa
  it('should approve completely with standard valid CPF', async () => {
    const result = await complianceService.executeVerification(
      'XXX.XXX.XXX-99',
      'c1a2b3c4-d5e6-7f8a-9b0c-1d2e3f4a5b6c',
      'trace-unit-001'
    );

    expect(result.status).toBe('ok');
    expect(result.kyc_approved).toBe(true);
    expect(result.pld_clear).toBe(true);
    expect(result.lgpd_consent).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.tools_called).toEqual(['verify_kyc', 'check_pld', 'verify_lgpd_consent']);
    expect(result.trace_id).toBe('trace-unit-001');
  });

  // 2. CPF com "111" → KYC fail com short-circuit
  it('should fail KYC with short-circuit when CPF contains "111"', async () => {
    const result = await complianceService.executeVerification(
      '111.XXX.XXX-99',
      'c1a2b3c4-d5e6-7f8a-9b0c-1d2e3f4a5b6c',
      'trace-unit-002'
    );

    expect(result.status).toBe('rejected');
    expect(result.kyc_approved).toBe(false);
    expect(result.pld_clear).toBeNull();
    expect(result.lgpd_consent).toBeNull();
    expect(result.reason).toBe('kyc_failed');
    expect(result.tools_called).toEqual(['verify_kyc']);
  });

  // 3. CPF com "222" → PLD fail com short-circuit
  it('should fail PLD with short-circuit when CPF contains "222"', async () => {
    const result = await complianceService.executeVerification(
      '222.XXX.XXX-99',
      'c1a2b3c4-d5e6-7f8a-9b0c-1d2e3f4a5b6c',
      'trace-unit-003'
    );

    expect(result.status).toBe('rejected');
    expect(result.kyc_approved).toBe(true);
    expect(result.pld_clear).toBe(false);
    expect(result.lgpd_consent).toBeNull();
    expect(result.reason).toBe('pld_positive');
    expect(result.tools_called).toEqual(['verify_kyc', 'check_pld']);
  });

  // 4. CPF com "111" E "222" → KYC tem prioridade (short-circuit no primeiro)
  it('should prioritize KYC failure over PLD when CPF contains both "111" and "222"', async () => {
    const result = await complianceService.executeVerification(
      '111.222.XXX-99',
      'c1a2b3c4-d5e6-7f8a-9b0c-1d2e3f4a5b6c',
      'trace-unit-004'
    );

    expect(result.status).toBe('rejected');
    expect(result.kyc_approved).toBe(false);
    expect(result.pld_clear).toBeNull();
    expect(result.lgpd_consent).toBeNull();
    expect(result.reason).toBe('kyc_failed');
    expect(result.tools_called).toEqual(['verify_kyc']);
  });

  // 5. trace_id propagado corretamente no resultado
  it('should correctly propagate traceId into the result body', async () => {
    const customTraceId = 'my-custom-trace-uuid';
    const result = await complianceService.executeVerification(
      'XXX.XXX.XXX-99',
      'c1a2b3c4-d5e6-7f8a-9b0c-1d2e3f4a5b6c',
      customTraceId
    );

    expect(result.trace_id).toBe(customTraceId);
  });
});
