import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Fixam's Supabase project. The publishable key is meant to be public: every visitor's
// browser receives it, and the database rules decide what each person may do.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://lebhilkianueucxhjinm.supabase.co';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_bBku6IxWGKr4nmFKzcjXKw_ueazs_oG';

let client: SupabaseClient | null = null;

// One shared connection for the whole site, created in the browser only.
export function sb(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}

export async function rpc<T = any>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb().rpc(fn, args);
  if (error) throw error;
  return data as T;
}

// Calls a Supabase Edge Function and turns its error body into a readable message.
export async function invoke<T = any>(fn: string, body: unknown): Promise<T> {
  const { data, error } = await sb().functions.invoke(fn, { body });
  if (error) {
    let msg = error.message;
    try { msg = (await (error as any).context.json()).error || msg; } catch { /* keep message */ }
    throw new Error(msg);
  }
  return data as T;
}
