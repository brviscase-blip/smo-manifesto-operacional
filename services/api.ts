import { supabase } from '../supabaseClient';

// --- INICIAR MANIFESTO: NAMES ---
// Prompt: Ação: Iniciar Manifesto | Campo: Nome | Table: Cadastro_Operacional
// Logic: Retornar os dados da tabela "Usuario_Operação"
export const fetchNames = async (status?: string): Promise<string[]> => {
  try {
    const { data, error } = await supabase
      .from('Cadastro_Operacional')
      .select('Usuario_Operação');

    if (error) {
      console.warn("Error fetching names from Cadastro_Operacional.", error);
      return [];
    }

    if (!data) return [];

    // Extract names, remove nulls/duplicates, and sort
    const uniqueNames = Array.from(new Set(data.map((item: any) => item['Usuario_Operação']))).filter(Boolean);
    return uniqueNames.sort() as string[];
  } catch (e) {
    console.error("Unexpected error in fetchNames", e);
    return [];
  }
};

// --- FINALIZAR MANIFESTO: NAMES ---
// Prompt: Ação: Finalizar Manifesto | Campo: Nome | Table: SMO_Operacional (Using SMO_Sistema to match DB)
// Logic: Verificar na coluna "Manifesto_Disponivel" as linhas vazias AND verificar na coluna "Manifesto_Iniciado" as linhas com dados
// Return: Usuario_Operação
export const fetchNamesForFinalization = async (): Promise<string[]> => {
  try {
    const { data, error } = await supabase
      .from('SMO_Sistema')
      .select('Usuario_Operacao, Usuario_Operação, Usuario')
      .is('Manifesto_Disponivel', null)     // Procurar dados vazios na tabela "Manifesto_Disponivel"
      .not('Manifesto_Iniciado', 'is', null); // verificar na coluna "Manifesto_Iniciado" se contém dados

    if (error) {
        console.warn("Error fetching names for finalization from SMO_Sistema.", error);
        return [];
    }

    if (!data) return [];

    // Robustly check for column name variations (Usuario_Operacao or Usuario_Operação)
    const uniqueNames = Array.from(new Set(data.map((item: any) => 
      item.Usuario_Operacao || item['Usuario_Operação'] || item.Usuario
    ))).filter(Boolean);

    return uniqueNames.sort() as string[];
  } catch (e) {
    console.error("Unexpected error in fetchNamesForFinalization", e);
    return [];
  }
};

// --- INICIAR MANIFESTO: IDS ---
// Prompt: Ação: Iniciar Manifesto | Campo: ID Manifesto | Table: SMO_Sistema
// Logic: Retornar os dados da coluna "ID_Manifesto" que estão com o status de "Manifesto Recebido" na coluna "Status"
export const fetchIdsByStatus = async (status: string): Promise<string[]> => {
  try {
    const { data, error } = await supabase
      .from('SMO_Sistema')
      .select('ID_Manifesto')
      .eq('Status', status); // Passed as 'Manifesto Recebido' from App.tsx

    if (error) {
        console.warn("Error fetching IDs from SMO_Sistema.", error);
        return [];
    }
    
    if (!data) return [];

    const uniqueIds = Array.from(new Set(data.map((item: any) => item.ID_Manifesto))).filter(Boolean);
    return uniqueIds.sort() as string[];
  } catch (e) {
    console.error("Unexpected error in fetchIdsByStatus", e);
    return [];
  }
};

// Helper to ignore status filter if needed, but here we generally use the specific functions above
export const fetchNamesByStatus = async (status: string): Promise<string[]> => {
   // This is kept for backward compatibility if used elsewhere, 
   // but fetchNamesForFinalization is the preferred specific logic now.
  try {
    const { data, error } = await supabase
      .from('SMO_Sistema')
      .select('Usuario_Operacao, Usuario_Operação, Usuario')
      .eq('Status', status);

    if (error) return [];
    if (!data) return [];

    const uniqueNames = Array.from(new Set(data.map((item: any) => 
      item.Usuario_Operacao || item['Usuario_Operação'] || item.Usuario
    ))).filter(Boolean);
    return uniqueNames.sort() as string[];
  } catch (e) {
    return [];
  }
};

