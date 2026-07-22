# 🚀 InnovateIT School — Deploy Guide

> ✅ Bu hujjat 2026-07-22'da serverda tasdiqlangan haqiqiy sozlamalarga
> asoslanib yozilgan (`pm2 status`, `.env`, mavjud nginx configlari orqali
> tekshirilgan). Eski versiyada bir nechta noto'g'ri taxmin bor edi
> (port 3001 o'rniga 3002, `innovateit-backend` process nomi o'rniga
> `innovateit-crm`) — bularning barchasi shu yerda tuzatilgan.

## Arxitektura (ikki domen, bitta backend)

```
                          ┌──────────────────────────────┐
 new.innovateitschool.uz  │  innovateit-frontend          │  CRM / Superadmin panel
     ├── /                │  (static HTML/CSS/JS)         │
     └── /api, /upload ───┤  └────────────────────────────┘
                          │
                          ▼
                  Node.js :3002  (Express, PM2 process: innovateit-crm)
                          │
                          ▼
                  PostgreSQL (innovateit DB)
                          ▲
                          │
                          ┌──────────────────────────────┐
 innovateitschool.uz      │  innovateit-blog-frontend      │  Ochiq blog sayti
     ├── /                │  (static HTML/CSS/JS)          │
     └── /api ────────────┘  └────────────────────────────┘
```

- **Bitta Node.js backend** (`innovateit-backend`, PM2 nomi **`innovateit-crm`**,
  port **3002**) ikkala domenga ham xizmat qiladi.
- Blogni boshqarish faqat `new.innovateitschool.uz` CRM panelidagi
  **"📝 Blog"** tabi orqali (faqat superadmin — `requireSuperAdmin`
  middleware bilan backendda ham tasdiqlanadi).
- `innovateitschool.uz` — faqat o'qish uchun ochiq (public, login shart emas).
- Repo joylashuvi: **`/var/www/IIS`** (GitHub Actions shu yerga `git pull`
  qiladi — `.github/workflows/deploy.yml`).
- Uploads (rasm/sertifikat fayllari) nginx orqali `alias` bilan
  to'g'ridan-to'g'ri diskdan (`/var/www/IIS/innovateit-backend/uploads/`)
  beriladi — Node backendga proxy qilinmaydi.

---

## Kundalik ishlatish: yangilanishlarni deploy qilish

Kodga o'zgartirish kiritib, `git push` qilgandan so'ng, serverda:

```bash
cd /var/www/IIS
bash deploy.sh
```

`deploy.sh` avtomatik quyidagilarni bajaradi:
1. `git pull origin main`
2. Backend dependencies (`npm install --production`)
3. `innovateit_schema_setup.sql` orqali database jadvallarini yangilaydi
4. `pm2 restart innovateit-crm`
5. `http://127.0.0.1:3002/health` orqali tekshiradi

> ⚠️ Blog frontend (`innovateit-blog-frontend`) va CRM frontend
> (`innovateit-frontend`) alohida `scp` qilinmaydi — ular `git pull` bilan
> birga `/var/www/IIS` ichida yangilanadi, chunki nginx to'g'ridan-to'g'ri
> shu papkalarni `root` sifatida ko'rsatadi (pastga qarang).

---

## Yangi server / dastlabki o'rnatish (agar noldan sozlansa)

### 1) Talab qilinadigan dasturlar

```bash
# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2

# Nginx
sudo apt update && sudo apt install -y nginx
sudo systemctl enable nginx && sudo systemctl start nginx
```

### 2) PostgreSQL: baza va foydalanuvchi

```bash
sudo -u postgres psql
CREATE DATABASE innovateit;
CREATE USER innovateit_user WITH PASSWORD 'KUCHLI_PAROL_YOZ';
GRANT ALL PRIVILEGES ON DATABASE innovateit TO innovateit_user;
\c innovateit
GRANT ALL ON SCHEMA public TO innovateit_user;
\q
```

### 3) Repo'ni serverga klonlash

```bash
sudo mkdir -p /var/www/IIS
sudo chown $USER:$USER /var/www/IIS
cd /var/www/IIS
git clone https://github.com/SIZNING_REPO/IIS.git .
```

### 4) Backend `.env` sozlash

```bash
cd /var/www/IIS/innovateit-backend
npm install --production
cp .env.example .env
nano .env
```

