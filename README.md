<p align="center"><img src="icons/icon128.png" width="96" alt="Anlamca icon"></p>

# Anlamca

**Türkçe bir kelimeyi seç, TDK Güncel Türkçe Sözlük'teki anlamını sayfadan ayrılmadan gör.**
*Select a Turkish word and see its meaning from the TDK dictionary, without leaving the page.*

The old "TDK Sözlük" Chrome extension had 2,000 users. It was removed from the Chrome Web Store along with the other Manifest V2 extensions. Anlamca replaces it for Manifest V3.

## Ne yapar / What it does

- **Kelimeyi seç, sağ tıkla → "Anlamca ile TDK'da ara"**, ya da **Alt+Shift+S**. Anlamı küçük bir baloncukta görünür: türü, örnek cümleler ve yazarları, kökeni, atasözleri ve deyimler.
- **Ekli kelimeleri de çözer:** *kitaplarımızdan → kitap*, *ağacı → ağaç*, *gidiyorum → gitmek*, *okuyorlar → okumak*.
- **İstersen çift tıklayınca gösterir.** Bu isteğe bağlı bir izin, açtığında istenir.
- **Popup:** Arama kutusu ve son aramalar.
- **TDK yanıt vermezse:** TDK'nın API'si sık sık yavaşlıyor. O durumda da kullanıcı boş kalmaz, TDK ve Vikisözlük linkleri gösterilir.

## Gizlilik / Privacy

- **Sadece aradığın kelime gönderilir, sadece TDK'ya:** Seçtiğin kelime `sozluk.gov.tr`'ye gider. Başka bir ağ isteği yapılmaz.
- **Veri toplanmaz:** Analitik yok, hesap yok.
- **Önbellek ve son aramalar** yalnızca tarayıcında (`chrome.storage.local`) tutulur.
- **İzinler:**
  - Kurulumda tüm sitelere erişim istenmez. Sağ tık menüsü ve kısayol `activeTab` ile çalışır.
  - "Çift tıklayınca göster" açılırsa tüm siteler izni istenir. Kapatınca izin geri bırakılır.

## How it works

| File | Role |
|---|---|
| `src/stem.js` | Turns an inflected word into lookup candidates. It strips common suffixes from the end, undoes consonant softening (b→p, c→ç, d→t, ğ→k, ng→nk) and adds infinitives for verb stems. |
| `src/tdk.js` | Queries `sozluk.gov.tr/gts` for the candidates **one at a time** and stops at the first hit. The API is slow and drops parallel requests, so each request has a 13 s timeout and one retry, and the whole lookup has a 30 s budget. |
| `src/render.js` | Builds the definition card from DOM nodes. TDK's HTML is never inserted into the page. |
| `src/bubble.js` | Shows the card in a closed shadow root, so page CSS can't affect it and it can't affect the page. |
| `src/background.js` | Context menu and shortcut, a 500-word cache, and registering or unregistering the double-click content script when the optional permission changes. |

## Development

```sh
npm install        # puppeteer, only for the end-to-end test
npm test           # unit tests (stemmer, TDK parsing, timeouts) — node:test
npm run test:e2e   # loads the extension into Chrome for Testing; real TDK lookup is skipped if TDK is unreachable
npm run package    # anlamca.zip for the Chrome Web Store
```

## License

The code is MIT. Dictionary content belongs to Türk Dil Kurumu and is fetched live from sozluk.gov.tr; none of it is bundled. Anlamca is not affiliated with TDK.
