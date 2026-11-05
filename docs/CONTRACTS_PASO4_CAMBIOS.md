# Cambios al contrato — Paso 4 (contract-v0.4 · backend-v0.4)

No reemplaza tu `docs/CONTRACTS.md` vigente (v0.3). Son las filas a agregar o cambiar.
Cuando lo pegues en el chat de CONTRACTS, dile que lo fusione y suba la versión.

## Versiones
- contract-v0.4 · backend-v0.4 · diseño: ninguna entrega (interfaz provisional)

## Stack
- Sin dependencias nuevas en este paso. `@supabase/ssr` y TanStack Query siguen sin instalarse.
- La lista de jugadores usa un sondeo propio y mínimo (`PlayerLobby`). TanStack Query llega en la Fase 2, cuando haya más datos de servidor en el cliente.

## Variables de entorno
- Sin cambios.

## Mapa "nombre en diseño → archivo en código"
| Nombre | Archivo | Estado |
|---|---|---|
| Entrada con apodo | `components/PlayerForms.tsx` (JoinNicknameForm) | provisional |
| Sala del jugador (lista de jugadores) | `components/PlayerForms.tsx` (PlayerLobby) | provisional |
| Pantalla de sala (jugadores) | `app/sala/[roomCode]/page.tsx` (ahora muestra: entrar / sala / no disponible / sin conexión) | provisional |
| Acción de entrada | `app/actions/players.ts` (joinRoomAction) | definitivo |
| Servicio de jugadores | `services/players.service.ts` | definitivo |
| Validación de apodo | `lib/validation/players.ts` | definitivo |
| Sesión del jugador | `lib/player-session.ts` | definitivo |
| Lista de jugadores (API) | `app/api/rooms/[roomCode]/players/route.ts` | definitivo |

## Reglas técnicas
- Apodo: 2 a 20 caracteres. Se permiten A-Z, a-z, 0-9, tildes españolas (áéíóúüñ y mayúsculas), espacio, punto, guion y guion bajo. Se recortan los bordes y se juntan espacios repetidos. Debe tener al menos 2 letras o números. Sin emojis (limitación deliberada: TypeScript y la base normalizan igual solo con estos caracteres).
- Duplicados: "Ana", "ANÁ" y "ana" son el mismo apodo dentro de una sala. La base manda (`players.nickname_key`, generado con `normalize_name`).
- Cookie de jugador: `ec_player_<sala>`, httpOnly, secure en producción, sameSite lax, 12 horas. Valor: token aleatorio de 43 caracteres. La base guarda solo `sha256("player:<sala>:<token>")`.
- Mismo dispositivo que vuelve a entrar: conserva su apodo original (no crea un segundo jugador).
- Tope de 100 jugadores y "sala abierta": los exige el trigger `players_enforce_room_rules`.

## Códigos de error
| HTTP | Código | Estado |
|---|---|---|
| 400 | VALIDATION_ERROR | en uso |
| 401 | UNAUTHENTICATED | en uso (lista de jugadores) |
| 404 | NOT_FOUND | en uso |
| 409 | NICKNAME_TAKEN | en uso (nuevo) |
| 409 | ROOM_CLOSED | en uso (nuevo) |
| 409 | ROOM_FULL | en uso (nuevo) |
| 409 | CONFLICT | en uso (unicidad de sesión, caso raro) |

## Límites de intentos
| Endpoint | Tipo | Límite | Clave |
|---|---|---|---|
| joinRoomAction | Server Action | 60 por 10 minutos | hash de IP + sala |
| GET /api/rooms/[roomCode]/players | Route Handler | sin límite propio | exige cookie secreta de jugador o de admin; sin cookie responde 401 sin tocar la base |

Riesgo conocido: 60 por IP y sala puede bloquear una sala llena si más de 60 personas entran desde una misma red en 10 minutos. Revisar en la prueba de carga.

## Endpoints
| Ruta | Tipo | Notas |
|---|---|---|
| GET /api/rooms/[roomCode]/players | Route Handler | `{ data: { players: [{ nickname }], count, max }, error: null }`. Estados: 200, 400, 401, 404, 409, 500, 503. Solo apodos. Nunca el hash de sesión. |
| GET /api/health | Route Handler | Ahora consulta Supabase con la clave de servidor. Si la clave no fuera `service_role` (p. ej. fuera la `anon`) devuelve 503. 200 / 500 (entorno) / 503 (base). Sin detalles internos. Sirve también contra la pausa de Supabase Free. |

## Matriz de permisos (agregar)
| role | table | SELECT | INSERT | UPDATE | DELETE | policy name |
|---|---|---|---|---|---|---|
| anon | `players` | ✗ | ✗ | ✗ | ✗ | ninguna (RLS activo sin políticas) |
| authenticated | `players` | ✗ | ✗ | ✗ | ✗ | ninguna (RLS activo sin políticas) |
| service_role | `players` | ✓ | ✓ | ✗ (llega en las Fases 2 y 3) | ✗ (llega en las Fases 2 y 3) | n/a (omite RLS; privilegios SELECT e INSERT) |

Pruebas: `supabase/tests/players_rls.test.sql` (20 pruebas pgTAP).

## Tablas cambiadas en esta entrega
| Objeto | Cambio |
|---|---|
| `public.players` | nueva. RLS activo, sin políticas. Apodo, `nickname_key` generado, hash de sesión. |
| `public.players_enforce_room_rules()` + trigger | nuevo. Sala abierta y máximo 100 jugadores. Errores: `P0001` (sala cerrada), `53400` (sala llena). |

Migración: `supabase/migrations/20261105002410_create_players.sql`, con rollback documentado.

## Verificación
- Aplicada y revisada en el Supabase de pruebas (RLS, 0 políticas, solo SELECT/INSERT para service_role, trigger).
- 47 pruebas de código pasan con un sustituto local de Vitest y `zod/v4`: no son Vitest real ni el Zod 4 del proyecto.
- `tsc` estricto pasa sobre lib/, services/ y las pruebas, con declaraciones de reemplazo para supabase-js y vitest.
- NO ejecutado: `supabase test db` (20 pruebas pgTAP), `npm test` real, `next lint`, `next build`, `tsc` sobre app/ y components/.

## Pendientes (actualizar)
- Hecho: `/api/health` toca Supabase.
- Sigue: dar UPDATE a `rooms` en el Paso 6, CSP con Realtime, generar tipos de Supabase, cierre automático de salas, y fijar la versión de Node.
- Sección 13 (temporizadores y tope de 100 mensajes/s): el borrador sigue en el chat; se cierra antes de pedir la Fase 2.

## Changelog
- backend-v0.4 / contract-v0.4: Paso 4. Tabla `players` con RLS y trigger de sala, entrada de jugador con apodo, cookie de jugador, lista de jugadores por sondeo, `/api/health` con consulta a la base.
