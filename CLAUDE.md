# CLAUDE.md

Guidance for Claude Code when working in this repository. General Obsidian
plugin conventions (manifest rules, releases, guidelines) are in `AGENTS.md`,
copied from the official sample plugin. This file covers what is specific to
this plugin. Keep it current when the structure or workflow changes.

## What this is

**Media Note Creator** (`id: media-note-creator`) is an Obsidian plugin that creates media
notes from online APIs. It is a TypeScript port of the Python CLI in
`mgaydash/obsidian-tools`, and its notes must match what the CLI writes.

Status: feature-complete (movies and TV via TMDB; games via IGDB, albums via
MusicBrainz, books via Google Books; word lookups via the Free Dictionary API
with a Wiktionary fallback). Next: the 0.2.0 release under the new name,
then community store submission.

## Decisions (do not revisit without asking)

- **Plugin id is `media-note-creator`** and can never change once it is in the
  store. It was `media-notes` for the 0.1.0 BRAT release, renamed in 0.2.0
  because the store already has a "Media Notes" plugin with that id. Ids may
  not contain "obsidian", which is why it differs from the repo name. CSS
  classes use the `media-note-creator-` prefix.
- **API keys live in the Obsidian Keychain** (`app.secretStorage`), never in
  `data.json`. Settings store only the Keychain entry name (`tmdbSecretId`),
  chosen with a `SecretComponent`. This sets `minAppVersion` to 1.11.4.
- **Mobile is supported** (`isDesktopOnly: false`): no Node or Electron APIs.
  Images are resized with a canvas (`src/obsidian/poster.ts`).
- **New notes go to** the `notesFolder` setting when set, otherwise Obsidian's
  "Default location for new notes" via `fileManager.getNewFileParent()`.
  Posters sit next to the note.
- **Store-ready from day one**: follow the plugin guidelines and keep
  `npm run lint` free of errors.
- The CLI's vault backup (`-b`) is intentionally not ported.
- The CLI's `posters` command (backfill covers for existing notes) is
  intentionally not ported. It served a one-time import and stays CLI-only.

## Layout

```
src/
├── main.ts                 # Plugin lifecycle only: settings, commands, getSecret()
├── settings.ts             # Settings type, defaults, settings tab, folder suggest
├── api/
│   ├── types.ts            # MediaClient, SearchResult, HttpGetJson/HttpRequestJson, HttpError, Sleep
│   ├── tmdb.ts             # TMDB (movies + TV)
│   ├── igdb.ts             # IGDB (games), Twitch client-credentials sign-in
│   ├── musicbrainz.ts      # MusicBrainz (albums) + Cover Art Archive
│   ├── googlebooks.ts      # Google Books (books), edition grouping + retries
│   └── dictionary.ts       # Word lookups: Free Dictionary, Wiktionary fallback
├── core/                   # Pure logic, no `obsidian` import, unit-tested
│   ├── addTitle.ts         # The add workflow (port of CLI process_title)
│   ├── disambiguation.ts   # Year filter, exact match, selectResult()
│   ├── genres.ts           # Genre -> tag table (port of genre_mappings.yaml)
│   ├── notes.ts            # Frontmatter, filenames, collections
│   ├── scaffold.ts         # Collection page + .base contents, create/skip plan
│   ├── selection.ts        # Selected lines -> titles, and -> link edits
│   └── titles.ts           # "Title (Year)" parsing, title list cleanup
├── obsidian/               # Thin wrappers over Obsidian APIs
│   ├── http.ts             # requestUrl -> getJson/getBytes
│   ├── poster.ts           # Canvas resize to JPEG (quality 0.85)
│   └── vault.ts            # Folder resolution, create-or-modify writes
├── ui/                     # Modals, each with an openAndWait() promise
└── commands/
    ├── addNote.ts          # One "Add <type> note" command per media type
    ├── scaffold.ts         # "Create collection pages and bases" command
    └── clients.ts          # createClient(): Keychain keys -> API client
tests/                      # Vitest; fixtures copied from the CLI repo
```

## Key patterns

- **Keep `core/` and `api/` free of `obsidian` imports.** The `obsidian`
  package is types only and cannot load under Vitest. Obsidian-specific
  behavior is passed in (`AddTitleDeps`, `HttpGetJson`).
- **API clients normalize search hits to `SearchResult`** (`id`, `title`,
  `year`, `overview`, `thumbnailUrl`). Media-specific date handling (such as
  IGDB Unix timestamps, which must use UTC) belongs in the client, so
  disambiguation stays generic.
- **HTTP goes through `obsidian/http.ts`.** `requestJson` calls `requestUrl`
  with `throw: false` and raises `HttpError(status)` itself, so clients can
  tell a transient 429/5xx (Google Books retries those: 3 retries, 0.5 s
  doubling) from a bad key. Clients receive it, plus `sleep`, by injection.
- **Per-source quirks**: IGDB needs a Twitch token (POST to
  `id.twitch.tv/oauth2/token`, cached per client) and Apicalypse bodies
  (titles are quoted and escaped; ids must be numeric). IGDB years come from
  Unix timestamps in **UTC** (`igdbYear`). MusicBrainz uses `fmt=json`, needs
  a User-Agent and at most 1 request/s (the client spaces them), and its
  Lucene query escapes the title. The CLI used musicbrainzngs (XML); the TS
  client maps JSON (`artist-credit`, `release-group.secondary-types`,
  `release-group.tags`, `label-info`) to the same `AlbumDetails`, preferring
  release-group tags and falling back to release tags. Google Books groups
  editions by (title, author) and remembers the earliest year per stand-in
  volume for `getDetails()`.
