# Armario Dev

Un taller compartido para guardar ideas de software y hacerlas crecer. La entrega actual cubre **0 · Fundaciones**, **1 · Espacios e ideas**, **2 · Proyecto ejecutable** y la primera entrega de **3 · Documentación** del roadmap.

## Stack

- Next.js 16, React 19, TypeScript, Tailwind CSS 4 y shadcn/ui.
- Clerk para cuentas, sesiones y correo de invitación.
- Supabase PostgreSQL para espacios, roles, ideas, proyectos, requisitos y tareas. El cliente de datos usa el JWT de Clerk y políticas RLS.
- Interfaz en español con Instrument Sans, Manrope y tarjetas pastel.

## Funciones de la fase 1

- Espacio personal privado al iniciar sesión; creación de espacios adicionales y cambio de espacio.
- Cuatro roles: propietario, administrador, editor y lector. Propietario y administrador gestionan personas; editor crea y modifica ideas; lector consulta.
- Invitación por correo con rol, expiración de siete días y revocación. La aceptación exige iniciar sesión con el correo verificado que recibió la invitación. Una invitación no concede acceso hasta aceptarse.
- Creación, edición, búsqueda por título/notas/etiquetas, filtros y archivo recuperable de ideas. La búsqueda muestra hasta 200 resultados por consulta.

## Funciones de la fase 2

- Conversión única de una idea activa en proyecto. Una transacción conserva una copia de las notas, autoría y fecha originales y evita duplicados incluso con envíos concurrentes.
- Definición de tipo, etapa, objetivo y módulos de frontend, backend, base de datos y autenticación. Los módulos se pueden cambiar mientras el proyecto crece.
- Requisitos funcionales y no funcionales con prioridad, criterios de aceptación, comentarios, orden manual, archivo y cobertura calculada según tareas vinculadas.
- Tareas con responsable del espacio, prioridad, rango de fechas, estados, orden, archivo, checklist, comentarios y vínculo a requisitos. El checklist inicial se guarda en la misma transacción que la tarea y sus pasos se pueden marcar o desmarcar después. Lista y tablero con cambios de estado.
- Los roles del espacio se aplican también a los proyectos: lectores consultan; propietarios, administradores y editores modifican. Las relaciones de base de datos impiden vincular registros de proyectos o espacios diferentes.

## Funciones de la fase 3

- Stack tecnológico por categoría y estado: candidata, elegida o descartada, con versión y motivo.
- Decisiones de arquitectura en formato ADR con contexto, elección, consecuencias, estado, autor y fecha.
- Diagramas editables con Mermaid y plantillas de flujo, contexto C4, contenedores y modelo de datos, además de vista previa y archivo recuperable.
- Exportación Markdown del objetivo, stack, ADR, diagramas, requisitos y tareas del proyecto.
- Lectura para todos los miembros del espacio y escritura para propietarios, administradores y editores, validada en acciones del servidor y políticas RLS.

## Preparar el entorno

Requiere Node.js 22 y pnpm 11.19.0.

```bash
pnpm install
pnpm dev
```

Usa `.env.example` como guía. Las claves locales de Clerk y Supabase están en `.env` o `.env.local`, ignorados por Git. `SUPABASE_SERVICE_ROLE_KEY` es **solo de servidor** y se usa exclusivamente en los flujos de invitación y gestión de roles. Nunca la publiques con el prefijo `NEXT_PUBLIC_`. En otra instalación debes configurarla en el servidor de despliegue. Define `NEXT_PUBLIC_APP_URL` con la URL pública para que los correos de Clerk lleven al destino correcto.

## Clerk y Supabase

El proyecto local está vinculado a la instancia de desarrollo de Clerk. Sus tokens incluyen `role: authenticated`; el proyecto Supabase `bzjvactaprvxpksazjka` registra el dominio `relieved-dragon-405.clerk.accounts.dev` como proveedor externo. En otro entorno, configura la integración nativa de Clerk con Supabase y registra el dominio de la nueva instancia.

Las migraciones están en `supabase/migrations`. Las primeras cuatro cubren fundaciones, espacios e ideas, el proyecto ejecutable y el orden de requisitos. La quinta añade la fecha de inicio de tareas; la sexta permite crear una tarea con su checklist inicial en una transacción; la séptima añade stack, ADR y diagramas. Todas están aplicadas al proyecto enlazado. Para instalar en otro proyecto, enlázalo con `supabase link --project-ref <ref>` y aplica `pnpm db:push`.

La clave de servicio permite a las acciones del servidor crear y aceptar invitaciones en transacciones. Las funciones de base de datos correspondientes solo conceden `EXECUTE` a `service_role`, y vuelven a comprobar el rol, el correo verificado, el estado y el vencimiento. El resto de lecturas y escrituras usa la clave publicable y RLS.

## Comprobaciones

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

GitHub Actions ejecuta estas comprobaciones en push y pull request. Para probar el flujo completo de invitación hacen falta dos cuentas de Clerk con correos distintos.
