import { ComplianceResponse } from '../schemas/compliance';

export class ComplianceService {
  /**
   * Executa a esteira sequencial de compliance com base no CPF mascarado.
   * Não executa chamadas externas ao LLM, simulando a lógica determinística descrita na Spec.
   */
  public async executeVerification(
    cpf: string,
    requestId: string,
    traceId?: string,
    scenario?: string
  ): Promise<ComplianceResponse> {
    // TODO: Quando os servidores MCP reais (mcp-kyc, mcp-pld, etc.) ou bancos de dados reais forem integrados,
    // o cálculo do tempo de processamento abaixo (Date.now() - startTime) passará a medir a latência real de E/S.
    // Atualmente, como a lógica é 100% síncrona e simulada em memória, a medição resulta em ~0ms (ou no tempo do delay do timeout).
    const startTime = Date.now();
    const toolsCalled: string[] = [];

    // Normaliza para verificar se contém "111", "222" ou "333" nos dígitos significativos
    const isKycFail = cpf.startsWith('111') || cpf.includes('111') || scenario === 'compliance_fail';
    const isPldFail = cpf.startsWith('222') || cpf.includes('222');
    const isTimeout = cpf.startsWith('333') || cpf.includes('333') || scenario === 'bureau_error';

    // 1. Verificação KYC (verify_kyc)
    toolsCalled.push('verify_kyc');
    
    if (isTimeout) {
      // O timeout de lentidão é tratado no handler principal.
      // Aqui apenas mapeamos a resposta caso o processamento chegue ao fim.
      return {
        request_id: requestId,
        kyc_approved: false,
        pld_clear: false,
        lgpd_consent: false,
        status: 'timeout',
        reason: 'kyc_timeout',
        details: 'Tempo limite de execução excedido durante a consulta KYC.',
        tools_called: toolsCalled,
        processing_time_ms: Date.now() - startTime,
        trace_id: traceId
      };
    }

    if (isKycFail) {
      return {
        request_id: requestId,
        kyc_approved: false,
        pld_clear: false,
        lgpd_consent: false,
        status: 'rejected',
        reason: 'kyc_failed',
        details: 'Falha cadastral: CPF com inconsistências ativas no banco de dados de KYC.',
        tools_called: toolsCalled,
        processing_time_ms: Date.now() - startTime,
        trace_id: traceId
      };
    }

    // 2. Verificação PLD (check_pld) - Short-circuit: Só roda se KYC aprovado
    toolsCalled.push('check_pld');
    
    if (isPldFail) {
      return {
        request_id: requestId,
        kyc_approved: true,
        pld_clear: false,
        lgpd_consent: false,
        status: 'rejected',
        reason: 'pld_positive',
        details: 'Rejeitado devido a apontamento restritivo em listas de PEP/PLD/Sanções.',
        tools_called: toolsCalled,
        processing_time_ms: Date.now() - startTime,
        trace_id: traceId
      };
    }

    // 3. Verificação LGPD (verify_lgpd_consent) - Short-circuit: Só roda se KYC e PLD aprovados
    toolsCalled.push('verify_lgpd_consent');

    // Sucesso Total
    return {
      request_id: requestId,
      kyc_approved: true,
      pld_clear: true,
      lgpd_consent: true,
      status: 'ok',
      reason: null,
      details: 'Validações cadastrais, regulatórias e LGPD concluídas com sucesso.',
      tools_called: toolsCalled,
      processing_time_ms: Date.now() - startTime,
      trace_id: traceId
    };
  }
}

export const complianceService = new ComplianceService();
