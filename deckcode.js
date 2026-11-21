/*
 * Riftbound deck-code decoder (decode only).
 *
 * Reads the shareable deck codes defined by Piltover Archive's RiftboundDeckCodes format,
 * versions 1-6: https://github.com/Piltover-Archive/RiftboundDeckCodes
 * Adapted from that project's reference implementation, Copyright 2025 PiltoverArchive,
 * licensed under the Apache License, Version 2.0 (see third_party/RiftboundDeckCodes-LICENSE.txt).
 * Changes: rewritten as a small dependency-free browser script that only decodes.
 *
 * RiftboundDeckCode.decode(code) returns:
 *   { version, main: [{code, count}], sideboard: [{code, count}], champion, legends: [code] }
 * where a card code looks like "OGN-007a" (set, number, optional variant) or "SFD-R01" / "VEN-SP3".
 */
(function (root) {
  'use strict';

  var ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  var SETS = ['OGN', 'OGS', 'ARC', 'SFD', 'UNL', 'VEN', 'RAD'];
  var VARIANTS = ['', 'a', 's', 'b']; // base, alternate art A, signed, alternate art B
  var FORMAT = 1;
  var MAX_VERSION = 6;

  function base32Decode(str) {
    var bytes = [];
    var buffer = 0;
    var bits = 0;
    for (var i = 0; i < str.length; i++) {
      var v = ALPHABET.indexOf(str.charAt(i).toUpperCase());
      if (v === -1) throw new Error('Not a deck code (unexpected "' + str.charAt(i) + '")');
      buffer = ((buffer << 5) | v) & 0xffff;
      bits += 5;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((buffer >> bits) & 0xff);
      }
    }
    return bytes;
  }

  function Reader(bytes) { this.bytes = bytes; this.pos = 0; }
  Reader.prototype.byte = function () {
    if (this.pos >= this.bytes.length) throw new Error('Deck code is incomplete');
    return this.bytes[this.pos++];
  };
  Reader.prototype.varint = function () { // little-endian base-128, like LEB128
    var result = 0;
    for (var shift = 0; shift <= 35; shift += 7) {
      var b = this.byte();
      result += (b & 0x7f) * Math.pow(2, shift);
      if (!(b & 0x80)) return result;
    }
    throw new Error('Deck code has a malformed number');
  };

  function pad(n, width) {
    var s = String(n);
    while (s.length < width) s = '0' + s;
    return s;
  }
  function setCode(n) {
    if (n >= SETS.length) throw new Error('Deck code uses a set this page does not know yet (' + n + ')');
    return SETS[n];
  }
  function variantCode(n) {
    if (n >= VARIANTS.length) throw new Error('Deck code uses an unknown card variant (' + n + ')');
    return VARIANTS[n];
  }
  // Card numbers carry a prefix flag byte (0 normal, 1 rune "R01", 2 special "SP1") when `flagged`.
  function cardNumber(r, flagged) {
    if (!flagged) return pad(r.varint(), 3);
    var flag = r.byte();
    var n = r.varint();
    if (flag === 0) return pad(n, 3);
    if (flag === 1) return 'R' + pad(n, 2);
    if (flag === 2) return 'SP' + n;
    throw new Error('Deck code uses an unknown card number type (' + flag + ')');
  }
  function readGroup(r, count, flagged, out) {
    var n = r.varint();
    var set = setCode(r.byte());
    var variant = variantCode(r.byte());
    for (var j = 0; j < n; j++) out.push({ code: set + '-' + cardNumber(r, flagged) + variant, count: count });
  }
  // Versions 1-4: every copy count from maxCount down to 1, each with its set/variant groups.
  function fixedSection(r, maxCount, flagged) {
    var out = [];
    for (var count = maxCount; count >= 1; count--) {
      var groups = r.varint();
      for (var g = 0; g < groups; g++) readGroup(r, count, flagged, out);
    }
    return out;
  }
  // Versions 5+: only the copy counts that occur.
  function sparseSection(r, flagged) {
    var out = [];
    var counts = r.varint();
    for (var i = 0; i < counts; i++) {
      var count = r.varint();
      var groups = r.varint();
      for (var g = 0; g < groups; g++) readGroup(r, count, flagged, out);
    }
    return out;
  }
  function cardRef(r, flagged) {
    var set = setCode(r.byte());
    var variant = variantCode(r.byte());
    return set + '-' + cardNumber(r, flagged) + variant;
  }

  // Deck codes are one unbroken run of uppercase base32 characters.
  function looksLikeCode(text) {
    var t = String(text || '').trim();
    return t.length >= 16 && /^[A-Z2-7]+=*$/.test(t);
  }

  function decode(text) {
    var code = String(text || '').trim();
    if (!looksLikeCode(code)) throw new Error('Not a deck code');
    code = code.replace(/=+$/, '');
    var r = new Reader(base32Decode(code));
    var head = r.byte();
    var format = head >> 4;
    var version = head & 0x0f;
    if (format !== FORMAT) throw new Error('Unsupported deck code format (' + format + ')');
    if (version < 1 || version > MAX_VERSION) throw new Error('Deck code version ' + version + ' is newer than this page supports');

    var flagged = version >= 4;
    if (version >= 5) {
      var prefixBit = r.byte();
      if (prefixBit > 1) throw new Error('Deck code has an unknown header');
      flagged = prefixBit === 1;
    }

    var main;
    var sideboard = [];
    if (version >= 5) {
      main = sparseSection(r, flagged);
      sideboard = sparseSection(r, flagged);
    } else {
      main = fixedSection(r, 12, flagged);
      if (version >= 2) sideboard = fixedSection(r, 3, flagged);
    }

    var champion = null;
    if (version >= 3 && r.byte() === 1) champion = cardRef(r, flagged);

    var legends = [];
    if (version >= 6) {
      var k = r.varint();
      for (var i = 0; i < k; i++) legends.push(cardRef(r, flagged));
    }
    return { version: version, main: main, sideboard: sideboard, champion: champion, legends: legends };
  }

  var api = { decode: decode, looksLikeCode: looksLikeCode, SETS: SETS.slice() };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RiftboundDeckCode = api;
})(this);
