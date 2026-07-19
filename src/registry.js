/**
 * The template catalogue.
 *
 * Hierarchy mirrors the folder layout on disk:
 *   stacks/<category>/<language>/<framework>
 *
 * `fullstack` is not a folder — it is composed at scaffold time from a
 * backend template plus a frontend template dropped into `client/`.
 */

export const CATEGORIES = [
  {
    id: 'backend',
    label: 'Backend / API',
    hint: 'REST service, no UI',
  },
  {
    id: 'frontend',
    label: 'Frontend / Web',
    hint: 'Single-page app',
  },
  {
    id: 'fullstack',
    label: 'Fullstack',
    hint: 'Backend at root + frontend in client/',
    composed: true,
  },
  {
    id: 'gui',
    label: 'Desktop GUI',
    hint: 'Native windowed app',
  },
  {
    id: 'mobile',
    label: 'Mobile',
    hint: 'Android / iOS',
  },
  {
    id: 'cli',
    label: 'CLI tool',
    hint: 'Terminal application',
  },
  {
    id: 'datascience',
    label: 'Data science / ML',
    hint: 'Notebooks, models, pipelines',
  },
];

/**
 * Every leaf template. `dir` is relative to templates/.
 *
 * vars: extra prompts a template needs beyond the project name.
 * post: human-readable next steps printed after scaffolding.
 */
