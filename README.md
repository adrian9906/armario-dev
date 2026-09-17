# Armario Dev

Armario Dev es un espacio compartido para transformar ideas en proyectos de software. Esta entrega implementa la etapa **0 · Fundaciones** del roadmap: base técnica, sistema visual, esquema inicial, autenticación y CI. El CRUD de ideas y proyectos, tareas, diagramas y colaboración se desarrolla en las etapas siguientes.

## Stack

- Next.js 16 (App Router), React 19, TypeScript y Tailwind CSS 4.
- shadcn/ui (base-nova) para la interfaz, con Poppins y la paleta del prototipo.
- Supabase Auth y PostgreSQL con Row Level Security (RLS).
- Vitest para las pruebas base y GitHub Actions para CI.

## Ejecutar la aplicación

Requiere Node.js 22 y pnpm 11.19.0.

```bash
pnpm install
Copy-Item .env.example .env.local
pnpm dev
```

Abre `http://localhost:3000`. La página principal funciona sin Supabase. El registro y el panel muestran un estado de configuración hasta que se agreguen las variables públicas.

En `.env.local`, configura:

```text
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Usa la **clave publicable** (o la anon key si tu proyecto aún la utiliza). Nunca pongas una service role key en variables `NEXT_PUBLIC_` ni la subas a Git. `.env.local` está ignorado.

## Preparar Supabase

1. Crea un proyecto de Supabase y copia su URL y clave publicable a `.env.local`.
2. En Auth → URL Configuration, configura la URL de desarrollo y agrega `http://localhost:3000/auth/confirm` como redirect permitido. Agrega la URL correspondiente del despliegue cuando exista.
3. Revisa `supabase/migrations/20260917000100_foundations.sql`. Aplica la migración con Supabase CLI (`pnpm exec supabase login`, `pnpm exec supabase link --project-ref <project-ref>`, `pnpm db:push`) o desde el SQL Editor del proyecto. El CLI solicitará la contraseña de la base si hace falta.
4. Para pruebas locales de la base necesitas Docker: `pnpm db:start` y `pnpm db:reset`. La migración remota sigue pendiente hasta que el CLI tenga acceso administrativo al proyecto.

La URL y la clave publicable conectan la aplicación, pero no autorizan cambios en el esquema. Para aplicar migraciones al proyecto remoto, inicia sesión en el CLI de Supabase o usa una conexión administrativa a PostgreSQL. La migración inicial también prepara perfiles y espacios para cuentas creadas antes de aplicarla.

El registro crea automáticamente un perfil y un espacio personal mediante triggers. Las tablas `profiles`, `workspaces`, `workspace_memberships`, `ideas` y `projects` tienen RLS. Solo los miembros leen un espacio; los roles owner/admin/editor pueden crear y editar ideas y proyectos. La gestión de invitaciones y membresías se incorporará con RPC auditadas en la etapa correspondiente.

## Comprobaciones

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

GitHub Actions ejecuta esas cuatro comprobaciones en cada push y pull request.

## Estructura

- `src/app`: páginas pública, registro, inicio de sesión, confirmación y panel.
- `src/components/ui`: componentes shadcn/ui generados con CLI.
- `src/lib/supabase` y `src/proxy.ts`: clientes SSR y renovación de sesión.
- `supabase/migrations`: esquema PostgreSQL y políticas RLS versionadas.
- `.github/workflows/ci.yml`: comprobaciones de integración continua.

## Próxima etapa

Captura de ideas, conversión a proyecto y primeros flujos de colaboración. El panel actual enseña los contadores reales cuando Supabase está conectado y mantiene deshabilitadas las acciones aún no implementadas.
