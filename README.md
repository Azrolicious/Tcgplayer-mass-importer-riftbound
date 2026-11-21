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

1. **Choose cards.** All sets and rarities are selected by default. Each set shows its
   card count and estimated cost. You can also set copies per card and a max price per card.
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

## Heads-up: "everything" is expensive

As of November 2026 there are about 1,800 Riftbound singles on TCGplayer. Buying one of
each comes to **roughly $200,000 at market price**. Most of that is promos,
Showcase/Signature/Overnumbered variants and the serial-numbered T1 Worlds cards.
Untick **Showcase** and **Promo** and you're under $20,000. Add a $5 max price and it's
under $1,000. The app shows the running total as you change filters.

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
