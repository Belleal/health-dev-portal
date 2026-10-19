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
npm run fixtures:fetch   # downloads the public e-Prescription workbook used by the regression test
npm run lint
npm test
```

### Importing a module workbook

```bash
npx hdp-import-module --spec e-prescription --json model.json "path/to/НЗИС Е-Рецепта - API Спецификация v1.5.1.xlsx"
```

The report lists every anomaly with its sheet and cell. Exit code 0: accepted; 1: refused (a blocking anomaly) or the
file could not be read; 2: wrong arguments.
