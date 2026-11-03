# CONTRACTS — Emerald City

**contract-v0.3** · **backend-v0.3** · design: ninguna entrega todavía (interfaz provisional)

> Este archivo es el contrato compartido entre Programador, Diseñador e Integrador. Lo mantiene el Programador. El Diseñador aporta la tabla de nombres; el Integrador solo lee y audita.
> Nota de v0.2: el Programador no pudo leer la v0.1 desde el repositorio, así que este archivo se reconstruyó desde el BRIEF v1.6 y el canon de continuidad. Si la v0.1 tenía algo que aquí falta, se recupera desde el historial de GitHub.

## 1. Respuestas del proyecto

| Tema | Valor |
|---|---|
| Modo | Proyecto nuevo (create) |
| Roles | Administrador (código de sala), Jugador (solo apodo) |
| Login | Ninguno. Admin entra con código generado al crear la sala (se guarda solo el hash) |
| Idioma | Español, nombres de Pokémon en español |
| Zona horaria | America/Caracas (UTC-4). En base de datos todo `timestamptz` en UTC |
| Modo oscuro | Sí, tema base (verde oscuro y negro). ASSUMPTION: sin modo claro |
| Citas/reservas | No |
| Pagos | No (sin Stripe, sin monetización) |
| Móvil | Obligatorio |
| Salas | Una sola sala activa a la vez |
| Jugadores | Hasta 100 por sala (plan B: 30 a 50) |
| Costo | Cero |

## 2. Stack y versiones

| Pieza | Versión | Origen |
|---|---|---|
| Next.js | 15.5.28 (App Router) | build de Vercel |
| React | ^19 | package.json |
| TypeScript | strict + noUncheckedIndexedAccess | tsconfig.json |
| Zod | ^4 | package.json |
| Tailwind CSS | ^4 (tokens en `@theme`) | package.json |
| ESLint | 8 | package.json |
| Supabase | proyecto de PRUEBAS "Projecto Dinamica Frio-Caliente", us-west-2, Postgres 17 | Supabase |
| Hosting | Vercel Hobby, equipo emerald-city1, proyecto emerald-city | Vercel |
| @supabase/supabase-js | ^2.45 | package.json (Paso 3) |
| Vitest | ^3.2 (`npm test`) | package.json (Paso 3) |
| Aún no instalados | @supabase/ssr (no hace falta: no hay login), TanStack Query | llegan con el paso que los usa |

Pendiente: fijar versión de Node (package.json dice `>=20`, Vercel usa 26.x).

## 3. Variables de entorno (solo nombres)

| Variable | Tipo | Dónde se usa |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | pública | navegador y servidor |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | pública | navegador y servidor |
| `SUPABASE_SERVICE_ROLE_KEY` | **secreta, solo servidor** | lecturas de `pokemon`, salas y límites de intentos. Nunca con prefijo `NEXT_PUBLIC_` |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | secretas | NO se usan en la Fase 1 (decisión pendiente, ver sección 9) |

Producción y Preview apuntan hoy al Supabase de PRUEBAS (decisión temporal). Al crear el Supabase definitivo solo cambian las de Production.

## 4. Mapa "nombre en diseño → archivo en código"

Interfaz **provisional**: el Diseñador entra al final y reconcilia con esta tabla. Todo renombre se reporta, nunca se hace en silencio.

