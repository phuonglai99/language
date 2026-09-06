import type { Metadata } from 'next';
import './globals.css';
import GlobalShell from './components/GlobalShell';

export const metadata: Metadata = {
  title: 'ice-bear is learning',
  description: 'Học tiếng Trung cùng ice-bear 🐻',
  icons: { icon: '/icon.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <head>
        <link rel="icon" href="/icon.png" type="image/png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&family=Be+Vietnam+Pro:ital,wght@0,300;0,400;0,500;0,600;1,400&family=JetBrains+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>
        <GlobalShell />
        <div id="app-main" style={{ transition: 'padding-left 0.25s cubic-bezier(0.4,0,0.2,1)', minHeight: '100vh' }}>
          {children}
        </div>
      </body>
    </html>
  );
}
