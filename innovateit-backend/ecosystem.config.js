module.exports = {
  apps: [{
    // ⚠️ Serverda haqiqiy process shu nom bilan ishlab turibdi (pm2 status
    // orqali tekshirilgan: 2026-07-22). Ilgari bu yerda 'innovateit-backend'
    // yozilgan edi — bu nomuvofiqlik "pm2 restart innovateit-backend" buyrug'i
    // hech narsani topmasligiga olib kelardi. deploy.sh esa to'g'ri
    // 'innovateit-crm' nomini ishlatadi.
    name:       'innovateit-crm',
    script:     'src/index.js',
    cwd: '/var/www/IIS/innovateit-backend',
    instances:  1,
    autorestart: true,
    watch:      false,
    max_memory_restart: '200M',
    env: {
      NODE_ENV: 'production',
      PORT:     3002   // .env dagi PORT bilan bir xil bo'lishi shart
    },
    error_file: '/var/log/innovateit/error.log',
    out_file:   '/var/log/innovateit/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
};

// ─── ESLATMA ───────────────────────────────────────────────────────────────
// Serverdagi jonli process pm2 start ecosystem.config.js orqali emas, balki
// to'g'ridan-to'g'ri (masalan `pm2 start src/index.js --name innovateit-crm`)
// ishga tushirilgan bo'lishi mumkin. Bu fayl endi u bilan mos (nom, port,
// yo'l bir xil), shuning uchun xavfsiz — lekin agar kelajakda serverni
// qaytadan sozlashga to'g'ri kelsa (masalan server ko'chirilganda), aynan shu
// fayldan `pm2 start ecosystem.config.js` bilan ishga tushirish tavsiya
// etiladi — bu ikkita alohida manbadan (qo'lda buyruq va bu fayl) kelib
// chiqadigan farqlarning oldini oladi.

