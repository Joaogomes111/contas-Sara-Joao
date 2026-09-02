'use client';

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, supabaseConfigured, rowToEntry, entryToRow, type EntryRow } from '@/lib/supabase';

type Entry = {
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

type ChartMode = 'weekly' | 'category';
type Filter = 'all' | 'card' | 'variable';
type ProfileKey = 'joao' | 'sara';
type EntrySeed = Omit<Entry, 'id' | 'profile' | 'billingMonth'> & { billingMonth?: string | null };

const SPENDING_TARGET_RATIO = 0.3;
const SARA_RESERVE_GOAL = 100000;

const PROFILES: Record<ProfileKey, { name: string; defaultMonth: string; cardName: string }> = {
  joao: { name: 'João', defaultMonth: '2026-09', cardName: 'Nubank João' },
  sara: { name: 'Sara', defaultMonth: '2026-09', cardName: 'Nubank Sara' },
};

const COLORS: Record<string, string> = {
  Moradia: '#24483b', Cartões: '#ff7254', Alimentação: '#f1bd52', Mercado: '#d2a83f', Restaurantes: '#e27c52',
  Transporte: '#6d9fa2', Compras: '#7f91c9', Saúde: '#bd7da0', Lazer: '#da9363', Educação: '#697db8', Assinaturas: '#9a8573', Pets: '#a87c55',
  Impostos: '#8a6d91', 'Cuidados pessoais': '#ce7f76', Outros: '#8b9691', Renda: '#8eaa58',
};

const CATEGORY_ICONS: Record<string, string> = {
  Alimentação: '🍱', Mercado: '🛒', Restaurantes: '🍽', Transporte: '⛽', Compras: '▣', Lazer: '✦',
  Saúde: '＋', Assinaturas: '◎', Impostos: '%', Outros: '•••',
};

const CARD_LIMITS: Record<string, { limit: number; due: number; closing: number; color: string }> = {
  'Nubank João': { limit: 735000, due: 8, closing: 30, color: '#820ad1' },
  'Nubank Sara': { limit: 830000, due: 12, closing: 5, color: '#6120a8' },
};

const MONTHS = [
  { value: '2026-09', label: 'Setembro 2026' },
  { value: '2026-08', label: 'Agosto 2026' },
  { value: '2026-07', label: 'Julho 2026' },
  { value: '2026-06', label: 'Junho 2026' },
  { value: '2026-05', label: 'Maio 2026' },
];

const brl = (cents: number, compact = false) => new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', maximumFractionDigits: compact ? 0 : 2,
}).format(cents / 100);

const sourceLabel: Record<Entry['source'], string> = {
  fixed: 'Fixo', card: 'Cartão', variable: 'Variável', income: 'Entrada',
};

