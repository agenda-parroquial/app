# Agenda Parroquial

App web instalable (PWA) para llevar la agenda de la parroquia entre la secretaria, el párroco y el vicario.

- **Funciona sin internet** en el teléfono y en la PC: se puede abrir, consultar y agregar eventos. Al volver la señal se sincroniza sola.
- **Avisos al instante** cuando alguien agrega, cambia o cancela algo (con la app abierta y con internet).
- **Detección de empalmes:** si dos eventos coinciden en horario y lugar (o con el mismo sacerdote), ambos se marcan en conflicto y se avisa a todos para resolverlo.
- **Misas fijas** que aparecen solas en la agenda: todas las semanas o **alternas** (una sí, una no; también cada 3 o 4 semanas). Para dos misas que se turnan a la misma hora, se crean dos con «Cada 2 semanas» y fechas de inicio con una semana de diferencia.
- **Intenciones de cada misa o evento:** el botón **🙏 Intenciones** de cada tarjeta muestra la lista (por los difuntos, acción de gracias y por la salud de) **en solo lectura**, con opción de copiarla para leerla. Se capturan, editan y quitan desde **Editar evento**, una por línea, y solo puede hacerlo la secretaria (en todas las misas) o el párroco/vicario en las misas que tienen asignadas. Funciona sin internet.
- **Avisos push:** llegan al teléfono aunque la app esté cerrada (ver «Avisos push» más abajo).
- **Roles:** párroco, secretaria y vicario; el párroco aprueba las cuentas.

Tecnología: React + Vite (PWA) · Dexie/IndexedDB (copia local) · Supabase (base de datos, usuarios y tiempo real) · Netlify (hosting).

---

## 1. Crear el proyecto en Supabase (gratis)

1. Entra a <https://supabase.com> → **New project**. Anota la contraseña de la base de datos.
2. **SQL Editor → New query**: pega **todo** el contenido de [`supabase/schema.sql`](supabase/schema.sql) y pulsa **Run**.
   - Si tu parroquia no está en la zona horaria de Ciudad de México, cambia `America/Mexico_City` en la primera línea de datos del archivo antes de ejecutarlo.
3. **Authentication → Providers → Email**: desactiva **Confirm email**. (No hace falta confirmar el correo: el párroco ya aprueba cada cuenta a mano.)
4. **Project Settings → API**: copia la **Project URL** y la clave **anon / publishable**.

## 2. Probarla en tu computadora

```bash
npm install
cp .env.example .env     # en Windows: copy .env.example .env
# edita .env y pega la URL y la clave de Supabase
npm run dev
```

## 3. Publicarla en Netlify (gratis)

1. Sube esta carpeta a un repositorio de GitHub (el archivo `.env` **no** se sube).
   - **Importante:** Netlify solo despliega gratis un repositorio *privado* si es de una cuenta personal. Si el repositorio es de una **organización**, debe ser **público** (aquí no hay secretos: las claves van como variables de entorno) o hay que pagar el plan Pro.
2. En <https://netlify.com> → **Add new project → Import from Git** y elige el repositorio. Si es de una organización, primero instala la app de Netlify en esa organización desde GitHub. La configuración de compilación ya viene en `netlify.toml`.
3. En la misma pantalla, **Environment variables**: agrega `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con los mismos valores del `.env`.
4. Despliega. Cada cambio que se suba a la rama `main` se publica solo.
5. Opcional: en Supabase → **Authentication → URL Configuration**, pon la dirección del sitio en **Site URL**. Hoy la app no envía correos, así que solo importará si más adelante agregas recuperación de contraseña.

**Sitio actual:** <https://agenda-parroquial.netlify.app> · **Código:** <https://github.com/agenda-parroquial/app>

## 3b. Avisos push (una sola vez)

Para que los avisos lleguen con la app cerrada hace falta una función en Supabase:

1. **Edge Functions → Deploy a new function → Via Editor.** Ponle el nombre **`enviar-push`**, pega el contenido de [`supabase/functions/enviar-push/index.ts`](supabase/functions/enviar-push/index.ts) y pulsa **Deploy function**.
2. En la pestaña **Settings** de esa función, apaga **«Verify JWT with legacy secret»** y guarda. (Quien la llama —la base de datos y el navegador— no envía JWT; la función se protege con un secreto compartido que la base de datos genera sola.)
3. Si instalaste con `schema.sql`, cambia en la tabla `config` el valor de `funciones_url` por la dirección de tu proyecto (`https://TU-PROYECTO.supabase.co/functions/v1`). Con la migración ya viene puesta.
4. Cada persona abre la app, va a **Avisos** y pulsa **Activar avisos** (en iPhone, antes hay que instalar la app en la pantalla de inicio: iOS 16.4 o superior). El botón **«Mandarme un aviso de prueba»** comprueba que todo funciona.

