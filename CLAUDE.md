# CLAUDE.md

Guidance for Claude Code when working in this repository. General Obsidian
plugin conventions (manifest rules, releases, guidelines) are in `AGENTS.md`,
copied from the official sample plugin. This file covers what is specific to
this plugin. Keep it current when the structure or workflow changes.

## What this is

**Media Notes** (`id: media-notes`) is an Obsidian plugin that creates media
notes from online APIs. It is a TypeScript port of the Python CLI in
`mgaydash/obsidian-tools`, and its notes must match what the CLI writes.

Status: milestones 1 and 2 of 5 done (movies and TV via TMDB; games via
IGDB, albums via MusicBrainz, books via Google Books). Next: lookups (Free
Dictionary), a "download missing posters" command, then community store
submission.

## Decisions (do not revisit without asking)

- **Plugin id is `media-notes`** and can never change after release. Ids may
  not contain "obsidian", which is why it differs from the repo name.
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
│   └── googlebooks.ts      # Google Books (books), edition grouping + retries
├── core/                   # Pure logic, no `obsidian` import, unit-tested
│   ├── addTitle.ts         # The add workflow (port of CLI process_title)
│   ├── disambiguation.ts   # Year filter, exact match, selectResult()
│   ├── genres.ts           # Genre -> tag table (port of genre_mappings.yaml)
│   ├── notes.ts            # Frontmatter, filenames, collections
│   ├── selection.ts        # Selected lines -> titles, and -> link edits
│   └── titles.ts           # "Title (Year)" parsing, title list cleanup
├── obsidian/               # Thin wrappers over Obsidian APIs
│   ├── http.ts             # requestUrl -> getJson/getBytes
│   ├── poster.ts           # Canvas resize to JPEG (quality 0.85)
│   └── vault.ts            # Folder resolution, create-or-modify writes
├── ui/                     # Modals, each with an openAndWait() promise
└── commands/
    ├── addNote.ts          # One "Add <type> note" command per media type
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

## Adding a media type

1. Add the type to `MediaType` and `COLLECTION_BY_MEDIA_TYPE` in `core/notes.ts`.
2. Write `src/api/<name>.ts` implementing `MediaClient`, with `getJson`
   injected. Port the CLI client's note format exactly.
3. Copy the CLI's fixtures to `tests/fixtures/` and add parity tests.
4. Add the key to settings (Keychain) if the API needs one, and register a
   command in `src/commands/`.
5. Update `README.md` (including the network-use section) and this file.
