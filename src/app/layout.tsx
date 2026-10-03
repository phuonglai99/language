import type { Metadata } from 'next';
import './globals.css';
import GlobalShell from './components/GlobalShell';
import { siteConfig } from '@/config/site';

export const metadata: Metadata = {
  // Child pages that set a title get the site name appended: "<title> | <name>".
  title: { default: siteConfig.name, template: `%s | ${siteConfig.name}` },
  description: siteConfig.description,
  icons: { icon: siteConfig.logo },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <head>
        <link rel="icon" href={siteConfig.logo} type="image/png" />
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
