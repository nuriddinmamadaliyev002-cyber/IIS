// ═══════════════════════════════════════════════════════════════════════════
//  Blog boshqaruv paneli — faqat superadmin uchun (tabs-row superadmin'da
//  ko'rinadi, shuning uchun bu bo'lim avtomatik ravishda superadmin bilan
//  cheklangan; backendda ham requireSuperAdmin bilan qayta tekshiriladi).
// ═══════════════════════════════════════════════════════════════════════════

let BL_POSTS = [];
let BL_CATEGORIES = [];

function blHtmlEsc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function blFormatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ─── Postlar ro'yxatini yuklash ────────────────────────────────────────────────
async function loadBlogTab() {
  g('bl-posts-loading').style.display = 'block';
  g('bl-posts-empty').style.display = 'none';
  try {
    const [postsRes, catsRes] = await Promise.all([
      api.getBlogPosts(),
      api.getBlogCategories()
    ]);
    if (postsRes.ok) BL_POSTS = postsRes.posts;
    if (catsRes.ok) BL_CATEGORIES = catsRes.categories;
    renderBlogPosts();
  } catch (e) {
    toast("❌ Blog postlarini yuklab bo'lmadi", 'error');
  }
  g('bl-posts-loading').style.display = 'none';
}

function renderBlogPosts() {
  const tbody = g('bl-posts-tbody');
  if (!BL_POSTS.length) {
    tbody.innerHTML = '';
    g('bl-posts-empty').style.display = 'block';
    return;
  }
  g('bl-posts-empty').style.display = 'none';

  tbody.innerHTML = BL_POSTS.map(p => {
    const holatBadge = p.holat === 'chop_etilgan'
      ? '<span style="background:#dcfce7;color:#15803d;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;">✅ Chop etilgan</span>'
      : '<span style="background:#fef3c7;color:#92400e;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;">📝 Qoralama</span>';
    return `
      <tr>
        <td style="font-weight:600;color:#111827;">${blHtmlEsc(p.sarlavha)}</td>
        <td>${blHtmlEsc(p.kategoriya_nomi || '—')}</td>
        <td>${holatBadge}</td>
        <td>${p.korishlar ?? 0}</td>
        <td>${blFormatDate(p.chop_vaqti)}</td>
        <td style="white-space:nowrap;">
          <button onclick="blEditPost(${p.id})" title="Tahrirlash" style="background:none;border:none;cursor:pointer;font-size:16px;padding:4px 6px;">✏️</button>
          <button onclick="blDeletePost(${p.id})" title="O'chirish" style="background:none;border:none;cursor:pointer;font-size:16px;padding:4px 6px;">🗑️</button>
        </td>
      </tr>`;
  }).join('');
}

// ─── Kategoriya select'ni to'ldirish ───────────────────────────────────────────
function blFillCategorySelect() {
  const sel = g('bl-p-kategoriya');
  sel.innerHTML = '<option value="">— Kategoriyasiz —</option>' +
    BL_CATEGORIES.map(c => `<option value="${c.id}">${blHtmlEsc(c.nomi)}</option>`).join('');
}

