-- Nofaol o'quvchida maktab_info saqlanishi
ALTER TABLE nofaol_oquvchilar ADD COLUMN IF NOT EXISTS maktab_info TEXT DEFAULT '';
