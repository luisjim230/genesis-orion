import { Rubik } from 'next/font/google';
import Sidebar from './sidebar';
import './globals.css';

const rubik = Rubik({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700'] });

export const metadata = {
  title: 'SOL · Sistema de Operaciones y Logística',
  description: 'Sistema de Operaciones y Logística · Corporación Rojimo S.A.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className={rubik.className} style={{
        margin: 0,
        display: 'flex',
        background: '#FDF4F4',
        minHeight: '100vh',
      }}>
        <Sidebar />
        <main style={{
          flex: 1,
          marginLeft: '240px',
          minHeight: '100vh',
          background: '#FDF4F4',
          padding: '32px 36px',
        }}>
          {children}
        </main>
      </body>
    </html>
  );
}
