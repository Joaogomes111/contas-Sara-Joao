import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anonKey);

// Durante o build as variáveis podem não existir. Os valores de fallback
// mantêm o createClient válido; a tela de login checa supabaseConfigured
// antes de qualquer chamada real.
export const supabase = createClient(
  url ?? 'https://placeholder.supabase.co',
  anonKey ?? 'placeholder-anon-key',
  { auth: { persistSession: true, autoRefreshToken: true } },
);

export type EntryRow = {
  id: string;
  profile: 'joao' | 'sara';
  description: string;
  amount_cents: number;
  type: 'expense' | 'income';
  category: string;
  source: 'fixed' | 'card' | 'variable' | 'income';
  card_name: string | null;
  transaction_date: string;
  billing_month: string | null;
  recurring: boolean;
  paid: boolean;
};

export type AppEntry = {
  id: string;
  description: string;
  amountCents: number;
  type: 'expense' | 'income';
  category: string;
  source: 'fixed' | 'card' | 'variable' | 'income';
  cardName: string | null;
  transactionDate: string;
  billingMonth: string | null;
  profile: 'joao' | 'sara';
  recurring: boolean;
  paid: boolean;
};

export function rowToEntry(row: EntryRow): AppEntry {
  return {
    id: row.id,
    description: row.description,
    amountCents: Number(row.amount_cents),
    type: row.type,
    category: row.category,
    source: row.source,
    cardName: row.card_name,
    transactionDate: row.transaction_date,
    billingMonth: row.billing_month,
    profile: row.profile,
    recurring: row.recurring,
    paid: row.paid,
  };
}

export function entryToRow(entry: AppEntry): Omit<EntryRow, 'id'> & { id?: string } {
  return {
    id: entry.id,
    profile: entry.profile,
    description: entry.description,
    amount_cents: entry.amountCents,
    type: entry.type,
    category: entry.category,
    source: entry.source,
    card_name: entry.cardName,
    transaction_date: entry.transactionDate,
    billing_month: entry.billingMonth,
    recurring: entry.recurring,
    paid: entry.paid,
  };
}
