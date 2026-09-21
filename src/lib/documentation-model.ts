export const technologyCategories = [
  { value: "frontend", label: "Frontend y frameworks" },
  { value: "backend", label: "Backend y frameworks" },
  { value: "database", label: "Base de datos" },
  { value: "auth", label: "Autenticación" },
  { value: "infrastructure", label: "Infraestructura" },
  { value: "testing", label: "Pruebas" },
  { value: "devops", label: "DevOps" },
  { value: "other", label: "Lenguajes y otras" },
] as const;

export type TechnologyCategory = (typeof technologyCategories)[number]["value"];

export type TechnologyCatalogItem = {
  key: string;
  name: string;
  category: TechnologyCategory;
  icon: string;
};

const svgl = (file: string) => `https://svgl.app/library/${file}`;

/**
 * Catálogo local para que el formulario no dependa de la API de SVGL al abrirse.
 * Los nombres y las categorías son los valores canónicos guardados en Supabase.
 */
export const technologyCatalog = [
  { key: "react", name: "React", category: "frontend", icon: svgl("react_light.svg") },
  { key: "nextjs", name: "Next.js", category: "frontend", icon: svgl("nextjs_icon_dark.svg") },
  { key: "vue", name: "Vue", category: "frontend", icon: svgl("vue.svg") },
  { key: "nuxt", name: "Nuxt", category: "frontend", icon: svgl("nuxt.svg") },
  { key: "angular", name: "Angular", category: "frontend", icon: svgl("angular.svg") },
  { key: "svelte", name: "Svelte", category: "frontend", icon: svgl("svelte.svg") },
  { key: "astro", name: "Astro", category: "frontend", icon: svgl("astro-icon-dark.svg") },
  { key: "tailwindcss", name: "Tailwind CSS", category: "frontend", icon: svgl("tailwindcss.svg") },
  { key: "shadcn-ui", name: "shadcn/ui", category: "frontend", icon: svgl("shadcn-ui.svg") },
  { key: "vite", name: "Vite", category: "frontend", icon: svgl("vitejs.svg") },

  { key: "nodejs", name: "Node.js", category: "backend", icon: svgl("nodejs.svg") },
  { key: "nestjs", name: "NestJS", category: "backend", icon: svgl("nestjs.svg") },
  { key: "express", name: "Express", category: "backend", icon: svgl("expressjs_dark.svg") },
  { key: "fastapi", name: "FastAPI", category: "backend", icon: svgl("fastapi.svg") },
  { key: "django", name: "Django", category: "backend", icon: svgl("django.svg") },
  { key: "laravel", name: "Laravel", category: "backend", icon: svgl("laravel.svg") },
  { key: "spring", name: "Spring", category: "backend", icon: svgl("spring.svg") },
  { key: "bun", name: "Bun", category: "backend", icon: svgl("bun.svg") },
  { key: "deno", name: "Deno", category: "backend", icon: svgl("deno.svg") },
  { key: "go", name: "Go", category: "backend", icon: svgl("golang.svg") },

  { key: "postgresql", name: "PostgreSQL", category: "database", icon: svgl("postgresql.svg") },
  { key: "mysql", name: "MySQL", category: "database", icon: svgl("mysql.svg") },
  { key: "mongodb", name: "MongoDB", category: "database", icon: svgl("mongodb.svg") },
  { key: "redis", name: "Redis", category: "database", icon: svgl("redis.svg") },
  { key: "supabase", name: "Supabase", category: "database", icon: svgl("supabase.svg") },
  { key: "firebase", name: "Firebase", category: "database", icon: svgl("firebase.svg") },
  { key: "neon", name: "Neon", category: "database", icon: svgl("neon.svg") },
  { key: "planetscale", name: "PlanetScale", category: "database", icon: svgl("planetscale.svg") },
  { key: "sqlite", name: "SQLite", category: "database", icon: svgl("sqlite.svg") },

  { key: "clerk", name: "Clerk", category: "auth", icon: svgl("clerk.svg") },
  { key: "auth0", name: "Auth0", category: "auth", icon: svgl("auth0.svg") },
  { key: "better-auth", name: "Better Auth", category: "auth", icon: svgl("better-auth_light.svg") },
  { key: "keycloak", name: "Keycloak", category: "auth", icon: svgl("keycloak.svg") },

  { key: "vercel", name: "Vercel", category: "infrastructure", icon: svgl("vercel_dark.svg") },
  { key: "aws", name: "AWS", category: "infrastructure", icon: svgl("aws_dark.svg") },
  { key: "google-cloud", name: "Google Cloud", category: "infrastructure", icon: svgl("google-cloud.svg") },
  { key: "azure", name: "Azure", category: "infrastructure", icon: svgl("azure.svg") },
  { key: "cloudflare", name: "Cloudflare", category: "infrastructure", icon: svgl("cloudflare.svg") },
  { key: "docker", name: "Docker", category: "infrastructure", icon: svgl("docker.svg") },
  { key: "kubernetes", name: "Kubernetes", category: "infrastructure", icon: svgl("kubernetes.svg") },
  { key: "railway", name: "Railway", category: "infrastructure", icon: svgl("railway_dark.svg") },
  { key: "render", name: "Render", category: "infrastructure", icon: svgl("render.svg") },
  { key: "netlify", name: "Netlify", category: "infrastructure", icon: svgl("netlify.svg") },

  { key: "vitest", name: "Vitest", category: "testing", icon: svgl("vitest.svg") },
  { key: "jest", name: "Jest", category: "testing", icon: svgl("jest.svg") },
  { key: "playwright", name: "Playwright", category: "testing", icon: svgl("playwright.svg") },
  { key: "cypress", name: "Cypress", category: "testing", icon: svgl("cypress.svg") },
  { key: "storybook", name: "Storybook", category: "testing", icon: svgl("storybook.svg") },

  { key: "github", name: "GitHub", category: "devops", icon: svgl("github_dark.svg") },
  { key: "gitlab", name: "GitLab", category: "devops", icon: svgl("gitlab.svg") },
  { key: "jenkins", name: "Jenkins", category: "devops", icon: svgl("jenkins.svg") },
  { key: "circleci", name: "CircleCI", category: "devops", icon: svgl("circleci.svg") },
  { key: "terraform", name: "Terraform", category: "devops", icon: svgl("terraform.svg") },
  { key: "sentry", name: "Sentry", category: "devops", icon: svgl("sentry.svg") },
  { key: "grafana", name: "Grafana", category: "devops", icon: svgl("grafana.svg") },

  { key: "typescript", name: "TypeScript", category: "other", icon: svgl("typescript.svg") },
  { key: "javascript", name: "JavaScript", category: "other", icon: svgl("javascript.svg") },
  { key: "python", name: "Python", category: "other", icon: svgl("python.svg") },
  { key: "rust", name: "Rust", category: "other", icon: svgl("rust.svg") },
  { key: "java", name: "Java", category: "other", icon: svgl("java.svg") },
  { key: "kotlin", name: "Kotlin", category: "other", icon: svgl("kotlin.svg") },
  { key: "swift", name: "Swift", category: "other", icon: svgl("swift.svg") },
  { key: "dart", name: "Dart", category: "other", icon: svgl("dart.svg") },
  { key: "graphql", name: "GraphQL", category: "other", icon: svgl("graphql.svg") },
] as const satisfies readonly TechnologyCatalogItem[];