| Nombre en diseño | Archivo en código | Estado |
|---|---|---|
| Página principal (con espacio de logo) | `app/page.tsx` | provisional |
| Layout raíz | `app/layout.tsx` | provisional |
| Tokens de color y tema | `app/globals.css` (bloque `@theme`) | provisional |
| Health check | `app/api/health/route.ts` | definitivo |
| Validación de variables de entorno | `lib/env.ts` | definitivo |
| Esquema de Pokémon | `lib/validation/pokemon.ts` | definitivo |
| Normalización de nombres (buscador) | `lib/normalize-name.ts` | definitivo |
| Buscador de Pokémon | `lib/pokemon-search.ts` | definitivo |
| Botón "Crear sala" / pantalla Crear sala | `app/page.tsx`, `app/crear/page.tsx`, `components/RoomForms.tsx` (`CreateRoomForm`) | provisional |
| Botón "Unirme a una sala" | `components/RoomForms.tsx` (`JoinRoomForm`) | provisional |
| Pantalla de sala (jugadores) | `app/sala/[roomCode]/page.tsx` | provisional |
| Panel de administrador y entrada con código | `app/sala/[roomCode]/admin/page.tsx`, `components/RoomForms.tsx` (`AdminLoginForm`) | provisional |
| Estilos provisionales de botones y campos | `lib/ui.ts` | provisional |
| Acciones de sala (crear, entrar como admin) | `app/actions/rooms.ts` | definitivo |
| Lógica de salas / Pokémon | `services/rooms.service.ts`, `services/pokemon.service.ts` | definitivo |
| Códigos, hash y verificación | `lib/room-codes.ts` (puro), `lib/room-secrets.ts` (solo servidor) | definitivo |
| Formato `{ data, error }` | `lib/result.ts` | definitivo |
| Límite de intentos | `lib/rate-limit.ts` | definitivo |
| Cliente de Supabase (servidor) | `lib/supabase/server.ts` | definitivo |

## 5. Tokens

Definidos en `app/globals.css`: `ec-bg`, `ec-surface`, `ec-primary` (valor **EXAMPLE**, HEX real pendiente del cliente), `ec-text`, `ec-muted`. Los valores viven solo en ese archivo.

## 6. Matriz de permisos (v0.2)

Nadie inicia sesión en Supabase: Jugador y Administrador llegan a la base como el rol técnico `anon`. Quién es admin y quién es jugador se decide **en el código del servidor** (desde el Paso 3) y el servidor accede con `service_role`. El navegador solo usa `anon`.

| role | table | SELECT | INSERT | UPDATE | DELETE | policy name |
|---|---|---|---|---|---|---|
| anon | `pokemon` | ✗ | ✗ | ✗ | ✗ | ninguna (RLS activo sin políticas = denegado) |
| authenticated | `pokemon` | ✗ | ✗ | ✗ | ✗ | ninguna (RLS activo sin políticas = denegado) |
| service_role | `pokemon` | ✓ | ✗ | ✗ | ✗ | n/a (omite RLS; solo privilegio SELECT) |
| anon | `pokemon_names` (vista) | ✓ | ✗ | ✗ | ✗ | n/a (vista; privilegio SELECT) |
| authenticated | `pokemon_names` (vista) | ✓ | ✗ | ✗ | ✗ | n/a (vista; privilegio SELECT) |
| service_role | `pokemon_names` (vista) | ✓ | ✗ | ✗ | ✗ | n/a (vista; privilegio SELECT) |

| anon | `rooms` | ✗ | ✗ | ✗ | ✗ | ninguna (RLS activo sin políticas) |
| authenticated | `rooms` | ✗ | ✗ | ✗ | ✗ | ninguna (RLS activo sin políticas) |
| service_role | `rooms` | ✓ | ✓ | ✗ (llega en el Paso 6) | ✗ | n/a (omite RLS; privilegios SELECT, INSERT) |
| anon / authenticated / service_role | `rate_limits` | ✗ | ✗ | ✗ | ✗ | ninguna. Solo la función `rate_limit_hit` (SECURITY DEFINER, ejecutable solo por `service_role`) la toca |

