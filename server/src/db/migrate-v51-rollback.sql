/* Quay ve v49: bo chia se bang duong lien ket. Moi link da gui se ngung hoat dong. */
DROP TABLE IF EXISTS share_link_views;
DROP TABLE IF EXISTS share_links;
DELETE FROM app_settings WHERE key = 'sharing.public_enabled';
