/* Quay ve v70: bo danh gia nhanh va tuy chon che do xem. Thai do 'mentor' van hop le o v70
   nen giu nguyen; chi mat cau tra loi Co / Chua ro / Khong. */
DROP TABLE deal_quick_answers;
ALTER TABLE users DROP COLUMN deal_view_mode;
