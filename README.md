# Cerutumurah Stock App

Admin inventori berbasis React, Vite, dan Supabase.

## Menjalankan project

```bash
npm install
copy .env.example .env
npm run dev
```

Isi `.env` dengan kredensial project Supabase:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Kolom yang digunakan modul Produk

Implementasi awal mengasumsikan struktur berikut:

- `products`: `id`, `sku`, `nama_produk`, `brand`, `kategori`, `aktif`, `created_at`
- `product_variants`: `id`, `product_id`, `nama_varian`, `satuan`, `harga_jual`,
  `stok`, `dijual`, `bisa_untuk_sampler`, `created_at`

Pastikan foreign key `product_variants.product_id -> products.id` tersedia agar
query relasi bekerja. Supabase Row Level Security policy perlu mengizinkan
operasi `select`, `insert`, `update`, dan `delete` untuk role yang digunakan
aplikasi.

## Format Import Excel Produk

Gunakan sheet pertama file `.xlsx` dengan header:

`sku`, `brand`, `nama_produk`, `kategori`, `nama_varian`, `satuan`,
`harga_jual`, `stok_awal`, `dijual`, `bisa_untuk_sampler`, `aktif`.

Daftar Produk menggunakan pagination server-side sebanyak 25 produk per halaman
dan card kategori ringkas untuk memfilter daftar. Setelah kategori dipilih,
produk dikelompokkan berdasarkan brand dan dropdown brand hanya menampilkan
brand yang tersedia pada kategori tersebut. Checkbox pada tabel dapat digunakan
untuk memilih beberapa produk, mengubah satuan seluruh variannya, atau mengubah
status Aktif/Nonaktif secara massal. Tabel juga menampilkan stok dan harga jual
secara ringkas agar seluruh informasi muat pada layar desktop.
dengan query Supabase `range`, search, dan filter kategori.

Saat menambah produk, SKU dibuat otomatis dengan format `CM-YYYYMMDD-001`.
Field Brand dan Kategori menampilkan saran dari data yang sudah tersedia; Brand
baru tetap dapat ditambahkan dengan mengetik nama baru.

## Modul Order

Input order manual menggunakan tabel `orders`, `order_items`, `product_variants`,
dan `stock_mutations`. Pastikan policy RLS mengizinkan operasi yang dibutuhkan.
Untuk transaksi atomik pada penggunaan produksi, alur penyimpanan order sebaiknya
dipindahkan ke Supabase database function/RPC.

Order dapat berisi produk biasa atau Paket Sampler. Item sampler disimpan pada
`order_items` dengan `variant_id` kosong, sedangkan stok dan `stock_mutations`
diproses untuk setiap varian penyusun dari `sampler_items.sampler_id`.

Halaman Riwayat Order mengambil data dari `orders` dan relasi `order_items`,
dengan search, filter status, pagination, detail item, print, dan salin format
WhatsApp.

## Modul Paket Sampler

Modul sampler menggunakan:

- `sampler_packages`: `id`, `nama_paket`, `harga_jual`, `aktif`, `created_at`
- `sampler_items`: `id`, `sampler_id`, `variant_id`, `qty`

Pastikan foreign key `sampler_items.sampler_id -> sampler_packages.id` dan
foreign key ke `product_variants` tersedia agar query relasi dan simulasi
kapasitas stok bekerja.

## Modul Stock Opname

Daftar pengecekan Stock Opname dapat difilter berdasarkan kategori dan brand.
Pilihan brand mengikuti kategori yang dipilih, sementara tabel diurutkan
berdasarkan kategori, brand, lalu nama produk. Filter tidak mengurangi data yang
disimpan saat draft atau opname diselesaikan. Tampilan tabel tidak menampilkan
varian dan menggunakan layout ringkas agar muat pada layar desktop.

Stock opname menggunakan:

- `stock_opnames`: `id`, `tanggal`, `nama_petugas`, `catatan`, `status`
- `stock_opname_items`: `id`, `opname_id`, `variant_id`, `stok_sistem`,
  `stok_fisik`, `selisih`, `catatan`

Saat opname diselesaikan, stok varian diperbarui ke stok fisik dan selisih
dicatat ke `stock_mutations` dengan tipe `OPNAME`. Pastikan foreign key
`stock_opname_items.opname_id -> stock_opnames.id` tersedia.

## Dashboard

Dashboard mengambil statistik asli dari `products`, `product_variants`, `orders`,
dan `sampler_packages`. Penjualan dan order hari ini dihitung berdasarkan rentang
tanggal lokal browser, sedangkan stok menipis menggunakan batas `stok <= 5`.

## Restock / Mutasi Stok

Halaman Mutasi Stok memperbarui `product_variants.stok` dan mencatat perubahan ke
`stock_mutations`. Tipe `RESTOCK` dan `RETUR` menambah stok, `RUSAK` mengurangi
stok, sedangkan `KOREKSI` menerima qty positif atau negatif.

## Monitoring Stok

Halaman Stok menggunakan relasi `product_variants + products` untuk menampilkan
unit stok dan nilai asset (`stok * harga_jual`). Default filter adalah produk
aktif dengan stok tersedia. Tabel mendukung search, filter status, sorting, dan
pagination 25 baris per halaman. Tabel menampilkan kategori produk dan dibuat
ringkas agar seluruh informasi stok muat pada layar desktop.

Kategori ditampilkan sebagai card yang dapat diklik. Setiap card menampilkan
jumlah produk tersedia, total unit stok, dan nilai total aset kategori. Saat
kategori dipilih, tabel dikelompokkan berdasarkan brand dan tersedia filter
berisi brand yang ada pada kategori tersebut.

## Login Admin

Seluruh halaman admin dilindungi Supabase Auth. Login menggunakan
`supabase.auth.signInWithPassword`, session dipulihkan otomatis saat refresh,
dan tombol Logout tersedia di header.

Semua query data berada di bawah `ProtectedRoute`, sehingga halaman data tidak
di-mount dan query tidak dijalankan sebelum session user tersedia. Supabase
client menggunakan `persistSession`, `autoRefreshToken`, dan access token session
aktif untuk setiap query.
