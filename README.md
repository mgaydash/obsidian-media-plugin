# Media Notes

An Obsidian plugin that creates notes for movies and TV shows from
[TMDB](https://www.themoviedb.org/), with poster art. It is a port of the
[obsidian-tools](https://github.com/mgaydash/obsidian-tools) command-line tool,
and writes the same notes it does.

Games, albums, books and word lookups are coming in later releases.

## What it does

Run **Add movie note** or **Add TV note** from the command palette and enter
one or more titles, one per line. If you have text selected in a note, the
prompt starts filled with it, one title per selected line. List bullets, task
checkboxes, headings and `[[wikilink]]` brackets are removed, so a selected
watchlist works as is. For each title the plugin:

1. Searches TMDB. Add a year to narrow the search: `Dune (2021)`.
2. Picks the result automatically when exactly one title matches. Otherwise
   it shows a pick list, and Esc skips that title.
3. Creates `Title (Year).md` with a `collection` property (`[[Movies]]` or
   `[[Series]]`), genre tags, an IMDb link and a description with the director
   or creator and the top three cast members.
4. Downloads the poster, resizes it to your chosen width, saves it next to the
   note as `Title (Year).jpg`, and embeds it at the top of the note.

If a note with that name already exists, you are asked before it is replaced.

## Setup

1. Get a TMDB API key: create an account at themoviedb.org, then go to
   **Settings → API**.
2. In Obsidian, open **Settings → Media Notes**. Under **TMDB API key**, create
   a Keychain entry and paste the key in.
3. Optionally choose a **Notes folder**. When empty, notes go to the
   "Default location for new notes" set in **Settings → Files and links**.

Requires Obsidian 1.11.4 or later, because API keys are stored in the
Obsidian Keychain rather than in the plugin's settings file. Works on desktop
and mobile.

## Network use

The plugin only contacts TMDB (`api.themoviedb.org` and `image.tmdb.org`), and
only when you run one of its commands. It sends the titles you enter and your
API key. Nothing else from your vault leaves your device.

## Development

```bash
npm install
npm run dev     # rebuild main.js on every save
npm test        # unit tests (Vitest)
npm run lint    # ESLint with Obsidian's plugin rules
npm run build   # type-check and production build
```

To try it in Obsidian, clone this repo into a test vault at
`<vault>/.obsidian/plugins/media-notes/`, run `npm install` and `npm run build`,
then enable **Media Notes** under **Settings → Community plugins**. Reload
Obsidian after each rebuild, or install the Hot Reload plugin.

## License

MIT
