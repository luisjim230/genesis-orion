import { Bungee, Rubik } from 'next/font/google';

const bungee = Bungee({ subsets: ['latin'], weight: '400', variable: '--font-bungee' });
const rubik = Rubik({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700'], variable: '--font-rubik' });

export const metadata = {
  title: 'Gran Rifa de Motos · Depósito Jiménez',
  description: 'Comprá en Depósito Jiménez, registrá tu factura y sumá acciones para ganarte una moto. Con el apoyo de nuestros patrocinadores.',
};

export default function RifaLayout({ children }) {
  return (
    <div className={`${bungee.variable} ${rubik.variable}`}>
      {children}
    </div>
  );
}
