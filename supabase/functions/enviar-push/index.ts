// Edge Function "enviar-push": manda los avisos al teléfono aunque la app esté cerrada.
//
//   POST  la llama la base de datos (trigger de `notificaciones` vía pg_net) con el
//         secreto compartido en la cabecera x-push-secret y { notificacion_id }.
//   GET   devuelve la clave pública VAPID que necesita el navegador para suscribirse.
//
// Las claves VAPID se generan solas la primera vez y se guardan en `push_config`
// (tabla sin políticas: solo este servidor puede leerla). Hay que desplegarla con la
// verificación de JWT DESACTIVADA, porque quien la llama (la base de datos y el
// navegador) no envía JWT; la protección del POST es el secreto compartido.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-push-secret',
};
const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const TITULOS: Record<string, string> = {
  evento_nuevo: 'Nueva actividad',
  evento_editado: 'Actividad modificada',
  evento_cancelado: 'Actividad cancelada',
  conflicto: '⚠ Empalme de horario',
  aviso_parroquial: '📣 Aviso parroquial',
};

async function leerConfig(): Promise<Record<string, string>> {
  const { data, error } = await sb.from('push_config').select('clave, valor');
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((r) => [r.clave as string, r.valor as string]));
}

/** Devuelve la configuración; la primera vez genera y guarda las claves VAPID. */
async function configuracion() {
  let c = await leerConfig();
  if (!c.vapid_publica || !c.vapid_privada) {
    const k = webpush.generateVAPIDKeys();
    // Un solo INSERT de ambas filas: si dos llamadas coinciden, gana una y la otra no escribe nada.
    const { error } = await sb.from('push_config').upsert(
      [{ clave: 'vapid_publica', valor: k.publicKey }, { clave: 'vapid_privada', valor: k.privateKey }],
      { onConflict: 'clave', ignoreDuplicates: true },
    );
    if (error) throw error;
    c = await leerConfig();
  }
  return c;
}

/** Comparación en tiempo constante (evita adivinar el secreto por el tiempo de respuesta). */
function iguales(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** A dónde lleva el aviso al tocarlo. */
async function destino(n: { tipo: string; evento_id: string | null }): Promise<string> {
  if (n.tipo === 'conflicto') return '/#/conflictos';
  if (n.tipo === 'aviso_parroquial') return '/#/parroquiales';
  if (!n.evento_id) return '/#/avisos';
  const { data: e } = await sb.from('eventos').select('inicio, parroquia_id').eq('id', n.evento_id).maybeSingle();
  if (!e) return '/#/avisos';
  // Cada parroquia tiene su zona horaria.
  const { data: z } = await sb.from('parroquias').select('zona_horaria').eq('id', e.parroquia_id).maybeSingle();
  const dia = new Date(e.inicio as string).toLocaleDateString('en-CA', { timeZone: (z?.zona_horaria as string) ?? 'America/Mexico_City' });
  return `/#/agenda/${dia}/${n.evento_id}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  try {
    const c = await configuracion();

    if (req.method === 'GET') return json({ publica: c.vapid_publica }); // no es secreta
    if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

    if (!c.secreto || !iguales(req.headers.get('x-push-secret') ?? '', c.secreto)) {
      return json({ error: 'No autorizado' }, 401);
    }

    const { notificacion_id } = await req.json();
    const { data: n } = await sb
      .from('notificaciones').select('id, usuario_id, tipo, evento_id, mensaje')
      .eq('id', notificacion_id).maybeSingle();
    if (!n) return json({ enviados: 0, motivo: 'notificación no encontrada' });

    const { data: subs } = await sb
      .from('push_suscripciones').select('id, endpoint, p256dh, auth_secret').eq('usuario_id', n.usuario_id);
    if (!subs?.length) return json({ enviados: 0, motivo: 'sin dispositivos' });

    webpush.setVapidDetails(
      Deno.env.get('SITIO_URL') ?? 'https://agenda-parroquial.netlify.app',
      c.vapid_publica, c.vapid_privada,
    );
    const url = await destino(n);
    const carga = JSON.stringify({
      titulo: TITULOS[n.tipo] ?? 'Agenda Parroquial',
      cuerpo: n.mensaje,
      url,
      tag: `${n.tipo}-${n.evento_id ?? n.id}`,
    });

    const resultados = await Promise.allSettled(
      subs.map((s) =>
        webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_secret } },
          carga,
          { TTL: 60 * 60 * 24, urgency: 'high' },
        )
      ),
    );

    // Los dispositivos dados de baja (404/410) se limpian solos.
    const caducados: string[] = [];
    const errores: number[] = [];
    resultados.forEach((r, i) => {
      if (r.status !== 'rejected') return;
      const codigo = (r.reason as { statusCode?: number })?.statusCode ?? 0;
      if (codigo === 404 || codigo === 410) caducados.push(subs[i].id as string);
      else errores.push(codigo);
    });
    if (caducados.length) await sb.from('push_suscripciones').delete().in('id', caducados);

    return json({
      enviados: resultados.filter((r) => r.status === 'fulfilled').length,
      caducados: caducados.length,
      errores,
    });
  } catch (e) {
    console.error('enviar-push:', e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
