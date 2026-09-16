# Belajar Indonesia

A small offline-friendly flashcard app for learning practical Indonesian before your trip, using
spaced repetition (an Anki-style algorithm: cards you find easy show up less often, cards you
struggle with come back sooner).

- Starts completely empty — you type in every word and phrase yourself, in the Browse tab. There's no
  built-in starter deck; the app is a blank flashcard box that's entirely yours.
- Installable as a home-screen app (PWA) and fully usable with no internet connection once installed —
  built for using it in Indonesia without data.
- Everything — your phrases and your review progress — is stored only in your phone's local storage
  (no account, no backend, nothing leaves your phone). That also means it lives in one browser on one
  device: there's no sync between your phone and a computer, and clearing Safari/Chrome site data wipes it.
- Optional pronunciation playback using your phone's built-in text-to-speech, including a hands-free
  **Listen** mode that reads through a whole set of phrases for you.

## Adding your own phrases

Open the **Browse** tab and tap **+ Add phrase**. Each entry has:
- **Indonesian** and **English** text (required)
- **Category** — free text, used to group phrases and to filter what you study in Settings. Use the
  same category name across entries to group them (e.g. "Greetings", "Food").
- **Note** (optional) — a usage tip, pronunciation hint, or context.

Tap the ✏️ on any row in Browse to edit or delete it. Editing keeps its review history; deleting removes
it for good, including its schedule.

## Deploying to GitHub Pages

Same pattern as your other apps (Tidy Clean Organized, HuntAI):

1. Create a new repository on GitHub, e.g. `belajar-indonesia` (public repos get free Pages hosting).
2. Push all the files in this folder to the repo's `main` branch — including the hidden `.nojekyll`
   file at the root. That file matters: without it, GitHub Pages runs a Jekyll build that can silently
   serve a stale/cached version of the site (this bit us on the Tidy app — see its notes).
3. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: main / (root)**.
4. Wait a minute or two, then visit `https://<your-username>.github.io/belajar-indonesia/`.
5. On your iPhone, open that URL in Safari → Share → **Add to Home Screen**. It'll launch full-screen
   like a native app from then on.

### Quick push from a terminal, if you'd rather script it

```bash
cd belajar-indonesia   # after copying these files in
git init
git add .
git commit -m "Initial version of Belajar Indonesia"
git branch -M main
git remote add origin https://github.com/<your-username>/belajar-indonesia.git
git push -u origin main
```

## Before you fly: turn on the Indonesian voice pack

The 🔊 pronunciation button uses your phone's built-in speech engine so it also works offline, but the
Indonesian voice itself usually needs to be downloaded once *while you still have Wi-Fi at home*:

- **iPhone**: Settings → Accessibility → Spoken Content → Voices → Indonesian → download a voice.
- **Android**: Settings → Accessibility → Text-to-speech → install the Indonesian language pack for
  your TTS engine (usually Google).

If no Indonesian voice is installed, the button just does nothing (no error) — the app still works
fine for reading/reviewing without it.

## If you make changes later and GitHub Pages seems to be showing an old version

This happened on the Tidy Clean Organized app. Fix, in order:
1. Confirm `.nojekyll` exists at the repo root.
2. Compare `https://raw.githubusercontent.com/<user>/<repo>/main/index.html` (the real latest file)
   against the live `*.github.io` URL — if they differ, Pages is serving a stale build.
3. Bump the `?v=` query strings in `index.html` (for `styles.css`, `app.js`) and the `CACHE_NAME` value
   in `sw.js` (e.g. `v3` → `v4`) — this forces the service worker to fetch fresh files instead of serving
   its offline cache. This only affects the *app code* — your phrases and progress live in local storage
   and are untouched by any of this.

## Worth knowing: there's no backup yet

Because everything lives in that one browser's local storage, there's currently no way to export your
phrase list or back it up elsewhere. If you clear Safari/Chrome site data, switch phones, or reinstall,
your added phrases and progress are gone. If that's a concern, say the word and an export/import feature
(e.g. to a JSON or CSV file you can keep a copy of) is a reasonable thing to add later.

## How the spaced repetition works, briefly

- Rate each card **Again / Hard / Good / Easy** after revealing the answer. The interval before you see
  it again grows the more consistently you get it right, and shrinks if you get it wrong — the app front
  screen shows how many are due today.
- There's no daily cap and no lockout: once everything due is reviewed, Study switches to a free-practice
  round through every phrase so you can keep going as much as you want.
- Settings lets you restrict which categories you're studying, and choose direction (Indonesian→English,
  English→Indonesian, or mixed — mixed is recommended so you practice both recognizing and recalling).

## Listen mode (hands-free playback)

In **Browse**, tap **▶️ Listen** to have the app read through the phrases currently on screen — so if
you've searched or scrolled to a particular category, Listen plays just that set; clear the search and
it plays everything. For each phrase it speaks the English at normal speed, pauses about 3 seconds (time
to guess the Indonesian yourself before it tells you), then the Indonesian slowed down, a shorter pause,
then moves to the next one, with the current phrase highlighted
as it plays so you can follow along visually. Reaching the end loops straight back to the start rather
than stopping, so you can prop the phone up and let it run continuously. Tap **⏭️** to skip to the next
phrase immediately, or tap the button again (now showing **⏸️ Pause**) to stop.

Two things worth knowing about Listen mode, both coming from how phone browsers handle text-to-speech:
- It needs to be started with a tap — like the 🔊 button, browsers won't let a page start talking on
  its own without you touching something first, so it always begins with you tapping ▶️ Listen.
- It's not reliable if you background the app or lock the screen while it's playing — phone browsers
  routinely pause or kill speech synthesis in the background. Keep the app in the foreground and the
  screen on while Listen mode is running.

Listen mode also stops automatically if you edit a phrase, change your search, toggle the learned-only
filter, or leave the Browse tab — all of those change what it would be reading, so it plays it safe and
lets you restart it once things have settled.

## The "Learned" list

Rate a phrase **Easy** five times (cumulative — they don't need to be in a row) and it's added to your
Learned count, shown on the Home screen and marked with a ⭐ badge in Browse (tick "Show learned only" to
see just that list). It doesn't disappear from your review rotation, though — it's still scheduled
normally and will come back around occasionally to check it's stuck. Answer **Again** on a learned card
even once and it's removed from the Learned list completely, resetting its Easy count to zero — it has to
earn its way back in from scratch.
