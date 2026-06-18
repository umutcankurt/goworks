# İmza Yönetimi — Editör & Medya Yeniden Tasarımı (Geliştirme Planı)

> Durum: Onaylanmış tasarım kararları, uygulama bekliyor.
> Oluşturulma: 2026-06-16
> Kapsam: İmza şablonu editörü (formatlama) + Medya Yönetimi (Drive Picker, token, thumbnail).

## 1. Amaç

İmza yönetimini "HTML bilen birinin işi" olmaktan çıkarıp her kullanıcının
kullanabileceği hâle getirmek. İki bağımsız sorun:

1. **Editör:** Düz `textarea` var; seçili metni kalın/italik yapmanın yolu yok.
   HTML'i başka yerde hazırlayıp yapıştırmak gerekiyor.
2. **Medya:** Görsel eklemek için kullanıcı önce kendisi Drive'a yükleyip linki
   elle yapıştırıyor. Uygulama içinden yükleme yok; görsel HTML'e token olarak
   bağlanmıyor; thumbnail'ler küçük ve tıkla-ekle değil.

## 2. Onaylanmış Tasarım Kararları

| Konu | Karar |
|------|-------|
| Editör yaklaşımı | **Akıllı toolbar** — `textarea` kalır, seçili metni etiketle saran formatlama butonları. Tam WYSIWYG yok (tablo+inline-CSS+token yapısını bozar). |
| Görsel ekleme | **Google Picker** — "Drive'dan seç **veya** karşıya yükle". Native dialog değil; kullanıcı eski Drive dosyasını da seçebilmeli. |
| OAuth izni | `drive.file` scope eklenir (en dar izin). Mevcut kullanıcılar bir kez re-login yapar (Groups Settings izninde olduğu gibi). |
| Görsel URL | Public yapılan dosya için **`https://lh3.googleusercontent.com/d/{fileId}`** (Google'ın görsel CDN'i — Gmail'in kendi kullandığı altyapı, `uc?export=view`'dan çok daha stabil). |
| Token formatı | **`{{image_1}}`** (alt çizgi). `-` çalışmaz çünkü render regex'i `\w` kullanıyor (`/\{\{(\w+)(?:\|([^}]*))?\}\}/`). UI'da "Görsel 1" etiketi gösterilir, token alt çizgilidir. |

### Neden Picker (teknik gerekçe)

`drive.file` scope yalnızca **uygulamanın oluşturduğu** dosyaları görür; `files.list`
ile kullanıcının eski görsellerini listeleyemeyiz. Eski dosyadan seçim için ya
`drive.readonly` (geniş/ürkütücü izin) ya da **Google Picker** gerekir. Picker, dar
`drive.file` iznine rağmen kullanıcı bir dosyayı seçtiği anda o dosyayı uygulamaya
yetkilendirir — Google'ın bunu önermesinin sebebi budur.

### Gmail karşılaştırması (önemli not)

Gmail'in kendi imza editörü Drive görselini **kendi sunucusuna kopyalar**
(`googleusercontent`). Biz imzayı Gmail API ile push ettiğimiz için bu otomatik
kopyalama olmaz; HTML'deki `<img src>` URL'i neyse o kalır → URL'in dışarıdan
erişilebilir ve stabil olması şart. `lh3` CDN tam da Gmail'in kullandığı altyapı
olduğu için en yakın pratik çözüm. (Kendi CDN'imiz yok; base64 gömme Gmail'de çalışmaz.)

## 3. Mevcut Durum — Dosya Haritası

