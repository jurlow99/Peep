# Media Specs

Specs for every image and video asset on Peep.

---

## Poster

Used as the card artwork in all browse rows and grids.

- **Dimensions:** 400 × 600px (2:3 ratio)
- **Safe zone:** keep faces/text inside the center 320 × 460 area
  - 40px margin left/right
  - 70px margin from top
  - 100px margin from bottom — the platform overlays the title here, anything in that zone gets covered
- **Format:** JPG or PNG
- **Tips:** Subject should be framed in the upper-center. Dark or busy bottom edges are fine since the title sits on top.

---

## Hero / Thumbnail

Full-screen banner image shown at the top of the home screen for featured content.

- **Dimensions:** 1920 × 1080px (16:9)
- **Safe zone:** keep key subjects inside the center 1400 × 800 area
  - 260px margin left/right
  - 140px margin top/bottom
- **Format:** JPG or PNG
- **Tips:** The image is cropped to show the top 20% first (`objectPosition: center 20%`), so frame subjects toward the upper half. Left side is where the title/buttons overlay — keep that area darker or free of competing detail.

---

## Hero Trailer (background autoplay)

Short clip that plays silently behind the hero banner after 3 seconds.

- **Aspect ratio:** 16:9 (matches the hero image)
- **Format:** Direct `.mp4` file — must be hosted in Supabase storage
  - YouTube/Vimeo links are **not** supported for background autoplay; those open in a modal instead
- **Duration:** Plays for 25 seconds, then pauses 25 seconds, then loops
- **Behavior:** Muted by default. Viewer can unmute with the button in the corner.
- **Tips:** Keep the most compelling part in the first 25 seconds. Avoid hard cuts at the very start — the fade-in takes ~1.4s.

---

## Card Hover Trailer (preview on hover)

Same file as the hero trailer. When a viewer hovers a card for 400ms, it expands into a 16:9 preview overlay and plays the trailer.

- **Requirements:** Must be a direct `.mp4` — same file used for the hero trailer works
- **Cloudflare Stream videos are excluded** — only direct file uploads get the hover preview
- **Overlay size:** ~560 × 315px at 16:9

---

## Podcast Artwork

Square image shown in podcast rows and on the podcast detail page.

- **Dimensions:** 1400 × 1400px (square)
- **Format:** JPG or PNG
- **Tips:** Standard podcast cover art dimensions — same file you'd submit to Apple Podcasts or Spotify works here.

---

## Music / Album Artwork

Square image shown in the music section.

- **Dimensions:** 1400 × 1400px (square)
- **Format:** JPG or PNG

---

## Summary Table

| Asset | Dimensions | Format | Notes |
|---|---|---|---|
| Poster | 400 × 600px | JPG/PNG | Bottom 100px covered by title |
| Hero / Thumbnail | 1920 × 1080px | JPG/PNG | Subject upper-half, left side stays dark |
| Hero Trailer | 16:9, any resolution | .mp4 (direct) | No YouTube/Vimeo for bg autoplay |
| Card Hover Trailer | same file as hero trailer | .mp4 (direct) | Cloudflare Stream excluded |
| Podcast Artwork | 1400 × 1400px | JPG/PNG | Standard podcast cover art |
| Music / Album Art | 1400 × 1400px | JPG/PNG | |