const SAMPLE_ENTRIES: EntrySeed[] = [
  // Entradas
  { description: 'Renda mensal', amountCents: 660000, type: 'income', category: 'Renda', source: 'income', cardName: null, transactionDate: '2026-09-05', recurring: true, paid: true },

  // Contas fixas
  { description: 'Faculdade da Sara', amountCents: 25000, type: 'expense', category: 'Educação', source: 'fixed', cardName: null, transactionDate: '2026-09-10', recurring: true, paid: false },
  { description: 'Academia', amountCents: 10000, type: 'expense', category: 'Saúde', source: 'fixed', cardName: null, transactionDate: '2026-09-10', recurring: true, paid: false },
  { description: 'MEI (DAS)', amountCents: 8000, type: 'expense', category: 'Impostos', source: 'fixed', cardName: null, transactionDate: '2026-09-10', recurring: true, paid: false },
  { description: 'Limpeza das calçadas', amountCents: 10000, type: 'expense', category: 'Moradia', source: 'fixed', cardName: null, transactionDate: '2026-09-10', recurring: true, paid: false },
  { description: 'Frajola (custos)', amountCents: 11000, type: 'expense', category: 'Pets', source: 'fixed', cardName: null, transactionDate: '2026-09-10', recurring: true, paid: false },

  // Fatura Nubank — vencimento 08/09/2026
  { description: 'Supermercados de Angel', amountCents: 1497, type: 'expense', category: 'Mercado', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-26', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Posto Sofia', amountCents: 3400, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-25', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Google One', amountCents: 999, type: 'expense', category: 'Assinaturas', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-25', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Brasil Atacadista', amountCents: 911, type: 'expense', category: 'Mercado', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-23', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Mini Kalzone', amountCents: 1500, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-23', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Brasil Atacadista', amountCents: 930, type: 'expense', category: 'Mercado', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-23', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Facebook', amountCents: 104, type: 'expense', category: 'Outros', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-22', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Beto Carrero - Parcela 1/2', amountCents: 12595, type: 'expense', category: 'Lazer', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-21', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Google Prime Video', amountCents: 1990, type: 'expense', category: 'Assinaturas', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-21', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'iFood - Jean Carlos Manari', amountCents: 1339, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-21', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Gela Boca Bc', amountCents: 400, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-19', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Supermercados de Angel', amountCents: 609, type: 'expense', category: 'Mercado', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-18', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Brasil Atacadista', amountCents: 1814, type: 'expense', category: 'Mercado', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-17', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Matriz Padaria', amountCents: 5790, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-17', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Stringari Brava', amountCents: 1857, type: 'expense', category: 'Mercado', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-16', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'iFood - Jean Carlos Manari', amountCents: 2349, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-16', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'iFood - Jean Carlos Manari', amountCents: 1349, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-14', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Posto Sofia', amountCents: 3224, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-14', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Barbearia', amountCents: 6000, type: 'expense', category: 'Cuidados pessoais', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-13', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Supermercados Koch', amountCents: 2347, type: 'expense', category: 'Mercado', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-13', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'TikTok Shop', amountCents: 9525, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-11', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Panvel', amountCents: 1203, type: 'expense', category: 'Saúde', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-11', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Posto Camboriú', amountCents: 1193, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-10', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Posto Camboriú', amountCents: 1432, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-10', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Brasil Atacadista', amountCents: 3809, type: 'expense', category: 'Mercado', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-09', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'IOF de compra internacional', amountCents: 155, type: 'expense', category: 'Impostos', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-08', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'iFood - At Home Pizzaria L', amountCents: 7853, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-08', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Supercell Store', amountCents: 4442, type: 'expense', category: 'Lazer', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-08', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Posto Sofia', amountCents: 2925, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-05', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Fort Atacadista', amountCents: 4743, type: 'expense', category: 'Mercado', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-05', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'iFood - Garden Lanchonete', amountCents: 1249, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-04', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Burger King', amountCents: 890, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-04', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'iFood - Garden Lanchonete', amountCents: 1249, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-03', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'iFood - Garden Lanchonete', amountCents: 1199, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-03', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Distretto Bc', amountCents: 25200, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-03', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Pichau - Parcela 1/4', amountCents: 3368, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-03', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Mercado Livre', amountCents: 17266, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-02', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'iFood - Jean Carlos Manari', amountCents: 1999, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-02', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Stringari Brava', amountCents: 3913, type: 'expense', category: 'Mercado', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-02', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Burger King', amountCents: 790, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-01', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Magalu QCY - Parcela 3/5', amountCents: 5598, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank João', transactionDate: '2026-07-31', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Tiktok Shop - Parcela 2/3', amountCents: 4977, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank João', transactionDate: '2026-07-31', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Shopee *BTX Utilidades - Parcela 2/3', amountCents: 6815, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank João', transactionDate: '2026-07-31', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Vivo Easy anual - Parcela 8/12', amountCents: 3000, type: 'expense', category: 'Assinaturas', source: 'card', cardName: 'Nubank João', transactionDate: '2026-07-31', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'iFood - Jean Carlos Manari', amountCents: 1289, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank João', transactionDate: '2026-07-31', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Tiktok Shop - Parcela 2/3', amountCents: 4600, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank João', transactionDate: '2026-07-31', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Mercado Livre - Parcela 10/12', amountCents: 1094, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank João', transactionDate: '2026-07-31', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Mercado Pago - Parcela 2/2', amountCents: 2995, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank João', transactionDate: '2026-07-31', billingMonth: '2026-09', recurring: false, paid: false },

  // Complemento fatura Nubank - PDF atualizado em 02/09/2026
  { description: 'Gela Boca Bc', amountCents: 1024, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-27', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Supermercados Koch', amountCents: 999, type: 'expense', category: 'Mercado', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-27', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'iFood - Jean Carlos Manari', amountCents: 999, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-28', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Supermercados Imperatriz', amountCents: 499, type: 'expense', category: 'Mercado', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-29', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Stringari Brava', amountCents: 1376, type: 'expense', category: 'Mercado', source: 'card', cardName: 'Nubank João', transactionDate: '2026-08-30', billingMonth: '2026-09', recurring: false, paid: false },
];

const SARA_ENTRIES: EntrySeed[] = [
  // Entradas
  { description: 'Renda mensal', amountCents: 500000, type: 'income', category: 'Renda', source: 'income', cardName: null, transactionDate: '2026-09-05', recurring: true, paid: true },

  // Contas fixas
  { description: 'Aluguel', amountCents: 180000, type: 'expense', category: 'Moradia', source: 'fixed', cardName: null, transactionDate: '2026-09-10', recurring: true, paid: false },
  { description: 'Energia elétrica', amountCents: 10000, type: 'expense', category: 'Moradia', source: 'variable', cardName: null, transactionDate: '2026-09-10', recurring: true, paid: false },
  { description: 'MEI (DAS)', amountCents: 8000, type: 'expense', category: 'Impostos', source: 'fixed', cardName: null, transactionDate: '2026-09-10', recurring: true, paid: false },
  { description: 'Ajuda com a faculdade', amountCents: 5000, type: 'expense', category: 'Educação', source: 'fixed', cardName: null, transactionDate: '2026-09-10', recurring: true, paid: false },

  // Gasto pontual do mês
  { description: 'Castração do Frajola', amountCents: 20000, type: 'expense', category: 'Pets', source: 'variable', cardName: null, transactionDate: '2026-09-12', billingMonth: '2026-09', recurring: false, paid: false },

  // Fatura julho (paga)
  { description: 'Vonny Cosmeticos - Parcela 2/2', amountCents: 7395, type: 'expense', category: 'Cuidados pessoais', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-05', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Shopee - Skfashionsofic - Parcela 2/3', amountCents: 6542, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-05', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Studio Z (sapatos) - Parcela 3/3', amountCents: 6332, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-05', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'TikTok Shopop - Parcela 2/3', amountCents: 1649, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-05', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Shopee - Rlstoreecommer - Parcela 2/2', amountCents: 2970, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-05', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Hamsgrill', amountCents: 3900, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-08', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Giassi Supermercados', amountCents: 388, type: 'expense', category: 'Mercado', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-08', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Casius Ramos Leite', amountCents: 2000, type: 'expense', category: 'Outros', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-08', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Shopee - Lingerieexpres - Parcela 1/2', amountCents: 1666, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-08', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Mercado Pago - Tioneca', amountCents: 450, type: 'expense', category: 'Outros', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-09', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Shopee - Sambalovemall - Parcela 1/2', amountCents: 1537, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-09', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Toque A Mais Bijuteria', amountCents: 8994, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-09', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Liv Up', amountCents: 23663, type: 'expense', category: 'Alimentação', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-09', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Uber', amountCents: 715, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-09', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Uber', amountCents: 996, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-10', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Donna Salão de Beleza', amountCents: 8000, type: 'expense', category: 'Cuidados pessoais', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-10', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Uber', amountCents: 694, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-10', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Mercado Brasil', amountCents: 1200, type: 'expense', category: 'Mercado', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-11', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Uber', amountCents: 693, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-11', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Fort Atacadista', amountCents: 6935, type: 'expense', category: 'Mercado', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-11', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Rosane Fogassa', amountCents: 2400, type: 'expense', category: 'Outros', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-12', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Uber', amountCents: 696, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-12', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Americanas', amountCents: 2504, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-13', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Mercado Pago - estep - Parcela 1/2', amountCents: 9495, type: 'expense', category: 'Outros', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-13', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Uber', amountCents: 794, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-13', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Lojas Renner - Parcela 1/3', amountCents: 13990, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-14', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'The Best Acai', amountCents: 4278, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-15', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'S.R. Padilha Restaurante', amountCents: 3885, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-15', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'iFood Club', amountCents: 795, type: 'expense', category: 'Assinaturas', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-16', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Milium Loja', amountCents: 3980, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-16', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Uber', amountCents: 795, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-16', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Uber', amountCents: 695, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-17', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Mercado Pago - Vivian Schmid', amountCents: 1200, type: 'expense', category: 'Outros', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-17', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Outgo', amountCents: 13200, type: 'expense', category: 'Outros', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-17', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Mercado Brasil', amountCents: 299, type: 'expense', category: 'Mercado', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-18', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Supermercados Koch', amountCents: 5748, type: 'expense', category: 'Mercado', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-18', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Uber', amountCents: 694, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-18', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Uber', amountCents: 694, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-19', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Maroma Express Avenida', amountCents: 1698, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-20', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Uber', amountCents: 696, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-20', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Jim.com', amountCents: 1500, type: 'expense', category: 'Outros', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-21', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Jim.com', amountCents: 1500, type: 'expense', category: 'Outros', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-21', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Maroma Express Avenida', amountCents: 899, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-23', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Uber', amountCents: 795, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-23', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Supermercados Koch', amountCents: 8286, type: 'expense', category: 'Mercado', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-23', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Mercado Pago - Tioneca', amountCents: 1200, type: 'expense', category: 'Outros', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-23', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Uber', amountCents: 695, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-24', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Burger King', amountCents: 2000, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-25', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Uber', amountCents: 695, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-25', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Uber', amountCents: 694, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-26', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Uber', amountCents: 695, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-27', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Panvel', amountCents: 2796, type: 'expense', category: 'Saúde', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-27', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Mini Kalzone', amountCents: 2480, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-28', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Uber', amountCents: 694, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-06-30', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Uber', amountCents: 696, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-02', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Uber', amountCents: 693, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-03', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Burger King', amountCents: 2000, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-03', billingMonth: '2026-07', recurring: false, paid: true },
  { description: 'Uber', amountCents: 695, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-04', billingMonth: '2026-07', recurring: false, paid: true },

  // Fatura agosto (paga)
  { description: 'Shopee - Skfashionsofic - Parcela 3/3', amountCents: 6542, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-05', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Mercado Pago - estep - Parcela 2/2', amountCents: 9495, type: 'expense', category: 'Outros', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-05', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Lojas Renner - Parcela 2/3', amountCents: 13990, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-05', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'TikTok Shopop - Parcela 3/3', amountCents: 1649, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-05', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Shopee - Sambalovemall - Parcela 2/2', amountCents: 1536, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-05', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Shopee - Lingerieexpres - Parcela 2/2', amountCents: 1665, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-05', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Uber', amountCents: 794, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-07', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Mercado Brasil', amountCents: 1499, type: 'expense', category: 'Mercado', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-07', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'TikTok Shopop - Parcela 1/3', amountCents: 5885, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-07', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Liv Up', amountCents: 29980, type: 'expense', category: 'Alimentação', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-07', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Maris Restaurante', amountCents: 2857, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-08', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Uber', amountCents: 895, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-08', billingMonth: '2026-08', recurring: false, paid: true },
  { description: '440 Bebida Cafe', amountCents: 2629, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-09', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Panvel', amountCents: 6035, type: 'expense', category: 'Saúde', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-09', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Lojas Americanas', amountCents: 3297, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-09', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Uber', amountCents: 744, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-10', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Uber', amountCents: 695, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-11', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Brasil Atacadista', amountCents: 947, type: 'expense', category: 'Mercado', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-12', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Estorno TikTok Shopop', amountCents: -5885, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-12', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Burger King', amountCents: 2290, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-13', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Supermercados Koch', amountCents: 6690, type: 'expense', category: 'Mercado', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-14', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Uber', amountCents: 695, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-15', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Milium Loja', amountCents: 2480, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-16', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'KaBuM - Parcela 1/4', amountCents: 7941, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-16', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Uber', amountCents: 695, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-16', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Milium Loja', amountCents: 2790, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-17', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Uber', amountCents: 696, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-18', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'iFood - Pooh Comércio', amountCents: 1249, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-18', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Milium Loja', amountCents: 1750, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-19', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Brasil Atacadista', amountCents: 6140, type: 'expense', category: 'Mercado', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-19', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Stringari Brava', amountCents: 1675, type: 'expense', category: 'Mercado', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-19', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Havan', amountCents: 4098, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-20', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Angeloni', amountCents: 2993, type: 'expense', category: 'Mercado', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-20', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Shopee - Vianellioficia - Parcela 1/3', amountCents: 6371, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-21', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Shopee - Beceramicas - Parcela 1/3', amountCents: 3002, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-21', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Shopee - Engage Eletro - Parcela 1/10', amountCents: 29320, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-22', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Uber', amountCents: 684, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-22', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Supermercados Koch', amountCents: 5648, type: 'expense', category: 'Mercado', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-23', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Milium Loja', amountCents: 990, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-24', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Shopee - Belatextil - Parcela 1/4', amountCents: 1385, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-24', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Shopee - Heconfeccoes - Parcela 1/4', amountCents: 2584, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-24', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Vonny Cosmeticos - Parcela 1/3', amountCents: 5500, type: 'expense', category: 'Cuidados pessoais', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-28', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Lojas Americanas', amountCents: 1998, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-28', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Uber', amountCents: 957, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-29', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Uber', amountCents: 704, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-29', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Uber', amountCents: 713, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-30', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Supermercados Koch', amountCents: 2499, type: 'expense', category: 'Mercado', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-30', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Di Paroli Pizzaria', amountCents: 3080, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-31', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Uber', amountCents: 710, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-07-31', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Uber', amountCents: 754, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-01', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Brasil Atacadista', amountCents: 1629, type: 'expense', category: 'Mercado', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-03', billingMonth: '2026-08', recurring: false, paid: true },
  { description: 'Lojas Americanas', amountCents: 3746, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-04', billingMonth: '2026-08', recurring: false, paid: true },

  // Fatura setembro (em aberto, vence 12/09)
  { description: 'Uber', amountCents: 913, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-26', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Uber', amountCents: 842, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-26', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Boutique do Pão de Ló', amountCents: 4620, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-25', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Mini Kalzone', amountCents: 1590, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-23', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Uber', amountCents: 1067, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-23', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'TikTok Shop - Parcela 1/2', amountCents: 3167, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-23', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Uber', amountCents: 1123, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-23', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Studio Z (sapatos) - Parcela 1/3', amountCents: 5667, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-23', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Uber', amountCents: 826, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-22', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Supermercado Imperatriz', amountCents: 9434, type: 'expense', category: 'Mercado', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-22', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Uber', amountCents: 726, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-21', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Supermercado Imperatriz', amountCents: 1698, type: 'expense', category: 'Mercado', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-21', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Uber', amountCents: 742, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-20', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Gela Boca Bc', amountCents: 525, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-19', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Uber', amountCents: 785, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-19', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Supermercados de Angel', amountCents: 677, type: 'expense', category: 'Mercado', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-18', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Matriz Padaria', amountCents: 4990, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-17', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Brasil Atacadista', amountCents: 4854, type: 'expense', category: 'Mercado', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-17', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Stringari Brava', amountCents: 1824, type: 'expense', category: 'Mercado', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-16', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Isto Ki Tajaí', amountCents: 1500, type: 'expense', category: 'Outros', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-15', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Supermercados Koch', amountCents: 7444, type: 'expense', category: 'Mercado', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-13', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Uber', amountCents: 754, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-13', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Uber', amountCents: 696, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-12', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'iFood - Brasileirissê', amountCents: 988, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-12', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Maroma Express Avenida', amountCents: 1200, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-11', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Casa Mix (casa)', amountCents: 8145, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-09', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Brasil Atacadista', amountCents: 799, type: 'expense', category: 'Mercado', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-09', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Uber', amountCents: 744, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-08', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Maris Restaurante', amountCents: 2352, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-08', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'TikTok Shop - Parcela 1/2', amountCents: 2532, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-08', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Uber', amountCents: 763, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-07', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Brasil Atacadista', amountCents: 8244, type: 'expense', category: 'Mercado', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-07', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Liv Up', amountCents: 32582, type: 'expense', category: 'Alimentação', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-07', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Shopee - Ma Global', amountCents: 2874, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-07', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Uber', amountCents: 726, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-06', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Panvel', amountCents: 2796, type: 'expense', category: 'Saúde', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-06', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Vonny Cosmeticos - Parcela 2/3', amountCents: 5500, type: 'expense', category: 'Cuidados pessoais', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-05', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Shopee - Vianellioficia - Parcela 2/3', amountCents: 6370, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-05', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Shopee - Beceramicas - Parcela 2/3', amountCents: 3001, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-05', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Shopee - Engage Eletro - Parcela 2/10', amountCents: 29315, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-05', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'KaBuM - Parcela 2/4', amountCents: 7941, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-05', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Lojas Renner - Parcela 3/3', amountCents: 13990, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-05', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Shopee - Belatextil - Parcela 2/4', amountCents: 1384, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-05', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Uber', amountCents: 727, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-05', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Shopee - Heconfeccoes - Parcela 2/4', amountCents: 2584, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-05', billingMonth: '2026-09', recurring: false, paid: false },

  // Complemento fatura setembro - CSVs atualizados em 02/09/2026
  { description: 'Burger King', amountCents: 890, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-04', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Casas Bahia - Parcela 2/3', amountCents: 5570, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-04', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Uber', amountCents: 752, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-04', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Brisa Restaurante', amountCents: 2857, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-05', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Milium Loja', amountCents: 6470, type: 'expense', category: 'Compras', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-05', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Uber', amountCents: 564, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-11', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Uber', amountCents: 784, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-14', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Uber', amountCents: 705, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-15', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Uber', amountCents: 800, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-18', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Apple', amountCents: 3243, type: 'expense', category: 'Assinaturas', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-22', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Uber', amountCents: 1240, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-23', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Uber', amountCents: 855, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-23', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Uber', amountCents: 564, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-25', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Uber', amountCents: 728, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-27', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Supermercados Koch', amountCents: 1587, type: 'expense', category: 'Mercado', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-27', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Uber', amountCents: 822, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-28', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Uber', amountCents: 866, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-28', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Cremelie', amountCents: 1600, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-29', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Uber', amountCents: 807, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-29', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Uber', amountCents: 762, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-29', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Brasil Atacadista', amountCents: 4298, type: 'expense', category: 'Mercado', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-30', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Matriz Padaria', amountCents: 2705, type: 'expense', category: 'Restaurantes', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-31', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Uber', amountCents: 1471, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-08-31', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Uber', amountCents: 842, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-09-01', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Uber', amountCents: 892, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-09-02', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Uber', amountCents: 1327, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-09-02', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Uber', amountCents: 1512, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-09-02', billingMonth: '2026-09', recurring: false, paid: false },
  { description: 'Uber', amountCents: 846, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Nubank Sara', transactionDate: '2026-09-02', billingMonth: '2026-09', recurring: false, paid: false },
];

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createEntry(entry: EntrySeed, profile: ProfileKey): Entry {
  return {
    ...entry,
    id: makeId(),
    profile,
    billingMonth: entry.billingMonth ?? entry.transactionDate.slice(0, 7),
  };
}

function seedEntries(profile: ProfileKey) {
  const seed = profile === 'joao' ? SAMPLE_ENTRIES : SARA_ENTRIES;
  return seed.map((entry) => createEntry(entry, profile));
}

function entryIdentity(entry: Entry) {
  const billingMonth = entry.billingMonth ?? entry.transactionDate.slice(0, 7);
  return [entry.profile, billingMonth, entry.transactionDate, entry.amountCents, entry.source].join('|');
}

function findMissingSeedEntries(profile: ProfileKey, existing: Entry[]) {
  const seen = new Set(existing.map(entryIdentity));
  return seedEntries(profile).filter((entry) => !seen.has(entryIdentity(entry)));
}

async function fetchEntries(profile: ProfileKey): Promise<Entry[]> {
  const { data, error } = await supabase
    .from('entries')
    .select('*')
    .eq('profile', profile)
    .order('transaction_date', { ascending: false });
  if (error) throw error;
  return (data as EntryRow[]).map(rowToEntry);
}

// Mantém o banco sincronizado com os lançamentos iniciais sem duplicar itens já salvos.
async function fetchOrSeedEntries(profile: ProfileKey): Promise<Entry[]> {
  const existing = await fetchEntries(profile);
  const missingSeeds = findMissingSeedEntries(profile, existing);
  if (!missingSeeds.length) return existing;
  const { error } = await supabase.from('entries').insert(missingSeeds.map(entryToRow));
  if (error) throw error;
  return fetchEntries(profile);
}

function entryDay(entry: Entry, month: string) {
  const originalDay = Number(entry.transactionDate.slice(8, 10)) || 1;
  const lastDay = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  return Math.min(originalDay, lastDay);
}

export default function Home() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [activeProfile, setActiveProfile] = useState<ProfileKey>('joao');
  const [selectedMonth, setSelectedMonth] = useState(PROFILES.joao.defaultMonth);
  const [chartMode, setChartMode] = useState<ChartMode>('weekly');
  const [filter, setFilter] = useState<Filter>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  const profileSettings = PROFILES[activeProfile];

  const loadEntries = useCallback(async (profile: ProfileKey) => {
    setLoading(true);
    try {
      setEntries(await fetchOrSeedEntries(profile));
    } catch {
      setToast('Não foi possível carregar seus dados agora.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('perfil');
    if (requested !== 'sara') return undefined;
    const timeout = window.setTimeout(() => {
      setActiveProfile('sara');
      setSelectedMonth(PROFILES.sara.defaultMonth);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);
  useEffect(() => {
    if (!supabaseConfigured) {
      const ready = window.setTimeout(() => setAuthReady(true), 0);
      return () => window.clearTimeout(ready);
    }
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!session) { setEntries([]); setLoading(false); return; }
      void loadEntries(activeProfile);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [activeProfile, loadEntries, session]);
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(''), 3000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const monthEntries = useMemo(() => entries.filter((entry) =>
    entry.recurring || (entry.billingMonth || entry.transactionDate.slice(0, 7)) === selectedMonth), [entries, selectedMonth]);

  const income = monthEntries.filter((entry) => entry.type === 'income').reduce((sum, entry) => sum + entry.amountCents, 0);
  const expenses = monthEntries.filter((entry) => entry.type === 'expense').reduce((sum, entry) => sum + entry.amountCents, 0);
  const paidExpenses = monthEntries.filter((entry) => entry.type === 'expense' && entry.paid).reduce((sum, entry) => sum + entry.amountCents, 0);
  const upcoming = monthEntries.filter((entry) => entry.type === 'expense' && !entry.paid);
  const upcomingTotal = upcoming.reduce((sum, entry) => sum + entry.amountCents, 0);
  const balance = income - expenses;
  const spentRatio = income > 0 ? Math.round((expenses / income) * 100) : 0;
  const fixedEntries = useMemo(() => monthEntries
    .filter((entry) => entry.type === 'expense' && entry.source === 'fixed')
    .sort((a, b) => entryDay(a, selectedMonth) - entryDay(b, selectedMonth)), [monthEntries, selectedMonth]);
  const fixedTotal = fixedEntries.reduce((sum, entry) => sum + entry.amountCents, 0);
  const installmentTotal = monthEntries
    .filter((entry) => entry.type === 'expense' && entry.description.toLowerCase().includes('parcela'))
    .reduce((sum, entry) => sum + entry.amountCents, 0);
  const budgetLimit = activeProfile === 'sara' ? Math.max(0, income - SARA_RESERVE_GOAL) : Math.round(income * SPENDING_TARGET_RATIO);
  const budgetOver = Math.max(0, expenses - budgetLimit);
  const budgetUsage = budgetLimit > 0 ? Math.round((expenses / budgetLimit) * 100) : 0;
  const committedExpenses = fixedTotal + installmentTotal;
  const flexibleAllowance = Math.max(0, budgetLimit - committedExpenses);

  const discretionaryCuts = useMemo(() => {
    const atSightExpenses = monthEntries.filter((entry) =>
      entry.type === 'expense' && !entry.description.toLowerCase().includes('parcela'));
    const sumCategory = (category: string) => atSightExpenses
      .filter((entry) => entry.category === category)
      .reduce((sum, entry) => sum + entry.amountCents, 0);
    const diningTotal = sumCategory('Restaurantes');
    const onlineTotal = sumCategory('Compras online');
    return {
      diningTotal,
      diningCut: Math.round(diningTotal / 2),
      onlineCut: onlineTotal,
      total: Math.round(diningTotal / 2) + onlineTotal,
    };
  }, [monthEntries]);
  const expensiveThreshold = Math.max(10000, Math.round(budgetLimit * 0.05));

  const categoryTotals = useMemo(() => {
    const totals = new Map<string, number>();
    monthEntries.filter((entry) => entry.type === 'expense').forEach((entry) => {
      totals.set(entry.category, (totals.get(entry.category) ?? 0) + entry.amountCents);
    });
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [monthEntries]);

  const cardCategoryTotals = useMemo(() => {
    const totals = new Map<string, number>();
    monthEntries.filter((entry) => entry.type === 'expense' && entry.source === 'card').forEach((entry) => {
      totals.set(entry.category, (totals.get(entry.category) ?? 0) + entry.amountCents);
    });
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [monthEntries]);
  const cardExpenseTotal = cardCategoryTotals.reduce((sum, [, value]) => sum + value, 0);

  const chartData = useMemo(() => {
    if (chartMode === 'category') {
      return categoryTotals.slice(0, 5).map(([label, value]) => ({ label, value, color: COLORS[label] ?? COLORS.Outros }));
    }
    const weeks = [0, 0, 0, 0, 0];
    monthEntries.filter((entry) => entry.type === 'expense').forEach((entry) => {
      const index = Math.min(4, Math.floor((entryDay(entry, selectedMonth) - 1) / 7));
      weeks[index] += entry.amountCents;
    });
    return weeks.map((value, index) => ({ label: index === 4 ? '29–31' : `${String(index * 7 + 1).padStart(2, '0')}–${String((index + 1) * 7).padStart(2, '0')}`, value, color: index === 3 ? '#ff7254' : '#cfd9d4' }));
  }, [categoryTotals, chartMode, monthEntries, selectedMonth]);

  const maxChart = Math.max(...chartData.map((item) => item.value), 1);

  const visibleTransactions = useMemo(() => monthEntries
    .filter((entry) => entry.type === 'expense' && entry.source !== 'fixed')
    .filter((entry) => filter === 'all' || entry.source === filter)
    .filter((entry) => categoryFilter === 'all' || entry.category === categoryFilter)
    .filter((entry) => entry.description.toLowerCase().includes(query.toLowerCase()) || entry.category.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => entryDay(b, selectedMonth) - entryDay(a, selectedMonth)), [categoryFilter, filter, monthEntries, query, selectedMonth]);

  const cardTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    monthEntries.filter((entry) => entry.type === 'expense' && entry.source === 'card').forEach((entry) => {
      const name = entry.cardName || 'Outro cartão';
      totals[name] = (totals[name] ?? 0) + entry.amountCents;
    });
    return totals;
  }, [monthEntries]);

  const openNew = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (entry: Entry) => { setEditing(entry); setModalOpen(true); };
  const switchProfile = (profile: ProfileKey) => {
    setActiveProfile(profile);
    setSelectedMonth(PROFILES[profile].defaultMonth);
    setCategoryFilter('all');
    setFilter('all');
    setQuery('');
    window.history.replaceState({}, '', profile === 'sara' ? '?perfil=sara' : window.location.pathname);
  };

  const saveEntry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const rawAmount = String(form.get('amount') || '').replace(/\./g, '').replace(',', '.');
    const amountCents = Math.round(Number(rawAmount) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      setToast('Informe um valor válido.');
      return;
    }
    const typeValue = String(form.get('type')) as Entry['type'];
    const sourceValue = (typeValue === 'income' ? 'income' : String(form.get('source'))) as Entry['source'];
    const payload: Entry = {
      id: editing?.id ?? makeId(),
      description: String(form.get('description') || '').trim(),
      amountCents,
      type: typeValue,
      category: String(form.get('category')),
      source: sourceValue,
      cardName: sourceValue === 'card' ? String(form.get('cardName')) : null,
      transactionDate: String(form.get('transactionDate')),
      billingMonth: selectedMonth,
      profile: activeProfile,
      recurring: form.get('recurring') === 'on',
      paid: form.get('paid') === 'on',
    };
    const appliesToSelectedMonth = payload.recurring || payload.billingMonth === selectedMonth;
    const previousExpense = editing?.type === 'expense' && (editing.recurring || (editing.billingMonth || editing.transactionDate.slice(0, 7)) === selectedMonth) ? editing.amountCents : 0;
    const previousIncome = editing?.type === 'income' && (editing.recurring || (editing.billingMonth || editing.transactionDate.slice(0, 7)) === selectedMonth) ? editing.amountCents : 0;
    const projectedExpenses = expenses - previousExpense + (payload.type === 'expense' && appliesToSelectedMonth ? payload.amountCents : 0);
    const projectedIncome = income - previousIncome + (payload.type === 'income' && appliesToSelectedMonth ? payload.amountCents : 0);
    const projectedLimit = activeProfile === 'sara' ? Math.max(0, projectedIncome - SARA_RESERVE_GOAL) : Math.round(projectedIncome * SPENDING_TARGET_RATIO);
    const makesBudgetWorse = payload.type === 'expense' && appliesToSelectedMonth && projectedExpenses > projectedLimit && projectedExpenses > expenses;
    if (makesBudgetWorse && !window.confirm(`Freio de gastos: este lançamento leva o mês a ${brl(projectedExpenses)}, ultrapassando a meta de ${profileSettings.name} em ${brl(Math.max(0, projectedExpenses - projectedLimit))}. Deseja registrar mesmo assim?`)) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('entries').upsert(entryToRow(payload));
      if (error) throw error;
      setEntries(editing
        ? entries.map((entry) => entry.id === editing.id ? payload : entry)
        : [payload, ...entries]);
      setModalOpen(false);
      setToast(editing ? 'Lançamento atualizado.' : 'Lançamento adicionado.');
    } catch {
      setToast('Não foi possível salvar. Tente novamente.');
    } finally { setSaving(false); }
  };

  const togglePaid = async (entry: Entry) => {
    try {
      const { error } = await supabase.from('entries').update({ paid: !entry.paid }).eq('id', entry.id);
      if (error) throw error;
      setEntries(entries.map((item) => item.id === entry.id ? { ...item, paid: !item.paid } : item));
      setToast(entry.paid ? 'Marcado como pendente.' : 'Pagamento confirmado.');
    } catch {
      setToast('Não foi possível atualizar agora.');
    }
  };

  const deleteEntry = async () => {
    if (!editing || !window.confirm(`Excluir “${editing.description}”?`)) return;
    try {
      const { error } = await supabase.from('entries').delete().eq('id', editing.id);
      if (error) throw error;
      setEntries(entries.filter((item) => item.id !== editing.id));
      setModalOpen(false);
      setToast('Lançamento excluído.');
    } catch {
      setToast('Não foi possível excluir agora.');
    }
  };

  const exportData = () => {
    const file = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), profile: activeProfile, entries }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url; link.download = `clara-${activeProfile}-${selectedMonth}.json`; link.click();
    URL.revokeObjectURL(url);
    setToast('Cópia dos dados exportada.');
  };

  const importData = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as { entries?: Entry[] } | Entry[];
      const imported = Array.isArray(parsed) ? parsed : parsed.entries;
      if (!Array.isArray(imported)) throw new Error();
      const entriesForProfile = imported.map((entry) => ({
        ...entry,
        id: makeId(),
        profile: activeProfile,
        billingMonth: entry.billingMonth || entry.transactionDate.slice(0, 7),
      }));
      const { error } = await supabase.from('entries').insert(entriesForProfile.map(entryToRow));
      if (error) throw error;
      await loadEntries(activeProfile);
      setToast(`${entriesForProfile.length} lançamentos adicionados para ${profileSettings.name}.`);
    } catch { setToast('Arquivo inválido. Use uma cópia exportada pela Clara.'); }
    event.target.value = '';
  };

  if (!supabaseConfigured) {
    return (
      <main className="app-shell auth-shell">
        <div className="auth-card">
          <span className="brand-mark">C</span>
          <h1>Falta configurar o banco</h1>
          <p>Defina <code>NEXT_PUBLIC_SUPABASE_URL</code> e <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> nas variáveis de ambiente e faça um novo deploy.</p>
        </div>
      </main>
    );
  }

  if (!authReady) {
    return <main className="app-shell auth-shell"><div className="auth-card"><p>Carregando…</p></div></main>;
  }

  if (!session) return <SignIn />;

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#inicio" aria-label="Clara — início"><span className="brand-mark">C</span><span>clara</span></a>
        <nav className="main-nav" aria-label="Navegação principal">
          <a className="active" href="#inicio">Visão geral</a><a href="#freio">Freio</a><a href="#gastos">Gastos</a><a href="#cartoes">Cartões</a>
        </nav>
        <div className="topbar-actions"><div className="profile-switch" aria-label="Escolher painel"><button className={activeProfile === 'sara' ? 'active' : ''} onClick={() => switchProfile('sara')} type="button">Sara</button><span>·</span><button className={activeProfile === 'joao' ? 'active' : ''} onClick={() => switchProfile('joao')} type="button">João</button></div><button className="primary-button" type="button" onClick={openNew}><span aria-hidden="true">＋</span> Adicionar gasto</button><button className="signout-button" type="button" onClick={() => void supabase.auth.signOut()} title="Sair">Sair</button></div>
      </header>

      <section className="page-heading" id="inicio">
        <div><p className="eyebrow">FINANÇAS DE {profileSettings.name.toUpperCase()}</p><h1>Seu dinheiro, <em>sem mistério.</em></h1><p className="intro">Entradas, contas fixas e cartões de {profileSettings.name} em um só lugar — com os cálculos feitos automaticamente.</p></div>
        <label className="month-select"><span className="sr-only">Selecionar mês</span><select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>{MONTHS.map((month) => <option value={month.value} key={month.value}>{month.label}</option>)}</select><span aria-hidden="true">⌄</span></label>
      </section>

      <section className="summary-grid" aria-label="Resumo financeiro">
        <article className="balance-card">
          <div><p>Saldo projetado</p><strong>{brl(balance)}</strong></div>
          <span className={`trend ${balance >= 0 ? 'positive' : 'negative'}`}>{balance >= 0 ? '↗' : '↘'} {income ? Math.abs(Math.round((balance / income) * 100)) : 0}%</span>
          <div className="balance-breakdown"><span><i className="dot income" /> Entradas <b>{brl(income, true)}</b></span><span><i className="dot expense" /> Saídas <b>{brl(expenses, true)}</b></span></div>
        </article>
        <article className="metric-card"><span className="metric-icon warm">↘</span><p>Gasto no mês</p><strong>{brl(expenses)}</strong><small>{spentRatio}% da sua renda · {brl(paidExpenses)} já pagos</small></article>
        <article className="metric-card"><span className="metric-icon sun">◒</span><p>Contas pendentes</p><strong>{brl(upcomingTotal)}</strong><small>{upcoming.length} {upcoming.length === 1 ? 'lançamento' : 'lançamentos'} para pagar</small></article>
      </section>

      <section className={`budget-guard ${budgetOver > 0 ? 'over-budget' : 'within-budget'}`} id="freio" aria-labelledby="budget-title">
        <div className="guard-overview">
          <div>
            <p className="eyebrow">{activeProfile === 'sara' ? 'META: SOBRAR PELO MENOS R$ 1.000' : 'META: GASTAR NO MÁXIMO 30% DA RENDA'}</p>
            <h2 id="budget-title">{budgetOver > 0 ? (activeProfile === 'sara' ? `Faltam ${brl(budgetOver)} para a meta.` : 'Hora de pisar no freio.') : (activeProfile === 'sara' ? 'A reserva de R$ 1.000 está garantida.' : 'Você está dentro da meta.')}</h2>
            <p>Seu teto mensal é <b>{brl(budgetLimit)}</b>. Você já gastou <b>{brl(expenses)}</b>{budgetOver > 0 ? ` e precisa reduzir ${brl(budgetOver)}.` : ` e ainda tem ${brl(Math.max(0, budgetLimit - expenses))} disponíveis.`}</p>
          </div>
          <div className="guard-score"><strong>{budgetUsage}%</strong><span>do limite usado</span></div>
        </div>
        <div className="guard-progress" aria-label={`${budgetUsage}% do limite de gastos utilizado`}><i style={{ width: `${Math.min(100, budgetUsage)}%` }} /></div>
        <div className="budget-numbers">
          <div><span>Teto de gastos</span><strong>{brl(budgetLimit)}</strong></div>
          <div><span>Fixos + parcelas</span><strong>{brl(committedExpenses)}</strong></div>
          <div><span>Espaço para variáveis</span><strong>{brl(flexibleAllowance)}</strong></div>
          <div className={budgetOver > 0 ? 'danger-number' : ''}><span>{budgetOver > 0 ? 'Precisa cortar' : 'Ainda disponível'}</span><strong>{brl(budgetOver || Math.max(0, budgetLimit - expenses))}</strong></div>
        </div>
        {budgetOver > 0 ? <div className="cut-plan">
          <div className="cut-copy"><span className="brake-icon" aria-hidden="true">!</span><div><h3>Plano de corte deste mês</h3><p>Primeiro nos gastos ajustáveis, sem mexer nos compromissos fixos essenciais.</p></div></div>
          <div className="cut-actions">
            <div><span>Restaurantes e delivery</span><small>reduzir pela metade de {brl(discretionaryCuts.diningTotal)}</small><strong>− {brl(discretionaryCuts.diningCut)}</strong></div>
            <div><span>Compras online e anúncio</span><small>pausar novas compras neste mês</small><strong>− {brl(discretionaryCuts.onlineCut)}</strong></div>
          </div>
          <div className="cut-result"><span>Economia possível <b>{brl(discretionaryCuts.total)}</b></span><span>{discretionaryCuts.total >= budgetOver ? `Meta alcançada com ${brl(discretionaryCuts.total - budgetOver)} de folga` : `Ainda faltariam ${brl(budgetOver - discretionaryCuts.total)}`}</span></div>
          <p className="brake-note"><b>Freio ativo:</b> novas despesas que piorarem a meta mostram uma confirmação antes de serem salvas. Evite novas parcelas até abrir espaço no orçamento.</p>
        </div> : <p className="brake-note safe-note"><b>Freio ativo:</b> você será avisado antes de registrar uma despesa que ultrapasse o teto.</p>}
      </section>

      <section className="dashboard-grid" id="gastos">
        <article className="panel chart-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">RITMO DO MÊS</p><h2>{chartMode === 'weekly' ? 'Gastos por semana' : 'Gastos por categoria'}</h2></div>
            <div className="segmented"><button className={chartMode === 'weekly' ? 'active' : ''} onClick={() => setChartMode('weekly')} type="button">Semanas</button><button className={chartMode === 'category' ? 'active' : ''} onClick={() => setChartMode('category')} type="button">Categorias</button></div>
          </div>
          <div className="chart" aria-label={chartMode === 'weekly' ? 'Gráfico de gastos semanais' : 'Gráfico de gastos por categoria'}>
            <div className="chart-lines" aria-hidden="true"><i /><i /><i /></div>
            {chartData.map((item) => <div className="bar-column" key={item.label}><button className="bar" style={{ height: `${Math.max(8, (item.value / maxChart) * 88)}%`, background: item.color }} type="button" aria-label={`${item.label}: ${brl(item.value)}`}><span>{brl(item.value)}</span></button><small>{item.label}</small></div>)}
          </div>
        </article>

        <article className="panel category-panel">
          <div className="panel-heading"><div><p className="eyebrow">PARA ONDE FOI</p><h2>Por categoria</h2></div><span className="total-note">Total <b>{brl(expenses, true)}</b></span></div>
          <div className="category-list">
            {categoryTotals.slice(0, 5).map(([category, value]) => <div className="category-row" key={category}><div className="category-meta"><span><i style={{ background: COLORS[category] ?? COLORS.Outros }} />{category}</span><b>{brl(value)}</b></div><div className="progress"><i style={{ width: `${expenses ? Math.round((value / expenses) * 100) : 0}%`, background: COLORS[category] ?? COLORS.Outros }} /></div></div>)}
            {!categoryTotals.length && <p className="empty-copy">Adicione um gasto para ver a distribuição.</p>}
          </div>
        </article>
      </section>

      <section className="fixed-section" id="fixos">
        <div className="section-heading fixed-heading"><div><p className="eyebrow">COMPROMISSOS DO MÊS</p><h2>Gastos fixos</h2></div><div className="fixed-summary"><span>Total mensal <b>{brl(fixedTotal)}</b></span><button type="button" onClick={openNew}>＋ Novo fixo</button></div></div>
        <div className="fixed-grid">
          {fixedEntries.map((entry) => <button className="fixed-item" key={entry.id} onClick={() => openEdit(entry)} type="button">
            <span className="fixed-icon" style={{ background: `${COLORS[entry.category] ?? COLORS.Outros}18`, color: COLORS[entry.category] ?? COLORS.Outros }}>{entry.category === 'Assinaturas' ? '◎' : entry.category === 'Pets' ? '♡' : '⌂'}</span>
            <span className="fixed-copy"><b>{entry.description}</b><small>{entry.category} · todo dia {String(entryDay(entry, selectedMonth)).padStart(2, '0')}</small></span>
            <strong>{brl(entry.amountCents)}</strong><span className="edit-tag">Editar</span>
          </button>)}
        </div>
      </section>

      <section className="card-categories" id="categorias-cartao">
        <div className="section-heading card-category-heading"><div><p className="eyebrow">FATURA ORGANIZADA</p><h2>Cartão por categoria</h2></div><p>Clique em uma categoria para ver somente aquelas compras.</p></div>
        <div className="card-category-total"><span>Total do cartão no mês</span><strong>{brl(cardExpenseTotal)}</strong></div>
        <div className="card-category-grid">
          {cardCategoryTotals.map(([category, value]) => {
            const ratio = cardExpenseTotal ? Math.round((value / cardExpenseTotal) * 100) : 0;
            return <button className={`card-category-item ${categoryFilter === category ? 'active' : ''}`} key={category} type="button" onClick={() => { setFilter('card'); setCategoryFilter((current) => current === category ? 'all' : category); }}>
              <span className="card-category-icon" style={{ color: COLORS[category] ?? COLORS.Outros, background: `${COLORS[category] ?? COLORS.Outros}18` }}>{CATEGORY_ICONS[category] ?? CATEGORY_ICONS.Outros}</span>
              <span className="card-category-copy"><b>{category}</b><small>{ratio}% da fatura</small><i><em style={{ width: `${ratio}%`, background: COLORS[category] ?? COLORS.Outros }} /></i></span>
              <strong>{brl(value)}</strong>
            </button>;
          })}
        </div>
      </section>

      <section className="panel transactions-panel">
        <div className="transactions-head"><div><p className="eyebrow">DETALHE DO MÊS</p><h2>Cartão e outros gastos</h2></div><div className="data-actions"><button onClick={() => importRef.current?.click()} type="button">Importar</button><button onClick={exportData} type="button">Exportar</button><input ref={importRef} onChange={importData} type="file" accept="application/json" hidden /></div></div>
        <div className="toolbar"><label className="search-box"><span aria-hidden="true">⌕</span><span className="sr-only">Buscar lançamentos</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar lançamento" /></label><div className="filter-tabs">{([['all', 'Todos'], ['card', 'Cartões'], ['variable', 'Variáveis']] as [Filter, string][]).map(([value, label]) => <button className={filter === value ? 'active' : ''} onClick={() => setFilter(value)} key={value} type="button">{label}</button>)}{categoryFilter !== 'all' && <button className="category-filter-active" onClick={() => setCategoryFilter('all')} type="button">{categoryFilter} ×</button>}</div></div>
        <div className="transaction-list">
          {loading ? <p className="empty-copy">Carregando seus lançamentos…</p> : visibleTransactions.map((entry) => <article className={`transaction-row ${entry.amountCents >= expensiveThreshold ? 'high-cost' : ''}`} key={entry.id}>
            <button className={`status-check ${entry.paid ? 'checked' : ''}`} onClick={() => void togglePaid(entry)} type="button" aria-label={entry.paid ? `Marcar ${entry.description} como pendente` : `Marcar ${entry.description} como pago`}>{entry.paid ? '✓' : ''}</button>
            <button className="transaction-main" onClick={() => openEdit(entry)} type="button"><span className="transaction-icon" style={{ background: `${COLORS[entry.category] ?? COLORS.Outros}18`, color: COLORS[entry.category] ?? COLORS.Outros }}>{CATEGORY_ICONS[entry.category] ?? (entry.source === 'card' ? '▭' : '•')}</span><span><b>{entry.description}</b><small><mark className="category-chip" style={{ color: COLORS[entry.category] ?? COLORS.Outros, background: `${COLORS[entry.category] ?? COLORS.Outros}16` }}>{entry.category}</mark> {sourceLabel[entry.source]}{entry.cardName ? ` · ${entry.cardName}` : ''}</small>{entry.amountCents >= expensiveThreshold && <em className="cost-badge">Alto impacto</em>}</span></button>
            <time dateTime={entry.transactionDate}>dia {String(entryDay(entry, selectedMonth)).padStart(2, '0')}</time><strong>{brl(entry.amountCents)}</strong><button className="row-menu" onClick={() => openEdit(entry)} type="button" aria-label={`Editar ${entry.description}`}>•••</button>
          </article>)}
          {!loading && !visibleTransactions.length && <p className="empty-copy">Nenhum lançamento encontrado nesse filtro.</p>}
        </div>
      </section>

      <section className="cards-section" id="cartoes">
        <div className="section-heading"><div><p className="eyebrow">CRÉDITO SOB CONTROLE</p><h2>Seus cartões</h2></div><p>As compras no cartão já entram automaticamente no total do mês.</p></div>
        <div className="credit-grid">
          {Object.entries(CARD_LIMITS).filter(([name]) => name === profileSettings.cardName).map(([name, info]) => {
            const used = cardTotals[name] ?? 0; const ratio = info.limit > 0 ? Math.min(100, Math.round((used / info.limit) * 100)) : 0;
            return <article className="credit-card" key={name} style={{ '--card-color': info.color } as React.CSSProperties}><div className="credit-top"><span className="chip" /><b>{name}</b></div><p>Fatura de {MONTHS.find((month) => month.value === selectedMonth)?.label.toLowerCase()}</p><strong>{brl(used)}</strong><div className="limit-bar"><i style={{ width: info.limit > 0 ? `${ratio}%` : '100%' }} /></div><div className="credit-foot"><span>{info.limit > 0 ? `${ratio}% do limite` : 'Limite não informado'}</span><span>{info.due > 0 ? `Vence dia ${info.due}` : 'Vencimento não informado'}</span></div></article>;
          })}
          <button className="add-card" type="button" onClick={openNew}><span>＋</span><b>Registrar compra</b><small>Adicione uma compra feita no cartão</small></button>
        </div>
      </section>

      <footer><span>clara · suas finanças no lugar certo</span><button type="button" onClick={exportData}>Baixar cópia dos dados</button></footer>

      <nav className="mobile-nav" aria-label="Navegação no celular"><a className="active" href="#inicio"><span>⌂</span>Início</a><a href="#freio"><span>!</span>Freio</a><button type="button" onClick={openNew} aria-label="Adicionar gasto">＋</button><a href="#gastos"><span>▥</span>Gastos</a><a href="#cartoes"><span>▭</span>Cartões</a></nav>

      {modalOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }} role="presentation">
        <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="modal-head"><div><p className="eyebrow">{editing ? 'AJUSTAR LANÇAMENTO' : 'NOVO LANÇAMENTO'}</p><h2 id="modal-title">{editing ? 'Editar movimentação' : 'O que aconteceu?'}</h2></div><button className="close-button" onClick={() => setModalOpen(false)} type="button" aria-label="Fechar">×</button></div>
          <EntryForm entry={editing} selectedMonth={selectedMonth} onSubmit={saveEntry} saving={saving} cardName={profileSettings.cardName} />
          {editing && <button className="delete-button" onClick={() => void deleteEntry()} type="button">Excluir lançamento</button>}
        </section>
      </div>}
      {toast && <div className="toast" role="status">✓ {toast}</div>}
    </main>
  );
}

function EntryForm({ entry, selectedMonth, onSubmit, saving, cardName }: { entry: Entry | null; selectedMonth: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void; saving: boolean; cardName: string }) {
  const [type, setType] = useState<Entry['type']>(entry?.type ?? 'expense');
  const [source, setSource] = useState<Entry['source']>(entry?.source ?? 'fixed');
  const date = entry?.transactionDate ?? `${selectedMonth}-25`;
  return <form className="entry-form" onSubmit={onSubmit}>
    <div className="type-tabs"><label><input type="radio" name="type" value="expense" checked={type === 'expense'} onChange={() => { setType('expense'); if (source === 'income') setSource('fixed'); }} /><span>Saída</span></label><label><input type="radio" name="type" value="income" checked={type === 'income'} onChange={() => { setType('income'); setSource('income'); }} /><span>Entrada</span></label></div>
    <label className="field full"><span>Descrição</span><input name="description" defaultValue={entry?.description} placeholder={type === 'expense' ? 'Ex.: Aluguel' : 'Ex.: Salário'} required autoFocus /></label>
    <label className="field full amount-field"><span>Valor</span><div><b>R$</b><input name="amount" inputMode="decimal" defaultValue={entry ? (entry.amountCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : ''} placeholder="0,00" required /></div></label>
    <div className="form-grid"><label className="field"><span>Categoria</span><select name="category" defaultValue={entry?.category ?? (type === 'income' ? 'Renda' : 'Moradia')}>{['Moradia', 'Alimentação', 'Mercado', 'Restaurantes', 'Transporte', 'Compras online', 'Saúde', 'Lazer', 'Educação', 'Assinaturas', 'Pets', 'Impostos', 'Cuidados pessoais', 'Outros', 'Renda'].map((item) => <option key={item}>{item}</option>)}</select></label><label className="field"><span>Data</span><input name="transactionDate" type="date" defaultValue={date} required /></label></div>
    {type === 'expense' && <><label className="field full"><span>Como foi pago?</span><select name="source" value={source} onChange={(event) => setSource(event.target.value as Entry['source'])}><option value="fixed">Conta fixa</option><option value="card">Cartão de crédito</option><option value="variable">Gasto variável</option></select></label>{source === 'card' && <label className="field full"><span>Cartão</span><select name="cardName" defaultValue={entry?.cardName ?? cardName}><option>{cardName}</option></select></label>}</>}
    <input type="hidden" name="source" value={type === 'income' ? 'income' : source} />
    <div className="check-row"><label><input name="recurring" type="checkbox" defaultChecked={entry?.recurring ?? source === 'fixed'} /><span><b>Repetir todos os meses</b><small>Ideal para contas fixas e renda</small></span></label><label><input name="paid" type="checkbox" defaultChecked={entry?.paid ?? true} /><span><b>{type === 'income' ? 'Já recebido' : 'Já pago'}</b><small>Inclui no valor realizado</small></span></label></div>
    <button className="submit-button" disabled={saving} type="submit">{saving ? 'Salvando…' : entry ? 'Salvar alterações' : 'Adicionar lançamento'}</button>
  </form>;
}

function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) setError('E-mail ou senha incorretos.');
    setBusy(false);
  };

  return (
    <main className="app-shell auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <span className="brand-mark">C</span>
        <h1>clara</h1>
        <p>Entre para ver as contas de João e Sara.</p>
        <label className="field full">
          <span>E-mail</span>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
        </label>
        <label className="field full">
          <span>Senha</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
        </label>
        {error && <p className="auth-error">{error}</p>}
        <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </main>
  );
}