| Katman | Dosya | Not |
|--------|-------|-----|
| Editör | `src/components/SignatureEditor.tsx` | `textarea` + token/conditional/width butonları. `handleConditionWrap` (53-69) selection-wrap desenini zaten kuruyor. |
| Önizleme | `src/components/SignaturePreview.tsx` | iframe `srcDoc`; token replace (17-51), `resolveVariable` kullanır. |
| Sayfa | `src/pages/SignatureTemplates.tsx` | CRUD + `SAMPLE_VARIABLES` + `MediaManager` entegrasyonu. |
| Medya UI | `src/components/MediaManager.tsx` | Elle isim+URL girişi (79-85), 48×48 thumbnail grid (88-112). |
| Token util (renderer) | `src/utils/signatureTokens.ts` | `CANONICAL_TAG_KEYS`, `localeToken`, `TOKEN_ALIAS`, `resolveVariable`. |
| Render (main) | `electron/services/template-renderer.ts` | `renderTemplate` (90-101), `TAG_REGEX` (39), sanitize allowed-tags (74-88). |
| Medya servis | `electron/services/media-service.ts` | `list/create/remove`; `extractDriveFileId`+`toDirectUrl`. |
| Drive util | `electron/services/drive-media.ts` | URL parse + `uc?export=view` üretimi. |
| Şema | `electron/db/schema.sql` | `media_assets` (36-46). |
| Migration | `electron/db/index.ts` | `runMigrations` (32-61), `pragma user_version` = **2** şu an. |
| API köprü | `src/services/server-api.ts` | `mediaApi`, `templatesApi`. |
| IPC | `electron/main.ts` | `media:*` (1013-1038), `templates:*` (939-1012), `auth:getAccessToken`. |
| i18n | `src/i18n/locales/{tr,en}/signatures.json` | Editör/medya/preview string'leri. |

---

## 4. FAZ A — Editör Formatlama Şeridi

**Hedef:** Seçili metni Bold/İtalik/Altı çizili/Renk/Bağlantı ile sar; canlı önizleme
otomatik gösterir. Re-login gerektirmez. Düşük risk.

**Risksiz olmasının sebebi:** `sanitize-html` allowed-tags listesi
(`template-renderer.ts:74-78`) zaten `strong, em, u, span, a, font` içeriyor. Yeni
render mantığı gerekmez — sadece editöre üretim butonları eklenir.

### A.1 — `SignatureEditor.tsx` (değişiklik)

`handleConditionWrap` (53-69) deseninin genel bir kardeşini ekle:

```ts
// Wrap the current selection with an inline tag. Mirrors handleConditionWrap.
const wrapSelection = (before: string, after: string, placeholder?: string) => {
  const ta = textareaRef.current;
  if (!ta) return;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const selected = value.substring(start, end) || placeholder || '';
  const wrapped = `${before}${selected}${after}`;
  const newValue = value.substring(0, start) + wrapped + value.substring(end);
  onChange(newValue);
  requestAnimationFrame(() => {
    // Place caret inside the tag when there was no selection, else after it.
    const caret = selected || !placeholder
      ? start + wrapped.length
      : start + before.length;
    ta.selectionStart = ta.selectionEnd = caret;
    ta.focus();
  });
};
```

