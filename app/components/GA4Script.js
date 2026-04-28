'use client';
// Carga gtag.js de GA4 y, si el navegador está marcado como interno
// (localStorage `dj_internal_traffic` === "true"), pasa traffic_type=internal
// al config inicial. De lo contrario, queda como external por default.
//
// IMPORTANTE: Génesis Orión es interno; en general no necesitamos trackearlo.
// Igual lo dejamos preparado para que si alguna vez se trackea, el flag funcione.
//
// Para depositojimenezcr.com (Nidux) la cobertura está dada por:
//   1) /marcar-interno redirige a depositojimenezcr.com/?traffic_type=internal
//      una vez registrado, que GA4 puede capturar mediante una "Internal Traffic Rule"
//      configurada para ese parámetro de URL.
//   2) Si Nidux permite snippet custom, se incluye el mismo bloque que está abajo.
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
          (function(){
            var isInternal = false;
            try {
              isInternal = window.localStorage.getItem('dj_internal_traffic') === 'true';
              if (!isInternal) {
                // Fallback cookie (sirve si limpiaron localStorage pero la cookie persiste).
                isInternal = /(?:^|; )dj_internal_traffic=true/.test(document.cookie);
              }
            } catch (e) {}
            var cfg = { send_page_view: true };
            if (isInternal) {
              cfg.traffic_type = 'internal';
            }
            gtag('config', '${MEASUREMENT_ID}', cfg);
          })();
        `}
      </Script>
    </>
  );
}
