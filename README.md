# health-dev-portal

The developer portal of the Bulgarian National Health Information System (НЗИС): the place where software vendors
find the integration specifications, nomenclatures and guides, and — in later stages — register, get sandbox
access and have their software assessed.

Built on the [ti-engine](https://github.com/Belleal/ti-engine) framework. Work in progress; nothing here is
released yet.

## Licensing

Copyright © 2026 the health-dev-portal contributors.

- **Source code** is licensed under the **European Union Public Licence v. 1.2** ([`LICENSE`](LICENSE),
  SPDX `EUPL-1.2`). All linguistic versions approved by the European Commission, including the Bulgarian one, have
  identical value; they are published at <https://interoperable-europe.ec.europa.eu/collection/eupl/eupl-text-eupl-12>.
- **Documentation and specification content** — guides, FAQ, and the specifications, nomenclatures and changelogs
  the portal publishes — is licensed under **Creative Commons Attribution 4.0 International**
  ([`LICENSE-CONTENT`](LICENSE-CONTENT), SPDX `CC-BY-4.0`).

Where a file does not say otherwise, code is EUPL-1.2 and prose is CC BY 4.0.

## Development

Requires Node 24 (`.nvmrc`).

```bash
npm ci
npm run fixtures:fetch   # downloads the public files the regression tests read: the eight production modules, nomenclatures, rules,
                         # e-Dental 1.0.5 and e-Hospitalization 1.0.6, and the 118 files of the /api/v1/ XSD set
npm run lint
npm test
```

The data layer's tests run on SQLite always, and on PostgreSQL too when `HDP_TEST_POSTGRES_URL` is set, as it is in
CI. Locally, with Docker:

```bash
docker run -d --rm --name hdp-pg -e POSTGRES_HOST_AUTH_METHOD=trust -p 5432:5432 postgres:18
HDP_TEST_POSTGRES_URL=postgres://postgres@localhost:5432/postgres npm test
```

Each suite works in a schema of its own and drops it afterwards. The container trusts every connection, so it is for
tests only.

### Importing a module workbook

```bash
npx hdp-import-module --spec e-prescription --json model.json "path/to/НЗИС Е-Рецепта - API Спецификация v1.5.1.xlsx"
```

The report lists every anomaly with its sheet and cell. Exit code 0: accepted; 1: refused (a blocking anomaly) or the
file could not be read; 2: wrong arguments.

### Importing and linking a set

```bash
npx hdp-import-set --nomenclatures "path/to/НЗИС Номенклатури - Спецификация v1.5.33.xlsx" --rules "path/to/НЗИС - API Бизнес Правила - Спецификация v1.1.1.xlsx" --module e-prescription="path/to/НЗИС Е-Рецепта - API Спецификация v1.5.1.xlsx"
```

The workbooks of one stage, imported together. Each module's code-list and rule references are checked against the
set's nomenclatures and rules; any of the three options may be left out, and what is then not linked is said. One
report per workbook, then the verdict for the set; the exit codes are as above.

### Migrating the published specifications

Today's published workbooks are loaded into the portal's database once (design record §7.11). A manifest says which
workbook goes to which spec and stage; paths are relative to it:

```json
{
    "xsd": "api-v1",
    "nomenclatures": [ { "file": "НЗИС Номенклатури - Спецификация v1.5.33.xlsx", "stage": "production" } ],
    "rules": [ { "file": "НЗИС - API Бизнес Правила - Спецификация v1.1.1.xlsx", "stage": "production" } ],
    "modules": [ { "spec": "e-prescription", "file": "НЗИС Е-Рецепта - API Спецификация v1.5.1.xlsx", "stage": "production" } ]
}
```

```bash
HDP_DATABASE_URL=sqlite:portal.db npx hdp-migrate --manifest migration.json
```

- **Stages.** A stage is `production`, `testing` or `development`. The nomenclatures become one spec per code list.
- **Published versions** are loaded as published, defects included, and frozen.
- **A testing workbook goes to testing only when it is ahead of production.**
  - One with production's number and content is the production version itself, and is skipped.
  - One behind production is refused.
- **A run finds what it already stored.** A second run stores nothing, and finishes whatever a run cut short left
  undone. A published number that comes back with other content is refused.
- **Exit codes:** 0 on success; 1 for a conflict, a workbook out of order or a file that cannot be read; 2 for wrong
  arguments or a manifest it cannot use.
- **The database URL** comes from `HDP_DATABASE_URL`, or `--database`, and is never printed. A URL with a password
  belongs in the environment. On the command line it shows in process listings and shell history, and the command
  warns.
- **Files** go to `--files`, by default `.files/` next to the manifest.
- **Development workbooks** are the spec team's work in progress. They are never in this repository, so they are loaded
  from their folder.

### Copying a database

```bash
HDP_COPY_FROM_URL=sqlite:portal.db HDP_COPY_TO_URL="$TARGET_DATABASE_URL" npx hdp-copy --files-from .files --files-to /mnt/files
```

This copies a whole database from one driver to the other, for example from the development deployment to the data
centre's PostgreSQL at launch.
- **What it keeps.** Every identity, all history, and the files the database names. When the source names files,
  `--files-from` and `--files-to` are required; without them the copy is refused before the target is opened.
- **The target** is migrated first. It must be empty, with the same schema as the source; otherwise the copy is refused
  with exit code 1 before any row is copied.
- **A copy that fails part-way** leaves the target partly filled. Drop the target and copy again.
- **The URLs** come from `HDP_COPY_FROM_URL` and `HDP_COPY_TO_URL`, or `--from` and `--to`, and neither is ever
  printed. A URL with a password belongs in the environment, and the command warns when one is given as an argument.
