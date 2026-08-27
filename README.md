# O'zgargan fayllar — O'qituvchi panel dizayn tuzatishlari

Bu arxivda faqat o'zgartirilgan/qo'shilgan fayllar bor. Har birini loyihangizdagi
xuddi shu yo'ldagi faylning o'rniga almashtiring:

- innovateit-frontend/oqituvchi.html
- innovateit-frontend/css/oqituvchi.css
- innovateit-frontend/img/logo-mark.png          ← YANGI fayl
- innovateit-frontend/img/logo-mark-cyan.svg      ← YANGI fayl
- innovateit-frontend/img/logo-mark-cyan.png      ← YANGI fayl (zaxira)

## Nima uchun buzilgan edi

`innovateit-frontend/img/` papkasida logotip fayllari umuman yo'q edi (faqat
`innovateit-blog-frontend/img/` da bor edi) — shuning uchun "InnovateIT School"
yozuvi yonida logotip ko'rinmay, bo'sh joy qolayotgan edi.

## Nima o'zgardi

1. **Logotip ko'rinmasligi** — `innovateit-blog-frontend/img/`dagi logotip
   fayllari (`logo-mark.png` — oq rangli variant, `logo-mark-cyan.svg` — cyan
   variant) `innovateit-frontend/img/`ga ko'chirildi. Yuqori bannerda (ko'k
   fonda) endi **oq rangli** logotip (`logo-mark.png`) ishlatiladi — yozuv
   bilan bir xil rangda, yaxshi ko'rinadi. Login ekranidagi (oq doira fonli)
   logotip esa avvalgidek cyan rangida qoldi.

2. **Ko'k banner kompyuterda to'liq chiqmasligi** — sabab: `#app`
   konteynerining o'zi `max-width: 1100px` bilan cheklangan edi, shu tufayli
   banner ham (uning ichida joylashgani uchun) markazda torroq bo'lib, keng
   ekranlarda ikki tarafdan bo'sh joy qolib ketardi. Endi `#app`dan
   `max-width` olib tashlandi — banner butun ekran kengligiga cho'ziladi,
   ichkaridagi tab-menyu va kontent esa (`oq-tabnav`, `oq-content`) avvalgidek
   1100px'da markazlashgan holda qoladi.

3. **Menyu va pastki tugmalar rangi** — "Guruhlarim/Guruh yaratish/..." tab
   menyusidagi faol tugma, "Saqlash" turidagi asosiy tugmalar va
   sinf/kun/guruh chip'lari endi yuqori bannerdagi bilan **bir xil gradient**
   rangda chiqadi (avval boshqacha ko'k — indigo rangda edi).
