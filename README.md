# Belajar Indonesia

A small offline-friendly flashcard app for learning practical Indonesian before your trip, using
spaced repetition (an Anki-style algorithm: cards you find easy show up less often, cards you
struggle with come back sooner).

- Starts completely empty — you type in every word and phrase yourself, in the Browse tab, or pick them
  from the curated **Ideas** tab (see below). There's no forced starter deck; the app is a blank
  flashcard box that's entirely yours to fill, at whatever pace you like.
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

## The Ideas tab — a phrase bank to pick from

The **💡 Ideas** tab has a curated bank of over 400 ready-made phrases you can add to your own deck one
at a time, entirely at your own pace — nothing there is added automatically. It's grouped by category
(**For Sita** — phrases picked out specifically for her — comes first, then Romantic and Funny & Playful,
then Meeting Her Family, Everyday Chat with Friends, and the more standard travel categories: Greetings,
Food, Directions, Shopping, Numbers & Time, Emergencies), with a search box to jump straight to something
specific.

Tap ➕ on any phrase to add it to your real deck — it's added exactly as if you'd typed it in yourself,
complete with a usage note where one's useful (explaining slang like *gombal*, *baper*, or *gemas*, or
who a phrase is meant for), and it's immediately in your Study rotation. Once added, it's marked
**✓ Added** so you always know where you left off; tick "Hide phrases I've already added" to only see
what's left to consider. If you delete something from Browse later, it becomes available in Ideas again.

A good number of the "Meeting Her Family" and casual-friend phrases lean into everyday Jakarta speech
(gue/lo, and particles like *sih*, *dong*, *banget*) rather than textbook-formal Indonesian, since that's
generally how people actually talk day to day.

## Staying on track

Home shows a status line under the 4 stat boxes telling you whether you're keeping pace with adding new
phrases — e.g. "✅ On track — 12 of 12 phrases added (2/day target)" or "⚠️ 3 behind pace — add 3 more to
catch up." It counts any phrase you add, however you add it (typed into Browse, or tapped ➕ in Ideas),
and it's cumulative from the day this feature first showed up in your app — so if you skip a few days,
the shortfall carries over rather than resetting each morning. The daily target starts at 2 but is
yours to change any time in **Settings → Daily phrase target**.

Since there's no way to know exactly when phrases you'd already added before this feature existed were
really added, they don't count toward the target one way or the other — tracking simply starts from
here, going forward.

## Drilling one stuck phrase

Sometimes a normal Study session interleaves other phrases in between reviews, which is by design (an
immediate repeat isn't a real memory test) — but it makes it harder to hammer at one specific phrase you
just aren't getting. For that, go to **Browse**, find the phrase, and tap **🔁** on its row (next to the
✏️ edit button). It opens a focused loop of just that phrase: tap to reveal the answer, tap **🔁 Again**
to reset and try it again, as many times in a row as you want. Tap **✅ Done drilling** whenever you're
ready to stop.

Drilling is separate from your real progress — it doesn't touch that phrase's schedule, ease, or Learned
count, so you can hammer at it as much as you like without throwing off its normal review timing.

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

## Backing up your phrases

Everything still lives only in that one browser's local storage — updating the app's files (following
the steps above) does **not** touch it, since your data is tied to the site's address, not its code.
But plenty of ordinary things around an update *can* wipe it: deleting and re-adding the app to your
iPhone home screen (iOS gives a re-added home-screen app a fresh, empty storage container), clearing
Safari/Chrome site data while troubleshooting, switching phones, or browsing in a private window.

To protect against that, go to **Settings → Backup & restore**:
- **⬇️ Export backup** downloads a `.json` file with every phrase, your review progress, and your
  settings. Do this any time you've added a bunch of new phrases, and especially before you touch
  browser site data or reinstall the home-screen icon.
- **⬆️ Import backup** loads a previously exported file back in, replacing whatever's currently in the
  app. You'll get a confirmation prompt first since it can't be undone.

Keep the exported file somewhere durable — email it to yourself, save it to iCloud/Drive, whatever you'd
normally use for a document you don't want to lose.

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
