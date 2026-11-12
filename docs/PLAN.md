# Guitar3D — v2 planı

## Kullanıcı geri bildirimi (v1)
1. Gitar gerçek ölçülerde değil. Sahibinin gitarı **42"**, yani toplam boyu yaklaşık 106,7 cm olmalı.
2. Model birebir gitarın görüntüsü değil: çıkıntılı, kaba parçalar var.
3. Kamera istenen yere sabitlenemiyor.
4. Baloncuklar rahat okunmuyor.
5. Arka plan ve genel arayüz kötü. Gökkuşağı gibi renkli teller ve baloncuklar sevilmedi.
6. Başka bir kullanıcı kendi gitarını yükleyemiyor. Gövde ve fretboard fotoğraflarından tek akışla gitar oluşturulabilmeli.
7. Tab yükleme esnek değil.

## Referanslar
- **Songsterr:** sade tab görünümü, net bir çalma imleci, hız ve döngü kontrolleri hep görünür.
- **Yousician / Fender Play:** ekranda tek bir odak var. Sıradaki nota önceden haber veriliyor. Renkler az ve anlamlı.
- **Rocksmith:** 3D sap görünümü. Kamera çalınan pozisyonu yumuşakça takip ediyor.
- **Guitar Pro 8:** fretboard paneli. Çalınan notalar sade, tek renkli işaretlerle gösteriliyor.

## Tasarım ilkeleri
- **Renk:** nötr, koyu bir stüdyo zemini ve tek bir vurgu rengi. Teller renk koduyla değil, konumla ayırt edilir. Renk yalnızca bir anlam taşıdığında kullanılır: o an çalınan nota, sıradaki nota, hata.
- **Odak:** 3D gitar sahnenin kahramanıdır. Kontroller ikinci planda kalır.
- **Kısayollar:** her şey klavyeyle de yapılabilir:
  - `Space`: çal / durdur
  - `←` `→`: önceki / sonraki ölçü
  - `L`: döngü
  - `M`: metronom
  - `-` `+`: hız
  - `1`–`4`: kamera modları
- **Dil:** Türkçe arayüz, kısa ve net metinler.

## Ortak sözleşmeler (önce yazıldı)
- `packages/shared/src/guitar.ts`:
  - `GuitarProfile`: ölçüler, gövde konturu, dokular, finish
  - `CameraMode`, `GuitarView`
- `packages/shared/src/index.ts`:
  - `FretNote`: `finger`, `muted` ve `technique` alanları eklendi

## Çalışma kolları
Her kol kendi git worktree'sinde ve kendi branch'inde çalışır. Dosya sahipliği ayrıdır, birleştirmeyi ana oturum yapar.

### A — 3D gitar ve görüntüleyici (`feat/3d-guitar`)
Sahip olduğu dosyalar: `apps/web/src/fretboard/**`, `apps/web/public/guitar/**`, `scripts/**`

**Veston profili**
- Gövde konturu `assets/photos/front-full.jpg` fotoğrafından otomatik çıkarılır.
- Her şey toplam boy 106,7 cm olacak şekilde ölçeklenir.
- Scale length, fotoğraftaki nut → 12. perde oranıyla doğrulanır.

**Model, three.js'te sıfırdan**
- Yuvarlatılmış kenarlı gövde
- Gerçek binding şeritleri
- C profilli, incelen bir sap ve topuk
- Açılı headstock
- Açık dişli tuner'lar
- Köprü, eğer (saddle) ve köprü pimleri
- Köprü pimlerinden tuner direklerine giden tüp teller
- Rozet ve pickguard fotoğraftan alınır

**Malzeme ve ışık**
- Malzeme: `MeshPhysicalMaterial`, saten siyah
- Ortam ışığı: `RoomEnvironment` (dış bir HDR dosyası gerekmez)
- ACES tone mapping ve yumuşak gölgeler

