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

2. **Scan a photo** (the core feature)
   - Upload/take a **photo or screenshot** of another collector's duplicate list.
   - **OCR** (Tesseract.js, in-browser) extracts the sticker numbers.
   - **Review & correct** the detected numbers — remove wrong ones, add missed
     ones. Low-confidence reads are visibly flagged.
   - **Compare** against your list. Results are grouped clearly:
     - 🟢 **They have — you're missing** (the ones you want)
     - 🔵 **You already own these**
     - 🟠 **Not on your list** — decide manually
     - 🟠 **Not confidently recognised** — needs your review

3. **Propose a trade**
   - Enter (type / paste / import) the other collector's **missing/wanted** list.
   - The app matches *their wants* against *your duplicates*, and *their
     duplicates* (from the Scan tab) against *your missing* list, and proposes a
     **balanced two-way exchange** (you give ⇄ you receive).

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
3. **Scan tab** → *Choose image* → take/upload a photo of a handwritten or
   printed list of numbers (some that are on your Missing list, e.g. `3 5 8 12`).
   Watch OCR progress, then review the chips. Tap wrong ones to remove; add any
   it missed. Press **Compare with my list** and check the four result groups.
4. **Trade tab** → type a few numbers that match your **Duplicate** stickers
   (from the sample: `4 7 11 ARG3 FWC1`) as the other collector's wanted list,
   then **Build proposed exchange**. You'll get a balanced give/receive summary.

### OCR tips (for best results)
- Good lighting, numbers roughly horizontal, minimal background clutter.
- Screenshots of typed lists read far better than blurry photos.
- Always review the detected numbers before comparing — OCR is not perfect,
  which is exactly why the review step exists.

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
