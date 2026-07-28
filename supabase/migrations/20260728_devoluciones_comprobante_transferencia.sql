-- ════════════════════════════════════════════════════════════════════════
-- Devoluciones: comprobante de la transferencia (imagen)
--
-- Además del recibo PDF del ERP, ahora se puede adjuntar la IMAGEN del
-- comprobante de la transferencia / SINPE que se le hizo al cliente. Queda
-- guardada en el mismo bucket privado y cualquiera que vea el historial puede
-- abrirla vía /api/devoluciones/:id/comprobante.
-- ════════════════════════════════════════════════════════════════════════

alter table public.devoluciones
  add column if not exists comprobante_path   text,  -- ruta de la imagen en el bucket
  add column if not exists comprobante_nombre text;  -- nombre original del archivo

-- El bucket ya existía solo para PDF. Ampliamos los tipos permitidos para
-- aceptar imágenes del comprobante (y seguimos aceptando PDF).
update storage.buckets
  set allowed_mime_types = array[
        'application/pdf',
        'image/jpeg', 'image/jpg', 'image/png',
        'image/webp', 'image/heic', 'image/heif'
      ]
  where id = 'recibos-devoluciones';
