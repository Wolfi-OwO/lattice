#!/usr/bin/env node
/**
 * lattice — scaffold a project from the stack library, set it up, and install it.
 *
 *   npm create lattice@latest                    fully interactive
 *   npm create lattice@latest my-api             name given, rest interactive
 *   lattice my-api --stack express --database postgres
 *   lattice shop  --stack express --database file --format ndjson --client react-vite-ts
 *   lattice --list
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { parseArgs } from '../src/args.js';
import { c, select, text, isInteractive, PromptCancelled } from '../src/prompts.js';
import { logger } from '../src/logger.js';
import { inspect, renderReport } from '../src/doctor.js';
import { buildVars, copyTemplate, isEmptyDir } from '../src/scaffold.js';
import { STORAGE, storageChoices, depsFor } from '../src/storage.js';
import { STYLING, DEFAULT_STYLING, stylingChoices } from '../src/styling.js';
import {
  detectPackageManager,
  findFreePort,
  hasDocker,
  install,
  installMaven,
  installPython,
  mergeDeps,
  detectToolchain,
  driverLoads,
  repairDriver,
  overlayEnterprise,
  pruneAdapters,
  pruneStyles,
  runGenerator,
  startDatabase,
  writeCompose,
  writeEnv,
} from '../src/setup.js';
import {
  CATEGORIES,
  FULLSTACK_BACKENDS,
  FULLSTACK_FRONTENDS,
  TEMPLATES,
  findTemplate,
  frameworksFor,
  languagesFor,
  nextSteps,
} from '../src/registry.js';
import { findGenerator, generatorChoices } from '../src/generators.js';
import { beginGeneration } from '../src/transaction.js';
import { verifyStructure, describeViolations } from '../src/verify.js';
import { checkToolchain } from '../src/toolchain.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STACK_ROOT = path.join(ROOT, 'stacks');

// --------------------------------------------------------------------- output

function printList() {
  console.log(`\n${c.bold('Available stacks')}\n`);
  for (const category of CATEGORIES) {
    if (category.composed) continue;
    const items = TEMPLATES.filter((t) => t.category === category.id);
    if (items.length === 0) continue;

    console.log(`  ${c.cyan(category.label)}`);
    for (const t of items) {
      console.log(
        `    ${c.bold(t.framework.padEnd(18))} ${c.gray(`${t.languageLabel} · ${t.frameworkLabel}`)}`,
      );
    }
    console.log('');
  }

  console.log(`  ${c.cyan('Databases')} ${c.gray('(--database, for stacks that persist)')}`);
  for (const [id, s] of Object.entries(STORAGE)) {
    console.log(`    ${c.bold(id.padEnd(18))} ${c.gray(s.hint)}`);
  }
  console.log(
    `\n  ${c.cyan('Fullstack')}  ${c.gray('--stack <backend> --client <frontend>')}\n` +
      `    ${c.gray(`backends:  ${FULLSTACK_BACKENDS.join(', ')}`)}\n` +
      `    ${c.gray(`frontends: ${FULLSTACK_FRONTENDS.join(', ')}`)}\n`,
  );

  console.log(`  ${c.cyan('External generators')} ${c.gray('(--generator, delegates to the real tool)')}`);
  for (const g of generatorChoices()) {
    console.log(`    ${c.bold(g.id.padEnd(18))} ${c.gray(g.label)}`);
  }
  console.log('');
}

function version() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  return pkg.version;
}

function printVersion() {
  console.log(version());
}

function printHelp() {
  console.log(`
  ${c.bold('lattice')} ${c.gray(`v${version()} — scaffold a project, set it up, install it`)}

  ${c.bold('Usage')}
    npm create lattice@latest [name] [options]

  ${c.bold('Options')}
    --stack <id>      stack id (see --list)
    --database <id>   ${Object.keys(STORAGE).join(' | ')}
    --format <fmt>    json | ndjson | yaml   ${c.gray('(only with --database file)')}
    --styling <id>    ${Object.keys(STYLING).join(' | ')}   ${c.gray('(frontend stacks)')}
    --client <id>     frontend for a fullstack project, placed in client/
    --package <pkg>   Java/Kotlin base package (default at.htlvillach.<name>)
    --port <n>        backend port (default 3000)
    --generator <id>  delegate the base scaffold to a real tool (create-vite, ng, cargo…; see --list)
    --enterprise      overlay docs/adr, todo, .github CI, and community-health files
    --owner <name>    GitHub owner/org for the enterprise overlay's badges (default your-org)
    --no-install      skip dependency installation
    --no-database-start
                      do not "docker compose up -d database"
    --force           scaffold into a non-empty directory
    --list            show all stacks and databases
    --version         print the version
    --help            show this
`);
}

// ------------------------------------------------------------------ prompts

const NAME_RE = /^[a-z0-9][a-z0-9._-]*$/;

function validateName(value) {
  if (!value) return 'Project name is required.';
  if (!NAME_RE.test(value)) {
    return 'Use lowercase letters, digits, dashes; must not start with a dash.';
  }
  return null;
}

function validatePackage(value) {
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(value)) {
    return 'Use a reverse-domain package like at.htlvillach.myapp (at least two segments).';
  }
  return null;
}

function validatePort(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 65535) return 'Port must be 1–65535.';
  return null;
}

/** Walk category -> language -> framework, or resolve straight from flags. */
async function resolveTemplate(flags) {
  const stackFlag = flags.stack ?? flags.template; // --template kept as an alias

  if (typeof stackFlag === 'string') {
    const template = findTemplate(stackFlag);
    if (!template) {
      throw new Error(`Unknown stack "${stackFlag}". Run with --list to see the options.`);
    }

    const client = typeof flags.client === 'string' ? findTemplate(flags.client) : null;
    if (typeof flags.client === 'string' && !client) {
      throw new Error(`Unknown client stack "${flags.client}".`);
    }
    if (client && !FULLSTACK_FRONTENDS.includes(client.framework)) {
      throw new Error(
        `"${client.framework}" cannot be used as a fullstack client.\n` +
          `  Clients: ${FULLSTACK_FRONTENDS.join(', ')}`,
      );
    }
    if (client && !FULLSTACK_BACKENDS.includes(template.framework)) {
      throw new Error(
        `--client needs a backend at the root, and "${template.framework}" is not one.\n` +
          `  Backends: ${FULLSTACK_BACKENDS.join(', ')}`,
      );
    }
    return { template, client };
  }

  const category = await select(
    'What are you building?',
    CATEGORIES.map((cat) => ({ value: cat.id, label: cat.label, hint: cat.hint })),
  );

  if (category === 'fullstack') {
    const backend = await select(
      'Backend:',
      FULLSTACK_BACKENDS.map(findTemplate).map((t) => ({
        value: t.framework,
        label: `${t.languageLabel} · ${t.frameworkLabel}`,
        hint: t.hint,
      })),
    );
    const frontend = await select(
      'Frontend (goes into client/):',
      FULLSTACK_FRONTENDS.map(findTemplate).map((t) => ({
        value: t.framework,
        label: `${t.languageLabel} · ${t.frameworkLabel}`,
        hint: t.hint,
      })),
    );
    return { template: findTemplate(backend), client: findTemplate(frontend) };
  }

  const languages = languagesFor(category);
  const language =
    languages.length === 1
      ? languages[0].id
      : await select(
          'Language:',
          languages.map((l) => ({ value: l.id, label: l.label })),
        );

  const frameworks = frameworksFor(category, language);
  const framework =
    frameworks.length === 1
      ? frameworks[0].framework
      : await select(
          'Framework:',
          frameworks.map((t) => ({
            value: t.framework,
            label: t.frameworkLabel,
            hint: t.hint,
          })),
        );

  return { template: findTemplate(framework), client: null };
}

