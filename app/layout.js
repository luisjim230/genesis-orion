import { DM_Sans } from 'next/font/google';
import Sidebar from './sidebar';
import './globals.css';

const dmSans = DM_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'] });

export const metadata = {
  title: 'Génesis Orión – Corporación Rojimo S.A.',
  description: 'Sistema de gestión empresarial · Depósito Jiménez',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
      </head>
      <body className={dmSans.className} style={{ margin: 0, display: 'flex', background: '#0f1115', minHeight: '100vh' }}>
        <Sidebar />
        <main style={{ flex: 1, marginLeft: '230px', minHeight: '100vh', background: '#0f1115' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
