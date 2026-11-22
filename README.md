# Media Notes

An Obsidian plugin that creates notes for movies, TV shows, games, albums and
books, with cover art. It is a port of the
[obsidian-tools](https://github.com/mgaydash/obsidian-tools) command-line tool,
and writes the same notes it does.

| Command | Source | Note name | Collection |
| --- | --- | --- | --- |
| **Add movie note** | [TMDB](https://www.themoviedb.org/) | `Title (Year).md` | `[[Movies]]` |
| **Add TV note** | TMDB | `Title (Year).md` | `[[Series]]` |
| **Add game note** | [IGDB](https://www.igdb.com/) | `Title (Year).md` | `[[Games]]` |
| **Add album note** | [MusicBrainz](https://musicbrainz.org/) and the Cover Art Archive | `Artist - Album (Year).md` | `[[Albums]]` |
| **Add book note** | [Google Books](https://books.google.com/) | `Author - Title (Year).md` | `[[Books]]` |

Word lookups are coming in a later release.

## What it does

Run one of the commands above from the command palette and enter
one or more titles, one per line. If you have text selected in a note, the
prompt starts filled with it, one title per selected line. List bullets, task
checkboxes, headings and `[[wikilink]]` brackets are removed, so a selected
watchlist works as is. When it finishes, each selected line whose note was
created becomes a link to that note. Bullets and checkboxes stay, and the
**Link text** setting decides what the link shows:

| Link text | `- mission impossible` becomes |
| --- | --- |
| Title and year, as the source shows them (default) | `- [[Mission - Impossible (1996)\|Mission: Impossible (1996)]]` |
| Title, as the source shows it | `- [[Mission - Impossible (1996)\|Mission: Impossible]]` |
| The text as you typed it | `- [[Mission - Impossible (1996)\|mission impossible]]` |
| Name of the new note | `- [[Mission - Impossible (1996)]]` |

The display text is left out when it would just repeat the note name.

For each title the plugin:

1. Searches the source. Add a year to narrow the search: `Dune (2021)`.
2. Picks the result automatically when exactly one title matches. Otherwise
   it shows a pick list, and Esc skips that title. A game with no release
   date yet asks before it is added.
3. Creates the note with a `collection` property, tags (genres; play modes for
   games; release types such as live or compilation for albums), a link to the
   source page, and a description: director or creator and top cast for films
   and TV, developer and publisher for games, artist and label for albums,
   the blurb and author for books. Games, albums and books with no date get
   `(TBD)` in place of the year.
4. Downloads the cover, resizes it to your chosen width, saves it next to the
   note with the same name as a `.jpg`, and embeds it at the top of the note.

If a note with that name already exists, you are asked before it is replaced.

## Setup

Get keys for the sources you want, then in Obsidian open
**Settings → Media Notes** and, for each key, create a Keychain entry and paste
it in.

| Media | Key | Where to get it |
| --- | --- | --- |
| Movies, TV | TMDB API key | themoviedb.org → **Settings → API** |
| Games | Twitch client ID and client secret | Register an application at [dev.twitch.tv](https://dev.twitch.tv/console/apps) ([IGDB guide](https://api-docs.igdb.com/#account-creation)) |
| Albums | None | |
| Books | Google Books API key | [Google Cloud console](https://console.cloud.google.com/): turn on the Books API, then create an API key |

Optionally choose a **Notes folder**. When empty, notes go to the
   "Default location for new notes" set in **Settings → Files and links**.

Requires Obsidian 1.11.4 or later, because API keys are stored in the
Obsidian Keychain rather than in the plugin's settings file. Works on desktop
and mobile.

## Network use

The plugin contacts these services only when you run one of its commands,
and only the one for the media type you chose. It sends the titles you enter
and your key for that service. Nothing else from your vault leaves your device.

| Media | Hosts |
| --- | --- |
| Movies, TV | `api.themoviedb.org`, `image.tmdb.org` |
| Games | `id.twitch.tv` (sign-in), `api.igdb.com`, `images.igdb.com` |
| Albums | `musicbrainz.org`, `coverartarchive.org` (and `archive.org`, where covers are stored) |
| Books | `www.googleapis.com`, `books.google.com` |

MusicBrainz requests carry a User-Agent naming this plugin, as MusicBrainz
requires, and are spaced at least one second apart.

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
