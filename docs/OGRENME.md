# Guitar3D — nasıl çalışıyor, neden böyle, ne öğrenmeli?

Bu rehber projeyi baştan sona anlatabilmen için yazıldı. Her bölümde üç soru var:
**ne yapıyor**, **neden böyle yapıldı**, **anlamak için ne öğrenmelisin**. En sonda bir çalışma
sırası ve "mülakatta nasıl anlatırım" özeti var.

---

## 1. Büyük resim

Guitar3D tamamen tarayıcıda çalışan bir web uygulaması (SPA). Sunucu yok:

```
 Kullanıcı ──► React ekranları (screens/)
                 │
                 ├─► alphaTab  : tab dosyasını okur, notayı çizer, MIDI ile çalar
                 ├─► three.js  : 3D gitarı ve nota baloncuklarını çizer (react-three-fiber)
                 ├─► Web Audio : mikrofon, akort, metronom
                 └─► IndexedDB : tablar, gitarlar, ilerleme (storage/)
```

Akış tek cümleyle şöyle: alphaTab şarkıyı çalarken "şu an şu vuruştayım" der. Biz o vuruştaki
notaları (tel, perde) alırız ve 3D sapta o noktaya baloncuk koyarız.

**Neden sunucu yok?** Kişisel bir araç için sunucu gereksiz bir yük. Ayrı çalıştırmak, yedeklemek
ve barındırmak gerekiyor. Tarayıcının kendi veritabanı (IndexedDB) dosyaları da tutabiliyor. Uygulama
statik dosyalardan ibaret olduğu için GitHub Pages gibi ücretsiz bir yerde yayınlanabilir.

**Öğren:** HTML/CSS/JS temelleri, TypeScript, React (bileşen, state, hook), tarayıcının
çalışma modeli (event loop, `async/await`, Promise).

---

## 2. Proje yapısı ve araçlar

| Araç | Ne işe yarıyor | Neden |
|---|---|---|
| **npm workspaces** | `apps/web` (uygulama) ve `packages/shared` (ortak tipler, müzik yardımcıları) | Saf mantığı arayüzden ayırmak |
| **Vite** | Geliştirme sunucusu ve derleme (`npm run dev`, `npm run build`) | Hızlı; TypeScript ve React'i ayarsız destekliyor |
| **TypeScript** | Tip kontrolü (`npm run typecheck`) | Gitar profili gibi büyük veri yapılarında hataları derlemede yakalamak |
| **Vitest** | Birim testleri (`npm test`, ~540 test) | Vite ile aynı ayarları kullanıyor |
| **GitHub Actions** | `.github/workflows/ci.yml` her push'ta tip, test ve build çalıştırır | Bozuk kodun fark edilmesi |

**Öğren:** `package.json` script'leri, ES modülleri (`import`/`export`), TypeScript'te `interface`,
`type`, union tipler ve generics. Vite'ı sadece kullanmayı bilmen yeterli.

---

## 3. Veri katmanı — `apps/web/src/storage/`

### db.ts — IndexedDB
**Ne:** Tarayıcının içindeki anahtar-değer veritabanı. 8 "store" (tablo gibi) var: `tabs`,
`tabFiles`, `progress`, `notes`, `sessions`, `guitars`, `textures`, `kv`.

**Nasıl:** IndexedDB'nin API'si eski usul ve olay (callback) tabanlı. `db.ts` onu küçük bir
`Promise` arayüzüne sarar (`get`, `put`, `delete`, `all`, `keys`, `clear`). Testlerde (Node'da
IndexedDB yok) aynı arayüzün bellekte çalışan bir sürümü kullanılır (`useMemoryDb`).

**Neden:** `localStorage` sadece metin tutar ve ~5 MB ile sınırlı. Tab dosyaları ve gitar
fotoğrafları ikili veri (binary). IndexedDB `ArrayBuffer`'ı doğrudan saklayabiliyor.

**Neden arayüz (Backend)?** Bu *dependency injection*'ın basit bir hali. Kod "veritabanı" ile
konuşur ama hangisi olduğunu bilmez. Böylece test edilebilir oluyor.

### library.ts — tablar, ilerleme, notlar, oturumlar
- `addTabFile`: uzantıyı ve boyutu kontrol eder, başlığı okur, dosyayı `tabFiles`'a, bilgisini
  `tabs`'a yazar.
- `recordPass`: hız antrenöründe bir geçişi kaydeder. Geçmişi tutar, temiz geçişlerde en iyi hızı
  günceller.
- `listTabs`: arama (`fold` ile aksansız karşılaştırma: "buklum" yazınca "Büklüm" bulunur) ve
  sıralama.

