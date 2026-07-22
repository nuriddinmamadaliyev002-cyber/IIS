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
  g('bl-p-cover-status').textContent = '';
  g('bl-p-cover-preview').style.display = 'none';
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
  g('bl-p-err').style.display = 'none';
  blFillCategorySelect();
  if (p.kategoriya_id) g('bl-p-kategoriya').value = p.kategoriya_id;
  if (p.muqova_rasm) {
    g('bl-p-cover-preview').src = blResolveUpload(p.muqova_rasm);
    g('bl-p-cover-preview').style.display = 'block';
  } else {
    g('bl-p-cover-preview').style.display = 'none';
  }
  g('bl-p-cover-status').textContent = '';
  g('bl-post-modal').style.display = 'flex';
}

function blClosePostModal() {
  g('bl-post-modal').style.display = 'none';
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
    g('bl-p-cover-preview').style.display = 'block';
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
    kategoriya_id: g('bl-p-kategoriya').value || null,
    muallif: g('bl-p-muallif').value.trim() || 'Innovate IT School',
    holat: g('bl-p-holat').value
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
