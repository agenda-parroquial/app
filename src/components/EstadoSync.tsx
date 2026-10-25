import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { useEstadoSync } from '../lib/sync';

export function EstadoSync() {
  const s = useEstadoSync();
  const porEnviar = useLiveQuery(() => db.outbox.count(), [], 0);

  let texto: string;
  if (!s.enLinea) texto = `Sin conexión${porEnviar ? ` · ${porEnviar} por enviar` : ''}`;
  else if (s.sincronizando) texto = 'Sincronizando…';
  else if (porEnviar) texto = `${porEnviar} por enviar`;
  else texto = '● Al día';

  return <span className={`estado ${s.enLinea ? '' : 'off'}`} role="status">{texto}</span>;
}
