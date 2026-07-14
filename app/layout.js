import { headers } from 'next/headers';
import { Rubik } from 'next/font/google';
import Sidebar from './sidebar';
import MobileNav from './mobile-nav';
import GA4Script from './components/GA4Script';
import './globals.css';

const rubik = Rubik({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700'] });

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'SOL · Sistema de Operaciones y Logística',
  description: 'Sistema de Operaciones y Logística · Corporación Rojimo S.A.',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: '48x48' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    other: [
      { rel: 'mask-icon', url: '/icon.svg', color: '#ED6E2E' },
    ],
  },
};

export default async function RootLayout({ children }) {
  // Marcado por el middleware: la página pública del Club (/club o subdominio
  // club.depositojimenez.com) se renderiza a pantalla completa, SIN el chrome
  // de SOL (sidebar/menú) y sin el gradiente del panel interno.
  const hdrs = await headers();
  const clubPublic = hdrs.get('x-club-public') === '1';

  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <GA4Script />
      </head>
      {clubPublic ? (
        <body className={rubik.className} style={{ margin: 0, minHeight: '100vh' }}>
          {children}
        </body>
      ) : (
        <body className={rubik.className} style={{
          margin: 0,
          display: 'flex',
          background: 'linear-gradient(135deg, #e8ecf4 0%, #d5dde8 30%, #e0e7f0 60%, #edf1f7 100%)',
          minHeight: '100vh',
        }}>
          <Sidebar />
          <MobileNav />
          <main id="sol-main" style={{
            flex: 1,
            marginLeft: '240px',
            minHeight: '100vh',
            background: 'transparent',
            padding: '32px 36px',
          }}>
            {children}
          </main>
        </body>
      )}
    </html>
  );
}
