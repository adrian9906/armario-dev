# Armario Dev

Espacio compartido para transformar ideas en proyectos de software. Esta entrega cubre la etapa **0 · Fundaciones**: Next.js, shadcn/ui, autenticación con Clerk, esquema PostgreSQL en Supabase, RLS, pruebas base y CI.

## Stack y estructura

- Next.js 16, React 19, TypeScript y Tailwind CSS 4.
- shadcn/ui con Poppins y tema pastel; los formularios de Clerk usan el tema shadcn.
- Clerk para cuentas y sesiones; Supabase para PostgreSQL y Data API.
- `src/proxy.ts`: middleware de Clerk.
- `src/lib/supabase/server.ts`: cliente Supabase que transmite el token de Clerk.
- `supabase/migrations/20260917000100_foundations.sql`: esquema y políticas RLS.
- `.github/workflows/ci.yml`: lint, tipos, pruebas y build.

## Ejecutar

Requiere Node.js 22 y pnpm 11.19.0.

```bash
pnpm install
pnpm dev
```

El CLI de Clerk ya generó claves de desarrollo en `.env.local`. La URL y la clave publicable de Supabase están en `.env`. Ambos archivos están ignorados por Git. Para otra instalación, usa `.env.example` como guía y obtén claves propias. Nunca coloques `CLERK_SECRET_KEY` ni una clave de servicio de Supabase en variables `NEXT_PUBLIC_`.

## Conectar Clerk con Supabase

1. En el [panel de Clerk](https://dashboard.clerk.com/), activa la integración con Supabase para que sus tokens de sesión incluyan `role: authenticated`. La instancia creada por el CLI es de desarrollo y debe reclamarse con `clerk auth login` antes de usarla en producción.
2. Copia el dominio de Clerk que muestra esa integración. En el [panel de Supabase](https://supabase.com/dashboard), entra en **Authentication → Sign In / Providers → Third-Party Auth**, agrega Clerk y pega el dominio.
3. Aplica la migración con acceso administrativo: `supabase login`, `supabase link --project-ref <project-ref>` y `supabase db push`. La URL y la clave publicable de `.env` solo autorizan llamadas de la aplicación; no permiten modificar el esquema. También se puede ejecutar el SQL desde el SQL Editor del proyecto.
4. Inicia sesión en la app. El panel llama a `ensure_personal_workspace`: crea el perfil y el espacio personal del usuario de Clerk si aún no existen.

Para una base local con Docker, agrega `[auth.third_party.clerk]` y el dominio de tu instancia a `supabase/config.toml`, y usa `pnpm db:start`/`pnpm db:reset`.

## Seguridad y alcance

Las tablas `profiles`, `workspaces`, `workspace_memberships`, `ideas` y `projects` usan RLS. Los IDs de usuario son los `sub` de los JWT verificados de Clerk. Solo los miembros leen su espacio; owner/admin/editor pueden crear y editar ideas y proyectos. Las invitaciones y la gestión de membresías vendrán en etapas posteriores.

El panel muestra contadores reales cuando la migración y la integración están activas. Las acciones de ideas y proyectos siguen deshabilitadas hasta la próxima etapa. El esquema anterior de la app no llegó a aplicarse al proyecto remoto; si ya se crearon cuentas con Supabase Auth, habrá que migrarlas a Clerk por separado.

## Verificación

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

GitHub Actions ejecuta estas comprobaciones en push y pull request.
