#!/bin/bash
# ═══════════════════════════════════════════════════
#  InnovateIT School — Deploy skript
#  Ishlatish: bash deploy.sh
# ═══════════════════════════════════════════════════

set -e  # Xato bo'lsa to'xta

echo ""
echo "🚀 InnovateIT deploy boshlandi..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ─── 1. Kodlarni yangilash ───
echo ""
echo "📥 1. GitHub dan kod yangilanmoqda..."
cd /var/www/IIS
git pull origin main
echo "✅ Kod yangilandi"

# ─── 1.5. Cache-busting: CSS/JS havolalariga vaqt belgisi qo'yish ───
echo ""
echo "🕒 1.5. Statik fayllar (CSS/JS) versiyalanmoqda..."
V=$(date +%s)
find /var/www/IIS -name "*.html" -exec sed -i -E \
  -e "s#(href=\"css/[^\"]+\.css)(\?v=[0-9]+)?\"#\1?v=${V}\"#g" \
  -e "s#(src=\"js/[^\"]+\.js)(\?v=[0-9]+)?\"#\1?v=${V}\"#g" \
  {} +
echo "✅ CSS/JS versiyasi yangilandi: v=${V}"
echo "   (Brauzer keshi endi eski CSS/JS'ni ko'rsatmaydi)"

# ─── 2. Backend dependencies ───
echo ""
echo "📦 2. Backend dependencies tekshirilmoqda..."
cd /var/www/IIS/innovateit-backend
npm install --production --silent
echo "✅ Dependencies tayyor"

# ─── 3. Database: jadvallar va ruxsatlar ───
echo ""
echo "🗄️  3. Database jadvallar va ruxsatlar yangilanmoqda..."
sudo -u postgres psql -d innovateit \
  -f /var/www/IIS/innovateit-backend/innovateit_schema_setup.sql
echo "✅ Database tayyor"

# ─── 4. Backend qayta ishga tushirish ───
echo ""
echo "🔄 4. Backend qayta ishga tushirilmoqda..."
pm2 restart innovateit-crm
sleep 2
pm2 status
echo "✅ Backend qayta ishga tushdi"

# ─── 5. Tekshirish ───
echo ""
echo "🔍 5. API tekshirilmoqda..."
sleep 1
HEALTH=$(curl -s http://127.0.0.1:3002/health 2>/dev/null || echo "xato")
if echo "$HEALTH" | grep -q '"ok":true'; then
  echo "✅ API ishlayapti: $HEALTH"
else
  echo "⚠️  API javob bermadi: $HEALTH"
  echo "   Loglarni tekshiring: pm2 logs innovateit-crm --lines 20"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Deploy muvaffaqiyatli yakunlandi!"
echo "🌐 https://new.innovateitschool.uz"
echo ""