Justificación escrita:
- `pokemon` guarda tipo y generación, que son las pistas del juego. Si el navegador pudiera leerla, un jugador vería la respuesta. Por eso no tiene políticas y se le quitaron todos los privilegios a `anon` y `authenticated`: doble barrera.
- `pokemon_names` expone solo `id`, `nombre_es`, `search_key`. Es pública a propósito (los nombres no son secretos; lo secreto es cuál se eligió). La vista usa los derechos de su dueño (`security_invoker = false`) para poder leer la tabla cerrada. El panel de Supabase puede mostrar un aviso "Security Definer View": es intencional y está documentado aquí.
- Ni siquiera `service_role` puede escribir en `pokemon` en tiempo de ejecución. La carga es por migración/seed.
- `rooms` guarda el código de admin solo como hash `sha256("<room_code>:<código>")`. Nadie puede leerla desde el navegador; el servidor la usa con `service_role`.
- `rate_limits` guarda contadores con claves hasheadas (nunca la IP en claro).

Cada celda tiene su prueba: `supabase/tests/pokemon_rls.test.sql` (63 pruebas) y `supabase/tests/rooms_rls.test.sql` (64 pruebas).

## 7. Formato de error y códigos

Todas las respuestas (Route Handlers y Server Actions): `{ data, error }`. En error: `error = { code, message, details? }`. `details` nunca lleva mensajes internos de Postgres.

| HTTP (solo Route Handlers) | code | Estado |
|---|---|---|
| 200 | — | en uso (`/api/health`) |
| 400 | `VALIDATION_ERROR` | en uso (acciones de sala) |
| 401 | `UNAUTHENTICATED` | propuesto |
| 403 | `FORBIDDEN` | en uso (`loginAdminAction`: código incorrecto o sala cerrada) |
| 404 | `NOT_FOUND` | propuesto |
| 409 | `CONFLICT` | propuesto |
| 409 | `ROOM_LIMIT_REACHED` (ya hay 10 salas abiertas) | en uso (`createRoomAction`) |
| 429 | `RATE_LIMITED` (en acciones va en `details.retryAfter`; en Route Handlers iría también `Retry-After`) | en uso |
| 500 | `INTERNAL` | en uso (`/api/health`) |
| 503 | `EXTERNAL_SERVICE_UNAVAILABLE` | en uso (falla de Supabase; el límite de intentos falla cerrado) |

## 8. Endpoints con límite de intentos

Almacén: **Supabase** (tabla `rate_limits` + función `rate_limit_hit`, ventana fija). Sin Upstash. Clave = hash del identificador de quien llama (primera IP de `x-forwarded-for`), nunca la IP en claro. Si el limitador no responde, la petición se rechaza (falla cerrado).

| Acción | Tipo | Límite |
|---|---|---|
| `createRoomAction` (crear sala) | Server Action | 10 por hora por persona |
| `loginAdminAction` (entrar como admin) | Server Action | 10 por 10 minutos por persona |

La cookie de admin no tiene límite propio: el código tiene 60 bits (32^12), inadivinable por fuerza bruta.

## 9. Decisiones y reglas vigentes

