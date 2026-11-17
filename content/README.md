# The portal's guides and questions

This folder holds the portal's guides (`/bg/guides`, `/en/guides`) and its questions and answers (`/bg/faq`,
`/en/faq`), in Markdown. The text is licensed under CC BY 4.0 ([`LICENSE-CONTENT`](../LICENSE-CONTENT)).

Changes come through a pull request, like any other. Its checks load every file listed here, exactly as the portal
does when it starts, so a mistake shows up in the pull request and never on the site.

## What is here

| Path | What it is |
|---|---|
| `content.yml` | The register: which guides and questions exist, and in what order |
| `guides/{slug}.bg.md`, `guides/{slug}.en.md` | One guide, in Bulgarian and in English |
| `faq/{slug}.bg.md`, `faq/{slug}.en.md` | One question and its answer, in Bulgarian and in English |

- **A file the register does not name is never shown,** even if it sits in this folder.
- **The Bulgarian file is required.** Without an English file, the English page shows the Bulgarian text and says it is
  not yet translated.
- **A slug** is the name in the address: small Latin letters, digits and hyphens, such as `getting-started`. No two
  guides, and no two questions, share one.

## A guide

1. In `content.yml`, add the guide under `guides`, where it should appear in the list:

   ```yaml
   - slug: signing
     aiAssisted: false   # true if it was written with the help of artificial intelligence
     reviewed:           # the date the solution architect reviewed it, such as 2026-12-01; empty for a draft
     sources:            # the documents it was written from, if any
       - { title: "НЗИС Подписване на е-документи с pen tablet", version: "1.0.2", url: "https://www.his.bg/upload/357/…" }
   ```

   If it was listed under `planned`, remove it from there.

2. Write `guides/signing.bg.md`, and `guides/signing.en.md` if there is an English text:

   ```markdown
   ---
   title: Подписване
   summary: One or two sentences for the list of guides.
   updated: 2026-12-01
   ---
   Introduction.

   ## Подпис на съобщението {#message-signature}

   Text.
   ```

- **Every `##` heading ends with an id** in `{#…}`, such as `{#message-signature}`. The guide's contents are built from
  those headings, and the id is the heading's address: `/bg/guides/signing#message-signature`. It does not change
  when the heading's wording does, so links to it keep working. Both languages should use the same ids.
- **A guide drafted with the help of artificial intelligence** keeps `aiAssisted: true` for good. Until `reviewed`
  has a date, its page says that it is an unreviewed draft. Once reviewed, it says when.

## A question

1. In `content.yml`, add its slug to its category's `questions`, where it should appear.
2. Write `faq/{slug}.bg.md`, with the question in the front matter and the answer below it:

   ```markdown
   ---
   question: "Кой метод се използва?"
   ---
   The answer, in as many paragraphs as it needs.
   ```

## The first line

**Every file begins with a line that is exactly `---`.** The portal refuses any other first line, such as `---js`. The
library that reads the front matter would otherwise run such a block as program code when the portal starts. A
reviewer reading a Markdown change does not look for code, so the portal does not allow any.

## What a file must not hold

- A person's name or contact details, including the author lists and document histories of the old his.bg documents.
- Real data from a patient, a practitioner or a facility. Examples use placeholders such as `…`.
- A password, a token or a certificate, even an expired one.
- Anything from a specification that is not yet published.
