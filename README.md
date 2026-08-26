# Clara — finanças pessoais

Dashboard responsivo para acompanhar entradas, gastos fixos, compras no cartão, categorias, vencimentos e saldo mensal.

## Recursos

- cadastro, edição e exclusão de lançamentos;
- contas recorrentes e status de pagamento;
- faturas por cartão e uso do limite;
- gráficos interativos por semana e categoria;
- filtros, busca e visão por mês;
- importação e exportação de backup em JSON;
- armazenamento local no navegador (`localStorage`), sem banco de dados.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS 4 · pnpm

## Desenvolvimento local

Requer Node.js 22.13 ou superior.

```bash
pnpm install
pnpm dev
```

Abra `http://localhost:3000`. O perfil da Sara fica em `http://localhost:3000/?perfil=sara`.

## Build de produção

```bash
pnpm build
pnpm start
```

## Deploy na Vercel

1. Suba o repositório no GitHub.
2. Na Vercel: **Add New → Project → Import** o repositório.
3. Framework Preset: **Next.js** (detectado automaticamente). Não altere Build Command nem Output Directory.
4. Em **Settings → Environment Variables**, adicione:

   | Nome | Valor |
   | --- | --- |
   | `NEXT_PUBLIC_SITE_URL` | `https://SEU-PROJETO.vercel.app` |
   | `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto no Supabase |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon/public key do Supabase |

   As duas do Supabase são obrigatórias — sem elas o app abre pedindo configuração.
5. Deploy.

### Observação sobre o pnpm

O campo `packageManager` foi removido do `package.json` de propósito. A Vercel ainda não reconhece o pnpm 11 e, com o campo presente, o build quebra com `ERR_PNPM_BAD_PM_VERSION`. Sem ele, a Vercel usa o pnpm 10, que lê o `pnpm-lock.yaml` (lockfileVersion 9.0) normalmente.

Se quiser fixar o pnpm 11, adicione a variável de ambiente `ENABLE_EXPERIMENTAL_COREPACK=1` no projeto da Vercel e devolva `"packageManager": "pnpm@11.19.0"` ao `package.json`.

## Banco de dados (Supabase)

Os lançamentos ficam num Postgres do Supabase, compartilhados entre João e Sara e protegidos por login.

### Configuração, uma vez só

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Abra o **SQL Editor**, cole o conteúdo de `supabase/schema.sql` e execute.
3. Em **Authentication > Users > Add user**, crie uma conta para cada pessoa
   (marque *Auto Confirm User*, senão o login não funciona sem e-mail configurado).
4. Volte ao SQL Editor e rode o bloco comentado no fim do `schema.sql`, trocando
   os dois e-mails pelos reais. Ele cria a "casa" e vincula as duas contas a ela.
5. Em **Project Settings > Data API**, copie a *Project URL* e a *anon public key*
   para as variáveis de ambiente da Vercel.

### Como os dados são protegidos

O `schema.sql` liga Row Level Security em todas as tabelas. Cada consulta só
enxerga lançamentos da casa a que o usuário logado pertence. A `anon key` é
pública por design (ela vai no JavaScript do navegador); é o RLS que impede que
alguém com a chave leia os dados de outra pessoa.

### Primeira carga

Quando um perfil abre e o banco ainda não tem nenhum lançamento dele, o app
insere automaticamente os dados iniciais que estão em `app/page.tsx`
(`SAMPLE_ENTRIES` para o João, `SARA_ENTRIES` para a Sara). A partir daí o banco
é a fonte da verdade e o código não é mais consultado.

### Backup

Os botões **Exportar** e **Importar** continuam funcionando. A importação agora
*adiciona* lançamentos em vez de substituir, para não apagar o que já está no
banco sem querer.