/** The storage question, asked only for stacks that actually persist anything. */
async function resolveStorage(template, flags) {
  if (!template.storage) {
    /*
     * Accepting --database here and ignoring it would hand back a project wired
     * to a different database than the one that was asked for, with nothing said.
     * These stacks have their persistence fixed by the template (FastAPI ships
     * SQLAlchemy, Spring ships JPA); only the storage-agnostic ones take one.
     */
    if (typeof (flags.database ?? flags.db) === 'string') {
      throw new Error(
        `The ${template.framework} stack does not take a --database — its database is fixed by the template.\n` +
          `  Storage is a choice on: ${TEMPLATES.filter((t) => t.storage)
            .map((t) => t.framework)
            .join(', ')}`,
      );
    }
    return { storage: null, fileFormat: null };
  }

  const databaseFlag = flags.database ?? flags.db; // --db is the historical alias
  let storage = typeof databaseFlag === 'string' ? databaseFlag : null;
  if (storage && !STORAGE[storage]) {
    throw new Error(
      `Unknown database "${storage}". Expected one of: ${Object.keys(STORAGE).join(', ')}`,
    );
  }

  storage ??= await select('Database:', storageChoices());

  let fileFormat = null;

  if (storage === 'file') {
    fileFormat = typeof flags.format === 'string' ? flags.format : null;

    const allowed = STORAGE.file.formats;
    if (fileFormat && !allowed.some((f) => f.value === fileFormat)) {
      throw new Error(
        `Unknown format "${fileFormat}". Expected one of: ${allowed.map((f) => f.value).join(', ')}`,
      );
    }

    fileFormat ??= await select('File format:', allowed);
  } else if (typeof flags.format === 'string') {
    throw new Error(`--format only means something with --database file (you asked for --database ${storage}).`);
  }

  return { storage, fileFormat };
}