export const TEMPLATES = [
  // ---------------------------------------------------------------- backend
  {
    category: 'backend',
    language: 'javascript',
    languageLabel: 'JavaScript',
    framework: 'express',
    frameworkLabel: 'Express (any database)',
    dir: 'backend/javascript/express',
    hint: 'Layered REST API, Joi validation, JWT, Winston, Mocha',
    vars: ['port'],
    // Offers the storage picker, and its deps/env/compose are generated from it.
    storage: true,
    installer: 'npm',
    env: (v) => ({
      NODE_ENV: 'development',
      PORT: v.port,
      JWT_EXPIRES_IN: '1h',
      CORS_ORIGIN: `http://localhost:${v.clientPort}`,
      LOG_LEVEL: 'debug',
    }),
    post: ['npm run dev'],
  },
  {
    category: 'backend',
    language: 'javascript',
    languageLabel: 'JavaScript',
    framework: 'fastify',
    frameworkLabel: 'Fastify 4 (any database)',
    dir: 'backend/javascript/fastify',
    hint: 'Schema-first REST API, JSON Schema validation, JWT, node:test',
    vars: ['port'],
    // Fastify reuses Express's storage seam verbatim — same six adapters, same
    // repository interface — so it takes the same --database choice.
    storage: true,
    installer: 'npm',
    env: (v) => ({
      NODE_ENV: 'development',
      PORT: v.port,
      JWT_EXPIRES_IN: '1h',
      CORS_ORIGIN: `http://localhost:${v.clientPort}`,
      LOG_LEVEL: 'debug',
    }),
    post: ['npm run dev'],
  },
  {
    category: 'backend',
    language: 'java',
    languageLabel: 'Java',
    framework: 'spring-boot',
    frameworkLabel: 'Spring Boot 3 (JPA + Flyway + JWT)',
    dir: 'backend/java/spring-boot',
    hint: 'Feature-packaged REST API, Lombok, MapStruct, Testcontainers-ready',
    vars: ['javaPackage', 'port'],
    installer: 'maven',
    post: ['./mvnw spring-boot:run'],
  },
  {
    category: 'backend',
    language: 'python',
    languageLabel: 'Python',
    framework: 'fastapi',
    frameworkLabel: 'FastAPI + SQLAlchemy + Alembic',
    dir: 'backend/python/fastapi',
    hint: 'Async REST API, Pydantic settings, pytest',
    vars: ['port'],
    installer: 'python',
    // The venv is created here, not assumed. lattice does not auto-install for
    // Python — it deliberately refuses to guess at someone's toolchain — so a step
    // that activates a .venv nobody made sends the user straight into
    // "no such file or directory". These match the template's README line for line.
    post: [
      'python -m venv .venv && source .venv/bin/activate',
      'pip install -r requirements-dev.txt',
      'uvicorn app.main:app --reload',
    ],
  },

  // --------------------------------------------------------------- frontend
  {
    category: 'frontend',
    language: 'javascript',
    languageLabel: 'JavaScript',
    framework: 'react-vite',
    frameworkLabel: 'React 18 + Vite',
    dir: 'frontend/javascript/react-vite',
    hint: 'react-router, feature folders, API client, .env proxy',
    installer: 'npm',
    post: ['npm run dev'],
  },
  {
    category: 'frontend',
    language: 'typescript',
    languageLabel: 'TypeScript',
    framework: 'react-vite-ts',
    frameworkLabel: 'React 18 + Vite (TypeScript)',
    dir: 'frontend/typescript/react-vite-ts',
    hint: 'Same layout, typed API client and routes',
    installer: 'npm',
    post: ['npm run dev'],
  },

  // -------------------------------------------------------------------- gui
  {
    category: 'gui',
    language: 'java',
    languageLabel: 'Java',
    framework: 'javafx',
    frameworkLabel: 'JavaFX 21 (Maven, MVC + FXML)',
    dir: 'gui/java/javafx',
    hint: 'MVC + service + DAL layering, FXML views',
    vars: ['javaPackage'],
    installer: 'maven',
    post: ['./mvnw javafx:run'],
  },

  // ----------------------------------------------------------------- mobile
  {
    category: 'mobile',
    language: 'kotlin',
    languageLabel: 'Kotlin',
    framework: 'android-compose',
    frameworkLabel: 'Android + Jetpack Compose + Retrofit',
    dir: 'mobile/kotlin/android-compose',
    hint: 'Material3, Navigation, Retrofit, version catalog',
    vars: ['javaPackage'],
    post: ['gradle wrapper   # once, or let Android Studio do it', './gradlew assembleDebug'],
  },

  // -------------------------------------------------------------------- cli
  {
    category: 'cli',
    language: 'javascript',
    languageLabel: 'JavaScript',
    framework: 'node-cli',
    frameworkLabel: 'Node.js CLI (zero-dependency)',
    dir: 'cli/javascript/node-cli',
    hint: 'Arg parsing, subcommands, colours, no deps',
    installer: 'npm',
    post: ['npm link', 'npm test'],
  },

  // ------------------------------------------------------------ datascience
  {
    category: 'datascience',
    language: 'python',
    languageLabel: 'Python',
    framework: 'ml-project',
    frameworkLabel: 'Notebook + src/ ML project',
    dir: 'datascience/python/ml-project',
    hint: 'data/ src/ notebooks/ models/, reproducible env',
    installer: 'python',
    post: [
      'python -m venv .venv && source .venv/bin/activate',
      'pip install -r requirements-dev.txt',
      'jupyter lab',
    ],
  },
];

/** Templates that can act as the backend half of a fullstack project. */
export const FULLSTACK_BACKENDS = ['express', 'spring-boot', 'fastapi'];

/** Templates that can act as the frontend half (dropped into client/). */
export const FULLSTACK_FRONTENDS = ['react-vite', 'react-vite-ts'];

export function templatesFor(category) {
  return TEMPLATES.filter((t) => t.category === category);
}

export function languagesFor(category) {
  const seen = new Map();
  for (const t of templatesFor(category)) {
    if (!seen.has(t.language)) {
      seen.set(t.language, { id: t.language, label: t.languageLabel });
    }
  }
  return [...seen.values()];
}

export function frameworksFor(category, language) {
  return templatesFor(category).filter((t) => t.language === language);
}

export function findTemplate(framework) {
  return TEMPLATES.find((t) => t.framework === framework);
}
