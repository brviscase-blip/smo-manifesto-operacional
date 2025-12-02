import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  ActionType, 
  FeedbackMessage 
} from './types';
import { 
  fetchNames, 
  fetchIdsByStatus, 
  fetchManifestosForEmployee, 
  fetchCIAs,
  submitManifestoAction
} from './services/api';
import { supabase } from './supabaseClient';
import LoadingOverlay from './components/LoadingOverlay';
import CustomSelect from './components/CustomSelect';

// Icons
const RefreshIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/>
  </svg>
);

const App: React.FC = () => {
  // State
  const [action, setAction] = useState<ActionType>('');
  const [name, setName] = useState<string>('');
  const [selectedManifestoId, setSelectedManifestoId] = useState<string>('');
  
  // Data Lists
  const [namesList, setNamesList] = useState<string[]>([]);
  const [idsList, setIdsList] = useState<string[]>([]);
  const [manifestosForEmployee, setManifestosForEmployee] = useState<string[]>([]);

  // UI State
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('Processando...');
  const [updating, setUpdating] = useState<boolean>(false); // For the refresh button spinner
  const [feedback, setFeedback] = useState<FeedbackMessage>({ text: '', type: '' });
  const [lastSubmission, setLastSubmission] = useState<string | null>(null);

  // --- Data Loading Functions ---

  const loadNames = useCallback(async () => {
    // For "Iniciar Puxe", we likely want all names or active employees
    const names = await fetchNames();
    setNamesList(names);
  }, []);

  const loadIds = useCallback(async () => {
    setUpdating(true);
    // Based on PDF logic: Iniciar Puxe needs "Manifesto Recebido"
    const ids = await fetchIdsByStatus('Manifesto Recebido');
    setIdsList(ids);
    setTimeout(() => setUpdating(false), 500); // Visual delay for spinner
  }, []);

  const loadIdsFinalization = useCallback(async () => {
    setUpdating(true);
    // Based on PDF logic: Finalizar Puxe logic loads names that have 'Manifesto Iniciado'
    const names = await fetchNames('Manifesto Iniciado');
    setNamesList(names);
    setTimeout(() => setUpdating(false), 500);
  }, []);

  // --- Real-time Subscription ---
  useEffect(() => {
    const channel = supabase
      .channel('realtime-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'SMO_Sistema' },
        (payload) => {
          // If SMO_Sistema changes (new manifesto or status change), refresh relevant lists
          if (action === 'Iniciar Puxe') {
            loadIds();
          } else if (action === 'Finalizar Puxe') {
            if (name) {
              // Refresh specific employee list if selected
              fetchManifestosForEmployee(name).then(setManifestosForEmployee);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'Cadastro_Operacional' },
        (payload) => {
          // If a new employee is added
          if (action === 'Iniciar Puxe') loadNames();
          if (action === 'Finalizar Puxe') loadIdsFinalization();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [action, name, loadIds, loadNames, loadIdsFinalization]);

  // --- Event Handlers ---

  // Handle Action Change
  useEffect(() => {
    setFeedback({ text: '', type: '' });
    setName('');
    setSelectedManifestoId('');
    setManifestosForEmployee([]);

    if (action === 'Iniciar Puxe') {
      loadNames();
      loadIds();
    } else if (action === 'Finalizar Puxe') {
      loadIdsFinalization(); // Loads specific names for finalization
    }
  }, [action, loadNames, loadIds, loadIdsFinalization]);

  // Handle Refresh Click
  const handleRefresh = () => {
    if (updating) return;
    if (action === 'Iniciar Puxe') {
      loadIds();
      loadNames();
    } else if (action === 'Finalizar Puxe') {
      loadIdsFinalization();
    }
  };

  // Handle Name Selection (Finalizar Puxe)
  const handleNameChange = async (val: string) => {
    setName(val);
    setSelectedManifestoId('');
    if (action === 'Finalizar Puxe' && val) {
      const manifests = await fetchManifestosForEmployee(val);
      setManifestosForEmployee(manifests);
    } else {
      setManifestosForEmployee([]);
    }
  };

  // Handle Submission
  const handleSubmit = async () => {
    setFeedback({ text: '', type: '' });

    // Validation
    if (!action) return;
    if (action === 'Iniciar Puxe' && (!name || !selectedManifestoId)) {
      setFeedback({ text: 'Preencha todos os campos.', type: 'error' });
      return;
    }
    if (action === 'Finalizar Puxe' && (!name || !selectedManifestoId)) {
      setFeedback({ text: 'Preencha todos os campos.', type: 'error' });
      return;
    }
    // Strict name check only if list is populated and not empty
    if (action === 'Iniciar Puxe' && namesList.length > 0 && !namesList.some(n => n.toLowerCase() === name.toLowerCase())) {
        setFeedback({ text: 'Por favor, escolha um nome válido da lista.', type: 'error' });
        return;
    }

    // Duplicate Check
    const submissionKey = `${action}-${selectedManifestoId}-${name}`;
    if (lastSubmission === submissionKey) {
      setFeedback({ text: 'Este registro já foi enviado recentemente!', type: 'error' });
      return;
    }

    setLoading(true);
    setLoadingMessage('Processando...');

    // Simulate Network Request
    setTimeout(async () => {
      const result = await submitManifestoAction(action, selectedManifestoId, name);
      
      setLoading(false);
      
      if (result.success) {
        setFeedback({ text: result.message, type: 'success' });
        setLastSubmission(submissionKey);
        
        // Reset specific fields
        if (action === 'Finalizar Puxe') {
           // Remove the finalized manifesto from the list visually
           setManifestosForEmployee(prev => prev.filter(id => id !== selectedManifestoId));
           setSelectedManifestoId('');
        } else {
           setSelectedManifestoId('');
           setName('');
           // Refresh IDs to remove the one just pulled
           loadIds();
        }

        // Auto hide success message
        setTimeout(() => setFeedback({text: '', type: ''}), 3000);

      } else {
        setFeedback({ text: result.message, type: 'error' });
      }
    }, 1500); 
  };

  return (
    <div className="container relative z-20 bg-white p-[30px] px-[25px] rounded-[20px] shadow-[0_10px_30px_rgba(0,0,0,0.15)] w-full max-w-[420px] text-center animate-fadeIn mx-4">
      
      <h2 className="text-[#ee2536] text-[22px] font-bold mb-[25px]">
        Controle de Manifesto Operacional
      </h2>

      {/* Action Selection */}
      <label htmlFor="acao" className="block mt-[15px] mb-[5px] font-bold text-[#444] text-[14px] text-left">
        Ação
      </label>
      <div className="flex gap-2 items-start">
        <div className="flex-1">
            <CustomSelect 
                options={['Iniciar Puxe', 'Finalizar Puxe']}
                value={action}
                onChange={(val) => setAction(val as ActionType)}
                placeholder="Selecione"
            />
        </div>

        {/* Refresh Button */}
        {action && (
            <button 
                onClick={handleRefresh}
                className={`w-[45px] h-[45px] mt-[5px] p-0 bg-transparent text-[#ee2536] font-bold border border-[#ee2536] rounded-[12px] cursor-pointer transition-all duration-200 text-[18px] flex items-center justify-center flex-shrink-0 hover:bg-[#fff0f1] ${updating ? 'opacity-70 cursor-wait' : ''}`}
                title="Atualizar lista"
            >
                <div className={updating ? 'animate-spin' : ''}>
                    <RefreshIcon />
                </div>
            </button>
        )}
      </div>

      {/* -------------------- INICIAR PUXE VIEW -------------------- */}
      {action === 'Iniciar Puxe' && (
        <div className="animate-fadeIn">
            {/* Name Input */}
            <div className="mt-[15px]">
                <label htmlFor="nome" className="block mb-[5px] font-bold text-[#444] text-[14px] text-left">Nome</label>
                <CustomSelect
                    options={namesList}
                    value={name}
                    onChange={setName}
                    placeholder="Digite ou selecione"
                    searchable={true}
                />
            </div>

            {/* Code Select */}
            <div className="mt-[15px]">
                <label htmlFor="codigo" className="block mb-[5px] font-bold text-[#444] text-[14px] text-left">Código de Rastreio (ID)</label>
                <CustomSelect 
                    options={idsList}
                    value={selectedManifestoId}
                    onChange={setSelectedManifestoId}
                    placeholder="Selecione"
                />
            </div>
        </div>
      )}

      {/* -------------------- FINALIZAR PUXE VIEW -------------------- */}
      {action === 'Finalizar Puxe' && (
        <div className="animate-fadeIn">
            {/* Employee Name Select */}
            <div className="mt-[15px]">
                <label htmlFor="nomeFinalizacao" className="block mb-[5px] font-bold text-[#444] text-[14px] text-left">Nome do Funcionário</label>
                <CustomSelect 
                    options={namesList}
                    value={name}
                    onChange={handleNameChange}
                    placeholder="Selecione"
                    searchable={true}
                />
            </div>

            {/* Expanded Manifesto Selection Area */}
            {name && (
                <div className="mt-[10px] bg-[#f8f9fa] border border-[#dee2e6] rounded-[12px] p-[15px] animate-slideDown">
                    <label className="block mb-[5px] font-bold text-[#444] text-[14px] text-left">
                        Código de Rastreio (ID)
                    </label>
                    <div className="max-h-[200px] overflow-y-auto text-left custom-scrollbar">
                        {manifestosForEmployee.length === 0 ? (
                            <div className="text-[#6c757d] italic text-center p-[20px] text-[13px]">
                                Nenhum manifesto encontrado para este funcionário
                            </div>
                        ) : (
                            <>
                                <div className="bg-[#e8f5e8] border border-[#28a745] text-[#155724] p-[10px] rounded-[8px] mb-[10px] font-bold text-[14px] text-center">
                                    {manifestosForEmployee.length} manifesto(s) encontrado(s)
                                </div>
                                {manifestosForEmployee.map(id => (
                                    <button
                                        key={id}
                                        onClick={() => setSelectedManifestoId(id)}
                                        className={`w-full block p-[10px_12px] my-[6px] border rounded-[8px] text-[13px] text-left font-medium relative transition-all duration-200 cursor-pointer 
                                            ${selectedManifestoId === id 
                                                ? 'bg-gradient-to-br from-[#ee2536] to-[#ff6f61] text-white border-[#ee2536] shadow-[0_4px_12px_rgba(238,37,54,0.3)] font-bold' 
                                                : 'bg-[#f5f5f5] text-[#495057] border-[#dee2e6] hover:bg-[#e9ecef] hover:border-[#adb5bd] hover:translate-x-[3px] hover:shadow-[0_2px_8px_rgba(0,0,0,0.1)]'
                                            }`}
                                    >
                                        {id}
                                    </button>
                                ))}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
      )}

      {/* Submit Button */}
      {action && (
        <button 
            id="btnEnviar"
            onClick={handleSubmit}
            disabled={loading}
            className={`w-full p-[14px] mt-[25px] bg-gradient-to-br from-[#ee2536] to-[#ff6f61] text-white font-bold text-[16px] border-none rounded-[12px] cursor-pointer transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed hover:scale-[1.03] hover:shadow-[0_5px_15px_rgba(238,37,54,0.4)]`}
        >
            {loading ? 'Processando...' : 'Enviar'}
        </button>
      )}

      {/* Feedback Messages */}
      {feedback.text && (
        <div className={`mt-[15px] p-[10px] rounded-[8px] text-[14px] font-bold animate-slideDown ${
            feedback.type === 'success' 
            ? 'bg-[#d4edda] border border-[#c3e6cb] text-[#155724]' 
            : 'bg-[#f8d7da] border border-[#f5c6cb] text-[#721c24]'
        }`}>
            {feedback.text}
        </div>
      )}

      {/* Overlay Component */}
      <LoadingOverlay isVisible={loading} message={loadingMessage} />

    </div>
  );
};

export default App;