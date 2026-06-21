# Anti Judol Sensor

Chrome extension untuk menyensor teks promosi judi online langsung di browser.

## Fitur

- Deteksi berjalan lokal di background service worker.
- Teks yang terdeteksi disensor di halaman dan bisa dilihat sementara saat hover.
- Popup untuk mengaktifkan sensor dan mengatur sensitivitas.
- Checker manual untuk mengetes teks tanpa membuka halaman lain.
- Tidak memakai API, server, atau koneksi tambahan.

## Model

Extension memakai model lokal berikut:

- Model: `Random Forest + FastText + SMOTE`
- ID: `35d0498d63e42e`
- Signature: `b12e5e182993`
- Test F1: `0.9849`

Model sudah dibundel di `anti_judol_model.js`.

## Instalasi

1. Buka `chrome://extensions` atau `edge://extensions`.
2. Aktifkan `Developer mode`.
3. Klik `Load unpacked`.
4. Pilih folder ini.
5. Klik ikon Anti Judol Sensor untuk membuka popup.

## Struktur

- `manifest.json`: konfigurasi extension.
- `background.js`: klasifikasi teks, konfigurasi, dan model runtime.
- `content.js`: scanning halaman dan sensor teks.
- `styles.css`: tampilan sensor di halaman.
- `popup.html`, `popup.css`, `popup.js`: popup extension.
- `website.html`, `website.css`, `website.js`: checker manual.
- `anti_judol_model.js`: model lokal yang dibundel.
- `icon16.png`, `icon48.png`, `icon128.png`: ikon extension.
