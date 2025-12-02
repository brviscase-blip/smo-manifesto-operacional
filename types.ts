export interface Manifesto {
  id: string;
  status: string;
  nome_funcionario?: string;
  cia?: string;
}

export type ActionType = '' | 'Iniciar Puxe' | 'Finalizar Puxe';

export interface FeedbackMessage {
  text: string;
  type: 'success' | 'error' | '';
}

export interface ProcessingState {
  isProcessing: boolean;
  message: string;
}