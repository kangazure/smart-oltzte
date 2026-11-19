# OLT Config Generator epek

Website untuk membuat config registrasi ONU **ZTE C320 / C300** (format `.cfg`) dengan **ONU ID yang diambil dari database running-config** OLT, jadi tidak perlu menebak ID mana yang masih kosong. Frontend Vite + React, API serverless di folder `api/` (Vercel), database Postgres (Neon).

## Alur pakai

1. **OLT**: upload file `show running-config` tiap OLT ZTE (boleh banyak file sekaligus). Semua ONU (port, ONU ID, SN, nama, VLAN, profil) masuk database. Upload ulang file terbaru kapan saja untuk menyegarkan data OLT yang sama.
2. **Manual**: pilih OLT dan port, isi SN, nama, VLAN, profil. ONU ID otomatis memakai **ID kosong pertama** di port itu (celah di tengah ikut dipakai, mis. ID 6 jika 1-5 dan 7-9 terpakai). Klik Copy atau Download .cfg. ONU yang baru dibuat otomatis dicatat ke database, jadi registrasi berikutnya memakai ID selanjutnya.
3. **Daftar ONU**: lihat dan cari nama / SN semua ONU per OLT dan port (data dari running-config), lengkap dengan ID kosong tiap port, export CSV. Catatan keliru bisa dihapus dari database (OLT aslinya tidak ikut berubah).
4. **Template**: edit template config sesuai kebutuhan, lalu simpan dengan nama di database. Tombol bintang menjadikannya bawaan untuk browser baru.

### Tab Manual

- VLAN: tombol cepat **450, 444, 500, 200, 300** atau ketik bebas. Daftar pilihan VLAN, profil, dan tipe ONU bisa diubah lewat "Atur pilihan" (tersimpan di database).
- Profil mengganti `<SPEED>` di template (`tcont profile` dan `traffic-limit`). Tipe ONU bawaan `ALL`.
- Nama bisa dijadikan HURUF BESAR. Peringatan muncul jika nama sudah dipakai ONU lain di OLT itu.
- SN yang sudah terdaftar ditolak, lengkap dengan lokasinya (port dan ONU ID).
- Tambah ke daftar: memasukkan ONU ke daftar pelanggan untuk digabung dengan config lain (Output per PON).

## Format config ZTE

`<SLOT>` berisi rack/slot (`1/2`) dan `<PON>` nomor port, sehingga `gpon-olt_<SLOT>/<PON>` menjadi `gpon-olt_1/2/1`. Output **tanpa baris kosong**:

```
configure terminal
interface gpon-olt_1/2/1
onu 6 type ALL sn ZTEGD5D8F864
exit
interface gpon-onu_1/2/1:6
name CONTOH
tcont 1 profile 50M
gemport 1 name Internet tcont 1
gemport 1 traffic-limit upstream 50M downstream 50M
encrypt 1 enable downstream
service-port 1 vport 1 user-vlan 450 vlan 450
exit
pon-onu-mng gpon-onu_1/2/1:6
service Internet gemport 1 vlan 450
vlan port veip_1 mode hybrid
vlan port veip_1 vlan 450
security-mgmt 1 state enable mode forward protocol web http
interface wifi wifi_0/1 state unlock
exit
end
write
```

Nomor ONU di baris `onu <ONU_ID>` dan `gpon-onu_...:<ONU_ID>` selalu sama (ONU ID harus sama di kedua baris).

## Deploy di Vercel (dengan database)

1. Push project ini ke GitHub, lalu **Add New → Project** di Vercel dan import repository-nya (Framework: Vite, otomatis).
2. Buat database: di project Vercel buka **Storage → Create Database → Neon (Postgres)**, lalu hubungkan ke project. Variabel `DATABASE_URL` / `POSTGRES_URL` terisi otomatis. Tabel dibuat sendiri saat API pertama dipakai.
3. Buka **Settings → Environment Variables**, tambahkan `APP_PASSWORD` (password untuk masuk ke aplikasi, wajib karena data berisi nama pelanggan).
4. **Redeploy**. Buka situsnya, tab **OLT**, masukkan password, lalu upload keempat file running-config.

