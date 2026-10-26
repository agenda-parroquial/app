import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';

export function Login() {
  const { iniciarSesion, registrar } = useAuth();
  const [modo, setModo] = useState<'entrar' | 'registro'>('entrar');
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [codigo, setCodigo] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError('');
    setAviso('');
    setTrabajando(true);
    const r = modo === 'entrar' ? await iniciarSesion(email, password) : await registrar(email, password, nombre, codigo);
    setTrabajando(false);
    if (r.error) setError(r.error);
    if (r.aviso) {
      setAviso(r.aviso);
      setModo('entrar');
    }
  }

  return (
    <div className="centro">
      <form className="caja" onSubmit={enviar}>
        <img className="logo" src="/icon.svg" alt="" />
        <h1>Agenda Parroquial</h1>
        <p className="sub">{modo === 'entrar' ? 'Inicia sesión' : 'Crea tu cuenta'}</p>

        {modo === 'registro' && (
          <>
            <label htmlFor="nombre">Tu nombre</label>
            <input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required autoComplete="name" />
          </>
        )}
        <label htmlFor="email">Correo electrónico</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        <label htmlFor="password">Contraseña</label>
        <input
          id="password" type="password" value={password} minLength={6} required
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
        />

        {modo === 'registro' && (
          <>
            <label htmlFor="codigo">Código de invitación (si te dieron uno)</label>
            <input
              id="codigo" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Ej.: 3F9A-12BC"
              autoCapitalize="characters" autoComplete="off" maxLength={12}
            />
          </>
        )}

        {error && <div className="aviso error">{error}</div>}
        {aviso && <div className="aviso ok">{aviso}</div>}
        {modo === 'registro' && (
          <p className="ayuda">
            {codigo.trim()
              ? 'Con tu código entrarás directo.'
              : 'Sin código, el párroco debe aprobar tu cuenta antes de que puedas ver la agenda.'}
          </p>
        )}

        <button className="btn ancho" style={{ marginTop: 18 }} disabled={trabajando}>
          {trabajando ? 'Un momento…' : modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}
        </button>
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <button type="button" className="enlace" onClick={() => { setModo(modo === 'entrar' ? 'registro' : 'entrar'); setError(''); }}>
            {modo === 'entrar' ? 'No tengo cuenta · Registrarme' : 'Ya tengo cuenta · Iniciar sesión'}
          </button>
        </div>
      </form>
    </div>
  );
}
