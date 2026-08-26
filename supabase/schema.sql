-- ============================================================
-- Clara — schema do Supabase
-- Rode este arquivo inteiro no SQL Editor do Supabase, uma vez.
-- ============================================================

-- 1. Casa (household): agrupa as pessoas que compartilham os dados
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- 2. Quem pertence a qual casa
create table if not exists public.household_members (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  created_at   timestamptz not null default now()
);

create index if not exists household_members_household_idx
  on public.household_members (household_id);

-- 3. Função auxiliar: devolve a casa do usuário logado.
--    SECURITY DEFINER evita recursão de RLS quando as políticas de
--    entries consultam household_members.
create or replace function public.current_household()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id
  from public.household_members
  where user_id = auth.uid()
  limit 1
$$;

-- 4. Lançamentos
create table if not exists public.entries (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null default public.current_household()
                     references public.households (id) on delete cascade,
  profile          text not null check (profile in ('joao', 'sara')),
  description      text not null,
  amount_cents     bigint not null,
  type             text not null check (type in ('expense', 'income')),
  category         text not null,
  source           text not null check (source in ('fixed', 'card', 'variable', 'income')),
  card_name        text,
  transaction_date date not null,
  billing_month    text,
  recurring        boolean not null default false,
  paid             boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists entries_household_profile_idx
  on public.entries (household_id, profile);

-- 5. updated_at automático
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists entries_touch_updated_at on public.entries;
create trigger entries_touch_updated_at
  before update on public.entries
  for each row execute function public.touch_updated_at();

-- ============================================================
-- Row Level Security
-- Sem isso, qualquer pessoa com a chave pública lê tudo.
-- ============================================================

alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.entries           enable row level security;

drop policy if exists "membro le a propria casa" on public.households;
create policy "membro le a propria casa" on public.households
  for select using (id = public.current_household());

drop policy if exists "membro le o proprio vinculo" on public.household_members;
create policy "membro le o proprio vinculo" on public.household_members
  for select using (user_id = auth.uid());

drop policy if exists "membro le lancamentos da casa" on public.entries;
create policy "membro le lancamentos da casa" on public.entries
  for select using (household_id = public.current_household());

drop policy if exists "membro cria lancamentos na casa" on public.entries;
create policy "membro cria lancamentos na casa" on public.entries
  for insert with check (household_id = public.current_household());

drop policy if exists "membro edita lancamentos da casa" on public.entries;
create policy "membro edita lancamentos da casa" on public.entries
  for update using (household_id = public.current_household())
              with check (household_id = public.current_household());

drop policy if exists "membro apaga lancamentos da casa" on public.entries;
create policy "membro apaga lancamentos da casa" on public.entries
  for delete using (household_id = public.current_household());

-- ============================================================
-- PASSO FINAL — vincular as contas
--
-- 1. Crie os dois usuários em Authentication > Users > Add user
--    (marque "Auto Confirm User").
-- 2. Rode o bloco abaixo trocando os dois e-mails pelos reais.
-- ============================================================

-- do $$
-- declare
--   casa uuid;
-- begin
--   insert into public.households (name) values ('Casa João e Sara')
--   returning id into casa;
--
--   insert into public.household_members (user_id, household_id)
--   select id, casa from auth.users
--   where email in ('EMAIL-DO-JOAO@exemplo.com', 'EMAIL-DA-SARA@exemplo.com');
-- end $$;
