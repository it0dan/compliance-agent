import { z } from 'zod';

// ==========================================
// Schema de Entrada (Request Body)
// ==========================================
export const ComplianceRequestSchema = z.object({
  applicant_masked_cpf: z
    .string({
      required_error: "applicant_masked_cpf é obrigatório",
      invalid_type_error: "applicant_masked_cpf deve ser uma string"
    })
    .regex(/^[Xx\d]{3}\.[Xx\d]{3}\.[Xx\d]{3}-[\dXx]{2}$/, {
      message: "applicant_masked_cpf deve estar no formato mascarado XXX.XXX.XXX-XX"
    }),
  request_id: z
    .string({
      required_error: "request_id é obrigatório"
    })
    .uuid({
      message: "request_id deve ser um UUID válido"
    }),
  trace_id: z
    .string({
      required_error: "trace_id é obrigatório"
    })
    .uuid({
      message: "trace_id deve ser um UUID válido"
    })
});

// Inferência de Tipagem TypeScript para o Input
export type ComplianceRequest = z.infer<typeof ComplianceRequestSchema>;

// ==========================================
// Schema de Saída (Response Body)
// ==========================================
export const ComplianceResponseSchema = z.object({
  request_id: z.string().uuid(),
  kyc_approved: z.boolean(),
  pld_clear: z.boolean().nullable(),
  lgpd_consent: z.boolean().nullable(),
  status: z.enum(['ok', 'rejected', 'error', 'timeout']),
  reason: z.enum([
    'kyc_failed', 'kyc_unavailable', 'kyc_timeout',
    'pld_positive', 'pld_unavailable', 'pld_timeout',
    'lgpd_no_consent', 'lgpd_unavailable', 'lgpd_timeout'
  ]).nullable(),
  details: z.string(),
  tools_called: z.array(z.string()),
  processing_time_ms: z.number().int(),
  trace_id: z.string().optional()
});

// Inferência de Tipagem TypeScript para o Output
export type ComplianceResponse = z.infer<typeof ComplianceResponseSchema>;
