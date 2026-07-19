# ⚽ World Cup Sticker Matcher

A **mobile-friendly, fully client-side** web app for managing a World Cup
sticker collection and matching it against other collectors' duplicates using
**OCR from a photo** — no server, no database, no paid API.

Everything runs in your browser and your data is stored locally
(`localStorage`). It's designed to be used from an Android phone.

---

## What it does

1. **My collection**
   - Import a master list from **CSV or Excel** (`number`, `status` where status
     is *Owned / Missing / Duplicate*).
   - **Add, edit (change status), and delete** stickers manually.
   - Search, filter, live counts, and **CSV export** (backup).

2. **Match & swap** (the core feature)
   - Two sides, each with its own **camera / upload** buttons and editable review
     box (you can also just type):
     - **① They GIVE** — the other collector's spares.
     - **② They WANT** — the stickers they're missing.
   - **OCR** (Tesseract.js, in-browser) reads each photo/screenshot into the
     right box. You can upload **several images at once** and they accumulate.
   - The app reads the **country first, then each number**, so a sticker is
     identified as `ECU 2` — not a bare `2` (which would be ambiguous across
     countries). Country codes are auto-corrected against your own collection,
     and numbers written as `3` or `03` are treated the same.
   - **Compare & propose swap** produces a **balanced two-way exchange**:
     - 🟢 **You RECEIVE** — they give, you need (their spares ∩ your Missing)
     - 🤝 **You GIVE** — they want, you have spare (their wants ∩ your Duplicates)
     - 🔵 **They give, but you already have / don't need**
     - 🟠 **Couldn't read confidently** — fix the text and re-compare

---

## Project structure

```
.
├── index.html               # App shell + tab layout (single page)
├── manifest.webmanifest     # PWA manifest (installable app metadata)
├── sw.js                    # Service worker (offline caching)
├── icons/                   # App icons (SVG source + 192/512 PNG)
├── css/
│   └── styles.css           # Mobile-first styles, bottom tab bar, dark mode
├── js/
│   ├── storage.js           # localStorage data layer + normalisation rules
│   ├── importer.js          # CSV / Excel / text parsing + CSV export
│   ├── stickers.js          # Collection list UI (CRUD, search, filter)
│   ├── ocr.js               # Tesseract OCR + sticker-number extraction
│   ├── matcher.js           # Compare detected numbers vs my collection
│   ├── trade.js             # Two-way exchange proposal
│   └── app.js               # Wiring: tabs, imports, OCR review, results
├── sample-data/
│   └── sample-master-list.csv
├── docs/
│   └── DATA_FORMAT.md       # Import format & matching rules
├── tests/
│   └── run-tests.js         # Dependency-free unit tests for the logic
├── package.json
└── README.md
```

The three external libraries (PapaParse, SheetJS, Tesseract.js) are **free and
open source** and loaded from a public CDN in `index.html`.

---

## How to run

You need to serve the folder over HTTP (OCR uses a web worker, which does not
work from a `file://` URL). Any static server works — pick one:

**Python (already on most machines):**
```bash
cd /path/to/Stickers
python3 -m http.server 8080
```

**Node:**
```bash
npx serve .        # or: npx http-server -p 8080
```

Then open <http://localhost:8080> in a browser.

Serving locally is only reachable from the same Wi-Fi as your computer. To use
the app from **any network** (mobile data, other Wi-Fi, another person's phone),
deploy it publicly — see below.

---

## Deploy it so anyone can use it from any network

The app is a static site, so any free static host works. Because the code is
already on GitHub, **GitHub Pages** is the least-effort choice. It gives you a
public **HTTPS** URL — which is also required for the camera and for installing
the app to a phone's home screen.

### GitHub Pages (recommended, free)

1. Get the app onto the branch Pages will serve (e.g. merge this branch into
   `main`).
2. On GitHub: **Settings → Pages**.
3. Under **Build and deployment**, set **Source = Deploy from a branch**.
4. Choose the branch (e.g. `main`) and folder **`/ (root)`**, then **Save**.
5. Wait ~1 minute. Your app is live at
   `https://<your-username>.github.io/<repo>/`
   (for this repo: `https://gtsirakkis.github.io/Stickers/`).

Share that URL with your wife — it works from any network, on any phone.
Netlify and Cloudflare Pages are equivalent free alternatives (drag-and-drop
the folder or connect the repo).

### Install it as an app (PWA)

This is a **Progressive Web App**, so once the public URL is open on a phone:

- **Android (Chrome):** tap the **⋮** menu → **Add to Home screen** / **Install
  app**. You'll get a soccer-ball icon that opens full-screen like a native app.
- **iPhone (Safari):** tap **Share** → **Add to Home Screen**.

After the first visit the app is cached and **opens offline**; the OCR model is
also cached after its first use, so scanning works without a connection too.
Your collection lives on each phone independently.

---

## How to test

**Automated logic tests** (no browser needed — pure functions run under Node):
```bash
npm test          # or: node tests/run-tests.js
```
This covers normalisation, import/merge, OCR number extraction, matching, and
the trade proposal.

**Manual end-to-end walkthrough:**
1. Start the server and open the app.
2. **Collection tab** → *Choose file* → pick
   `sample-data/sample-master-list.csv`. You should see counts populate
   (Owned / Missing / Duplicate). Try changing a status and deleting a row.
3. **Match & swap tab** → in **① They GIVE**, take/upload a photo of the other
   collector's spares (or type `ECU: 1, 2, 8`). In **② They WANT**, add the
   stickers they're missing (`MEX: 3, 5, 12`). Correct any wrong country codes
   or numbers, then press **Compare & propose swap**.
4. Check the result: **You RECEIVE** (their spares you're missing) and **You
   GIVE** (their wants you have spare), with a balanced N-for-N summary.

### OCR tips (for best results)
- Good lighting, text roughly horizontal, minimal background clutter.
- Screenshots of typed lists read far better than blurry photos.
- Keep one country per line so the country code stays with its numbers.
- Always review the text before comparing — OCR is not perfect, which is exactly
  why the review step exists. Country codes are auto-corrected against your
  collection, and numbers above your highest sticker number are flagged.

---

## Privacy & storage

- No accounts, no network calls for your data — the collection lives only in
  your browser under the `localStorage` key `wcsm.collection.v1`.
- Photos are processed **on-device**; images are never uploaded.
- Use **Export CSV** to back up, and re-import to restore or move devices.
- See [`docs/DATA_FORMAT.md`](docs/DATA_FORMAT.md) for the exact file format.

---

## Roadmap / ideas

- IndexedDB for very large collections.
- Multiple saved collections / other-collector profiles.
- Sticker-set templates (auto-generate the full 1–N checklist).

## License

MIT
