// ═══════════════════════════════════════════════════════════════════════════
//  Ijtimoiy tarmoq preview'lari uchun SSR (server-side render) endpoint
//  ─────────────────────────────────────────────────────────────────────────
//  Muammo: blog postlari client-side JS orqali yuklanadi (post.html avval
//  bo'sh keladi, keyin JS to'ldiradi). Telegram/Facebook/Twitter kabi
//  botlar JavaScript ishlatmaydi — ular faqat boshlang'ich HTML'ni o'qiydi,
//  shuning uchun sarlavha/rasm ko'rinmay qoladi.
//
//  Yechim: nginx bot User-Agent'ini aniqlab, /post.html so'rovini shu yerga
//  yo'naltiradi (faqat botlar uchun) — biz esa to'g'ri og:title/og:image
//  teglari bilan tayyor HTML qaytaramiz. Oddiy foydalanuvchilar bu yerga
//  umuman tushmaydi, ular hozirgidek post.html'ni JS bilan ko'radi.
//
//    GET /ssr/post-preview?slug=xxx
// ═══════════════════════════════════════════════════════════════════════════
const { Router } = require('express');
const pool = require('../db');

const router = Router();

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

router.get('/post-preview', async (req, res) => {
  try {
    const slug = req.query.slug;
    if (!slug) return res.status(400).send('slug parametri kerak');

    const q = await pool.query(
      `SELECT p.sarlavha, p.slug, p.qisqacha, p.seo_tavsif, p.muqova_rasm
       FROM blog_posts p
       WHERE p.slug = $1 AND p.holat = 'chop_etilgan'`,
      [slug]
    );
    if (q.rowCount === 0) return res.status(404).send('Post topilmadi');

    const p = q.rows[0];
    const origin = `${req.headers['x-forwarded-proto'] || 'https'}://${req.get('host')}`;
    const title = p.sarlavha || 'InnovateIT School Blog';
    const desc  = p.seo_tavsif || p.qisqacha || 'InnovateIT School — IT, matematika va ingliz tili ta\'lim markazi.';
    const image = p.muqova_rasm
      ? (p.muqova_rasm.startsWith('http') ? p.muqova_rasm : `${origin}/uploads/${p.muqova_rasm}`)
      : `${origin}/img/logo-mark.png`;
    const url = `${origin}/post.html?slug=${encodeURIComponent(p.slug)}`;

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="uz">
<head>
<meta charset="UTF-8">
<title>${esc(title)} — InnovateIT School Blog</title>
<meta name="description" content="${esc(desc)}">

<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="InnovateIT School">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">

<meta http-equiv="refresh" content="0; url=${esc(url)}">
</head>
<body>
<p><a href="${esc(url)}">${esc(title)}</a></p>
</body>
</html>`);
  } catch (err) {
    console.error('ssr /post-preview xatolik:', err.message);
    res.status(500).send('Server xatoligi');
  }
});

module.exports = router;