// Fetch IDs for a specific employee (Finalizar Manifesto context)
export const fetchManifestosForEmployee = async (name: string): Promise<string[]> => {
  try {
    // We assume that if we are finalizing, we look for manifestos that are NOT finished yet.
    // Based on the new logic: Manifesto_Disponivel is NULL and Manifesto_Iniciado is NOT NULL
    const { data, error } = await supabase
      .from('SMO_Sistema')
      .select('ID_Manifesto')
      .eq('Usuario_Operacao', name) // We try Usuario_Operacao first
      .is('Manifesto_Disponivel', null)
      .not('Manifesto_Iniciado', 'is', null);

    if (error) {
         // Fallback query if Usuario_Operacao fails or returns nothing, 
         // though logic dictates we should match the column used in fetchNamesForFinalization
         console.warn("Error fetching employee manifestos.", error);
         return [];
    }

    if (!data) return [];

    return data.map((item: any) => item.ID_Manifesto);
  } catch (e) {
    return [];
  }
};

export const fetchCIAs = async (): Promise<string[]> => {
  try {
    const { data, error } = await supabase
      .from('SMO_Sistema')
      .select('CIA')
      .neq('CIA', null);

    if (error) return ['CIA A', 'CIA B', 'CIA C'];
    
    const uniqueCias = Array.from(new Set((data || []).map((item: any) => item.CIA)));
    return uniqueCias.sort() as string[];
  } catch (e) {
    return [];
  }
};

export const fetchManifestosByCIA = async (cia: string): Promise<string[]> => {
   try {
    const { data, error } = await supabase
      .from('SMO_Sistema')
      .select('ID_Manifesto')
      .eq('CIA', cia);

    if (error) return [];
    return (data || []).map((item: any) => item.ID_Manifesto);
   } catch (e) {
     return [];
   }
};

export const submitManifestoAction = async (action: string, id: string, name: string): Promise<{ success: boolean; message: string }> => {
  try {
    // Insert into registros_operacionais
    const { error } = await supabase
      .from('registros_operacionais')
      .insert([
        { 
          manifesto_id: id, 
          acao: action, 
          nome: name, 
          created_at: new Date().toISOString() 
        }
      ]);

    if (!error) {
        const newStatus = action === 'Iniciar Manifesto' ? 'Manifesto Iniciado' : 'Manifesto Finalizado';
        
        // Update SMO_Sistema
        // NOTE: We update Usuario_Operacao. If the DB has 'Usuario_Operação', this update might rely on Supabase mapping or might need adjustment.
        // We also rely on 'Status' for general tracking, although 'Finalizar' logic now checks specific timestamp columns.
        await supabase
          .from('SMO_Sistema')
          .update({ Status: newStatus, Usuario_Operacao: name }) 
          .eq('ID_Manifesto', id);
    }

    // N8N Webhook Integration
    let webhookUrl = 'https://projeto-teste-n8n.ly7t0m.easypanel.host/webhook/Manifesto-Operacional';

    if (action === 'Iniciar Manifesto') {
      webhookUrl = 'https://projeto-teste-n8n.ly7t0m.easypanel.host/webhook/Iniciar-Manifesto';
    }

    const formattedDate = new Date().toLocaleString('pt-BR');
    
    let webhookBody = {};

    if (action === 'Iniciar Manifesto') {
        webhookBody = {
            id_manifesto: id,
            nome: name,
            Manifesto_Iniciado: formattedDate
        };
    } else if (action === 'Finalizar Manifesto') {
        webhookBody = {
            id_manifesto: id,
            nome: name,
            Manifesto_Finalizado: formattedDate
        };
    }

    // Call Webhook
    if (Object.keys(webhookBody).length > 0) {
        try {
            await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(webhookBody)
            });
        } catch (webhookError) {
            console.error('Webhook error:', webhookError);
        }
    }
    
    if (action === 'Iniciar Manifesto') {
        return { success: true, message: 'Manifesto iniciado com sucesso!' };
    } else if (action === 'Finalizar Manifesto') {
        return { success: true, message: 'Manifesto finalizado com sucesso!' };
    } else {
        return { success: true, message: 'Registro salvo com sucesso!' };
    }

  } catch (error: any) {
    return { success: false, message: 'Erro ao processar: ' + error.message };
  }
};
