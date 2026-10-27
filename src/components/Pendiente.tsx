import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { refrescarParroquia } from '../lib/sync';

/**
 * Cuenta sin parroquia asignada, o parroquia suspendida o vencida. Con `parroquiaId` la pantalla
 * consulta sola si ya la reactivaron o renovaron (la app no sincroniza mientras no hay acceso).
 */
export function SinAcceso({ titulo, texto, parroquiaId }: { titulo: string; texto: string; parroquiaId?: string }) {
  const { perfil, usuario, cerrarSesion } = useAuth();
  const [revisando, setRevisando] = useState(false);

  const revisar = useCallback(async () => {
    if (!parroquiaId) return;
    setRevisando(true);
    await refrescarParroquia(parroquiaId);
    setRevisando(false);
  }, [parroquiaId]);

  useEffect(() => {
    if (!parroquiaId) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void revisar();
    }, 15000);
    return () => window.clearInterval(t);
  }, [parroquiaId, revisar]);

  return (
    <div className="centro">
      <div className="caja">
        <img className="logo" src="/icon.svg" alt="" />
        <h1>{titulo}</h1>
        <p className="sub">{perfil?.nombre || usuario?.email}</p>
        <div className="aviso">{texto}</div>
        {parroquiaId && (
          <button className="btn ancho" onClick={() => void revisar()} disabled={revisando}>
            {revisando ? 'Revisando…' : 'Revisar de nuevo'}
          </button>
        )}
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <button className="enlace" onClick={() => void cerrarSesion()}>Cerrar sesión</button>
        </div>
      </div>
    </div>
  );
}

/** Cuenta creada pero todavía no aprobada por el párroco. */
export function Pendiente() {
  const { perfil, usuario, recargarPerfil, cerrarSesion } = useAuth();
  const [revisando, setRevisando] = useState(false);

  async function revisar() {
    setRevisando(true);
    await recargarPerfil();
    setRevisando(false);
  }

  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void recargarPerfil();
    }, 8000);
    return () => window.clearInterval(t);
  }, [recargarPerfil]);

  return (
    <div className="centro">
      <div className="caja">
        <img className="logo" src="/icon.svg" alt="" />
        <h1>Cuenta pendiente</h1>
        <p className="sub">{perfil?.nombre || usuario?.email}</p>
        <div className="aviso">
          El párroco debe autorizar tu cuenta para que puedas ver la agenda. Avísale que ya te registraste;
          esta pantalla se actualiza sola cuando te apruebe.
        </div>
        <button className="btn ancho" onClick={revisar} disabled={revisando}>
          {revisando ? 'Revisando…' : 'Revisar de nuevo'}
        </button>
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <button className="enlace" onClick={() => void cerrarSesion()}>Cerrar sesión</button>
        </div>
      </div>
    </div>
  );
}
