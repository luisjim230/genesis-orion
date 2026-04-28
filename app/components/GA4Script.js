'use client';
// Carga gtag.js de GA4. SOL siempre se marca como tráfico INTERNO porque
// es la app del equipo de Depósito Jiménez — sin importar si el navegador
// tiene el flag dj_internal_traffic ya configurado.
//
// El sitio público (depositojimenezcr.com) usa el mismo Measurement ID pero
// envía traffic_type=internal solo si el navegador está marcado vía /marcar-interno.
//
// Adicionalmente, todos los eventos desde SOL llevan app_name=sol para poder
// diferenciarlos del tráfico interno del sitio público en GA4.
import Script from 'next/script';

const MEASUREMENT_ID = 'G-237EPSVR3Z';

export default function GA4Script() {
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${MEASUREMENT_ID}', {
            send_page_view: true,
            traffic_type: 'internal',
            app_name: 'sol',
          });
        `}
      </Script>
    </>
  );
}
