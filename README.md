# Armario Dev

Espacio compartido para transformar ideas en proyectos de software. Esta entrega cubre la etapa **0 · Fundaciones**: Next.js, shadcn/ui, autenticación con Clerk, esquema PostgreSQL en Supabase, RLS, pruebas base y CI.

## Tecnologías y estructura

- Next.js 16, React 19, TypeScript y Tailwind CSS 4.
- shadcn/ui con Poppins y tema pastel; los formularios de Clerk usan el tema shadcn y textos en español.
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

Las claves de desarrollo de Clerk están en `.env.local`; la URL y la clave publicable de Supabase están en `.env`. Ambos archivos están ignorados por Git. Para otra instalación, usa `.env.example` como guía y obtén claves propias. Nunca coloques `CLERK_SECRET_KEY` ni una clave de servicio de Supabase en variables `NEXT_PUBLIC_`.

## Conectar Clerk con Supabase

1. El proyecto `armario-dev` está vinculado a la instancia de desarrollo de Clerk. Sus tokens de sesión ya incluyen `role: authenticated`.
2. Clerk ya está registrado como proveedor externo en el [proyecto Supabase](https://supabase.com/dashboard/project/bzjvactaprvxpksazjka), con el dominio `relieved-dragon-405.clerk.accounts.dev`. Supabase confirmó que resolvió las claves públicas de la instancia. Para otras instalaciones, agrégalo en **Autenticación → Métodos de inicio de sesión / Proveedores → Autenticación de terceros**. Esta configuración remota se gestiona por separado de `supabase config push`.
3. La migración `20260917000100_foundations.sql` ya está aplicada al proyecto Supabase `bzjvactaprvxpksazjka`. Para otras instalaciones, usa `supabase login`, `supabase link --project-ref <project-ref>` y `supabase db push`.
4. Inicia sesión en la app. El panel llama a `ensure_personal_workspace`: crea el perfil y el espacio personal del usuario de Clerk si aún no existen.

Para una base local con Docker, `supabase/config.toml` ya contiene el dominio de la instancia de desarrollo. Cambia el dominio si usas otra instancia, y ejecuta `pnpm db:start`/`pnpm db:reset`.

## Seguridad y alcance

Las tablas `profiles`, `workspaces`, `workspace_memberships`, `ideas` y `projects` usan RLS. Los IDs de usuario son los `sub` de los JWT verificados de Clerk. Solo los miembros leen su espacio; owner/admin/editor pueden crear y editar ideas y proyectos. Las invitaciones y la gestión de membresías vendrán en etapas posteriores.

El panel muestra contadores reales cuando la integración remota de Clerk está activa. Las acciones de ideas y proyectos siguen deshabilitadas hasta la próxima etapa. El esquema anterior de la app no llegó a aplicarse al proyecto remoto; si ya se crearon cuentas con Supabase Auth, habrá que migrarlas a Clerk por separado.

## Verificación

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

GitHub Actions ejecuta estas comprobaciones en push y pull request.
