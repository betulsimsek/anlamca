// Anlamca: turns an inflected Turkish word into dictionary lookup candidates.
// TDK only knows lemmas ("kitap", "gitmek"); pages contain inflected forms
// ("kitaplarımızdan", "gidiyorum"). This strips common suffixes from the end,
// undoes consonant softening and adds infinitive forms for verb stems.
// Shared by the service worker and the popup, so it attaches to globalThis.
(function (root) {
  "use strict";

  const VOWELS = "aeıioöuü";
  const BACK = "aıou";

  // Longest first, so "larımızdan" style chains peel off one suffix per step.
  const SUFFIXES = [
    "ıyorlar", "iyorlar", "uyorlar", "üyorlar",
    "acaklar", "ecekler",
    "ımızdan", "imizden", "umuzdan", "ümüzden", "ınızdan", "inizden", "unuzdan", "ünüzden",
    "larından", "lerinden",
    "ıyorum", "iyorum", "uyorum", "üyorum", "ıyorsun", "iyorsun", "uyorsun", "üyorsun",
    "acağım", "eceğim", "acaksın", "eceksin",
    "mışlar", "mişler", "muşlar", "müşler",
    "ların", "lerin", "ları", "leri", "lara", "lere", "larda", "lerde", "lardan", "lerden",
    "ımız", "imiz", "umuz", "ümüz", "ınız", "iniz", "unuz", "ünüz",
    "ıyor", "iyor", "uyor", "üyor",
    "acak", "ecek",
    "ndan", "nden", "ında", "inde", "unda", "ünde",
    "dan", "den", "tan", "ten",
    "nın", "nin", "nun", "nün",
    "mış", "miş", "muş", "müş",
    "lar", "ler",
    "yla", "yle", "yken",
    "dır", "dir", "dur", "dür", "tır", "tir", "tur", "tür",
    "sın", "sin", "sun", "sün",
    "dık", "dik", "duk", "dük", "tık", "tik", "tuk", "tük",
    "sı", "si", "su", "sü",
    "da", "de", "ta", "te",
    "ya", "ye", "yı", "yi", "yu", "yü",
    "nı", "ni", "nu", "nü",
    "la", "le", "ca", "ce", "ça", "çe",
    "dı", "di", "du", "dü", "tı", "ti", "tu", "tü",
    "ım", "im", "um", "üm", "ın", "in", "un", "ün",
    "ı", "i", "u", "ü", "a", "e"
  ];

  // Suffixes that only attach to verbs; when one is stripped the infinitive
  // is a better guess than the bare stem ("okuyorlar" -> "okumak", not "ok").
  const VERBAL = /^(?:[ıiuü]?yor|[ae]c[ae][kğ]|m[ıiuü]ş|[dt][ıiuü]k?|s[ıiuü]n)/;

  // Softened final consonants and what they were in the dictionary form.
  const UNSOFTEN = { b: "p", c: "ç", d: "t", "ğ": "k" };

  function lower(word) {
    return word.toLocaleLowerCase("tr");
  }

  function hasVowel(s) {
    for (const ch of s) if (VOWELS.includes(ch)) return true;
    return false;
  }

  function lastVowel(s) {
    for (let i = s.length - 1; i >= 0; i--) if (VOWELS.includes(s[i])) return s[i];
    return "";
  }

  // Strips punctuation and quotes around a selection; keeps inner spaces
  // so multi-word entries ("göz atmak") still work.
  function normalize(text) {
    if (typeof text !== "string") return "";
    const t = text.trim().replace(/^[\s"'“”‘’«»(\[{.,;:!?…-]+|[\s"'“”‘’«»)\]}.,;:!?…-]+$/g, "");
    // A trailing apostrophe suffix ("İstanbul'da") belongs to a proper noun.
    return lower(t.replace(/['’][a-zçğıöşü]+$/i, "")).replace(/\s+/g, " ");
  }

  function variants(stem) {
    const out = [stem];
    const last = stem.slice(-1);
    if (UNSOFTEN[last]) out.push(stem.slice(0, -1) + UNSOFTEN[last]);
    // "renk" -> "rengi": after n, k softens to g.
    if (last === "g" && stem.slice(-2, -1) === "n") out.push(stem.slice(0, -1) + "k");
    return out;
  }

  function infinitive(stem) {
    const v = lastVowel(stem);
    if (!v) return null;
    return stem + (BACK.includes(v) ? "mak" : "mek");
  }

  // Returns lookup candidates, most specific first, without duplicates.
  function candidates(text, max) {
    const limit = max || 6;
    const word = normalize(text);
    if (!word) return [];
    const out = [];
    const add = w => {
      if (w && w.length >= 2 && hasVowel(w) && !out.includes(w)) out.push(w);
    };
    add(word);
    if (word.includes(" ")) return out.slice(0, limit);

    // Noun-like stems first; verb infinitives ("gid" -> "gitmek") go last so
    // they only use up lookups when the plain stems were not found.
    const verbs = [];
    const nouns = [];
    let verbal = false;
    let stem = word;
    for (let step = 0; step < 4; step++) {
      const suffix = SUFFIXES.find(s => stem.endsWith(s) && stem.length - s.length >= 2 && hasVowel(stem.slice(0, -s.length)));
      if (!suffix) break;
      stem = stem.slice(0, -suffix.length);
      if (VERBAL.test(suffix)) verbal = true;
      nouns.push(...variants(stem));
      const stems = variants(stem);
      // "okuyor" = "oku" + "yor": the suffix vowel can belong to the stem.
      if (/^[ıiuü]yor/.test(suffix)) stems.unshift(stem + suffix[0]);
      for (const v of stems) verbs.push(infinitive(v));
    }
    for (const v of verbal ? verbs.concat(nouns) : nouns.concat(verbs)) add(v);
    return out.slice(0, limit);
  }

  root.AnlamcaStem = { candidates, normalize };
})(typeof globalThis !== "undefined" ? globalThis : this);
