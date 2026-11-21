# Riftbound Mass Entry

A one-page web app that puts **every Riftbound card from every set** into your
[TCGplayer](https://www.tcgplayer.com) cart, using TCGplayer's own
[Mass Entry](https://www.tcgplayer.com/massentry) tool.

It runs in any browser: desktop (Windows, macOS, Linux) or phone (Android, iPhone).
There's nothing to install and no login. You add to cart on TCGplayer's site, in your
own browser, so your cart and account stay yours.

## Use it

**Online (easiest, works on Android):** once GitHub Pages is on (see below), open

> https://azrolicious.github.io/Tcgplayer-mass-importer-riftbound/

On Android, in Chrome's menu tap **Add to Home screen** to get an app icon.

**Offline / local:** download this repository (Code → Download ZIP), unzip it, and
double-click `index.html`. Keep the `data` folder next to it.

### Turning on GitHub Pages (one time)

1. On GitHub, open the repository's **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to *Deploy from a branch*.
3. Pick the branch that holds these files and the `/ (root)` folder, then **Save**.
4. After a minute the link above starts working.

## How it works

1. **Choose cards.** By default you get each set's numbered cards (Origins 001–298,
   Spiritforged 001–221, and so on) in every rarity. Tick **Extras** to add cards outside
   those numbered lists. A **Versions** row then lets you pick which kinds; *Alternate Art*
   stays off unless you tick it. Each set shows its card count and estimated cost. You can
   also set copies per card and a max price per card.

   To hand-pick cards, tap the **›** arrow on a set. Its cards open in a searchable list with
   a checkbox for each one. The set's own checkbox still selects or clears the whole set, and
   shows a dash when only some of its cards are picked.
2. **Send to TCGplayer.** The cards are split into batches (100 by default). Tap
   **Open in TCGplayer** on a batch. Mass Entry opens with those cards already filled in.
3. In TCGplayer's **Item Options** popup, keep the printings and conditions you want and
   press **Add to Cart**. TCGplayer picks the cheapest sellers for you.
4. Come back and open the next batch. Every batch lands in the same cart, and opened
   batches get a checkmark (saved on that device) so you can stop and resume later.

Each batch link looks like this:

```
https://www.tcgplayer.com/massentry?c=1-652771||1-652772||...&productline=Riftbound%20League%20of%20Legends%20Trading%20Card%20Game
```

`1-652771` means "1 copy of TCGplayer product 652771", so every line points at one exact
card. Under **Advanced** you can switch to readable lines instead (`1 Blazing Scorcher [OGN]`),
which use the same set codes Mass Entry lists under *Show Set/Series Codes*.
**Copy list** copies a batch's lines so you can paste them into Mass Entry yourself.

## What it costs

Prices as of November 2026 (the app shows a live total as you change filters):

- **Numbered cards of every set (the default):** 1,098 cards, about **$1,400** at market price.
- **Everything, extras included:** about 1,800 cards and **roughly $200,000**. Most of that is
  promos, Signature/Overnumbered versions and the serial-numbered T1 Worlds cards. Alternate
  Art is only about $2,000 of it.

## Numbered cards vs. extras

A set's **numbered list** is its main run, `001/298` to `298/298` for Origins. The data script
works it out per set (`main_run` in `scripts/update_data.py`):

| Set | Numbered cards | Extras |
| --- | --- | --- |
| Origins (OGN) | 001–298 | 61 |
| Origins: Proving Grounds (OGS) | 01–24 | 4 |
| Spiritforged (SFD) | 001–221 | 88 |
| Unleashed (UNL) | 001–219 | 95 |
| Vendetta (VEN) | 001–166 | 88 |
| Radiance (RAD) | 001–167 | 79 |
| Secret Garden (SGN) | 1–3 | 0 |
| Promo and bundle groups (OPP, PR, JDG, RWB, T12025, RXK/DA) | none | all |

**Extras** are everything else: overnumbered cards (`299/298`), lettered alternate arts
(`027a/298`), signatures (`299*/298`), tokens, the `R01`–`R06` runes in Spiritforged and later
sets, and all promo and bundle cards (those reuse other sets' numbers, so they don't count as
a set's numbered list).

### Versions (only used when extras are on)

Version buckets come from the tags TCGplayer puts in product names (see `variant_of` in
`scripts/update_data.py`):

| Version | Includes |
| --- | --- |
| Alternate Art | `(Alternate Art)`, alternate-art runes like `Fury Rune (A)` / `(R01b)`, `(K/DA Special Art Card)`, `(Full Art)` |
| Overnumbered | `(Overnumbered)`, `(Heartsteel Overnumbered)` |
| Signature | `(Signature)`, `(Heartsteel Signature)` |
| Metal | `(Metal)` prize cards |
| Other special versions | Oversized, Top 8, Champion, T1 Worlds bundle and serial-numbered cards, and similar |
| Standard | Everything else |

## If something goes wrong

- **Some lines turn red** ("could not be found" / "not enough quantity"): listings change
  constantly. Delete the red lines on TCGplayer and press Add to Cart again.
- **"Your cart is full"**: TCGplayer caps cart size. Check out (or save for later) what you
  have, then continue with the next unchecked batch.
- **No game selected in Mass Entry / no printings in the popup**: press *Edit Items*, choose
  *Riftbound: League of Legends Trading Card Game*, then Add to Cart. If that happens every
  time, change the product line name under **Advanced**.
- **Rares and up are foil-only.** Unticking *Foil* in Item Options makes those cards fail.
- **Android opens the TCGplayer app** instead of the website: long-press the button and
  choose *Open in new tab*.
- Cards that nobody is selling are skipped by default, because TCGplayer can't add them and
  one unfillable line can stop a whole batch.

## Card data

The card list and prices come from [TCGCSV](https://tcgcsv.com), which mirrors TCGplayer's
catalog every day. They're saved in `data/riftbound-cards.js`.

- A GitHub Action (`.github/workflows/update-data.yml`) refreshes the file daily, so new sets
  show up on their own. You can also run it from the **Actions** tab.
- To refresh by hand (Python 3.8+, no packages needed):

  ```
  python3 scripts/update_data.py
  ```

Only singles are included. Sealed product (booster boxes, packs, decks, bundles) is left out.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The whole app (HTML, CSS and JavaScript in one file) |
| `data/riftbound-cards.js` | Generated card list and prices |
| `scripts/update_data.py` | Rebuilds the data file from TCGCSV |
| `.github/workflows/update-data.yml` | Daily data refresh |
| `manifest.webmanifest`, `icon.svg` | Home-screen app name and icon |

Not affiliated with TCGplayer or Riot Games.
