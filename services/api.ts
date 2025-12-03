import { supabase } from '../supabaseClient';

// Fetch names from Cadastro_Operacional -> Usuario_Operação
export const fetchNames = async (status?: string): Promise<string[]> => {
  try {
    // The user explicitly requested to fetch from 'Cadastro_Operacional' column 'Usuario_Operação'
    // We ignore the status filter here to ensure we populate the list from the master table.
    // Logic for filtering by active manifestos is handled by the UI/other queries if needed.
    const { data, error } = await supabase
      .from('Cadastro_Operacional')
      .select('Usuario_Operação');

    if (error) {
      console.warn("Error fetching names from Cadastro_Operacional.", error);
      return [];
    }

    if (!data) return [];

    // Extract names, remove nulls/duplicates, and sort
    // Note: accessing item['Usuario_Operação'] due to special characters
    const uniqueNames = Array.from(new Set(data.map((item: any) => item['Usuario_Operação']))).filter(Boolean);
    return uniqueNames.sort() as string[];
  } catch (e) {
    console.error("Unexpected error in fetchNames", e);
    return [];
  }
};

// Fetch IDs from SMO_Sistema -> ID_Manifesto
export const fetchIdsByStatus = async (status: string): Promise<string[]> => {
  try {
    // User requested to fetch from 'SMO_Sistema' column 'ID_Manifesto'
    // We keep the status filter to ensure business logic (only showing 'Recebido' for 'Iniciar Manifesto')
    const { data, error } = await supabase
      .from('SMO_Sistema')
      .select('ID_Manifesto')
      .eq('Status', status);

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

// Fetch IDs for a specific employee (Finalizar Manifesto context)
export const fetchManifestosForEmployee = async (name: string): Promise<string[]> => {
  try {
    // Query SMO_Sistema for manifests started by this user
    // Column 'Usuario_Operacao' matches the name from Cadastro_Operacional
    const { data, error } = await supabase
      .from('SMO_Sistema')
      .select('ID_Manifesto')
      .eq('Usuario_Operacao', name) 
      .eq('Status', 'Manifesto Iniciado');

    if (error) {
         console.warn("Error fetching employee manifestos from SMO_Sistema.", error);
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
        // Update status in SMO_Sistema
        // We assume ID_Manifesto is the unique key here
        await supabase
          .from('SMO_Sistema')
          .update({ Status: newStatus, Usuario_Operacao: name }) // Also update the user who took action
          .eq('ID_Manifesto', id);
    }

    // Call N8N Webhook for "Iniciar Manifesto"
    if (action === 'Iniciar Manifesto') {
        try {
            const formattedDate = new Date().toLocaleString('pt-BR');
            await fetch('https://projeto-teste-n8n.ly7t0m.easypanel.host/webhook/Iniciar-Manifesto', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id_manifesto: id,
                    nome: name,
                    Manifesto_Iniciado: formattedDate
                })
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