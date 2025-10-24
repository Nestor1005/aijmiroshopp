import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let cachedClient: SupabaseClient | null = null;

/**
 * Obtiene una instancia única del cliente de Supabase.
 * Lanza un error descriptivo si las variables de entorno aún no están configuradas.
 */
export const getSupabaseClient = (): SupabaseClient => {
  if (cachedClient) {
    return cachedClient;
  }

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Variables NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY no definidas. Configúralas antes de usar Supabase.",
    );
  }

  cachedClient = createClient(supabaseUrl, supabaseKey);
  return cachedClient;
};