Variabel lingkungan ada di `.env.example`. Tanpa `APP_PASSWORD` atau database, API menolak semua permintaan (aman secara bawaan).

### Mode lokal (tanpa database)

Di `npm run dev`, Dockerfile / Dokploy, atau hosting statis lain, API tidak ada. Aplikasi tetap jalan: tab Manual memakai data dari tab **Impor OLT**, dan template tersimpan di browser. Untuk mencoba API lokal, jalankan `vercel dev` dengan `DATABASE_URL` yang valid.

### Keamanan

- Semua endpoint `/api/*` (kecuali `/api/health`) butuh header `x-app-password`; password dibandingkan secara constant-time. Password disimpan di localStorage browser setelah login.
- Ini password tunggal bersama (bukan akun per pengguna). Pakai password yang kuat.
- Query database memakai parameter (aman dari SQL injection). Input SN, port, VLAN, profil, dan tipe divalidasi di server.

## Migrasi OLT VSOL / Global ke ZTE C320 (opsional)

Alur utama aplikasi ini:

1. Buka tab **Migrasi**, upload satu atau beberapa file backup OLT lama (VSOL, Global, dan lainnya).
2. SN dan nama pelanggan dibaca otomatis. Backup **VSOL** dibaca persis (`interface gpon 0/1`, `onu add ... sn ...`, `onu N desc ...`). Format lain dibaca dengan parser **Umum** yang menebak dari kata kunci `name / desc / description / alias`, jadi periksa contoh hasilnya.
3. Atur **peta PON** (PON asal → PON tujuan di ZTE). ONU ID dinomori ulang otomatis, atau bisa dipertahankan.
4. Klik **Buat daftar pelanggan**, lalu cek tab **Parameter** (slot, tipe ONU per vendor, profile) dan ambil config dari preview (Copy / .cfg / .txt).

### Output per PON

Panel **Output per PON** (di sisi kanan) memecah config sesuai kebutuhan:

- Pilih **Semua PON** atau satu PON saja (mis. PON 1 dengan 100 pelanggan).
- Pilih **pelanggan per file**: 10, 20, 50, Semua, atau angka sendiri. Tiap file lengkap dengan header (`configure terminal`) dan footer (`end`, `write`), jadi bisa dipaste sendiri-sendiri.
- Tiap file bisa di-Copy atau didownload `.cfg` sendiri. **Download semua (ZIP)** membungkus semua bagian (dalam folder `PON-n/` jika lebih dari satu PON), dan **1 file gabungan** memuat semua PON dalam satu file.
- Nama file memuat PON dan rentang ONU ID, mis. `pon-1_bagian-2-dari-5_onu-21-40.cfg`.
- Tombol **HURUF BESAR** mengubah semua nama pelanggan di config menjadi kapital (`budi-sb11` menjadi `BUDI-SB11`).
- ONU ID tetap berurutan lintas bagian, jadi bagian 2 melanjutkan bagian 1. Paste berurutan dari bagian pertama.

Catatan:

- Tab **Impor OLT** hanya untuk backup OLT **tujuan** (ZTE) yang sudah berisi ONU, supaya ONU ID tidak bentrok. Jangan diisi backup OLT lama.
- SN dibaca ke huruf kapital semua, sesuai kebiasaan OLT ZTE.
- ONU merek lain (mis. VSOL) perlu tipe yang sudah terdaftar di OLT ZTE. Isi di Parameter, bagian "Tipe ONU per vendor".
- Config yang besar (ratusan ONU) tetap lengkap di Copy / .cfg / .txt, preview hanya menampilkan 600 baris pertama.

## Fitur

- Input satu per satu, tempel massal dari Excel (`SN, Nama, [PON], [ONU ID]`), atau upload CSV
- ONU ID otomatis per PON (auto-increment), bisa diisi manual
- Validasi: format SN (4 huruf + 8 hex, otomatis uppercase), SN duplikat, nama kosong, ONU ID bentrok, maksimal 128 ONU per PON
- Nama pelanggan disanitasi aman untuk CLI (spasi jadi `_`, simbol dibuang, maks 32 karakter)
- Template config bisa diedit (header / blok per pelanggan / footer) dengan placeholder
- Impor config OLT yang sudah berjalan: ONU ID terpakai dan SN terdaftar dikenali, penomoran dilanjutkan dari ID kosong
- Preview dengan syntax highlight, Copy, Download `.cfg` / `.txt`
- Riwayat generate (localStorage) + export / import JSON
- Dark mode (bawaan) dan light mode, responsif untuk mobile

