'use client';

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
  joao: { name: 'João', defaultMonth: '2026-08', cardName: 'Cartão principal' },
  sara: { name: 'Sara', defaultMonth: '2026-09', cardName: 'Nubank Sara' },
};

const COLORS: Record<string, string> = {
  Moradia: '#24483b', Cartões: '#ff7254', Alimentação: '#f1bd52', Mercado: '#d2a83f', Restaurantes: '#e27c52',
  Transporte: '#6d9fa2', 'Compras online': '#7f91c9', Saúde: '#bd7da0', Lazer: '#da9363', Educação: '#697db8', Assinaturas: '#9a8573', Pets: '#a87c55',
  Impostos: '#8a6d91', 'Cuidados pessoais': '#ce7f76', Outros: '#8b9691', Renda: '#8eaa58',
};

const CATEGORY_ICONS: Record<string, string> = {
  Alimentação: '🍱', Mercado: '🛒', Restaurantes: '🍽', Transporte: '⛽', 'Compras online': '▣', Lazer: '✦',
  Saúde: '＋', Assinaturas: '◎', Impostos: '%', Outros: '•••',
};

const CARD_LIMITS: Record<string, { limit: number; due: number; closing: number; color: string }> = {
  'Cartão principal': { limit: 0, due: 0, closing: 0, color: '#173a31' },
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

const STORAGE_PREFIX = 'clara-financas-v1';

const SAMPLE_ENTRIES: EntrySeed[] = [
  { description: 'Salário', amountCents: 1250000, type: 'income', category: 'Renda', source: 'income', cardName: null, transactionDate: '2026-08-05', recurring: true, paid: true },
  { description: 'Aluguel', amountCents: 280000, type: 'expense', category: 'Moradia', source: 'fixed', cardName: null, transactionDate: '2026-08-10', recurring: true, paid: true },
  { description: 'Condomínio', amountCents: 44000, type: 'expense', category: 'Moradia', source: 'fixed', cardName: null, transactionDate: '2026-08-10', recurring: true, paid: true },
  { description: 'Internet', amountCents: 11990, type: 'expense', category: 'Moradia', source: 'fixed', cardName: null, transactionDate: '2026-08-22', recurring: true, paid: false },
  { description: 'Academia', amountCents: 13990, type: 'expense', category: 'Saúde', source: 'fixed', cardName: null, transactionDate: '2026-08-08', recurring: true, paid: true },
  { description: 'Supermercado', amountCents: 68435, type: 'expense', category: 'Alimentação', source: 'card', cardName: 'Nubank', transactionDate: '2026-08-12', recurring: false, paid: true },
  { description: 'Restaurantes', amountCents: 31240, type: 'expense', category: 'Alimentação', source: 'card', cardName: 'Nubank', transactionDate: '2026-08-18', recurring: false, paid: true },
  { description: 'Passagens', amountCents: 85670, type: 'expense', category: 'Lazer', source: 'card', cardName: 'Itaú', transactionDate: '2026-08-23', recurring: false, paid: false },
  { description: 'Combustível', amountCents: 27000, type: 'expense', category: 'Transporte', source: 'card', cardName: 'Itaú', transactionDate: '2026-08-16', recurring: false, paid: true },
  { description: 'Curso de idiomas', amountCents: 65000, type: 'expense', category: 'Educação', source: 'fixed', cardName: null, transactionDate: '2026-08-15', recurring: true, paid: true },
  { description: 'Energia elétrica', amountCents: 18645, type: 'expense', category: 'Moradia', source: 'variable', cardName: null, transactionDate: '2026-08-27', recurring: false, paid: false },
  { description: 'Streaming', amountCents: 8990, type: 'expense', category: 'Assinaturas', source: 'card', cardName: 'Nubank', transactionDate: '2026-08-20', recurring: true, paid: true },
];

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function storageKey(profile: ProfileKey) {
  return `${STORAGE_PREFIX}:${profile}`;
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
  return profile === 'joao' ? SAMPLE_ENTRIES.map((entry) => createEntry(entry, profile)) : [];
}

function readStoredEntries(profile: ProfileKey) {
  try {
    const raw = window.localStorage.getItem(storageKey(profile));
    if (!raw) {
      const seeded = seedEntries(profile);
      window.localStorage.setItem(storageKey(profile), JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw) as Entry[];
    return Array.isArray(parsed) ? parsed : seedEntries(profile);
  } catch {
    return seedEntries(profile);
  }
}

function writeStoredEntries(profile: ProfileKey, nextEntries: Entry[]) {
  window.localStorage.setItem(storageKey(profile), JSON.stringify(nextEntries));
}

function entryDay(entry: Entry, month: string) {
  const originalDay = Number(entry.transactionDate.slice(8, 10)) || 1;
  const lastDay = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  return Math.min(originalDay, lastDay);
}

export default function Home() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [activeProfile, setActiveProfile] = useState<ProfileKey>('joao');
  const [selectedMonth, setSelectedMonth] = useState('2026-08');
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
      setEntries(readStoredEntries(profile));
    } catch {
      setToast('Não foi possível carregar seus dados agora.');
    } finally {
      setLoading(false);
    }
  }, []);

  const persistEntries = (nextEntries: Entry[], profile = activeProfile) => {
    writeStoredEntries(profile, nextEntries);
    setEntries(nextEntries);
  };

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
    const timeout = window.setTimeout(() => { void loadEntries(activeProfile); }, 0);
    return () => window.clearTimeout(timeout);
  }, [activeProfile, loadEntries]);
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
      const nextEntries = editing
        ? entries.map((entry) => entry.id === editing.id ? payload : entry)
        : [payload, ...entries];
      persistEntries(nextEntries);
      setModalOpen(false);
      setToast(editing ? 'Lançamento atualizado.' : 'Lançamento adicionado.');
    } catch {
      setToast('Não foi possível salvar. Tente novamente.');
    } finally { setSaving(false); }
  };

  const togglePaid = async (entry: Entry) => {
    try {
      const nextEntries = entries.map((item) => item.id === entry.id ? { ...item, paid: !item.paid } : item);
      persistEntries(nextEntries);
      setToast(entry.paid ? 'Marcado como pendente.' : 'Pagamento confirmado.');
    } catch {
      setToast('Não foi possível atualizar agora.');
    }
  };

  const deleteEntry = async () => {
    if (!editing || !window.confirm(`Excluir “${editing.description}”?`)) return;
    try {
      const nextEntries = entries.filter((item) => item.id !== editing.id);
      persistEntries(nextEntries);
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
        id: entry.id || makeId(),
        profile: activeProfile,
        billingMonth: entry.billingMonth || entry.transactionDate.slice(0, 7),
      }));
      persistEntries(entriesForProfile);
      setToast(`${entriesForProfile.length} lançamentos importados para ${profileSettings.name}.`);
    } catch { setToast('Arquivo inválido. Use uma cópia exportada pela Clara.'); }
    event.target.value = '';
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#inicio" aria-label="Clara — início"><span className="brand-mark">C</span><span>clara</span></a>
        <nav className="main-nav" aria-label="Navegação principal">
          <a className="active" href="#inicio">Visão geral</a><a href="#freio">Freio</a><a href="#gastos">Gastos</a><a href="#cartoes">Cartões</a>
        </nav>
        <div className="topbar-actions"><div className="profile-switch" aria-label="Escolher painel"><button className={activeProfile === 'sara' ? 'active' : ''} onClick={() => switchProfile('sara')} type="button">Sara</button><span>·</span><button className={activeProfile === 'joao' ? 'active' : ''} onClick={() => switchProfile('joao')} type="button">João</button></div><button className="primary-button" type="button" onClick={openNew}><span aria-hidden="true">＋</span> Adicionar gasto</button></div>
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
