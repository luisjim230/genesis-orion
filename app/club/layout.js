import { Bungee, Rubik } from 'next/font/google';

const bungee = Bungee({ subsets: ['latin'], weight: '400', variable: '--font-bungee' });
const rubik = Rubik({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700'], variable: '--font-rubik' });

export const metadata = {
  title: 'Club del Enchapador · Depósito Jiménez',
  description: 'Acumulá puntos por cada saco de mortero Impersa y canjealos por herramientas profesionales.',
};

export default function ClubLayout({ children }) {
  return (
    <div className={`${bungee.variable} ${rubik.variable}`}>
      {children}
    </div>
  );
}