Las claves del servicio de avisos (VAPID) se generan solas la primera vez y se guardan en la tabla `push_config`, que ningún usuario puede leer. Para no saturar, si llegan varios avisos del mismo tipo en menos de 20 segundos solo se envía el primero al teléfono; el resto se ve dentro de la app.

## 4. Primer uso

1. **El párroco se registra primero** desde la dirección de Netlify. El primer usuario que se registra queda automáticamente como párroco y con acceso.
2. En **Más → Lugares** agrega la parroquia, las capillas y la oficina.
3. En **Más → Misas fijas** agrega los horarios semanales.
4. La secretaria y el vicario se registran ellos mismos; el párroco los aprueba en **Más → Usuarios** y les asigna su rol.

| | Párroco | Secretaria | Vicario |
|---|:-:|:-:|:-:|
| Ver la agenda y los conflictos | ✔ | ✔ | ✔ |
| Crear, editar y cancelar eventos | ✔ | ✔ | ✔ |
| Ver las intenciones de cualquier evento | ✔ | ✔ | ✔ |
| Capturar o editar intenciones | solo en sus misas | en todas | solo en sus misas |
| Lugares y misas fijas | ✔ | ✔ | solo ver |
| Aprobar cuentas y asignar roles | ✔ | — | — |

## 5. Instalar en el teléfono

- **iPhone:** abrir la dirección en **Safari** → Compartir → **Añadir a pantalla de inicio**. Abrirla desde ese ícono.
- **Android:** en Chrome → menú ⋮ → **Instalar aplicación**.
- **PC:** en Chrome o Edge, ícono de instalar en la barra de direcciones (opcional; también funciona como página normal).

**Importante:** abrir la app **una vez con internet** después de instalarla, para que descargue todo y funcione sin señal.

---

## Cómo se resuelven los empalmes

- Al escribir un evento, el formulario avisa al momento si se empalma con otro (incluso sin internet).
- Si se guarda igual, o si el empalme nace porque dos personas agendaron sin verse (por ejemplo, el párroco sin señal), al sincronizar **el servidor marca ambos eventos «EN CONFLICTO» y avisa a todos**.
- En la pestaña **Conflictos** se resuelve: cambiar horario o lugar, cancelar uno, o confirmar que pueden coexistir. Al cambiar o cancelar, el conflicto se cierra solo.
- Si dos personas editan **el mismo evento** a la vez, aparece «Cambio que chocó» mostrando las dos versiones para elegir cuál conservar. Solo viajan los campos que cada quien cambió, así que no se pisan cambios distintos.

La regla de empalme: se cruzan en el tiempo **y** comparten lugar (de la lista) **o** el mismo sacerdote asignado. Un evento en «Otro lugar (solo esta vez)» solo choca por sacerdote.

## Límites actuales y siguientes pasos

- **Avisos push en iPhone:** solo funcionan con la app instalada en la pantalla de inicio (iOS 16.4 o superior) y aceptando el permiso. En Android funcionan también desde Chrome.
- **Mapa de capillas:** la tabla de lugares ya guarda latitud y longitud. Falta la pantalla con mapa (Leaflet + OpenStreetMap, gratis).
- **PDF/impresión semanal** para el tablón: pendiente.
- **Supabase gratis** pausa un proyecto tras una semana sin actividad; con uso diario no ocurre. El plan gratis **no incluye respaldos automáticos**: conviene exportar las tablas `eventos`, `lugares` y `misas_fijas` a CSV de vez en cuando (Table Editor → Export).
- **Cerrar sesión borra los datos locales** de ese dispositivo; si hay cambios sin enviar, la app lo avisa antes.

## Estructura

```
supabase/schema.sql        tablas, roles, seguridad, detección de empalmes, misas fijas (instalación nueva)
supabase/migrations/       cambios para bases ya creadas (ejecutar en orden en el SQL Editor)
supabase/functions/        función que envía los avisos push (se despliega desde el panel de Supabase)
src/sw.ts                  service worker: modo sin conexión y recepción de avisos
src/lib/db.ts              copia local (Dexie)
src/lib/store.ts           escrituras "local primero" + cola de cambios pendientes
src/lib/sync.ts            enviar pendientes, traer cambios, tiempo real
src/lib/traslapes.ts       regla de empalme (espejo de la del servidor)
src/components/            pantallas
```