Toolbar butonları (token grid'inin üstüne yeni bir satır):

| Buton | Çağrı |
|-------|-------|
| **B** (Kalın) | `wrapSelection('<strong>', '</strong>', t('editor.boldPlaceholder'))` |
| *I* (İtalik) | `wrapSelection('<em>', '</em>')` |
| <u>U</u> (Altı çizili) | `wrapSelection('<u>', '</u>')` |
| 🔗 (Bağlantı) | URL prompt/popover → `wrapSelection('<a href="URL">', '</a>')` |
| 🎨 (Renk) | renk seçici popover → `wrapSelection('<span style="color:HEX">', '</span>')` |
| A± (Boyut) | sayı popover → `wrapSelection('<span style="font-size:Npx">', '</span>')` |

- Renk ve bağlantı için `showWidthPicker` benzeri küçük bir popover state'i kullan
  (mevcut popover deseni 203-251). `<input type="color">` yerine birkaç hazır renk +
  serbest HEX girişi MD3 paletiyle uyumlu olur.
- Klavye kısayolu opsiyonel (Ctrl/Cmd+B/I/U) — `onKeyDown` ile `wrapSelection`.

### A.2 — Başlangıç Şablonu Galerisi

Boş `textarea` sorununu çözer. Kullanıcı sıfırdan tablo yazmaz.

- **Yeni dosya:** `src/utils/signatureStarters.ts` — 2-3 hazır şablon export'u
  (`logolu`, `logosuz`, `cizgili`). HTML temeli i18n'deki mevcut örnek tablodur.
  Placeholder marka adı **generic** olmalı (örn. "ABC Firma") — proje kuralı.
- **UI:** `SignatureTemplates.tsx`'te yeni şablon oluştururken, `htmlContent` boşsa
  galeri kartlarını göster; kart seçilince `setHtmlContent(starter.html)`.
- Token'lar aktif dile göre yazılmalı (`localeToken`), tıpkı `insertTag` gibi.

### A.3 — i18n (TR + EN, aynı commit — parity kuralı)

`signatures.json` (tr + en) `editor` altına: `bold`, `italic`, `underline`, `link`,
`color`, `fontSize`, `boldPlaceholder`, `linkUrlPrompt`, `starters.*` anahtarları.

### A.4 — Test

`SignatureEditor` saf string dönüşümleri için `wrapSelection` mantığını ayrı bir
pure fonksiyona (örn. `applyWrap(value, start, end, before, after)`) çıkar ve
`src/utils/signatureFormat.test.ts` ile test et (selection var/yok, iç içe sarma).

---

## 5. FAZ B0 — Google Picker Fizibilite (spike)

Faz B'ye girmeden, Picker'ın Electron renderer'ında çalıştığını **bir kez** kanıtla.
En riskli belirsizlik budur; erken kapat.

### Ön gereksinimler (Picker'ın istedikleri)

1. **OAuth access token** — `auth:getAccessToken` IPC zaten var. (preload.ts'de
   expose edildiğini doğrula.)
2. **`drive.file` scope** — `auth-service.ts:12-22` `SCOPES` dizisine ekle.
   → Re-login gerekir. CLAUDE.md'deki "Re-login gereksinimi" notunu güncelle.
3. **Developer/API key** — Cloud Console'dan alınır. **Yeni config alanı gerekir**
   (onboarding'de veya Settings → Genel/Google OAuth kartında). `app_config`'e
   `googleApiKey` anahtarı.
4. **App ID (project number)** — `setAppId(...)` için. **İçgörü:** clientId formatı
   `{projectNumber}-xxxx.apps.googleusercontent.com` olduğundan, project number =
   `clientId.split('-')[0]`. Yani ek alan gerekmeden mevcut clientId'den türetilebilir
   (spike'ta doğrula).
5. **CSP / origin** — `gapi` script'i (`https://apis.google.com/js/api.js`) için
   renderer CSP'sine izin; Picker'ın `setOrigin(...)` parametresi prod'da `file://`
   olabilir. Spike'ın asıl test edeceği nokta budur. Çözülmezse fallback'e geç.

### Spike çıktısı (karar)

- ✅ Picker açılıyor + dosya seçimi access token döndürüyor → **Faz B (Picker yolu)**.
- ❌ Origin/CSP aşılamıyor → **Faz B (Fallback yolu):** native `dialog.showOpenDialog`
  + Drive `files.create` ile yalnızca yükleme. "Eski Drive dosyasından seç" özelliği
  bu durumda kapsamdan çıkar (kullanıcıya bildirilir).

---

## 6. FAZ B — Medya Yönetimi Yeniden Tasarımı

### B.1 — Veritabanı (şema + migration)

`media_assets` tablosuna kalıcı token kolonu. Sıraya göre türetme **yapma** — silme
token kaydırır ve imzaları kırar.

**`schema.sql` (36-46)** → kolon ekle:
```sql
token TEXT,            -- e.g. "image_1"; stable per template, never recomputed
```
İsteğe bağlı tekillik: `CREATE UNIQUE INDEX IF NOT EXISTS idx_media_token_per_template
ON media_assets(template_id, token) WHERE token IS NOT NULL;`

**`index.ts` `runMigrations`** → `user_version` 2 → 3:
```ts
if (version < 3) {
  const tx = db.transaction(() => {
    const tbl = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='media_assets'"
    ).get();
    if (tbl) {
      const cols = db.prepare("PRAGMA table_info(media_assets)").all() as { name: string }[];
      if (!cols.some(c => c.name === 'token')) {
        db.exec('ALTER TABLE media_assets ADD COLUMN token TEXT');
      }
      // Backfill existing rows: image_1, image_2... per template by created_at.
      const rows = db.prepare(
        'SELECT id, template_id FROM media_assets ORDER BY template_id, created_at, id'
      ).all() as { id: number; template_id: number }[];
      const counter: Record<number, number> = {};
      const upd = db.prepare('UPDATE media_assets SET token = ? WHERE id = ?');
      for (const r of rows) {
        counter[r.template_id] = (counter[r.template_id] ?? 0) + 1;
        upd.run(`image_${counter[r.template_id]}`, r.id);
      }
    }
    db.pragma('user_version = 3');
  });
  tx();
}
```
> Not: `runMigrations` `schema.exec()`'ten önce çalışır; ilk kurulumda tablo yoktur,
> migration atlar, schema.exec token'lı tabloyu kurar. Mevcut kurulumda ALTER+backfill çalışır.

### B.2 — Drive yükleme/yetkilendirme servisi (main)

**Yeni dosya:** `electron/services/drive-upload-service.ts`
- `uploadImage(localPath | buffer, name): { fileId, mimeType }` — Drive `files.create`,
  **giriş yapan adminin OAuth client'ı** ile (`authService.getClient()`; Service
  Account değil — Groups kararıyla tutarlı, audit log'da actor doğru).
- `makePublic(fileId)` — `drive.permissions.create({ fileId, role:'reader', type:'anyone' })`.
- `toCdnUrl(fileId): string` → `https://lh3.googleusercontent.com/d/${fileId}`.
- Picker yolunda (kullanıcı dosya seçtiğinde): yalnızca `makePublic` + `toCdnUrl`
  (dosya zaten yüklü). Native fallback yolunda: `uploadImage` → `makePublic` → `toCdnUrl`.
- Retry: `electron/services/retry.ts` (429/503) sarması.

**`drive-media.ts`** → `toCdnUrl` ekle; `toDirectUrl`'ü deprecated bırak (geriye
dönük: eski kayıtların `public_url`'leri çalışmaya devam eder, sadece yeni kayıtlar CDN).

### B.3 — Medya servis (`media-service.ts`)

- `create(...)` imzasını güncelle: `driveUrl` zorunluluğunu kaldır; `fileId` ile de
  oluşturulabilsin (Picker fileId döndürür). `public_url` = `toCdnUrl(fileId)`.
- `token` alanını set et: template içindeki mevcut max `image_N` + 1.
  ```ts
  function nextToken(templateId: number): string {
    const rows = db.prepare('SELECT token FROM media_assets WHERE template_id = ?').all(templateId);
    const max = rows.reduce((m, r) => {
      const n = /^image_(\d+)$/.exec(r.token ?? '');
      return n ? Math.max(m, +n[1]) : m;
    }, 0);
    return `image_${max + 1}`;
  }
  ```
- `toApi` çıktısına `token` ekle; `MediaRow` tipini güncelle (`template-service.ts`).
- (Opsiyonel, Faz B+) `rename(id, token)` — kullanıcı token'ı `logo`, `banner` yapsın;
  `^[a-z][a-z0-9_]*$` doğrula (regex `\w` uyumu).

### B.4 — IPC (`main.ts`) + köprü (`server-api.ts`, `preload.ts`)

Yeni kanallar:
- `media:uploadFromPicker` `{ fileId, name, templateId }` → makePublic + create.
- `media:uploadLocal` `{ name, templateId, ... }` (fallback yolu) → showOpenDialog
  içeride veya renderer'dan path; uploadImage + makePublic + create.
- `picker:getConfig` → `{ accessToken, apiKey, appId }` (Picker init için tek seferde).
- `server-api.ts` `mediaApi`'ye `uploadFromPicker`, (varsa) `uploadLocal`, `pickerConfig`.

### B.5 — Render entegrasyonu (image token → URL)

**En temiz kısım.** Hem main hem renderer `variables` map'ine `image_N: cdnUrl`
enjekte edilince token mevcut pipeline ile çözülür. Ekstra render mantığı yok.

- **Renderer (`SignaturePreview.tsx`):** `SignatureTemplates.tsx`, `media` listesinden
  `{ image_1: url, image_2: url, ... }` üretip `SAMPLE_VARIABLES` ile birleştirip
  `variables` prop'una versin. Token `src="{{image_1}}"` içinde çözülür.
- **Main (`template-renderer.ts`):** İmza push eden worker (`signature-push-worker.ts`)
  ilgili template'in medya token map'ini `variables`'a eklesin. `renderTemplate`
  değişmeden çalışır.
- **`VARIABLE_SANITIZE_OPTIONS` (68-71) güvenli:** token değeri düz URL; `lh3` URL'i
  query string içermez → `&`→`&amp;` bozulması olmaz (bu da `uc?export=view`'a karşı
  ek avantaj).

> **Tıkla-ekle davranışı:** Thumbnail'e tıklayınca editöre yalnızca `{{image_1}}`
> değil, tam blok eklensin:
> `<img src="{{image_1}}" width="90" height="90" alt="..." style="display:block" />`
> Böylece kullanıcı boyut/hizayı görür ve düzenler; token sadece `src` içinde kalır.

### B.6 — Medya UI (`MediaManager.tsx`)

- Üst kısım: tek **"Görsel Ekle"** butonu → Picker (veya fallback dialog).
- Elle isim+URL formunu (79-85) kaldır (veya "Gelişmiş: URL ile ekle" altına gizle).
- Grid: **90×90 thumbnail** kutuları (`w-12 h-12` → `w-[90px] h-[90px]`), kutu altında
  `{{image_1}}` etiketi (kopyalanabilir). Kutuya/etikete **tıkla → editöre img bloğu ekle**.
  - Bunun için `MediaManager`'a `onInsertToken?: (snippet: string) => void` prop'u;
    `SignatureTemplates.tsx` bunu editörün insert fonksiyonuna bağlar.
- Hover'da: token kopyala + sil. Kırık görsel fallback'i (91-102) korunur.

### B.7 — Picker bileşeni (renderer)

**Yeni dosya:** `src/components/DriveMediaPicker.tsx` (veya hook `useDrivePicker`)
- `apis.google.com/js/api.js` script'ini bir kez yükle (`gapi.load('picker')`).
- `picker:getConfig`'ten `{ accessToken, apiKey, appId }` al.
- `DocsView` ile image MIME filtresi + upload view; `setOAuthToken`, `setDeveloperKey`,
  `setAppId`, `setOrigin`. `PICKED` callback → `media:uploadFromPicker`.
- `index.html` CSP'sine `https://apis.google.com` ve Picker frame origin'lerini ekle.

### B.8 — i18n (TR + EN, aynı commit)

`signatures.json` (tr+en) `media` altına: `addImage`, `pickFromDrive`, `uploadNew`,
`insertToken`, `tokenCopied`, `picker.*`, `uploadFailed`, `madePublic` vb.

### B.9 — Test

- `media-service`: `nextToken` (boşluk sonrası doğru artış), token backfill mantığı.
- `template-renderer`: `{{image_1}}` → URL çözümü, public URL `&` içermeyince
  bozulmama; eski `uc?export=view` kayıtları geriye dönük render.
- `index.ts`: v2→v3 migration idempotent (iki kez çalıştır, kolon bir kez eklenir).

---

## 7. Riskler & Açık Sorular

| # | Risk / Soru | Hafifletme |
|---|-------------|-----------|
| 1 | Picker Electron `file://` origin'de açılmayabilir | Faz B0 spike erken karar; fallback native upload. |
| 2 | API key yeni config alanı gerektirir | Onboarding/Settings'e `googleApiKey`. App ID clientId'den türetilir. |
| 3 | `lh3` CDN formatı resmi değil, Google değiştirebilir | Düşük olasılık; `public_url` DB'de saklı, gerekirse migration ile yeniden üretilir. |
| 4 | Re-login tüm kullanıcıları etkiler | Sürüm notunda duyur; Groups izninde yapıldı, kabul edilebilir. |
| 5 | Eski `uc?export=view` kayıtları | Dokunma; sadece yeni kayıtlar CDN. Geriye dönük render çalışır. |
| 6 | Token silme boşluğu (image_3 silinince image_1,2,4) | Bilinçli tercih: token sabit, imza kırılmaz. UI'da "kalıcı" notu. |

## 8. Önerilen İş Sırası

1. **Faz A** (editör toolbar + starter galerisi + i18n + test) — bağımsız, re-login yok, hemen sevk edilebilir. _Commit 1._
2. **Faz B0** (scope + Picker spike) — karar noktası.
3. **Faz B** (şema/migration → servisler → IPC → render → UI → Picker → i18n → test) —
   tek büyük özellik. _Commit 2 (+ gerekirse alt commit'ler)._

## 9. Uyulacak Proje Kuralları

- i18n: yeni her `t()` anahtarı TR **ve** EN'de aynı commit'te.
- Kod yorumları İngilizce.
- Tasarım/placeholder'larda generic marka adı ("ABC Firma"), gerçek müşteri adı değil.
- `npm run lint` (max-warnings 0) ve `npm run test` temiz geçmeli.
- Drive yazma işlemleri **giriş yapan adminin OAuth token'ı** ile (SA değil).
