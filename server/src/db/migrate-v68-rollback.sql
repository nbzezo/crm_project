/* Quay lui v68: bo Bang tin nhom.

   Tep tai len nhom (`documents.group_id`) VAN GIU trong kho tai lieu — chung thuoc
   nguoi da tai len (owner_contact_id) nen van hien voi ho; chi mat lien ket nhom.
   rollbackTo() da sao luu CSDL truoc khi chay. */

DROP INDEX IF EXISTS idx_documents_group;
ALTER TABLE documents DROP COLUMN group_id;

DROP TABLE feed_event_rsvps;
DROP TABLE feed_poll_votes;
DROP TABLE feed_poll_options;
DROP TABLE feed_post_saves;
DROP TABLE feed_post_acks;
DROP TABLE feed_mentions;
DROP TABLE feed_comment_likes;
DROP TABLE feed_comments;
DROP TABLE feed_post_reactions;
DROP TABLE feed_post_links;
DROP TABLE feed_post_attachments;
DROP TABLE feed_posts;
DROP TABLE feed_visits;
DROP TABLE feed_group_members;
DROP TABLE feed_groups;