/**
 * The styling question, asked only for stacks that render anything.
 *
 * Same shape as resolveStorage, and refuses for the same reason: accepting
 * `--styling tailwind` on a Spring Boot project and ignoring it would hand back
 * something other than what was asked for, with nothing said.
 */
async function resolveStyling(template, client, flags) {
  const flag = flags.styling;

  /*
   * In a fullstack run the frontend arrives as `--client`, so the stack that
   * takes the styling is the client, not the backend the name was given for.
   */
  const styled = template.styling ? template : client?.styling ? client : null;

  if (!styled) {
    if (typeof flag === 'string') {
      throw new Error(
        `The ${template.framework} stack does not take a --styling — it renders no UI of its own.\n` +
          `  Styling is a choice on: ${TEMPLATES.filter((t) => t.styling)
            .map((t) => t.framework)
            .join(', ')}` +
          (client ? '' : `\n  For a backend, pair it with --client react-vite.`),
      );
    }
    return null;
  }

  if (typeof flag === 'string') {
    if (!STYLING[flag]) {
      throw new Error(
        `Unknown styling "${flag}". Expected one of: ${Object.keys(STYLING).join(', ')}`,
      );
    }
    return flag;
  }

  /*
   * Unlike the database, styling has a defensible default, so a non-interactive
   * run without the flag gets it rather than an error.
   *
   * The asymmetry is the point. There is no safe default database — picking one
   * silently builds the project against storage nobody asked for, and finding out
   * costs a rewrite. `plain` is exactly what these templates shipped before this
   * choice existed, so a script that says nothing gets what it got yesterday, and
   * changing its mind later is one file. Failing instead would have broken every
   * existing `--stack react-vite` invocation — including this repository's own CI,
   * which is how it was caught — and a new feature does not get to do that.
   */
  if (!isInteractive()) return DEFAULT_STYLING;

  return select('Styling:', stylingChoices());
}

// --------------------------------------------------------------------- main

/**
 * The `--generator` path: run an external tool, then overlay. Kept separate from the
 * template flow because it shares almost nothing with it — no stack, no database.
 */