**Kamera**
- drei `CameraControls` ile yumuşak geçişler
- Modlar: `follow`, `overview`, `neck`, `free`
- Sınırlar ve sıfırlama
- Fretboard'a çift tıklayınca o noktaya odaklanır

**Baloncuklar (yeniden tasarım)**
- Fretboard üzerinde tek renkli, sade bir işaret
- İçinde parmak numarası, varsa perde numarası
- Sıradaki nota: içi boş bir halka, zaman ilerledikçe dolar
- Açık tel: nut üzerinde işaret
- Susturulmuş nota: X

**Bileşen API'si**

```ts
<Guitar3D profile notes beatId beatProgress view cameraMode onFretClick?>
```

### B — Kendi gitarını oluşturma ve tab içe aktarma (`feat/guitar-pipeline`)
Sahip olduğu dosyalar: `packages/shared/src/guitar.ts`, `apps/web/src/guitar-setup/**`, `apps/web/src/tabs/**`, `apps/server/**`

**Fotoğraftan gitar profili (tarayıcıda)**
1. Ön fotoğraf yüklenir.
2. Gövde arka plandan otomatik ayrılır (eşik ayarlanabilir).
3. Kullanıcı birkaç noktaya tıklar: headstock ucu, nut, 12. perde, eğer, gövde altı.
4. Kullanıcı boyu seçer (39/40/41/42" veya cm) → kontur, ölçüler ve gövde dokusu çıkar.
5. Fretboard fotoğrafından perdeler otomatik bulunur ve kullanıcı düzeltebilir.
6. Fretboard, Python betiğindeki yöntemin TypeScript'e taşınmış haliyle perde perde düzeltilir.
7. Headstock dokusu çıkarılır.

**Sunucu**
- Gitar profilleri için CRUD (birden çok gitar) ve görsel depolama
- Aktif gitarı seçme

**Tab içe aktarma**
- Sürükle-bırak, birden çok dosya
- Formatlar: gp3/4/5/gpx/gp7, MusicXML, alphaTex
- ASCII tab (yapıştır veya `.txt`) → alphaTex dönüştürücü
- Kütüphanede arama, yeniden adlandırma, son çalınanlar

Saf mantık için testler yazılır.

### C — Arayüz ve kullanıcı deneyimi (`feat/ui-redesign`)
Sahip olduğu dosyalar: `apps/web/src/App.tsx`, `apps/web/src/ui/**`, `apps/web/src/screens/**`, `apps/web/src/styles*`, `apps/web/index.html`

**Tasarım sistemi**
- Token'lar, tipografi
- Bileşenler: buton, slider, dialog, tooltip, segmented control, drawer
- Lucide ikonları

**Uygulama kabuğu**
- Kütüphane ekranı
- Çalışma (player) ekranı: 3D sahne baskın, alt kısımda transport çubuğu, açılıp kapanabilen tab şeridi, sağda pratik çekmecesi
- "Gitarım" ekranı: B'nin mantığını kullanan bir sihirbaz için iskelet
- Ayarlar

**Diğer**
- Klavye kısayolları
- Boş durum ekranları
- Mobil uyumlu düzen
- Erişilebilirlik

## Birleştirme sırası
1. A
2. B
3. C, ardından entegrasyon düzeltmeleri

Her kol mantıklı adımlarla commit atar. Ana oturum birleştirir, tarayıcıda doğrular ve GitHub'a push eder.

## Kabul kriterleri
- Veston modeli fotoğrafla yan yana konduğunda aynı oranlarda olmalı. Toplam boy 106,7 cm ± 1.
- Kamera modları arasında takılmadan, yumuşak geçiş yapılmalı.
- Baloncuklar her açıdan okunabilir olmalı.
- Yeni bir kullanıcı, iki fotoğraf ve birkaç tıklamayla kendi gitarını oluşturabilmeli.
- `.gp5` ve ASCII tab sürükle-bırak ile yüklenebilmeli.
- `npm test` ve `npm run typecheck` temiz geçmeli.
