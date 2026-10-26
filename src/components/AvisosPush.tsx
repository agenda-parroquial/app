import { useCallback, useEffect, useState } from 'react';
import {
  activarPush, avisoDePrueba, desactivarPush, esIPhone, estaInstalada, estadoPush, type EstadoPush,
} from '../lib/push';
import { esErrorDeRed, mensajeDeError } from '../lib/sync';

/** Activa o desactiva los avisos en ESTE teléfono (llegan aunque la app esté cerrada). */
export function AvisosPush() {
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState('');
  const [probado, setProbado] = useState(false);

  const leer = useCallback(() => void estadoPush().then(setEstado), []);
  useEffect(leer, [leer]);

  async function correr(f: () => Promise<void>) {
    setError('');
    setTrabajando(true);
    try {
      await f();
    } catch (e) {
      setError(esErrorDeRed(e) ? 'Necesitas internet para hacer esto.' : mensajeDeError(e));
    } finally {
      setTrabajando(false);
      leer();
    }
  }

  if (!estado) return null;

  if (estado === 'no-soportado') {
    return (
      <div className="aviso">
        {esIPhone() && !estaInstalada() ? (
          <>
            <b>Para recibir notificaciones en iPhone, primero instala la app:</b><br />
            1. En Safari toca <b>Compartir</b> (el cuadro con la flecha).<br />
            2. Elige <b>«Añadir a pantalla de inicio»</b>.<br />
            3. Abre la app desde ese ícono y vuelve a esta pantalla.
          </>
        ) : (
          'Este navegador no permite notificaciones con la app cerrada.'
        )}
      </div>
    );
  }

  if (estado === 'denegado') {
    return (
      <div className="aviso">
        Las notificaciones están bloqueadas para esta app. Para activarlas ve a los <b>Ajustes</b> del teléfono (o del navegador),
        busca <b>Agenda</b> y permite las notificaciones.
      </div>
    );
  }

  if (estado === 'activo') {
    return (
      <div className="aviso ok">
        ✔ <b>Notificaciones activadas en este teléfono.</b> Te llegarán aunque la app esté cerrada.
        {error && <div className="aviso error">{error}</div>}
        <div className="fila" style={{ marginTop: 10 }}>
          <button
            className="btn sec chico" disabled={trabajando}
            onClick={() => void correr(async () => { await avisoDePrueba(); setProbado(true); })}
          >
            Mandarme una notificación de prueba
          </button>
          <button className="btn peligro chico" disabled={trabajando} onClick={() => void correr(desactivarPush)}>Desactivar</button>
        </div>
        {probado && <p className="ayuda" style={{ marginBottom: 0 }}>Enviado. Debe aparecer en unos segundos; puedes cerrar la app para comprobarlo.</p>}
      </div>
    );
  }

  return (
    <div className="aviso">
      <b>Activa las notificaciones en este teléfono</b> para enterarte al instante cuando se agregue, cambie o choque algo,
      aunque la app esté cerrada.
      {error && <div className="aviso error">{error}</div>}
      <div style={{ marginTop: 8 }}>
        <button className="btn chico" disabled={trabajando} onClick={() => void correr(activarPush)}>
          {trabajando ? 'Activando…' : 'Activar notificaciones'}
        </button>
      </div>
    </div>
  );
}
