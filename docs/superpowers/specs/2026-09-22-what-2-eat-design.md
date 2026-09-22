# What-2-Eat v1 — Katalog Makanan (Design / PRD)

- Date: 2026-09-22
- Status: draft, menunggu review Farrel
- Scope sesi ini: PRD saja. Tidak ada implementasi.

## 1. Goal

Dalam <30 detik Farrel bisa menjawab "makan apa?" lewat filter tag +
area atau tombol shuffle.

Success criteria:

- Filter tag (OR) + search nama + filter area bekerja dan konsisten
  dengan shuffle.
- Shuffle hanya mengambil dari hasil yang sedang terfilter.
- Empty state jelas + tombol reset bekerja.
- `pnpm build` lolos tanpa env Shopify.

## 2. Non-goals v1

- CRUD UI (tambah/edit/hapus lewat edit `foods.json` + commit).
- Database, auth, foto, harga, rating, link Maps, jam buka.
- Cart/checkout Shopify, Eve agent, i18n/Markets.

## 3. Konteks template (keputusan arsitektur)

Project ini adalah template e-commerce Vercel Shop (Next.js 16 +
Shopify Hydrogen SDK + cart/checkout + Eve agent). Untuk katalog
pribadi itu overkill, tapi diputuskan: **pakai resource yang ada,
nonaktifkan yang tidak perlu, jangan hapus.**

Artinya di v1:

- `shopConfig.auth.isEnabled = false`, `agent.isEnabled = false`.
- Rute baru tidak memanggil operasi Shopify.
- Navigasi menunjuk ke katalog. Tidak ada file Shopify/cart/Eve yang
  dihapus di v1 (konsekuensi: bundle/lint tetap membawa sisa itu).

## 4. Data model

```ts
type FoodPlace = {
  id: string; // slug, mis. "soto-cak-har"
  name: string;
  tags: string[]; // 2-5 per tempat
  area: string; // v1 selalu "surabaya" (city-level)
};
```

- `TAG_CATALOG` = union semua `tags` di seed, di-sort. Daftar baku
  awal diturunkan dari 17 seed; entri baru boleh membawa string tag
  baru (hybrid: baku tapi bisa tambah).
- Aturan tag: satu kata, Title Case, tanpa duplikat makna (pakai
  `Noodles`, bukan `Noodle`/`Mie` bergantian).
- Tag = agregat semua menu di satu tempat. Filter `Rice` + `Beef`
  (OR) = "tempat yang menjual salah satunya", bukan "satu dish yang
  mengandung keduanya".

## 5. Seed data (17 tempat, semua `area: "surabaya"`)

| id | name | tags |
|---|---|---|
| yoshinoya | Yoshinoya | Rice, Beef, Chicken, Japanese |
| dikichi | Dikichi | Chicken, Japanese, Rice |
| selamat-sukses | Selamat Sukses (Kecombrang) | Rice, Indonesian |
| subway | Subway | Sandwich, Chicken, Beef, Western |
| greenly | Greenly | Salad, Healthy, Western |
| dominos-pizza | Domino's Pizza | Pizza, Western |
| pizza-hut | Pizza Hut | Pizza, Pasta, Western |
| warkam | Warkam | Rice, Noodles, Indonesian |
| j-one | J-One | Japanese |
| soto-cak-har | Soto Cak Har | Soto, Soup, Chicken, Indonesian |
| mie-gacoan | Mie Gacoan | Noodles, Spicy, Indonesian |
| uncle-w | Uncle W | Rice, Chinese |
| mcdonalds | McDonald's | Burger, Chicken, Fast Food, Western |
| kfc | KFC | Chicken, Burger, Fast Food |
| sushi-go | Sushi Go! | Sushi, Japanese, Rice |
| aeon | AEON | Food Court, Japanese |
| taria | Taria | Coffee |

Catatan: sebagian tag di atas adalah usulan awal dan belum
diverifikasi (Dikichi, Warkam, J-One, Uncle W, AEON, Taria). Farrel
akan membetulkan sendiri setelah rollout.

## 6. UX v1 (satu halaman `/foods`)

1. Search nama (contains, case-insensitive) + multi-select tag (OR) +
   single-select area (v1 isinya hanya Surabaya; tetap ada sebagai
   fondasi untuk Malang) + result count.
2. Grid cards **statis** — klik tidak mengarah ke mana-mana, tidak ada
   halaman detail di v1. Card = nama + chips tag + area.
3. Tombol "Pilih acak dari hasil ini" menampilkan 1 hasil secara
   prominent + tombol shuffle ulang. Shuffle mengambil dari array
   yang sedang terfilter, bukan dari seluruh data.
4. Empty state: "Tidak ada yang cocok — kurangi tag / reset filter" +
   tombol reset.

## 7. Routing

- Halaman katalog tinggal di `/foods`.
- `app/page.tsx` lama **dipertahankan tapi tidak dipakai**: isinya
  redirect ke `/foods` sehingga buka pertama kali langsung masuk
  katalog.

## 8. File plan (dipakai saat build, bukan sesi ini)

- `lib/foods/types.ts` — `FoodPlace`, `TAG_CATALOG`.
- `lib/foods/index.ts` — pure helpers: filter OR, search, shuffle,
  derivasi katalog tag. Aman untuk import server maupun client.
- `lib/foods/server.ts` — baca JSON seed (import statis atau
  `"use cache"` ringan; diputuskan saat build).
- `lib/foods/data/foods.json` — 17 seed di atas.
- `app/foods/page.tsx` — Server Component, komposisi shell katalog.
- Komponen katalog di bawah `components/foods/`, mengikuti konvensi
  template (`components/ui/` hanya menerima primitive props).

## 9. Acceptance v1

- [ ] 17 seed tampil; filter `Rice` memunculkan Yoshinoya; filter
  `Rice` + `Pizza` (OR) menampilkan gabungan, bukan irisan.
- [ ] Search "gacoan" hanya menampilkan Mie Gacoan.
- [ ] Shuffle 5x dari hasil filter berisi 3 item selalu menghasilkan
  salah satu dari 3 itu, tidak pernah di luar.
- [ ] 0 hasil menampilkan empty state + reset bekerja.
- [ ] `pnpm build` lolos tanpa `.env` Shopify.

## 10. Risiko / hal yang ditunda

- Sisa Shopify/cart/Eve tetap ada di repo (tidak dihapus) — tech debt
  yang disengaja untuk v1.
- CRUD UI ditunda: sebelum ada database, UI CRUD tidak akan persist
  di Vercel/Netlify. Arsitektur backend (DB vs git-based) diputuskan
  di fase berikutnya setelah frontend terlihat.
- Filter area single-value di v1 — sengaja sebagai fondasi, bukan
  fitur yang berguna hari ini.