- **Word lookups** (`mediaType: 'lookup'`, collection `[[Lookups]]`): an
  exact lookup, not a search. The primary (`api.dictionaryapi.dev`, 8 s
  timeout) is a flaky community proxy; any `HttpError` other than 404 trips
  a per-client circuit breaker (`primaryFailed`) and that word and the rest
  of the batch go to Wiktionary (`en.wiktionary.org/api/rest_v1/page/definition`,
  15 s, English section only, HTML stripped, one entry, no pronunciation or
  synonyms). A 404 means the word is not in Wiktionary, so it never falls
  back. Entries are cached by `word#index` in `search()` for `getDetails()`.
  Homographs are separate results, so they always prompt. Part of speech is
  the tag (not run through the genre table). Filename `Word.md`, no poster,
  and `addTitle()` skips the "no poster" warning for lookups.
  `HttpRequest.timeoutMs` is implemented in `obsidian/http.ts` by racing
  `requestUrl` against a timer, since `requestUrl` has no timeout.
- **Unreleased games**: `addTitle()` asks before adding a game whose exact
  match has no release date (`SearchResult.year === null`), only on the
  exact-match path, as in the CLI. Games, albums and books with no year get
  `(TBD)` in the filename; only TMDB refuses a missing year.
- **The note is written once**, after the poster download, with the `poster`
  property and embed already in place. A failed poster still writes the note.
- **Output parity with the CLI**: each client's test file holds note text
  generated by the Python CLI from the same fixtures (MusicBrainz: from the
  same normalized details, since the CLI's fixtures are musicbrainzngs-shaped
  and the TS fixtures are MusicBrainz JSON). When porting a client,
  generate expected text the same way. One known difference: once a poster is
  added, the CLI rewrites YAML with PyYAML (single quotes, unindented lists);
  the plugin keeps the double-quoted, indented style. The parsed values are
  identical.
- **Selected text prefills the title prompt, then becomes links.**
  `captureSelection()` in `core/selection.ts` records each selected line
  (line, start column, text) and `parseSelectedLine()` splits it into a kept
  prefix (bullets, numbering, checkbox, heading marks) and a body whose title
  is searched. After the run, `linkChanges()` replaces each body whose title
  produced a note with `fileManager.generateMarkdownLink()` (so the user's
  wikilink/Markdown setting is respected). The alias comes from the
  `linkText` setting via `linkDisplayText()`: source title + year (default),
  source title, the typed text, or none (note name). It is dropped when it
  equals the note name. Clients expose `getTitleAndYear()` for this, and
  `addTitle()` returns it on a created outcome. All edits go in one
  `editor.transaction()` (one undo). Lines are matched by title, so a title
  edited in the prompt is not linked; a line whose text changed meanwhile is
  skipped, and nothing is linked if the view moved to another note. With a
  selection, the new note is not opened.
- **Collection pages and bases** (`core/scaffold.ts`): `Movies.md` embeds
  `![[Movies Base.base#Covers]]`, the naming used in Mitchell's vault
  (`Lookups Base.base`). Bases filter on `collection == link("Movies")`, never
  `file.hasLink()` (matches body mentions) or `contains()` (substring). The
  command never overwrites: a file is skipped when a link to its name already
  resolves anywhere in the vault (`getFirstLinkpathDest`) or its path exists.
  Pages have no frontmatter; vault-specific bits (`collection: [[Index]]`,
  `cssclasses`, rating/status columns) are the user's to add.
- **`SuggestModal` calls `onClose` before `onChooseSuggestion`**, so
  `ResultSuggestModal` resolves on the next tick. Keep that pattern in new
  pick lists.
- UI text is sentence case. Brands and acronyms allowed by lint are listed in
  `eslint.config.mts`.

## Commands

```bash
npm install
npm run dev      # watch build
npm run build    # tsc type-check + production bundle
npm test         # vitest run
npm run lint     # eslint (obsidianmd rules)
```

CI (`.github/workflows/lint.yml`) runs build, lint and tests on Node 20, 22 and
24 for every push and PR. Tagging a version runs `release.yml`, which makes a
draft GitHub release with `main.js`, `manifest.json` and `styles.css`.

## Releasing

1. `npm version patch` (or `minor`) on `main`. `version-bump.mjs` updates
   `manifest.json` and `versions.json`. Keep `minAppVersion` accurate.
2. Push the tag. It must equal the version exactly, with no leading `v`.
3. Publish the draft release that `release.yml` creates. BRAT and the store
   both read the latest published release.

The store listing is made once, through the dashboard at
community.obsidian.md (not a pull request to `obsidian-releases`). It reads
`manifest.json` from the head of `main` and runs an automated review; fixes
ship as a new release. Later releases need no resubmission.

Store guidelines to keep: `vault.process()` (not `modify`) to rewrite a note,
`getFileByPath()`, `normalizePath()` on user paths, no `console.log`, no
inline styles, sentence-case UI text, network use and needed accounts
disclosed in `README.md`. The one lint warning
(`prefer-setting-definitions`) needs the Obsidian 1.13 settings API, above
`minAppVersion`, and is accepted.

## Adding a media type

1. Add the type to `MediaType` and `COLLECTION_BY_MEDIA_TYPE` in `core/notes.ts`.
2. Write `src/api/<name>.ts` implementing `MediaClient`, with `getJson`
   injected. Port the CLI client's note format exactly.
3. Copy the CLI's fixtures to `tests/fixtures/` and add parity tests.
4. Add the key to settings (Keychain) if the API needs one, and register a
   command in `src/commands/`.
5. Update `README.md` (including the network-use section) and this file.