### guitars.ts — kendi gitarların
Fotoğraflar `textures` store'unda bayt olarak durur. Profil onlara `local:<id>/<ad>?v=...` diye
referans verir. 3D sahneye gitmeden önce `withTextureUrls` bunları `URL.createObjectURL` ile
`blob:` adreslerine çevirir. three.js normal bir resim adresi gibi yükler.

**Neden `?v=`?** Fotoğraf değişince adres de değişir. Böylece eski resim önbellekten gelmez.

### backup.ts — yedek dosyası
Tüm store'lar ve `localStorage`'daki `guitar3d.*` ayarları tek bir JSON dosyasına yazılır. JSON
bayt tutamadığı için `ArrayBuffer`'lar base64 metne çevrilir (`{ $bytes: "..." }`). Eski sunuculu
sürümün yedekleri de okunabilir (`fromOldBackup`).

**Öğren:** IndexedDB kavramları (database, object store, transaction), `Promise` ile callback
sarmalama, `ArrayBuffer`/`Uint8Array`/`Blob`, base64, `URL.createObjectURL`. Test için sahte
(fake) bağımlılık kullanımı.

---

## 4. Tab okuma ve çalma — alphaTab (`player/`)

**Ne:** [alphaTab](https://alphatab.net), Guitar Pro / MusicXML / alphaTex dosyalarını okuyan,
nota ve tab olarak çizen ve dahili bir synthesizer ile (SoundFont: `public/soundfont/sonivox.sf2`)
çalan bir kütüphane.

**Nasıl (`useAlphaTab.ts`):**
1. Bir `AlphaTabApi` oluşturulur ve dosyanın baytları verilir.
2. alphaTab dosyayı bir **model**e çevirir: `Score → Track → Staff → Bar → Voice → Beat → Note`.
3. Çalarken iki olay dinlenir:
   - `playerPositionChanged`: zaman/tick (saniyede ~20 kez),
   - aktif vuruş değişince `beat`.
4. `beats.ts` o vuruştaki notaları `{ string, fret }` listesine çevirir (`FretNote`). alphaTab'ın tel
   numarası ile tab numarası ters, `toTabString` bunu düzeltir.

**Neden `position.ts` (ayrı bir store)?** Zaman saniyede 20 kez değişiyor. Bunu React state'ine
koysaydık tüm oynatıcı ekranı saniyede 20 kez yeniden çizilirdi (render). Bunun yerine küçük bir
abone (subscribe) deposu var. Sadece zamanı gösteren bileşen kendini günceller. Bu, React'te
performansın en önemli dersi: **sık değişen veriyi state'e koyma.**

**Hız ve A–B döngü:** alphaTab'ın `playbackSpeed` ve `playbackRange` ayarları. Döngü, seçilen
ölçülerin tick aralığına çevrilir.

**Hız antrenörü (`tempoLadder.ts`):** Saf bir durum makinesi (state machine). 3 temiz geçişten sonra
hız %5 artar, art arda hatalarda düşer. Saf fonksiyon olduğu için kolayca test edilir.

**Öğren:** MIDI temelleri (tick, tempo, ölçü, vuruş), müzik notasyonu temelleri (ölçü, nota
süreleri, tab okuma), React `useEffect` ile dış kütüphane bağlama ve temizleme (cleanup), "external
store" deseni (`useSyncExternalStore`), state machine.

---

## 5. 3D gitar — `fretboard/`

**Ne:** three.js ile çizilen gitar. React içinde **react-three-fiber (R3F)** kullanılıyor. Sahne,
JSX ile bileşen gibi yazılıyor (`<mesh>`, `<group>`).

### geometry.ts — saf matematik
three.js'e hiç dokunmaz, sadece sayı hesaplar. Bu yüzden testlenebilir.
- **Perde konumu:** `fretX(scale, n) = scale − scale / 2^(n/12)`. Bu, **12 eşit aralıklı
  akort (12-TET)** formülü. Her perde teli 2^(1/12) oranında kısaltır, 12 perde oktav eder.
- **Notanın yeri:** `noteX`, iki perdenin arasında, parmağın bastığı nokta.
- **Tel konumu:** `stringY` telleri eşikten köprüye doğru açılarak yerleştirir (ara mesafeler
  profildeki ölçülerden).

Koordinat sistemi: x gitar boyunca (eşik 0, gövde eksi), y enine, z yukarı, birim santimetre.
Gerçek ölçüler kullanıldığı için kendi 42" gitarın birebir boyda çıkar.

### build.ts / materials.ts — gövde, sap, kafa
Gövde dış hattı (outline) bir 2D çokgen. `ExtrudeGeometry` ile kalınlık verilir. Fotoğraflar
**texture** (doku) olarak yüzeylere kaplanır.

### NoteMarkers.tsx — baloncuklar
- Dolu disk: şimdi çalınacak nota. Halka: sıradaki notalar (uzaklaştıkça soluklaşır).
- `useFrame`: R3F'in her karede (saniyede ~60) çağrılan fonksiyonu. Animasyonlar React render'ı ile
  değil, doğrudan three.js nesnelerinin üzerinde yapılır. Bu da yine performans için.
- Çok sayıda aynı şekil **instancing** ile tek çizim çağrısında (draw call) çizilir.

### camera.ts
Kamera çalınan pozisyonu yumuşakça takip eder (lerp / damping).

**Öğren:** 3D temelleri (sahne, kamera, ışık, mesh = geometri + materyal, texture, koordinat
sistemleri), vektör matematiği (lerp, normalize), three.js'in "Fundamentals" bölümü, R3F
dokümantasyonu ("Your first scene", `useFrame`), ve gitarın fiziği (12-TET, tel boyu, oktav).

---

## 6. Kendi gitarını eklemek — `guitar-setup/`

İki yol var:
1. **Şablon:** hazır parametrik gitar (dreadnought, klasik…). Ölçüler ve renk değiştirilir.
   (`fretboard/templates.ts`, `scripts/gen-guitar-templates.ts`)
2. **Fotoğraftan:** fotoğraf işleme hattı `guitar-setup/lib/` içinde. Hepsi saf TypeScript, piksel
   dizileri üzerinde çalışıyor (OpenCV yok):
   - `segment.ts` / `contour.ts`: gövdeyi arka plandan ayırır ve dış hattını çıkarır.
   - `fretboard.ts`: perde tellerini bulur (parlaklık tepeleri, high-pass filtre). Sonra fotoğrafı
     **perde perde** düzeltir (warp), böylece fotoğraftaki perdeler 3D perdelerle hizalanır.
     Perspektif hesabı `fitPerspective` ile yapılır.
   - `colors.ts`: gövde rengini (medyan renk) örnekler.

**Neden perde perde warp?** Fotoğraf hafif açılı çekilir. Tek bir dikdörtgen germe işlemi
perdeleri kaydırır. 12-TET aralıklarını kullanarak her perde arasını ayrı germek hizayı korur.

**Öğren:** Görüntü işleme temelleri (piksel, gri ton, eşikleme, filtreler, kenar bulma), bilinear
örnekleme, perspektif / homografi kavramı, `<canvas>` ile piksel okuma (`getImageData`).

---

## 7. Ses ve mikrofon — `audio/`, `coach/`

### Akort aleti ve dinleme modu
- `useMicPitch.ts`: `getUserMedia` ile mikrofon, `AudioContext` + `AnalyserNode` ile ham ses
  örnekleri alınır.
- `pitch.ts`: **YIN algoritması** ile temel frekans bulunur. Sinyal kendisiyle kaydırılarak
  karşılaştırılır, en iyi tekrar eden periyot = frekans. Sonra `freqToMidi` ile nota adına çevrilir.
  Saf fonksiyon olduğu için sentetik sinüs dalgalarıyla test ediliyor.
- Dinleme modu: oynatıcı doğru notayı duyana kadar bekler.

### Koç (geçiş puanlama)
1. Bir geçiş kaydedilir.
2. `onsets.ts`: notaların başladığı anlar bulunur (enerji sıçraması = pena vuruşu; hammer-on gibi
   vuruşsuz notalar için perde değişimi).
3. `expected.ts`: tabdan "hangi nota ne zaman çalınmalıydı" listesi çıkarılır.
4. `scorePass.ts`: ikisi eşleştirilir. Her nota temiz, erken, geç, yanlış ya da kaçırılmış olur.
5. `calibration.ts`: hoparlör ve mikrofon gecikmesi ölçülüp çıkarılır.

**Öğren:** Web Audio API (`AudioContext`, `AnalyserNode`, `OscillatorNode`), örnekleme frekansı,
frekans ↔ nota (A4 = 440 Hz, `midi = 69 + 12·log2(f/440)`), otokorelasyon / YIN fikri, RMS (ses
şiddeti), basit eşleştirme algoritmaları.

---

## 8. Kural tabanlı ipuçları — `tips/`

Her ölçü için pozisyon kayması, geniş açılma, barre, akor geçişi, hız ve teknikler (hammer-on,
slide, bend, palm mute) tespit edilir ve zorluk puanı çıkar. Yapay zeka yok, düz kurallar var
(ör. "aynı vuruşta perde farkı 4'ten fazla = açılma"). `packages/shared/src/fingering.ts` ise
notalar için en az el hareketi gerektiren tel/perde seçimini **dinamik programlama** (Viterbi) ile
bulur.

**Öğren:** Dinamik programlama (en kısa yol mantığı), gitarda pozisyon kavramı.

---

## 9. Arayüz — `screens/`, `ui/`

- **Yönlendirme (`ui/router.ts`):** `#/library`, `#/play/...` gibi hash tabanlı. Sunucu gerekmez,
  GitHub Pages'te çalışır.
- **Tembel yükleme:** ekranlar `lazy(() => import(...))` ile yüklenir. İlk açılış hızlı olur.
- **Kit (`ui/kit`):** Radix UI üzerine kendi Button, Dialog, Toast bileşenleri (erişilebilirlik
  hazır).
- **PWA (`public/sw.js`, `sw-strategy.js`):** Service worker, dosyaları önbelleğe alır. Uygulama
  çevrimdışı da açılır (`cache-first` / `network-first` stratejileri).

**Öğren:** React Router mantığı (burada elle yazılmış), code splitting, erişilebilirlik (ARIA),
service worker yaşam döngüsü ve önbellek stratejileri.

---

## 10. Testler

Tasarımın ana fikri: **mantık saf fonksiyonlarda, arayüz ince.** Geometri, perde bulma, YIN, hız
merdiveni, puanlama, depolama gibi parçaların hepsi tarayıcı olmadan Node'da test ediliyor.
Örnekler:
- `storage/library.test.ts`: tab ekle, ara, sil, ilerleme kaydet.
- `storage/backup.test.ts`: yedekle, JSON'a çevir, geri yükle, aynı veriyi geri al.
- `audio/pitch.test.ts`: 110 Hz sinüs ver, "A2" duy.

**Öğren:** Birim test yazma (`describe`/`it`/`expect`), saf fonksiyon ve yan etki ayrımı, fake/mock.

---

## Önerilen çalışma sırası

1. **JS + TypeScript temelleri** → `packages/shared/src/guitar.ts` tiplerini oku.
2. **React** → `screens/library/LibraryScreen.tsx` (liste, state, effect).
3. **Veri** → `storage/db.ts` → `storage/library.ts` ve testleri.
4. **alphaTab** → `player/useAlphaTab.ts`, `player/beats.ts`.
5. **3D** → three.js temelleri → `fretboard/geometry.ts` (12-TET) → `NoteMarkers.tsx`.
6. **Ses** → `audio/pitch.ts` → tuner ekranı.
7. **İleri:** `guitar-setup/lib/fretboard.ts` (görüntü işleme), `coach/` (puanlama),
   `shared/fingering.ts` (dinamik programlama).

Her adımda: dosyayı oku, testini çalıştır (`npx vitest run src/storage`), küçük bir şey değiştir,
testin ne dediğine bak.

---

## Mülakatta 1 dakikada anlatım

> "Guitar3D, Guitar Pro tablarını kendi gitarımın gerçek ölçülerdeki 3D modeli üzerinde gösteren
> bir pratik uygulaması. Tamamen tarayıcıda çalışıyor: React + TypeScript, tab okuma ve çalma için
> alphaTab, 3D için three.js / react-three-fiber, veriler IndexedDB'de. alphaTab çalarken aktif
> vuruşu alıyorum, notaları tel/perde koordinatına çeviriyorum. Perde konumlarını 12-TET formülüyle
> hesaplayıp baloncukları sapa yerleştiriyorum. Mikrofonla YIN algoritması kullanarak akort ve
> çalınan notayı algılıyorum. Performans için sık değişen oynatma zamanını React state'i yerine
> ayrı bir store'da tutuyorum, animasyonları da render döngüsünde değil her karede çalışıyorum.
> Mantığın çoğu saf fonksiyon olduğu için ~540 birim testi var, CI'da çalışıyor."

Sorulabilecek "neden" soruları ve kısa cevapları:
- *Neden sunucu yok?* Kişisel araç. Veri tarayıcıda kalıyor, yedek dosyasıyla taşınıyor, statik
  barındırma bedava.
- *Neden IndexedDB, localStorage değil?* İkili dosyalar ve boyut sınırı.
- *Neden R3F?* three.js sahnesini React bileşenleri gibi kurmak, state ile senkron tutmak.
- *En zor kısım?* Fotoğraftaki perdeleri 3D perdelerle hizalamak (perde perde warp) ve
  oynatma ile 3D'nin akıcı senkronu.
