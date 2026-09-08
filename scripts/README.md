
## Add one or more symbols

1. Edit `scripts/additional-symbols.js` and add a tag such as `NEWTOKENUSDT`.
2. Run `npm run history:add-symbol`. or `npm run history:download` to download initial selected tags
3. Rebuild the combined package with `npm run history:build`.
4. Verify it with `npm run history:verify`.

The downloader reuses existing files and downloads only missing archives. The package builder includes the original symbols and the added symbols in the new manifest. Clear the array after packaging if you do not want the next run to refresh that symbol group.