async function runExternalGenerator(projectName, args) {
  const generator = findGenerator(args.flags.generator);
  if (!generator) {
    throw new Error(
      `Unknown generator "${args.flags.generator}". Run --list to see them.`,
    );
  }

  const target = path.resolve(process.cwd(), projectName);
  if (!isEmptyDir(target) && !args.flags.force) {
    throw new Error(
      `Directory "${projectName}" already exists and is not empty. Pass --force to scaffold into it anyway.`,
    );
  }

  process.stdout.write(`${c.gray('⋯')} Running ${c.bold(generator.label)} (${generator.bin})…\r`);
  runGenerator(generator, projectName, process.cwd());
  console.log(`${c.green('✔')} Scaffolded ${c.bold(projectName)} ${c.gray(`via ${generator.label}`)}          `);

  const vars = buildVars({ projectName, owner: args.flags.owner });

  if (args.flags.enterprise) {
    const { files, toolchain } = overlayEnterprise(
      path.join(ROOT, 'overlays', 'enterprise'),
      target,
      vars,
    );
    console.log(
      `${c.green('✔')} Enterprise overlay ${c.gray(`(${files.length} files: docs/adr, todo, .github, community health)`)}` +
        (toolchain
          ? `\n  ${c.gray('ci      ')}  ${toolchain}`
          : `\n  ${c.yellow('!')} ${c.gray('no CI: could not tell which build tool this project uses')}`),
    );
  }

  const steps = [`cd ${projectName}`, ...(generator.next ?? [])];
  console.log(`\n${c.bold('Next steps')}\n\n${steps.map((s) => `  ${s}`).join('\n')}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  /*
   * --verbose turns on the debug logs (src/logger.js reads this). Set before any
   * other work so the machinery of this run is actually captured.
   */
  if (args.flags.verbose) process.env.LATTICE_LOG_LEVEL = 'debug';

  if (args.flags.help) return printHelp();
  if (args.flags.version) return printVersion();
  if (args.flags.list) return printList();

  /*
   * `lattice doctor [path]` — score a project instead of scaffolding one. A
   * subcommand rather than a flag because it is a different verb with a different
   * output, and treating "doctor" as a project name would scaffold a folder called
   * doctor, which nobody wants.
   */
  if (args._[0] === 'doctor') {
    const target = args._[1] ?? '.';
    logger.debug(`doctor: inspecting ${path.resolve(target)}`);
    const report = inspect(target);
    console.log(renderReport(report));
    /*
     * Non-zero on a failing grade only under --strict, so it can gate CI without
     * breaking the common "just show me" run.
     */
    if (args.flags.strict && report.overall < 60) process.exitCode = 1;
    return;
  }

  console.log(`\n${c.bold(c.cyan('◆ lattice'))} ${c.gray('· project scaffolder')}\n`);

  const projectName = args._[0] ?? (await text('Project name:', 'my-app', validateName));
  const nameError = validateName(projectName);
  if (nameError) throw new Error(nameError);

  /*
   * `--generator <id>` delegates the base scaffold to a framework's real tool
   * (create-vite, ng, cargo, …), then layers lattice's overlay on top. A different
   * path entirely from the built-in templates: no storage, no stack picker.
   */
  if (typeof args.flags.generator === 'string') {
    return runExternalGenerator(projectName, args);
  }

  const { template, client } = await resolveTemplate(args.flags);
  const { storage, fileFormat } = await resolveStorage(template, args.flags);
  const styling = await resolveStyling(template, client, args.flags);

  // Extra vars — only ask for what this stack actually declares.
  const needs = new Set([...(template.vars ?? []), ...(client?.vars ?? [])]);
  const answers = { projectName, storage: storage ?? 'memory', fileFormat: fileFormat ?? 'json' };
  if (styling) answers.styling = styling;
  if (typeof args.flags.owner === 'string') answers.owner = args.flags.owner;

  if (needs.has('javaPackage')) {
    answers.javaPackage =
      typeof args.flags.package === 'string'
        ? args.flags.package
        : await text(
            'Base package:',
            `at.htlvillach.${projectName.replace(/[^a-z0-9]/g, '')}`,
            validatePackage,
          );
    const packageError = validatePackage(answers.javaPackage);
    if (packageError) throw new Error(packageError);
  }

  if (needs.has('port')) {
    answers.port =
      typeof args.flags.port === 'string'
        ? args.flags.port
        : await text('Backend port:', '3000', validatePort);
    const portError = validatePort(answers.port);
    if (portError) throw new Error(portError);
  }

  const target = path.resolve(process.cwd(), projectName);
  if (!isEmptyDir(target) && !args.flags.force) {
    throw new Error(
      `Directory "${projectName}" already exists and is not empty. Pass --force to scaffold into it anyway.`,
    );
  }

  /*
   * Pick the database's host port before rendering anything, so the compose
   * file and .env are written against a port that is actually free.
   */
  const spec = storage ? STORAGE[storage] : null;
  if (spec?.server) {
    answers.databasePort = await findFreePort(spec.defaultPort);
  }

  const vars = buildVars(answers);

  // ------------------------------------------------------------- scaffold

  /*
   * Everything below is written to a staging directory and only becomes the real
   * project once it has all succeeded. See src/transaction.js — a failure partway
   * used to leave a half-written tree that then blocked its own retry.
   */
  const generation = beginGeneration(target);
  const staged = generation.path;

  let files = [];
  let clientFiles = [];
  let enterpriseFiles = [];
  let enterpriseToolchain = null;

  try {
    files = copyTemplate(path.join(STACK_ROOT, template.dir), staged, vars);

    if (client) {
      clientFiles = copyTemplate(path.join(STACK_ROOT, client.dir), path.join(staged, 'client'), {
        ...vars,
        projectName: `${vars.projectName}-client`,
      });
    }

    if (args.flags.enterprise) {
      ({ files: enterpriseFiles, toolchain: enterpriseToolchain } = overlayEnterprise(
        path.join(ROOT, 'overlays', 'enterprise'),
        staged,
        vars,
      ));
    }

    if (storage) {
      // Keep only the chosen adapter, then add exactly the deps it needs.
      pruneAdapters(staged, STORAGE[storage].adapter);
      mergeDeps(staged, depsFor(storage, fileFormat));

      writeEnv(staged, {
        base: template.env?.(vars) ?? {},
        storage,
        vars: { ...vars, fileFormat },
      });

      writeCompose(staged, { storage, vars });
    }

    if (styling) {
      /*
       * The frontend is at the root of its own scaffold, but under client/ in a
       * fullstack one — the same tree either way, just rooted differently.
       */
      const uiRoot = template.styling ? staged : path.join(staged, 'client');
      const spec = STYLING[styling];

      pruneStyles(uiRoot, spec.source, spec.entry);
      mergeDeps(uiRoot, spec.deps ?? {});
      mergeDeps(uiRoot, spec.devDeps ?? {}, 'devDependencies');
    }

    /*
     * The structural gate, deliberately the last thing before the commit. Checking
     * the staged tree rather than the committed one is what lets a violation roll
     * back completely instead of leaving a rejected project on disk — the reason
     * this and the transaction were built in that order.
     */
    const structure = verifyStructure(staged, detectToolchain(staged));
    if (!structure.ok) {
      throw new Error(describeViolations(structure.violations));
    }

    generation.commit();
  } catch (error) {
    generation.rollback();
    throw error;
  }

  console.log(
    `\n${c.green('✔')} Scaffolded ${c.bold(projectName)} ` +
      `${c.gray(`(${files.length + clientFiles.length} files)`)}\n` +
      `  ${c.gray('stack   ')}  ${template.languageLabel} · ${template.frameworkLabel}` +
      (client ? `\n  ${c.gray('client  ')}  ${client.languageLabel} · ${client.frameworkLabel}` : '') +
      (storage
        ? `\n  ${c.gray('database')}  ${STORAGE[storage].label}` +
          (fileFormat ? ` (${fileFormat})` : '') +
          (answers.databasePort ? c.gray(` · host port ${answers.databasePort}`) : '')
        : '') +
      (enterpriseFiles.length
        ? `\n  ${c.gray('overlay ')}  enterprise (${enterpriseFiles.length} files: docs/adr, todo, .github, community health)` +
          (enterpriseToolchain ? `\n  ${c.gray('ci      ')}  ${enterpriseToolchain}` : '')
        : ''),
  );

  // ---------------------------------------------------------------- wire up

  if (storage) {
    const composed = Boolean(STORAGE[storage].server);
    console.log(
      `${c.green('✔')} Wired up ${c.gray(`(.env written, ${STORAGE[storage].adapter} adapter${composed ? ', compose file' : ''})`)}`,
    );
  }

  // ---------------------------------------------------------------- install

  const wantsInstall = args.flags['no-install'] !== true;
  const pm = detectPackageManager();

  /*
   * Whether the project's dependencies really are in place. Read by the "Next
   * steps" block below, which has a different answer for a project that is ready
   * to run than for one that still needs installing.
   */
  let installed = false;

  if (wantsInstall && template.installer === 'npm') {
    const targets = [{ dir: target, label: projectName }];
    if (client) targets.push({ dir: path.join(target, 'client'), label: 'client' });

    for (const { dir, label } of targets) {
      process.stdout.write(`${c.gray('⋯')} Installing dependencies (${pm}) in ${label}…\r`);
      const result = install(dir, pm, true);

      if (result.ok) {
        console.log(`${c.green('✔')} Installed dependencies in ${label} ${c.gray(`(${pm})`)}      `);

        /*
         * Exiting 0 is not the same as a working project. better-sqlite3 compiles
         * a binding during install, and npm has been observed reporting success
         * while skipping that step entirely — leaving a project that fails on its
         * first command with "Could not locate the bindings file". Asking the
         * project to load its own driver is the only check that cannot be fooled.
         */
        const driver = dir === target ? Object.keys(depsFor(storage, fileFormat))[0] : null;
        const smoke = dir === target ? STORAGE[storage]?.smoke : null;

        if (driver && smoke && !driverLoads(dir, smoke)) {
          process.stdout.write(`${c.gray('⋯')} ${driver} did not load — rebuilding…\r`);

          if (repairDriver(dir, driver, smoke, pm)) {
            console.log(`${c.green('✔')} Rebuilt ${driver} ${c.gray('(its install step had been skipped)')}   `);
          } else {
            console.log(`${c.yellow('!')} ${driver} is installed but will not load          `);
            console.log(c.gray(`    Run "${pm} rebuild ${driver}" in ${label}, then try again.`));
          }
        }
      } else {
        console.log(`${c.yellow('!')} ${pm} install failed in ${label}       `);
        console.log(c.gray(result.error.split('\n').map((l) => `    ${l}`).join('\n')));
        console.log(c.gray(`    Run "${pm} install" in ${label} yourself once that is fixed.`));
      }
    }
  } else if (wantsInstall && (template.installer === 'maven' || template.installer === 'python')) {
    /*
     * Maven and Python install too, but only onto a machine that can already run
     * them. checkToolchain answers that — it looks for the runtime and compares
     * it against the floor the template itself declares, and never installs a
     * runtime. A missing or too-old JDK is reported with both versions and the
     * project is left complete, which is what the printed steps already describe.
     */
    const check = checkToolchain(template.installer, target);

    if (!check.ok) {
      console.log(`${c.gray('·')} ${c.gray(`Skipped dependency install — ${check.reason}`)}`);
      console.log(c.gray('    The project is complete; run the steps below once that is sorted.'));
    } else if (template.installer === 'maven') {
      process.stdout.write(`${c.gray('⋯')} Resolving dependencies and compiling (./mvnw)…\r`);
      const result = installMaven(target, true);

      if (result.ok) {
        installed = true;
        console.log(
          `${c.green('✔')} Resolved dependencies in ${projectName} ${c.gray(`(./mvnw · ${check.using})`)}      `,
        );
      } else {
        console.log(`${c.yellow('!')} Could not resolve dependencies          `);
        console.log(c.gray(result.error.split('\n').map((l) => `    ${l}`).join('\n')));
        console.log(c.gray(`    Run "./mvnw -DskipTests test-compile" in ${projectName} yourself.`));
      }
    } else {
      process.stdout.write(`${c.gray('⋯')} Creating .venv and installing (pip)…\r`);
      const result = installPython(target, check.command, true);

      if (result.ok) {
        installed = true;
        const how = result.reused ? 'reused .venv' : 'created .venv';
        console.log(
          `${c.green('✔')} Installed dependencies in ${projectName} ${c.gray(`(${how} · ${check.using} · ${result.requirements})`)}      `,
        );
      } else {
        console.log(`${c.yellow('!')} Could not install into .venv          `);
        console.log(c.gray(result.error.split('\n').map((l) => `    ${l}`).join('\n')));
        console.log(c.gray(`    Run the steps below in ${projectName} yourself.`));
      }
    }
  } else if (wantsInstall && template.installer) {
    /*
     * Gradle/Android is deliberately still out. Its build needs the Android SDK
     * and accepted licences, neither of which a scaffolder should be arranging,
     * and a `./gradlew` that fails on a missing SDK is a worse first impression
     * than one that was never run.
     */
    console.log(
      `${c.gray('·')} ${c.gray(`Skipping auto-install — run the ${template.installer} steps below.`)}`,
    );
  }

  // --------------------------------------------------------------- database

  const wantsDatabaseStart =
    args.flags['no-database-start'] !== true && args.flags['no-db-start'] !== true;

  if (spec?.server && wantsDatabaseStart) {
    if (!hasDocker()) {
      console.log(
        `${c.yellow('!')} Docker is not running — start ${spec.label} yourself, then ${c.bold('npm run dev')}.`,
      );
    } else {
      process.stdout.write(`${c.gray('⋯')} Starting ${spec.label} (docker compose up -d database)…\r`);
      const result = startDatabase(target);

      if (result.ok) {
        console.log(`${c.green('✔')} ${spec.label} is running ${c.gray('(docker compose)')}          `);
      } else {
        console.log(`${c.yellow('!')} Could not start ${spec.label}          `);
        console.log(c.gray(result.error.split('\n').map((l) => `    ${l}`).join('\n')));
      }
    }
  }

  // ----------------------------------------------------------------- report

  console.log(`\n${c.bold('Next steps')}\n`);
  console.log(`  cd ${projectName}`);
  /*
   * nextSteps, not an inline choice: scripts/print-next-steps.js makes the same
   * decision so CI can run what was printed, and two copies of the rule would be
   * two copies that can disagree.
   */
  for (const step of nextSteps(template, installed)) console.log(`  ${step}`);

  if (client) {
    console.log(`\n  ${c.gray('# in a second terminal')}`);
    console.log(`  cd ${projectName}/client`);
    for (const step of client.post ?? []) console.log(`  ${step}`);
  }

  if (spec && !spec.durable) {
    console.log(
      `\n  ${c.yellow('Note')} ${c.gray(`${spec.label} keeps nothing across restarts — swap the adapter in src/database/ when you need it to.`)}`,
    );
  }

  console.log('');
}

main().catch((error) => {
  if (error instanceof PromptCancelled) {
    console.log(c.gray('Cancelled.'));
    process.exit(130);
  }
  console.error(`\n${c.red('✖')} ${error.message}\n`);
  process.exit(1);
});