`.env` (haqiqiy production qiymatlariga mos):
```env
PORT=3002
DB_HOST=localhost
DB_PORT=5432
DB_NAME=innovateit
DB_USER=innovateit_user
DB_PASSWORD=KUCHLI_PAROL_YOZ
SUPER_ADMIN_USERNAME=superadmin
SUPER_ADMIN_PAROL=25145771
SUPER_ADMIN_ISM=InnovateIT School Manager
JWT_SECRET=kamida_32_belgi_uzunlikda_maxfiy_kalit
JWT_EXPIRES=8h
```

### 5) Database jadvallarini yaratish

```bash
sudo -u postgres psql -d innovateit -f /var/www/IIS/innovateit-backend/innovateit_schema_setup.sql

# Blog moduli (agar hali ishga tushirilmagan bo'lsa):
sudo -u postgres psql -d innovateit -f /var/www/IIS/innovateit-backend/migrations/002_blog_module.sql

# Tekshirish:
sudo -u postgres psql -d innovateit -c "\dt"
sudo -u postgres psql -d innovateit -c "\dt blog_*"
```

### 6) PM2 bilan ishga tushirish

```bash
sudo mkdir -p /var/log/innovateit
sudo chown $USER:$USER /var/log/innovateit

cd /var/www/IIS/innovateit-backend
pm2 start ecosystem.config.js   # process nomi: innovateit-crm

pm2 status
pm2 logs innovateit-crm --lines 20

pm2 startup   # chiqqan buyruqni nusxalab ishga tushiring
pm2 save
```

### 7) Nginx: ikkala domen

**CRM** (`new.innovateitschool.uz`) — mavjud, tayyor fayl:
`/etc/nginx/sites-available/new.innovateitschool.uz`. Bunga tegilmaydi.

**Blog** (`innovateitschool.uz`) — repo bilan birga keladigan
`nginx-innovateitschool-blog.conf` faylini ishlatamiz:

```bash
sudo cp /var/www/IIS/nginx-innovateitschool-blog.conf /etc/nginx/sites-available/innovateitschool.uz
sudo ln -s /etc/nginx/sites-available/innovateitschool.uz /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

> ⚠️ Eski/stub `sites-available/innovateit` fayli (`return 404;`) bo'lsa,
> uni `sites-enabled`dan olib tashlang, aks holda ikkala fayl bir xil
> `server_name` bilan konflikt qilishi mumkin:
> ```bash
> sudo rm -f /etc/nginx/sites-enabled/innovateit
> ```

### 8) SSL (Certbot)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d innovateitschool.uz -d www.innovateitschool.uz
sudo certbot renew --dry-run
```

`new.innovateitschool.uz` hozircha self-signed sertifikat bilan ishlayapti —
bu CRM (faqat xodimlar kiradigan) bo'lgani uchun unchalik muhim emas, lekin
`innovateitschool.uz` ochiq/public sayt bo'lgani uchun **real sertifikat
shart** (aks holda brauzer "Not secure" ko'rsatadi va SEO'ga salbiy ta'sir
qiladi).

---

## Tekshirish

```bash
# Backend to'g'ridan-to'g'ri
curl http://127.0.0.1:3002/health

# Blog API (public)
curl https://innovateitschool.uz/api/blog/posts

# CRM orqali kirish
curl -X POST https://new.innovateitschool.uz/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"superadmin","parol":"..."}'
```

CRM panelida superadmin bilan kiring → **📝 Blog** tabini oching →
"➕ Yangi post" → holatni **✅ Chop etilgan** qilib saqlang →
`https://innovateitschool.uz` da darhol ko'rinadi.

---

## 🔧 Foydali PM2 buyruqlari

```bash
pm2 status
pm2 logs innovateit-crm
pm2 logs innovateit-crm --lines 50
pm2 restart innovateit-crm
pm2 stop innovateit-crm
```

---

## ❓ Muammolar

**Backend ishlamayapti:**
```bash
pm2 logs innovateit-crm --err --lines 30
```

**DB ga ulanmayapti:**
```bash
sudo -u postgres psql -d innovateit -c "SELECT current_user;"
```

**Nginx xatosi:**
```bash
sudo nginx -t
sudo journalctl -u nginx --since "5 minutes ago"
```

**Port band yoki backend qaysi portda ekanini tekshirish:**
```bash
cat /var/www/IIS/innovateit-backend/.env | grep -i port
sudo ss -tlnp | grep node
```

**CORS xatosi (browser konsolida "CORS: ruxsat yoq"):**
`innovateit-backend/src/index.js` dagi CORS whitelist'ni tekshiring —
`https://innovateitschool.uz`, `https://www.innovateitschool.uz` va
`https://new.innovateitschool.uz` ro'yxatda bo'lishi shart.
