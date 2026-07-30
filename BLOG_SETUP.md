# 📝 Innovate IT School — Blog moduli

> ✅ Bu hujjat 2026-07-30'da mavjud kod bazasiga (repo tuzilishi, `DEPLOY.md`,
> `nginx-innovateitschool-blog.conf`, `deploy.sh`) qarab qayta tekshirilib
> yangilandi. Eski versiyada bir nechta eskirgan taxmin bor edi — port 3001
> o'rniga to'g'risi **3002**, PM2 process nomi `innovateit-backend` o'rniga
> **`innovateit-crm`**, repo/deploy yo'li `/var/www/Innovateit` yoki alohida
> `/var/www/innovateit-blog-frontend` o'rniga to'g'risi **`/var/www/IIS`**
> (ikkala frontend ham shu yagona repo ichida, `git pull` bilan birga
> yangilanadi — alohida `scp` shart emas).

## Nima uchun bu modul bor

`innovateitschool.uz` — ochiq (public, login shart emas) blog sayti:
maktab yangiliklari, o'quvchilar yutuqlari, IT darslar va ota-onalar uchun
maqolalar. Shu bilan bir qatorda **qabul/lead** oqimi ham shu saytda
joylashgan (`royxat.html` → `sales` moduli, bor keyin sales bo'limi ular
bilan bog'lanadi).

## Fayllar xaritasi

```
innovateit-backend/
  migrations/002_blog_module.sql     ← blog_posts, blog_categories, blog_tags jadvallari
  migrations/003_blog_cover_position.sql ← muqova rasm fokus pozitsiyasi (0-100)
  migrations/004_blog_cover_zoom.sql     ← muqova rasm zoom (100-250%)
  migrations/005_sales_module.sql        ← sales_xodimlar, leadlar (royxat.html forma shu yerga yozadi)
  src/routes/blog.js                 ← /api/blog/* endpointlari (public + admin)
  src/routes/sales.js                ← /api/sales/leads (royxat.html POST qiladigan joy)
  src/index.js                       ← barcha router'lar shu yerda ulanadi

innovateit-frontend/                  (CRM paneli — new.innovateitschool.uz)
  index.html                         ← "📝 Blog" tabi + post/kategoriya modallari
  js/api.js                          ← blog admin API metodlari
  js/app.js                          ← switchTab('bl') va tab ulanishi
  js/blog-admin.js                   ← blog CRUD mantig'i (post/kategoriya, muqova pozitsiya/zoom)
  js/sales-admin.js                  ← leadlar/sales xodimlari boshqaruvi

innovateit-blog-frontend/             (ochiq blog sayti — innovateitschool.uz)
  index.html                         ← postlar ro'yxati, hero, kategoriya filtri, qabul banneri
  post.html                          ← bitta post (DOMPurify bilan XSS himoyasi)
  royxat.html                        ← qabul/lead formasi (sales moduliga yozadi)
  css/blog.css                       ← umumiy dizayn tizimi
  css/royxat.css                     ← royxat.html'ga xos stillar
  js/blog.js                         ← API client + umumiy yordamchilar (BASE, apiGet, mobil menyu)
  js/royxat.js                       ← forma validatsiyasi va yuborish
```

## Arxitektura (bitta backend, ikkita domen)

```
                          ┌──────────────────────────────┐
 new.innovateitschool.uz  │  innovateit-frontend           │  CRM / Superadmin panel
     ├── /                │  (static HTML/CSS/JS)          │  (+ 📝 Blog tab)
     └── /api, /upload ───┤  └────────────────────────────┘
                          │
                          ▼
                  Node.js :3002  (Express, PM2 process: innovateit-crm)
                  /api/blog, /api/sales, /api/auth, ...
                          │
                          ▼
                  PostgreSQL (innovateit DB)
                          ▲
                          │
                          ┌──────────────────────────────┐
 innovateitschool.uz      │  innovateit-blog-frontend       │  Ochiq blog sayti
     ├── /                │  (static HTML/CSS/JS)           │  (public, login shart emas)
     └── /api ────────────┘  ├── index.html, post.html      │
                              └── royxat.html (lead forma) ──┘
```

- **Bitta Node.js backend** (`innovateit-backend`, PM2 nomi **`innovateit-crm`**,
  port **3002**) ikkala domenga ham xizmat qiladi.
- Blogni boshqarish faqat `new.innovateitschool.uz` CRM panelidagi
  **"📝 Blog"** tabi orqali (faqat superadmin — frontendda tab yashirilgan,
  backendda ham `requireSuperAdmin` middleware bilan qayta tekshiriladi).
- Repo joylashuvi: **`/var/www/IIS`**. Ikkala frontend (`innovateit-frontend`
  va `innovateit-blog-frontend`) ham shu repo ichida — nginx ularni
  to'g'ridan-to'g'ri `root` sifatida ko'rsatadi, alohida `scp` qilish shart
  emas, `git pull`/`deploy.sh` bilan birga yangilanadi.
- Uploads (muqova rasmlar) nginx orqali `alias` bilan to'g'ridan-to'g'ri
  diskdan (`/var/www/IIS/innovateit-backend/uploads/`) beriladi — Node
  backendga proxy qilinmaydi.

## 1) Migratsiyalarni ishga tushirish

Yangi serverda yoki hali ishga tushirilmagan bo'lsa:

```bash
cd /var/www/IIS/innovateit-backend
sudo -u postgres psql -d innovateit -f innovateit_schema_setup.sql   # asosiy sxema (blog+sales jadvallari shu ichida ham bor)
# yoki alohida migratsiyalar bilan qadam-baqadam:
sudo -u postgres psql -d innovateit -f migrations/002_blog_module.sql
sudo -u postgres psql -d innovateit -f migrations/003_blog_cover_position.sql
sudo -u postgres psql -d innovateit -f migrations/004_blog_cover_zoom.sql
sudo -u postgres psql -d innovateit -f migrations/005_sales_module.sql
```

Tekshirish:
```bash
sudo -u postgres psql -d innovateit -c "\dt blog_*"
sudo -u postgres psql -d innovateit -c "\dt leadlar"
```

> ℹ️ Odatiy holatda bularning barchasi `bash deploy.sh` ichidagi
> `innovateit_schema_setup.sql` bosqichi orqali avtomatik qo'llaniladi —
> qo'lda ishga tushirish faqat noldan sozlashda yoki muammoni debug
> qilishda kerak bo'ladi.

## 2) Kundalik yangilash (kod o'zgargandan keyin)

Serverda:
```bash
cd /var/www/IIS
bash deploy.sh
```

`deploy.sh` avtomatik bajaradi: `git pull` → statik fayllarni cache-busting
bilan versiyalash → `npm install --production` → schema sinxronlash →
`pm2 restart innovateit-crm` → `http://127.0.0.1:3002/health` tekshiruvi.

Superadmin CRM panelida (`new.innovateitschool.uz`) kirganda **📝 Blog**
tabi ko'rinadi; oddiy (maktab) adminlar uni ko'rmaydi.

## 3) Nginx

Blog sayti uchun konfiguratsiya repo ichida tayyor:
**`nginx-innovateitschool-blog.conf`** (root: `/var/www/IIS/innovateit-blog-frontend`,
`/api/` va `/uploads/` — bitta backendga, port 3002 ga). Faylni faqat bir
marta `sites-enabled`ga ulash kifoya:

```bash
sudo cp /var/www/IIS/nginx-innovateitschool-blog.conf /etc/nginx/sites-available/innovateitschool-blog
sudo ln -s /etc/nginx/sites-available/innovateitschool-blog /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d innovateitschool.uz -d www.innovateitschool.uz   # real sertifikat uchun
```

`new.innovateitschool.uz` konfiguratsiyasiga hech qanday o'zgartirish shart
emas — u alohida faylda, mustaqil ishlaydi.

## 4) Tekshirish

```bash
curl https://innovateitschool.uz/api/blog/posts
curl https://innovateitschool.uz/api/sales/leads -X POST -H "Content-Type: application/json" \
  -d '{"ism":"Test","telefon":"+998901234567"}'
curl https://new.innovateitschool.uz/api/auth/login -X POST -H "Content-Type: application/json" \
  -d '{"username":"...","parol":"..."}'
```

Ish jarayoni: CRM panelida (**new.innovateitschool.uz**) superadmin bilan
kiring → **📝 Blog** tabini oching → "➕ Yangi post" orqali post yarating →
holatni **✅ Chop etilgan** qilib saqlang → https://innovateitschool.uz da
darhol ko'rinadi. Qabul formasi (`royxat.html`) orqali kelgan leadlar CRM
panelidagi **Sales** tabida (yoki alohida `sales.html` panelida) ko'rinadi.

---

Bitta baza, bitta backend, bitta repo (`/var/www/IIS`), bitta superadmin
login — ikkita frontend, ikkita domen.