- **Reglas de pistas** (se calculan solo en el servidor, nunca en el navegador): 🔥 coincide tipo **y** generación; 🌡️ solo uno de los dos; ❄️ ninguno. "Coincide en tipo" = comparte al menos un tipo. Las formas regionales usan su propia generación y tipos.
- **Datos**: `data/pokemon.json` llega con 1083 entradas; **Basculin de Hisui** (`nombre_en = basculin-white-striped`) se excluye porque el brief lo deja fuera. Resultado: **1082** filas (1025 base + 57 regionales). El archivo JSON no se modificó; la exclusión vive en `EXCLUDED_POKEMON_NOMBRE_EN` de `lib/validation/pokemon.ts` y en el seed.
- **Identificadores**: `pokemon.id` (1 a 1082) es la clave del juego y sigue el orden del JSON. `pokemon.dex_number` es el número de la Pokédex y **se repite** en formas regionales (p. ej. Meowth 52 ×3, Tauros 128 ×4). Nunca usar `dex_number` como clave.
- **Buscador**: ignora mayúsculas, tildes, puntos, guiones, apóstrofes y símbolos (♀ ♂). Clave = minúsculas, sin tildes, solo `a-z0-9`. Una sola colisión conocida: Nidoran♀ y Nidoran♂ comparten clave `nidoran`; el buscador muestra ambos.
- **Rate limiting**: con Supabase (sección 8). Upstash solo si algún día no aguanta, y se justifica por escrito.
- **Salas**: hasta **10 abiertas a la vez** (regla en la base de datos, trigger `rooms_enforce_open_limit`). Una sala abierta con más de 24 horas se considera abandonada y no cuenta; el cierre automático llega en la Fase 3.
- **Códigos**: código de sala de 6 caracteres (público, va en el enlace `/sala/ABC234`). Código de admin de 12 caracteres (se muestra una sola vez, formato `ABCD-EFGH-JKMN`). Alfabeto de 32 caracteres sin I, O, 0, 1. El admin se reconoce por una cookie `ec_admin_<sala>` (httpOnly, sameSite lax, 12 horas) que guarda el código; el servidor lo compara contra el hash.
- **Admin sin login**: no hay Supabase Auth ni `profiles`. Quien crea la sala queda como admin en ese navegador; en otro dispositivo entra con el código en `/sala/<código>/admin`.
- **Sin usuarios en Supabase Auth**: no hay `profiles` ni roles en `user_metadata`.

## 10. Tablas cambiadas en esta entrega

| Objeto | Cambio |
|---|---|
| `public.pokemon` | nueva (1082 filas), RLS activo, sin políticas |
| `public.pokemon_names` | nueva vista (id, nombre_es, search_key) |
| `public.normalize_name(text)` | nueva función pura; ejecución solo para `service_role` y dueño |
| `public.rooms` | nueva, RLS activo, sin políticas; `service_role` solo SELECT e INSERT |
| `public.rate_limits` | nueva, RLS activo, sin políticas ni privilegios; solo la función `rate_limit_hit` |
| `public.rate_limit_hit(text,int,int)` | nueva, SECURITY DEFINER con `search_path` vacío; ejecutable solo por `service_role` |
| `public.rooms_enforce_open_limit()` + trigger | nuevos: máximo 10 salas abiertas |

Migraciones (14 dígitos para coincidir con el historial real del Supabase de pruebas): `20261101223300_create_pokemon.sql`, `20261102222755_create_rooms.sql`, `20261102225304_limit_open_rooms.sql`. Rollback documentado al final de cada archivo.

## 11. Excepciones de accesibilidad aceptadas

Ninguna.

## 12. Versiones de entrega

| Entrega | Versión |
|---|---|
| Diseño | ninguna (interfaz provisional) |
| Backend | backend-v0.3 |
| Contrato | contract-v0.3 |

Changelog:
- **backend-v0.3 / contract-v0.3**: Paso 3. Crear sala con Pokémon secreto y código de admin (solo hash), entrar como admin, botón Unirme, límite de intentos en Supabase, máximo 10 salas abiertas, Vitest (`npm test`) y `@supabase/supabase-js`. Afecta secciones 2, 3, 4, 6, 7, 8, 9 y 10.
- **backend-v0.2 / contract-v0.2**: Paso 2. Tabla `pokemon` (1082 filas), vista `pokemon_names`, función `normalize_name`, RLS y matriz de permisos con 63 pruebas pgTAP, esquema Zod `lib/validation/pokemon.ts`, seed. Contrato reconstruido (ver nota inicial).
- backend-v0.1 / contract-v0.1: Paso 1. Sitio base y `/api/health`.

## 13. Temporizadores y tope de 100 mensajes/s

**Pendiente.** Se escribe al cerrar la Fase 1, antes de pedir la confirmación de la Fase 2: (a) mecanismo de temporizadores sin procesos de servidor en Vercel (salto a 20 s, cierre a 5 min de sala vacía) y (b) manejo del tope de 100 mensajes por segundo de Realtime en Supabase Free.
