/*
 * Turns a pasted deck (a deck code or a text list) into TCGplayer products from
 * data/riftbound-cards.js. No network access: everything is matched locally.
 *
 *   var resolver = RiftboundDecks.createResolver(window.RIFTBOUND_DATA);
 *   var result = RiftboundDecks.importDeck(text, resolver);
 *   // result: { ok, kind: 'code'|'list', cards: [{id, qty, side}], championId, name,
 *   //           unmatched: [{text, qty, reason}], skipped: [line], error }
 */
(function (root) {
  'use strict';

  var DeckCode = root.RiftboundDeckCode || (typeof require === 'function' ? require('./deckcode.js') : null);

  // ---- helpers ----
  function normName(s) {
    return String(s || '')
      .replace(/[‘’‛′`´]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, '-')
      .normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').replace(/[.\s]+$/, '').trim();
  }

  // "007a/298" -> "7a", "R01" -> "R1", "SP3/006" -> "SP3", "299*/298" -> "299s"; null if unusual.
  function numberKey(number) {
    var m = /^([A-Za-z]{0,2})0*(\d+)([a-z*]?)(?:\/\d+)?$/.exec(String(number || '').trim());
    if (!m) return null;
    return m[1].toUpperCase() + m[2] + (m[3] === '*' ? 's' : m[3].toLowerCase());
  }

  // Lower is better: the ordinary printing from the set's numbered list, then cheapest.
  function rank(c) {
    var price = c.market != null ? c.market : c.low;
    return [
      (c.variant || 'standard') === 'standard' ? 0 : 1,
      c.main === false ? 1 : 0,
      c.low == null ? 1 : 0,
      price == null ? 1e9 : price,
      c.id
    ];
  }
  function better(a, b) {
    var ra = rank(a), rb = rank(b);
    for (var i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] < rb[i];
    return false;
  }

  function createResolver(data) {
    var setsById = {};
    var setCodes = {};
    data.sets.forEach(function (s) { setsById[s.id] = s; if (s.code) setCodes[s.code.toUpperCase()] = true; });
    if (DeckCode) DeckCode.SETS.forEach(function (c) { setCodes[c] = true; });

    var byCode = {};
    var byName = {};
    var byId = {};
    data.cards.forEach(function (c) {
      byId[c.id] = c;
      var set = setsById[c.set];
      var nk = numberKey(c.number);
      if (set && nk) {
        var key = set.code.toUpperCase() + '-' + nk;
        if (!byCode[key] || better(c, byCode[key])) byCode[key] = c;
      }
      var n = normName(c.name);
      if (!byName[n] || better(c, byName[n])) byName[n] = c;
    });

    function findCode(setCode, number) {
      var nk = numberKey(number);
      return nk ? byCode[String(setCode).toUpperCase() + '-' + nk] || null : null;
    }
    function findName(name) {
      var n = normName(name);
      if (!n) return null;
      if (byName[n]) return byName[n];
      // "Name (anything)" or "Name - anything" as a fallback
      var stripped = n.replace(/\s*[\[(][^\])]*[\])]\s*$/, '').replace(/\s+-\s+.*$/, '');
      return stripped !== n && byName[stripped] ? byName[stripped] : null;
    }
    var codeSets = Object.keys(setCodes).sort(function (a, b) { return b.length - a.length; })
      .map(function (c) { return c.replace(/[^A-Z0-9]/g, function (ch) { return '\\' + ch; }); });
    return {
      byId: byId,
      findCode: findCode,
      findName: findName,
      // "(OGN-247)", "[OGN] 247", "OGN 247/298", "OGN-R01", "VEN-SP3a" ...
      codePattern: new RegExp('(?:^|[\\s\\[(])(' + codeSets.join('|') + ')[\\])]?(?:[\\s#:-]+|-)([A-Za-z]{0,2}\\d{1,3}[a-z*]?)(?:\\/\\d+)?[\\])]?', 'i')
    };
  }

  // ---- deck codes ----
  function findDeckCode(text) {
    var t = String(text || '').trim();
    if (DeckCode && DeckCode.looksLikeCode(t)) return t;
    var m = /(?:^|[^A-Za-z0-9])([A-Z2-7]{30,})(?:[^A-Za-z0-9]|$)/.exec(t); // code inside other text
    return m ? m[1] : null;
  }

  function fromCode(code, resolver) {
    var deck = DeckCode.decode(code);
    var out = newResult('code');
    function add(entry, side) {
      var m = /^([A-Z]{3})-(.+)$/.exec(entry.code);
      var card = m && resolver.findCode(m[1], m[2]);
      if (!card) {
        out.unmatched.push({ text: entry.code, qty: entry.count, reason: codeReason(m && m[1]) });
        return;
      }
      addCard(out, card, entry.count, side);
    }
    deck.main.forEach(function (e) { add(e, false); });
    deck.sideboard.forEach(function (e) { add(e, true); });
    deck.legends.forEach(function (c) { add({ code: c, count: 1 }, false); }); // legends beyond the starting one
    if (deck.champion) {
      var cm = /^([A-Z]{3})-(.+)$/.exec(deck.champion);
      var champ = cm && resolver.findCode(cm[1], cm[2]);
      if (champ) out.championId = champ.id;
    }
    return out;
  }

  // ---- text lists ----
  var SECTION = /^(?:#+\s*|\/\/\s*)?([A-Za-z][A-Za-z ]{1,24}?)\s*(?:\(\s*\d+\s*\))?\s*:?\s*(?:\(\s*\d+\s*\))?$/;
  var KNOWN_SECTIONS = /^(legends?|chosen champion|champions?|main ?deck|main|deck|battlefields?|runes?|rune deck|side ?board|side ?deck|side|reserve|maybe ?board|tokens?)$/i;

  function fromList(text, resolver) {
    var out = newResult('list');
    var side = false;
    var skipSection = false;
    var championSection = false;
    String(text || '').split(/\r?\n/).forEach(function (raw) {
      var line = raw.replace(/\t/g, ' ').trim();
      if (!line || /^(#|\/\/)\s*$/.test(line)) return;

      // Section headers such as "Sideboard:", "Runes (12)", "## Main Deck"
      var sec = SECTION.exec(line);
      if (sec && !/^\d/.test(line) && (KNOWN_SECTIONS.test(sec[1].trim()) || /:\s*$/.test(line))) {
        var name = sec[1].trim().toLowerCase();
        side = /^side/.test(name);
        skipSection = /^maybe/.test(name);
        championSection = /champion/.test(name);
        return;
      }
      if (skipSection) return;

      // "Legend: Kai'Sa, Daughter of the Void" puts a single card right after its label.
      var labelled = /^(legends?|chosen champion|champions?|battlefields?)\s*:\s*(.+)$/i.exec(line);
      var isChampion = championSection;
      if (labelled) { line = labelled[2].trim(); isChampion = /champion/i.test(labelled[1]); }

      var qty = null;
      var rest = line;
      var m = /^(\d{1,3})\s*[x×]?\s+(.+)$/i.exec(line) || /^(\d{1,3})[x×]\s*(.+)$/i.exec(line);
      if (m) { qty = parseInt(m[1], 10); rest = m[2]; }
      else if ((m = /^(.+?)\s*[x×]\s*(\d{1,3})$/i.exec(line))) { qty = parseInt(m[2], 10); rest = m[1]; }
      rest = rest.replace(/^[-*•]\s*/, '').trim();

      var card = null;
      var reason = 'no card with that name';
      var code = resolver.codePattern.exec(' ' + rest);
      if (code) {
        card = resolver.findCode(code[1], code[2]);
        var nameOnly = (' ' + rest).replace(code[0], ' ').replace(/[\s\-–|,:]+$/, '').replace(/\s*[\[(]\s*[\])]\s*/g, ' ').trim();
        if (!card && nameOnly) card = resolver.findName(nameOnly);
        if (!card && !nameOnly) reason = codeReason(code[1]);
        rest = nameOnly || rest;
      } else {
        card = resolver.findName(rest);
      }

      if (card && qty !== 0) {
        addCard(out, card, qty || 1, side);
        if (isChampion && !out.championId) out.championId = card.id;
      }
      else if (qty) out.unmatched.push({ text: rest, qty: qty, reason: reason });
      else out.skipped.push(line);
    });
    return out;
  }

  function codeReason(set) {
    return String(set || '').toUpperCase() === 'ARC'
      ? 'Arcane Box Set cards aren\'t sold as singles on TCGplayer'
      : 'not found on TCGplayer';
  }

  function newResult(kind) {
    return { ok: false, kind: kind, cards: [], championId: null, name: '', unmatched: [], skipped: [], error: '' };
  }
  function addCard(out, card, qty, side) {
    for (var i = 0; i < out.cards.length; i++) {
      if (out.cards[i].id === card.id && out.cards[i].side === side) { out.cards[i].qty += qty; return; }
    }
    out.cards.push({ id: card.id, qty: qty, side: side });
  }

  function importDeck(text, resolver) {
    var t = String(text || '').trim();
    var result;
    if (!t) { result = newResult('list'); result.error = 'Paste a deck code or a deck list first.'; return result; }
    if (/^https?:\/\/\S+$/i.test(t)) {
      result = newResult('list');
      result.error = 'That\'s a link. Open it, use the site\'s "Copy deck code" or "Export" button, and paste what it gives you.';
      return result;
    }
    var code = findDeckCode(t);
    if (code && DeckCode) {
      try { result = fromCode(code, resolver); }
      catch (e) {
        if (DeckCode.looksLikeCode(t)) { result = newResult('code'); result.error = 'Couldn\'t read that deck code: ' + e.message + '.'; return result; }
        result = null; // the long token was something else; read the text as a list
      }
    }
    if (!result) result = fromList(t, resolver);

    var legend = null;
    result.cards.forEach(function (e) {
      var c = resolver.byId[e.id];
      if (!legend && !e.side && c && /legend/i.test(c.type || '')) legend = c;
    });
    result.name = legend ? legend.name : '';
    result.ok = result.cards.length > 0;
    if (!result.ok && !result.error) result.error = 'No cards found. Paste a deck code or one card per line, like "3 Void Seeker".';
    return result;
  }

  var api = { createResolver: createResolver, importDeck: importDeck, normName: normName, numberKey: numberKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RiftboundDecks = api;
})(this);
