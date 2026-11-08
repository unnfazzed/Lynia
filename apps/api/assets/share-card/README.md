Fonts and mark for the shop share preview card (`src/merchant/share-card.ts`, handoff shop-share-v1 README §4 og:image).

- `inter-700.ttf`, `fredoka-600.ttf`: the website's own subset files (`apps/website/site/assets/fonts/*.woff2`) converted
  to TTF, which the image renderer loads directly. Their family names are changed to `LyniaCard Inter` / `LyniaCard Fredoka`
  so the renderer can only ever use these files, never a system font. Both fonts are under the SIL Open Font License 1.1,
  which allows modified copies under a different name.
- `lyniago-mark.svg`: the LyniaGo mark, as on the website.