export function technologyByKey(key: string) {
  return technologyCatalog.find((technology) => technology.key === key);
}

export function technologyByName(name: string) {
  return technologyCatalog.find((technology) => technology.name.toLocaleLowerCase() === name.toLocaleLowerCase());
}

export const technologyStatuses = [
  { value: "candidate", label: "Candidata" },
  { value: "selected", label: "Elegida" },
  { value: "rejected", label: "Descartada" },
] as const;

export const decisionStatuses = [
  { value: "proposed", label: "Propuesta" },
  { value: "accepted", label: "Aceptada" },
  { value: "rejected", label: "Descartada" },
  { value: "superseded", label: "Reemplazada" },
] as const;

export const diagramKinds = [
  { value: "flow", label: "Flujo" },
  { value: "context", label: "Contexto C4" },
  { value: "container", label: "Contenedores" },
  { value: "data_model", label: "Modelo de datos" },
] as const;

export const diagramTemplates: Record<(typeof diagramKinds)[number]["value"], string> = {
  flow: `flowchart LR
    idea[Idea] --> definition[Definición]
    definition --> planning[Planificación]
    planning --> development[Desarrollo]
    development --> published[Publicado]`,
  context: `flowchart LR
    user[Persona usuaria]
    system[Armario Dev]
    auth[Proveedor de identidad]
    user -->|Organiza proyectos| system
    system -->|Autentica| auth`,
  container: `flowchart TB
    browser[Navegador]
    web[Aplicación web]
    database[(Base de datos)]
    browser -->|HTTPS| web
    web -->|Consultas seguras| database`,
  data_model: `erDiagram
    PROJECT ||--o{ TASK : contiene
    PROJECT ||--o{ REQUIREMENT : define
    REQUIREMENT }o--o{ TASK : cubre`,
};

export function optionLabel(options: readonly { value: string; label: string }[], value: string) {
  return options.find((option) => option.value === value)?.label ?? value;
}
