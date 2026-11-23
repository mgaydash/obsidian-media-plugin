# Changelog

Each release's notes are taken from its section here by the release workflow,
so add a `## <version>` section before tagging.

## 0.3.1

- Settings now appear in Obsidian's settings search (Obsidian 1.13 and later).
  Older versions keep the same settings page as before.
- The 0.3.0 release files were built from an older commit and lacked the
  "Create collection pages and bases" command. This release is built from the
  tagged commit, and the release workflow now refuses a tag that does not
  match `manifest.json`.

## 0.3.0

- New command: **Create collection pages and bases**. It creates a page and a
  Bases file for each media collection, and never overwrites existing files.
- First release under the name Media Note Creator (id `media-note-creator`).

## 0.1.0

- First beta release (as Media Notes): notes for movies, TV, games, albums,
  books and word lookups, with cover art.