## Template

Tersedia dua preset di tab **Template** (bisa dipilih dan diedit bebas).

### VSOL (bawaan, disusun dari backup OLT)

```
configure terminal

interface gpon <SLOT>/<PON>
onu add <ONU_ID> profile default sn <SN>
onu <ONU_ID> desc <CUSTOMER_NAME>
onu <ONU_ID> profile line name <LINE_PROFILE>
exit

end
write
```

Baris `interface gpon` sampai `exit` diambil dari format backup OLT VSOL V1.4.8R. Header (`configure terminal`) dan footer (`end`, `write`) adalah asumsi, sesuaikan dengan alur CLI OLT kamu. Slot bawaan `0`, line profile bawaan `line_1` (daftar line profile otomatis terisi setelah impor config OLT).

Penulisan SN mengikuti tampilan OLT (`ZTEGdc79ec52`: vendor kapital, hex huruf kecil). Bisa diganti ke kapital semua di tab Parameter.

### ZTE (bawaan)

Lihat bagian **Format config ZTE** di atas. `configure terminal` (header) dan `end` + `write` (footer) ditulis **sekali** per file, blok di tengah diulang untuk setiap ONU.

| Placeholder | Isi |
| --- | --- |
| `<SLOT>` | Rack/slot, mis. `1/2` (dari port yang dipilih) |
| `<PON>` | PON port pelanggan (kolom PON, atau PON bawaan) |
| `<ONU_ID>` | ONU ID otomatis / manual |
| `<LINE_PROFILE>` | Nama line profile (tab Parameter, bawaan `line_1`) |
| `<TYPE>` | Tipe ONU (tab Parameter, template ZTE) |
| `<SN>` | Serial number (uppercase) |
| `<CUSTOMER_NAME>` | Nama pelanggan yang sudah disanitasi |
| `<VLAN>` | VLAN (pilihan di tab Manual, bawaan di Parameter) |
| `<SPEED>` | Nama profil / kecepatan (bawaan 50M) |

> Tipe ONU bawaan `ALL`. Profil (mis. `50M`) harus sudah ada di OLT.

## Contoh input

```
GPON1A2B3C4D,Budi Santoso
ZTEGC1234567,Siti Aminah
```

Hasilnya: ONU ID otomatis berurutan di PON 1, nama menjadi `Budi_Santoso` dan `Siti_Aminah`.

## Jalankan lokal

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit test parser & generator
npm run build      # hasil build di folder dist/
```

## Deploy di Dokploy

1. Push project ini ke repository Git (GitHub / GitLab / Gitea).
2. Di Dokploy: **Create Project**, lalu **Create Service → Application**.
3. Tab **General**: pilih provider Git dan repository + branch.
4. **Build Type** = `Dockerfile`, Docker File = `Dockerfile`, Docker Context Path = `.`
5. Tab **Domains**: tambah domain kamu, **Container Port = `80`**, aktifkan HTTPS dan pilih certificate Let's Encrypt. Arahkan DNS (record A) domain ke IP server Dokploy.
6. Klik **Deploy**. Healthcheck tersedia di `/healthz`.

(Nama menu bisa sedikit berbeda antar versi Dokploy.)

### Tanpa Dokploy (Docker biasa)

```bash
docker build -t olt-config-generator .
docker run -d -p 3000:80 --name olt-config-generator olt-config-generator
```

## Struktur

```
src/
  lib/          parser, generator, validasi, impor config, helper
  components/   panel UI (form, tabel, template, impor, riwayat, preview)
  App.tsx       layout dan state utama
Dockerfile      multi-stage: node build -> nginx static
nginx.conf      SPA fallback, cache aset, /healthz
```

## Catatan keamanan

- Data pelanggan hanya disimpan di localStorage browser, tidak dikirim ke server mana pun.
- Selalu uji config pada satu ONU sebelum dipakai ke OLT produksi, karena sintaks CLI bisa berbeda antar seri dan firmware.
