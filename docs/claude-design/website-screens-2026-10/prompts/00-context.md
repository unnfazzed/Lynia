# 00 · Context (paste first)

**Resources to attach:** `resources/tokens/*.css`, every file in `resources/current-site/*.png`, `resources/current-site/page/index.html`

---

```
We're updating the app screens on the lyniago.com landing page. They show an old version of the LyniaGo app (an auction screen, a "Re-issue delivery code" button, a solid-green rider header, the old dove splash). I'm attaching the current images and the page HTML.

Two sections change:
1. "How it works": 3 cards. Each has a phone image (step-N-phone) and a highlight crop (step-N-hl) that the page overlays with a coloured outline.
2. The hero collage: 4 phone screens (app-splash, app-send, app-tracking, app-rider). The page wraps each one in a coloured, tilted frame using CSS.

DON'T change the page layout, card shapes, tile colours, frame colours, tilt, background shapes or headline type. Only the images change, plus a copy pass (rider → biker) at the end.

Image specs (the CSS depends on them):
- Hero screens: 265×530 (also export at 2×). The flat screen only: no frame, no tilt, no shadow. Draw at 360×720 and scale down.
- step-1-phone 500×605; step-2-phone and step-3-phone 500×537. The top part of a phone: black bezel with the notch, transparent outside the device. Crop straight through the screen at the bottom, like the current files.
- step-N-hl: 600 wide, height to fit. The component flat on white. No outline, shadow or tilt (the page CSS adds those).

The app's visual language (use the attached tokens; don't invent values):
- accent fill #00b14f, accent text #006630, accent wash #e9f8ef
- ink #14181b, muted #5b6670, line #e2e6ea, surface #f6f7f8, danger #c0392b
- radius 12 on inputs and cards, pill radius on buttons
- Inter for all UI text; Fredoka only for the "LyniaGo" wordmark
- Pickup is always a green circle and drop-off always a red square
- Cash only. Every icon has a visible text label.
- The status bar reads "9:41"
- The app says "biker", never "rider"

I'll send one prompt per screen, with that screen's source design attached. Match the source exactly: copy, sizes, colours.
```
