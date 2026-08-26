import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: 'Clara — Seu dinheiro, sem mistério',
  description: 'Dashboard pessoal para acompanhar gastos fixos, cartões, categorias e o saldo do mês.',
  openGraph: {
    title: 'Clara — Seu dinheiro, sem mistério',
    description: 'Acompanhe gastos fixos, cartões, categorias e seu saldo mensal em uma visão simples.',
    type: 'website',
    locale: 'pt_BR',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Clara — Seu dinheiro, sem mistério.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Clara — Seu dinheiro, sem mistério',
    description: 'Acompanhe gastos fixos, cartões, categorias e seu saldo mensal em uma visão simples.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
