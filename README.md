# Guitar3D

Kendi gitarının 3D modeli üzerinde, Guitar Pro tablarını baloncuklarla gösteren interaktif bir gitar çalışma uygulaması.

## Çalıştırma

```bash
npm install
npm run dev
```

- Web: http://localhost:5173
- API: http://localhost:3001

Uygulama açılışta bir demo etüt yükler. "Tab yükle" ile `.gp`, `.gp5`, `.gpx`, `.gp7` veya MusicXML dosyası yükleyebilirsin.

## Özellikler

- **Tab okuma ve çalma:** alphaTab ile yapılır. Çalarken hız ayarı, metronom, sayarak başlama ve gitar sesini kısma desteklenir.
- **3D gitar:** react-three-fiber ile çizilir. Baloncuklarda dolu daire o an çalınacak notayı, halka sıradaki notayı gösterir. Her telin kendi rengi vardır. Basılan tel titreşir ve kamera notaları takip eder.
- **Ölçü haritası:** her ölçünün zorluğunu gösterir. Bir ölçüye tıklayınca döngüye alınır, Shift ile tıklayınca aralık seçilir.
- **Kural tabanlı ipuçları:** pozisyon kayması, geniş açılım, barre, akor geçişi, hız ve teknikleri (hammer-on, slide, bend, palm mute) otomatik bulur. AI gerekmez.
- **Tempo merdiveni:** 3 temiz turdan sonra hız %5 artar. İlerleme sunucuya kaydedilir.
- **"Gitarım" penceresi:**
  - Fretboard fotoğrafında 4 noktaya tıklarsın. Uygulama perspektifi düzeltir ve fotoğrafı 3D sapa birebir giydirir.
  - Gövde fotoğrafı da gövdenin üst yüzüne giydirilir.

## Veston modeli

Varsayılan model, sahibinin Veston dreadnought gitarıdır:
- mat siyah gövde ve krem binding
- siyah pickguard ve sedef görünümlü rozet
- hayat ağacı kakmalı fretboard

Fretboard ve headstock dokuları `assets/photos/front-neck.jpg` fotoğrafından üretilir:

```bash
python3 scripts/build-veston-textures.py
```

Fotoğraf hafif açılı çekildiği için 20 perde teli fotoğrafta tek tek ölçüldü. Dokular perde perde düzeltildi, böylece fotoğraftaki perdeler 3D perdelerle tam çakışıyor. Ölçümler betiğin başındadır. Betiğin çıktıları `apps/web/public/guitar/` klasörüne yazılır.

## Gitarının ölçüleri

`data/guitar/guitar.json` dosyası `apps/web/src/fretboard/guitarSpec.ts` içindeki `GuitarSpec` alanlarını ezer. Örnek:

```json
{ "scaleLength": 65.0, "bodyLength": 51, "lowerBout": 40, "inlayShape": "diamond", "inlays": [3, 5, 7, 9, 15], "doubleInlays": [12] }
```

## Meshy ile 3D gövde

Meshy'nin resmi MCP sunucusu, fotoğraflardan 3D gövde modeli üretir.

1. https://www.meshy.ai adresinde hesap aç ve bir API anahtarı al. Meshy API'si ücretli kredi ile çalışır.
2. Anahtarı terminalinde ortam değişkeni olarak ayarla. Örnek fish kabuğu için:

   ```bash
   set -Ux MESHY_API_KEY anahtarın
   ```

3. MCP sunucusunu Claude Code'a ekle:

   ```bash
   claude mcp add --scope user meshy -- npx -y @meshy-ai/meshy-mcp-server
   ```

Üretilen modeli `data/guitar/body.glb` konumuna koy. Uygulama prosedürel gövde yerine bunu kullanır. Konum ve ölçek `guitar.json` içindeki `bodyModel` alanından ayarlanır.

## Testler

```bash
npm test
npm run typecheck
```