// ─── Chop etilgan sana maydoni (datetime-local <-> ISO) ────────────────────────
function blToLocalInputValue(dateOrIso) {
  const d = dateOrIso instanceof Date ? dateOrIso : new Date(dateOrIso);
  if (isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function blSetDateNow() {
  g('bl-p-sana').value = blToLocalInputValue(new Date());
}

function blToggleDateField() {
  const isPublished = g('bl-p-holat').value === 'chop_etilgan';
  g('bl-p-sana-wrap').style.display = isPublished ? 'block' : 'none';
  if (isPublished && !g('bl-p-sana').value) blSetDateNow();
}

// ─── Postga qo'shimcha rasmlar (galereya) ───────────────────────────────────────
let BL_GALLERY = []; // yuklangan rasm fayl nomlari ro'yxati

function blRenderGalleryList() {
  const wrap = g('bl-p-galereya-list');
  const countEl = g('bl-p-galereya-count');
  countEl.textContent = BL_GALLERY.length ? `${BL_GALLERY.length} ta rasm` : '';
  wrap.innerHTML = BL_GALLERY.map((filename, idx) => `
    <div style="position:relative;width:72px;height:72px;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;flex-shrink:0;">
      <img src="${blResolveUpload(filename)}" style="width:100%;height:100%;object-fit:cover;display:block;">
      <button type="button" onclick="blRemoveGalleryImage(${idx})" title="O'chirish"
        style="position:absolute;top:2px;right:2px;width:20px;height:20px;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;border:none;cursor:pointer;font-size:12px;line-height:1;display:flex;align-items:center;justify-content:center;">✕</button>
    </div>
  `).join('');
}

function blRemoveGalleryImage(idx) {
  BL_GALLERY.splice(idx, 1);
  blRenderGalleryList();
}

async function blUploadGalleryFiles(ev) {
  const files = Array.from(ev.target.files || []);
  if (!files.length) return;
  const countEl = g('bl-p-galereya-count');

  for (const file of files) {
    countEl.textContent = `Yuklanmoqda... (${file.name})`;
    const fd = new FormData();
    fd.append('file', file);
    const res = await api.uploadFile(fd);
    if (res.ok) {
      BL_GALLERY.push(res.filename);
    } else {
      toast(`❌ ${file.name} yuklanmadi`, 'error');
    }
  }
  ev.target.value = '';
  blRenderGalleryList();
}

// ─── Post modal ─────────────────────────────────────────────────────────────
function blOpenPostModal() {
  g('bl-modal-title').textContent = '➕ Yangi post';
  g('bl-p-id').value = '';
  g('bl-p-sarlavha').value = '';
  g('bl-p-qisqacha').value = '';
  g('bl-p-kontent').value = '';
  g('bl-p-muallif').value = 'Innovate IT School';
  g('bl-p-muqova').value = '';
  g('bl-p-holat').value = 'qoralama';
  g('bl-p-sana').value = '';
  blToggleDateField();
  BL_GALLERY = [];
  blRenderGalleryList();
  g('bl-p-cover-status').textContent = '';
  g('bl-p-cover-preview-wrap').style.display = 'none';
  blSetCoverPosition(50);
  blSetCoverZoom(100);
  g('bl-p-err').style.display = 'none';
  blFillCategorySelect();
  g('bl-post-modal').style.display = 'flex';
}

async function blEditPost(id) {
  const res = await api.getBlogPost(id);
  if (!res.ok) { toast('❌ Post topilmadi', 'error'); return; }
  const p = res.post;
  g('bl-modal-title').textContent = '✏️ Postni tahrirlash';
  g('bl-p-id').value = p.id;
  g('bl-p-sarlavha').value = p.sarlavha;
  g('bl-p-qisqacha').value = p.qisqacha || '';
  g('bl-p-kontent').value = p.kontent;
  g('bl-p-muallif').value = p.muallif || 'Innovate IT School';
  g('bl-p-muqova').value = p.muqova_rasm || '';
  g('bl-p-holat').value = p.holat;
  g('bl-p-sana').value = p.chop_vaqti ? blToLocalInputValue(p.chop_vaqti) : '';
  blToggleDateField();
  BL_GALLERY = Array.isArray(p.galereya) ? [...p.galereya] : [];
  blRenderGalleryList();
  g('bl-p-err').style.display = 'none';
  blFillCategorySelect();
  if (p.kategoriya_id) g('bl-p-kategoriya').value = p.kategoriya_id;
  if (p.muqova_rasm) {
    g('bl-p-cover-preview').src = blResolveUpload(p.muqova_rasm);
    g('bl-p-cover-preview-wrap').style.display = 'block';
    blSetCoverPosition(p.muqova_pozitsiya ?? 50);
    blSetCoverZoom(p.muqova_masshtab ?? 100);
  } else {
    g('bl-p-cover-preview-wrap').style.display = 'none';
    blSetCoverPosition(50);
    blSetCoverZoom(100);
  }
  g('bl-p-cover-status').textContent = '';
  g('bl-post-modal').style.display = 'flex';
}

function blClosePostModal() {
  g('bl-post-modal').style.display = 'none';
}

// ─── Muqova rasm pozitsiyasi (0=yuqori, 50=o'rta, 100=past) va zoom (100-250%) ──
function blApplyCoverTransform() {
  const pos  = parseInt(g('bl-p-pozitsiya').value, 10) || 50;
  const zoom = parseInt(g('bl-p-masshtab').value, 10) || 100;
  const img = g('bl-p-cover-preview');
  img.style.objectPosition = `center ${pos}%`;
  img.style.transformOrigin = `center ${pos}%`;
  img.style.transform = `scale(${zoom / 100})`;
}

function blSetCoverPosition(value) {
  const v = Math.max(0, Math.min(100, parseInt(value, 10) || 50));
  g('bl-p-pozitsiya').value = v;
  g('bl-p-pozitsiya-range').value = v;
  const label = v <= 20 ? "Yuqori qism" : v >= 80 ? "Past qism" : "O'rtada";
  g('bl-p-pozitsiya-val').textContent = label;
  blApplyCoverTransform();
}

function blSetCoverZoom(value) {
  const v = Math.max(100, Math.min(250, parseInt(value, 10) || 100));
  g('bl-p-masshtab').value = v;
  g('bl-p-masshtab-range').value = v;
  g('bl-p-masshtab-val').textContent = `${v}%`;
  blApplyCoverTransform();
}

function blUpdateCoverPosition(value) {
  blSetCoverPosition(value);
}

function blUpdateCoverZoom(value) {
  blSetCoverZoom(value);
}

function blResolveUpload(filename) {
  if (!filename) return '';
  if (filename.startsWith('http')) return filename;
  const base = (typeof BASE !== 'undefined') ? BASE : '';
  return `${base}/uploads/${filename}`;
}

async function blUploadCover(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  g('bl-p-cover-status').textContent = '⏳ Yuklanmoqda...';
  const fd = new FormData();
  fd.append('file', file);
  const res = await api.uploadFile(fd);
  if (res.ok) {
    g('bl-p-muqova').value = res.filename;
    g('bl-p-cover-preview').src = blResolveUpload(res.filename);
    g('bl-p-cover-preview-wrap').style.display = 'block';
    blSetCoverPosition(50);
    blSetCoverZoom(100);
    g('bl-p-cover-status').textContent = '✅ Yuklandi';
  } else {
    g('bl-p-cover-status').textContent = '❌ Yuklanmadi';
  }
}

async function blSavePost() {
  const id = g('bl-p-id').value;
  const sarlavha = g('bl-p-sarlavha').value.trim();
  const kontent  = g('bl-p-kontent').value.trim();
  const errEl = g('bl-p-err');

  if (!sarlavha || !kontent) {
    errEl.textContent = "Sarlavha va kontent to'ldirilishi shart";
    errEl.style.display = 'block';
    return;
  }
  errEl.style.display = 'none';

  const data = {
    sarlavha,
    kontent,
    qisqacha: g('bl-p-qisqacha').value.trim(),
    muqova_rasm: g('bl-p-muqova').value,
    muqova_pozitsiya: parseInt(g('bl-p-pozitsiya').value, 10) || 50,
    muqova_masshtab: parseInt(g('bl-p-masshtab').value, 10) || 100,
    kategoriya_id: g('bl-p-kategoriya').value || null,
    muallif: g('bl-p-muallif').value.trim() || 'Innovate IT School',
    holat: g('bl-p-holat').value,
    chop_vaqti: g('bl-p-holat').value === 'chop_etilgan' && g('bl-p-sana').value
      ? new Date(g('bl-p-sana').value).toISOString()
      : null,
    galereya: BL_GALLERY
  };

  const btn = g('bl-p-save-btn');
  btn.disabled = true; btn.textContent = 'Saqlanmoqda...';

  const res = id ? await api.editBlogPost(id, data) : await api.createBlogPost(data);

  btn.disabled = false; btn.textContent = 'Saqlash';

  if (res.ok) {
    toast('✅ Saqlandi', 'success');
    blClosePostModal();
    loadBlogTab();
  } else {
    errEl.textContent = res.error || 'Xatolik yuz berdi';
    errEl.style.display = 'block';
  }
}

async function blDeletePost(id) {
  const post = BL_POSTS.find(p => p.id === id);
  if (!confirm(`"${post ? post.sarlavha : 'Bu post'}"ni o'chirmoqchimisiz?`)) return;
  const res = await api.deleteBlogPost(id);
  if (res.ok) {
    toast("✅ O'chirildi", 'success');
    loadBlogTab();
  } else {
    toast('❌ ' + (res.error || "O'chirib bo'lmadi"), 'error');
  }
}

// ─── Postga video qo'shish (YouTube / Vimeo yoki localdan yuklash) ─────────────
let BL_KONTENT_CARET = null; // video qo'shishdan oldingi kursor pozitsiyasini eslab qolish
let BL_VIDEO_MODE = 'link';  // 'link' | 'file'
let BL_VIDEO_UPLOADED = null; // { filename } — localdan yuklangan video

function blOpenVideoModal() {
  const ta = g('bl-p-kontent');
  BL_KONTENT_CARET = ta.selectionStart ?? ta.value.length;
  g('bl-video-url').value = '';
  g('bl-video-file').value = '';
  g('bl-video-uploaded-filename').value = '';
  BL_VIDEO_UPLOADED = null;
  g('bl-video-upload-progress-wrap').style.display = 'none';
  g('bl-video-upload-progress-bar').style.width = '0%';
  g('bl-video-err').style.display = 'none';
  blSwitchVideoTab('link');
  g('bl-video-modal').style.display = 'flex';
  setTimeout(() => g('bl-video-url').focus(), 50);
}

function blCloseVideoModal() {
  g('bl-video-modal').style.display = 'none';
}

function blSwitchVideoTab(mode) {
  BL_VIDEO_MODE = mode;
  const isLink = mode === 'link';
  g('bl-video-tab-link').style.display = isLink ? 'block' : 'none';
  g('bl-video-tab-file').style.display = isLink ? 'none' : 'block';
  g('bl-video-tab-btn-link').style.background = isLink ? '#6c63ff' : '#f3f4f6';
  g('bl-video-tab-btn-link').style.color = isLink ? '#fff' : '#374151';
  g('bl-video-tab-btn-file').style.background = isLink ? '#f3f4f6' : '#6c63ff';
  g('bl-video-tab-btn-file').style.color = isLink ? '#374151' : '#fff';
  g('bl-video-err').style.display = 'none';
}

// URL'dan YouTube/Vimeo video ID'sini ajratib oladi
function blParseVideoUrl(url) {
  url = (url || '').trim();
  let m;

  // YouTube: youtu.be/ID, youtube.com/watch?v=ID, /shorts/ID, /embed/ID
  m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([a-zA-Z0-9_-]{11})/);
  if (m) return { provider: 'youtube', id: m[1] };

  // Vimeo: vimeo.com/ID (ixtiyoriy /video/ oldida)
  m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (m) return { provider: 'vimeo', id: m[1] };

  return null;
}

function blBuildVideoEmbed(parsed) {
  if (parsed.provider === 'youtube') {
    return `<div class="video-embed"><iframe src="https://www.youtube.com/embed/${parsed.id}" title="YouTube video" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`;
  }
  return `<div class="video-embed"><iframe src="https://player.vimeo.com/video/${parsed.id}" title="Vimeo video" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>`;
}

function blBuildLocalVideoEmbed(filename) {
  const src = blResolveUpload(filename);
  return `<video class="local-video" controls preload="metadata" src="${src}"></video>`;
}

// XHR orqali yuklaymiz (fetch progress ko'rsatmaydi, katta fayllar uchun kerak)
function blUploadVideoFile(ev) {
  const file = ev.target.files[0];
  if (!file) return;

  BL_VIDEO_UPLOADED = null;
  g('bl-video-uploaded-filename').value = '';
  g('bl-video-err').style.display = 'none';

  const maxBytes = 200 * 1024 * 1024;
  if (file.size > maxBytes) {
    g('bl-video-err').textContent = "Video 200MB dan katta bo'lmasligi kerak";
    g('bl-video-err').style.display = 'block';
    ev.target.value = '';
    return;
  }

  const wrap = g('bl-video-upload-progress-wrap');
  const bar  = g('bl-video-upload-progress-bar');
  const status = g('bl-video-upload-status');
  wrap.style.display = 'block';
  bar.style.width = '0%';
  status.textContent = 'Yuklanmoqda... 0%';

  const fd = new FormData();
  fd.append('file', file);

  const xhr = new XMLHttpRequest();
  xhr.open('POST', `${BASE}/upload-video`);
  const token = (typeof tokenStore !== 'undefined') ? tokenStore.get() : null;
  if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

  xhr.upload.onprogress = (e) => {
    if (!e.lengthComputable) return;
    const pct = Math.round((e.loaded / e.total) * 100);
    bar.style.width = pct + '%';
    status.textContent = `Yuklanmoqda... ${pct}%`;
  };

  xhr.onload = () => {
    let res;
    try { res = JSON.parse(xhr.responseText); } catch (e) { res = { ok: false, error: 'Server javobi noto\'g\'ri' }; }
    if (res.ok) {
      BL_VIDEO_UPLOADED = { filename: res.filename };
      g('bl-video-uploaded-filename').value = res.filename;
      status.textContent = '✅ Yuklandi';
      bar.style.width = '100%';
    } else {
      status.textContent = '❌ ' + (res.error || 'Yuklanmadi');
      g('bl-video-err').textContent = res.error || 'Video yuklanmadi';
      g('bl-video-err').style.display = 'block';
    }
  };
  xhr.onerror = () => {
    status.textContent = '❌ Tarmoq xatoligi';
    g('bl-video-err').textContent = "Yuklashda tarmoq xatoligi yuz berdi";
    g('bl-video-err').style.display = 'block';
  };
  xhr.send(fd);
}

function blInsertEmbedAtCaret(embedHtml) {
  const ta = g('bl-p-kontent');
  const pos = BL_KONTENT_CARET ?? ta.value.length;
  const before = ta.value.slice(0, pos);
  const after = ta.value.slice(pos);
  const needsNewlineBefore = before && !before.endsWith('\n');
  const insertion = (needsNewlineBefore ? '\n\n' : '') + embedHtml + '\n\n';
  ta.value = before + insertion + after;

  const newPos = (before + insertion).length;
  ta.focus();
  ta.setSelectionRange(newPos, newPos);
}

function blInsertVideo() {
  const errEl = g('bl-video-err');

  if (BL_VIDEO_MODE === 'link') {
    const parsed = blParseVideoUrl(g('bl-video-url').value);
    if (!parsed) {
      errEl.textContent = "Havola tanilmadi. YouTube yoki Vimeo havolasini kiriting.";
      errEl.style.display = 'block';
      return;
    }
    errEl.style.display = 'none';
    blInsertEmbedAtCaret(blBuildVideoEmbed(parsed));
  } else {
    if (!BL_VIDEO_UPLOADED) {
      errEl.textContent = "Avval video faylni yuklang, keyin qo'shing.";
      errEl.style.display = 'block';
      return;
    }
    errEl.style.display = 'none';
    blInsertEmbedAtCaret(blBuildLocalVideoEmbed(BL_VIDEO_UPLOADED.filename));
  }

  blCloseVideoModal();
  toast('✅ Video qoshildi', 'success');
}

// ─── Kategoriyalar boshqaruvi ───────────────────────────────────────────────────
async function blOpenCategoryManager() {
  g('bl-cat-modal').style.display = 'flex';
  g('bl-cat-nomi').value = '';
  await blRenderCategoryList();
}

function blCloseCategoryManager() {
  g('bl-cat-modal').style.display = 'none';
  loadBlogTab(); // ehtimoliy o'zgarishlarni sinxronlash
}

async function blRenderCategoryList() {
  const res = await api.getBlogCategories();
  if (!res.ok) return;
  BL_CATEGORIES = res.categories;
  g('bl-cat-list').innerHTML = BL_CATEGORIES.map(c => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f3f4f6;">
      <div>
        <div style="font-weight:600;font-size:14px;color:#111827;">${blHtmlEsc(c.nomi)}</div>
        <div style="font-size:12px;color:#9ca3af;">${c.postlar_soni || 0} ta post</div>
      </div>
      <button onclick="blDeleteCategory(${c.id})" style="background:none;border:none;cursor:pointer;font-size:15px;color:#ef4444;">🗑️</button>
    </div>
  `).join('') || '<div style="text-align:center;color:#9ca3af;padding:20px;">Hali kategoriya yo\'q</div>';
}

async function blCreateCategory() {
  const nomi = g('bl-cat-nomi').value.trim();
  if (!nomi) return;
  const res = await api.createBlogCategory({ nomi });
  if (res.ok) {
    g('bl-cat-nomi').value = '';
    await blRenderCategoryList();
  } else {
    toast('❌ ' + (res.error || 'Xatolik'), 'error');
  }
}

async function blDeleteCategory(id) {
  if (!confirm("Bu kategoriyani o'chirmoqchimisiz? Unga bog'liq postlar kategoriyasiz qoladi.")) return;
  const res = await api.deleteBlogCategory(id);
  if (res.ok) {
    await blRenderCategoryList();
  } else {
    toast('❌ ' + (res.error || "O'chirib bo'lmadi"), 'error');
  }
}
