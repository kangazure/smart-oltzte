# OLT Config Generator

Website untuk mengubah daftar pelanggan (**SN ONU + nama**) menjadi config registrasi ONU format `.cfg`, siap di-paste atau di-upload ke OLT. Semua proses berjalan di browser (tanpa backend dan database), jadi cukup di-deploy sebagai static site.

## Migrasi OLT VSOL / Global ke ZTE C320

Alur utama aplikasi ini:

1. Buka tab **Migrasi**, upload satu atau beberapa file backup OLT lama (VSOL, Global, dan lainnya).
2. SN dan nama pelanggan dibaca otomatis. Backup **VSOL** dibaca persis (`interface gpon 0/1`, `onu add ... sn ...`, `onu N desc ...`). Format lain dibaca dengan parser **Umum** yang menebak dari kata kunci `name / desc / description / alias`, jadi periksa contoh hasilnya.
3. Atur **peta PON** (PON asal → PON tujuan di ZTE). ONU ID dinomori ulang otomatis, atau bisa dipertahankan.
4. Klik **Buat daftar pelanggan**, lalu cek tab **Parameter** (slot, tipe ONU per vendor, profile) dan ambil config dari preview (Copy / .cfg / .txt).

### Registrasi manual (satu ONU)

Tab **Manual** untuk mendaftarkan satu ONU tanpa upload backup: isi **SN, nama, VLAN, dan profil** (PON dan ONU ID opsional). Config langsung muncul, tinggal **Copy** atau **Download .cfg**.

- VLAN dan profil yang dikosongkan memakai nilai di tab Parameter. Profil mengganti `<SPEED>` (template ZTE: `tcont profile` dan `traffic-limit`) dan `<LINE_PROFILE>` (template VSOL).
- ONU ID otomatis memilih ID kosong berikutnya di PON itu, berdasarkan data tab **Impor OLT** dan daftar pelanggan. Tanpa data OLT, ID mulai dari ONU ID awal, jadi impor config OLT ZTE dulu atau isi ONU ID sendiri.
- Opsi **Catat ONU ID terpakai** (aktif bawaan): setelah Copy / Download, ID dan SN dicatat sehingga registrasi berikutnya otomatis memakai ID selanjutnya, dan SN yang sama ditolak.
- **Tambah ke daftar** memasukkan ONU (beserta VLAN dan profilnya) ke daftar pelanggan, untuk digabung dengan config lain di Output per PON. VLAN dan profil khusus tampil di bawah nama di tabel pelanggan.

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

### ZTE (template awal)

```
configure terminal

interface gpon-olt_<SLOT>/<PON>
onu <ONU_ID> type <TYPE> sn <SN>
exit

interface gpon-onu_<SLOT>/<PON>:<ONU_ID>
name <CUSTOMER_NAME>
sn-bind enable sn
tcont 1 profile <SPEED>
gemport 1 name Internet tcont 1
gemport 1 traffic-limit upstream <SPEED> downstream <SPEED>
encrypt 1 enable downstream
service-port 1 vport 1 user-vlan <VLAN> vlan <VLAN>
service-port 1 description PPPoE
exit

pon-onu-mng gpon-onu_<SLOT>/<PON>:<ONU_ID>
service Internet gemport 1 vlan <VLAN>
vlan port veip_1 mode hybrid
vlan port veip_1 vlan <VLAN>
security-mgmt 1 state enable mode forward protocol web http
interface wifi wifi_0/1 state unlock
exit

end
write
```

`configure terminal` (header) dan `end` + `write` (footer) hanya ditulis **sekali**, sedangkan blok di tengah diulang untuk setiap pelanggan.

| Placeholder | Isi |
| --- | --- |
| `<SLOT>` | Slot (tab Parameter) |
| `<PON>` | PON port pelanggan (kolom PON, atau PON bawaan) |
| `<ONU_ID>` | ONU ID otomatis / manual |
| `<LINE_PROFILE>` | Nama line profile (tab Parameter, bawaan `line_1`) |
| `<TYPE>` | Tipe ONU (tab Parameter, template ZTE) |
| `<SN>` | Serial number (uppercase) |
| `<CUSTOMER_NAME>` | Nama pelanggan yang sudah disanitasi |
| `<VLAN>` | VLAN (tab Parameter, bawaan 444) |
| `<SPEED>` | Kecepatan / nama profile (tab Parameter, bawaan 30M) |

> Tipe ONU bawaan adalah `ZTE-F609`. Ganti di tab **Parameter** sesuai tipe ONU yang terdaftar di OLT kamu. Profile `<SPEED>` (mis. `30M`) harus sudah ada di OLT.

## Contoh input

```
GPON1A2B3C4D,Budi Santoso
ZTEGC1234567,Siti Aminah
```

Hasilnya: ONU ID 1 dan 2 di PON 1, nama menjadi `Budi_Santoso` dan `Siti_Aminah`.

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
