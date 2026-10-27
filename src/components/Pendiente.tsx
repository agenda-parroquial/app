import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';

/** Cuenta sin parroquia asignada, o parroquia suspendida por el superadmin. */
export function SinAcceso({ titulo, texto }: { titulo: string; texto: string }) {
  const { perfil, usuario, cerrarSesion } = useAuth();
  return (
    <div className="centro">
      <div className="caja">
        <img className="logo" src="/icon.svg" alt="" />
        <h1>{titulo}</h1>
        <p className="sub">{perfil?.nombre || usuario?.email}</p>
        <div className="aviso">{texto}</div>
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
