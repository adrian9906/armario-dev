# Armario Dev

Un taller compartido para guardar ideas de software y hacerlas crecer. La entrega actual cubre **0 · Fundaciones** y **1 · Espacios e ideas** del roadmap.

## Stack

- Next.js 16, React 19, TypeScript, Tailwind CSS 4 y shadcn/ui.
- Clerk para cuentas, sesiones y correo de invitación.
- Supabase PostgreSQL para espacios, roles, ideas e invitaciones. El cliente de datos usa el JWT de Clerk y políticas RLS.
- Interfaz en español con Poppins y tarjetas pastel.

## Funciones de la fase 1

- Espacio personal privado al iniciar sesión; creación de espacios adicionales y cambio de espacio.
- Cuatro roles: propietario, administrador, editor y lector. Propietario y administrador gestionan personas; editor crea y modifica ideas; lector consulta.
- Invitación por correo con rol, expiración de siete días y revocación. La aceptación exige iniciar sesión con el correo verificado que recibió la invitación. Una invitación no concede acceso hasta aceptarse.
- Creación, edición, búsqueda por título/notas/etiquetas, filtros y archivo recuperable de ideas. La búsqueda muestra hasta 200 resultados por consulta.
- La sección de proyectos se desarrolla en la fase 2.

## Preparar el entorno

Requiere Node.js 22 y pnpm 11.19.0.

```bash
pnpm install
pnpm dev
```

Usa `.env.example` como guía. Las claves locales de Clerk y Supabase están en `.env` o `.env.local`, ignorados por Git. `SUPABASE_SERVICE_ROLE_KEY` es **solo de servidor** y se usa exclusivamente en los flujos de invitación y gestión de roles. Nunca la publiques con el prefijo `NEXT_PUBLIC_`. En otra instalación debes configurarla en el servidor de despliegue. Define `NEXT_PUBLIC_APP_URL` con la URL pública para que los correos de Clerk lleven al destino correcto.

## Clerk y Supabase

El proyecto local está vinculado a la instancia de desarrollo de Clerk. Sus tokens incluyen `role: authenticated`; el proyecto Supabase `bzjvactaprvxpksazjka` registra el dominio `relieved-dragon-405.clerk.accounts.dev` como proveedor externo. En otro entorno, configura la integración nativa de Clerk con Supabase y registra el dominio de la nueva instancia.

Las migraciones están en `supabase/migrations`. La primera crea perfiles, espacios, roles, ideas y proyectos. La segunda añade invitaciones, gestión de miembros y búsqueda. Para instalar en otro proyecto, enlázalo con `supabase link --project-ref <ref>` y aplica `pnpm db:push`.

La clave de servicio permite a las acciones del servidor crear y aceptar invitaciones en transacciones. Las funciones de base de datos correspondientes solo conceden `EXECUTE` a `service_role`, y vuelven a comprobar el rol, el correo verificado, el estado y el vencimiento. El resto de lecturas y escrituras usa la clave publicable y RLS.

## Comprobaciones

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

GitHub Actions ejecuta estas comprobaciones en push y pull request. Para probar el flujo completo de invitación hacen falta dos cuentas de Clerk con correos distintos.
