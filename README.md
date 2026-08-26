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

   Ela é opcional para o build passar, mas sem ela as imagens de Open Graph (preview no WhatsApp, X, etc.) apontam para `localhost`.
5. Deploy.

### Observação sobre o pnpm

O campo `packageManager` foi removido do `package.json` de propósito. A Vercel ainda não reconhece o pnpm 11 e, com o campo presente, o build quebra com `ERR_PNPM_BAD_PM_VERSION`. Sem ele, a Vercel usa o pnpm 10, que lê o `pnpm-lock.yaml` (lockfileVersion 9.0) normalmente.

Se quiser fixar o pnpm 11, adicione a variável de ambiente `ENABLE_EXPERIMENTAL_COREPACK=1` no projeto da Vercel e devolva `"packageManager": "pnpm@11.19.0"` ao `package.json`.

## Dados compartilhados

Os lançamentos ficam salvos no `localStorage` do navegador — cada dispositivo tem os seus. Para João e Sara verem os mesmos dados em aparelhos diferentes, conecte um banco compatível com a Vercel (Supabase/Postgres, por exemplo) e troque o armazenamento local por uma API autenticada. Enquanto isso, a exportação/importação em JSON serve como sincronização manual.
