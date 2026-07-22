# 📝 Innovate IT School — Blog moduli qo'shildi

## Nima o'zgardi

```
innovateit-backend/
  migrations/002_blog_module.sql   ← YANGI: blog_posts, blog_categories jadvallari
  src/routes/blog.js               ← YANGI: /api/blog/* endpointlari
  src/index.js                     ← o'zgartirildi: blog router ulandi

innovateit-frontend/                (CRM paneli — new.innovateitschool.uz)
  index.html                       ← o'zgartirildi: "📝 Blog" tabi + modallar qo'shildi
  js/api.js                        ← o'zgartirildi: blog admin metodlari qo'shildi
  js/app.js                        ← o'zgartirildi: switchTab('bl') qo'shildi
  js/blog-admin.js                 ← YANGI: blog CRUD mantig'i

innovateit-blog-frontend/           (YANGI — ochiq blog sayti, innovateitschool.uz)
  index.html                       ← postlar ro'yxati, hero, kategoriya filtri
  post.html                        ← bitta post sahifasi
  css/blog.css                     ← dizayn tizimi
  js/blog.js                       ← API client
```

## 1) Serverda migration ishga tushirish

CRM allaqachon ishlayotgan `innovateit` bazasida (o'zgartirmasdan, faqat yangi jadvallar qo'shiladi):

```bash
cd /var/www/Innovateit/innovateit-backend
sudo -u postgres psql -d innovateit -f migrations/002_blog_module.sql
```

Tekshirish:
```bash
sudo -u postgres psql -d innovateit -c "\dt blog_*"
```

## 2) Backendni yangilash

```bash
cd /var/www/Innovateit/innovateit-backend
git pull   # yoki fayllarni scp bilan yuklang
pm2 restart innovateit-backend
pm2 logs innovateit-backend --lines 20
```

`.env` faylida hech narsa o'zgartirish shart emas — blog moduli mavjud
`JWT_SECRET`, `DB_*` va superadmin sozlamalaridan foydalanadi.

## 3) CRM frontendni yangilash (new.innovateitschool.uz)

```bash
scp -r innovateit-frontend/* root@SERVER:/var/www/innovateit-frontend/
```

Superadmin login qilganda endi tablar qatorida **📝 Blog** tugmasi ko'rinadi.
Oddiy (maktab) adminlar bu tabni ko'rmaydi — mavjud `super-admin` cheklovi
avtomatik ishlaydi, backend tomonda ham `requireSuperAdmin` bilan qayta
tekshiriladi.

## 4) Yangi domen: innovateitschool.uz (ochiq blog sayti)

### 4.1 — Frontend fayllarni serverga yuklash

```bash
sudo mkdir -p /var/www/innovateit-blog-frontend
scp -r innovateit-blog-frontend/* root@SERVER:/var/www/innovateit-blog-frontend/
```

### 4.2 — Nginx: ikkinchi server bloki qo'shish

Mavjud `new.innovateitschool.uz` konfiguratsiyasiga tegmang. Yangi fayl:

```bash
sudo nano /etc/nginx/sites-available/innovateitschool-blog
```

```nginx
server {
    listen 80;
    server_name innovateitschool.uz www.innovateitschool.uz;

    root /var/www/innovateit-blog-frontend;
    index index.html;

    location / {
        try_files $uri $uri.html $uri/ =404;
    }

    # ─── Bir xil backendga proxy (blog + uploads) ───
    location /api {
        proxy_pass         http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    location /uploads {
        proxy_pass http://127.0.0.1:3001;
    }

    location ~* \.(css|js|png|jpg|jpeg|webp|ico|woff2?)$ {
        expires 7d;
        add_header Cache-Control "public, immutable";
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/innovateitschool-blog /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d innovateitschool.uz -d www.innovateitschool.uz
```

> ⚠️ Bitta backend (`127.0.0.1:3001`, PM2 process `innovateit-backend`)
> ikkala domenga ham xizmat qiladi. CORS'da `innovateitschool.uz` allaqachon
> ruxsat etilgan edi (`src/index.js`), qo'shimcha o'zgartirish shart emas.

## 5) Tekshirish

```bash
curl https://innovateitschool.uz/api/blog/posts
curl https://new.innovateitschool.uz/api/auth/login -X POST -H "Content-Type: application/json" -d '{"username":"...","parol":"..."}'
```

CRM panelida (**new.innovateitschool.uz**) superadmin bilan kiring → **📝 Blog**
tabini oching → "➕ Yangi post" orqali birinchi postni yarating → holatni
**✅ Chop etilgan** qilib saqlang → https://innovateitschool.uz da darhol
ko'rinadi.

## Arxitektura xulosasi

```
                     ┌─────────────────────────┐
                     │   PostgreSQL: innovateit  │
                     │  (+ blog_posts, blog_categories) │
                     └────────────┬─────────────┘
                                  │
                     ┌────────────┴─────────────┐
                     │  innovateit-backend (PM2) │
                     │  Express :3001            │
                     │  /api/auth, /api/students │
                     │  /api/blog  ← YANGI        │
                     └──┬─────────────────────┬──┘
                        │ nginx proxy         │ nginx proxy
        ┌───────────────┴───────┐   ┌─────────┴──────────────┐
        │ new.innovateitschool.uz │   │ innovateitschool.uz     │
        │ CRM paneli (admin/     │   │ Ochiq blog sayti         │
        │ superadmin, +Blog tab) │   │ (public, login shart emas)│
        └────────────────────────┘   └─────────────────────────┘
```

Bitta baza, bitta backend, bitta superadmin login — ikkita frontend, ikkita
domen.
