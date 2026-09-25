import type { PartialBlock } from '@blocknote/core';
import type { MeetingNote } from '../../../types';

export type DocumentPurpose = MeetingNote['purpose_key'];

export const DOCUMENT_TEMPLATES: {
  key: DocumentPurpose;
  label: string;
  description: string;
  sections: string[];
}[] = [
  { key: 'blank', label: 'Trang trắng', description: 'Bắt đầu với một trang trống.', sections: [] },
  {
    key: 'meeting',
    label: 'Biên bản họp',
    description: 'Ghi lại nội dung, quyết định và việc cần làm.',
    sections: ['Mục tiêu cuộc họp', 'Nội dung trao đổi', 'Quyết định', 'Việc cần làm'],
  },
  {
    key: 'plan',
    label: 'Kế hoạch',
    description: 'Lập kế hoạch công việc hoặc dự án.',
    sections: ['Mục tiêu', 'Phạm vi', 'Các bước thực hiện', 'Mốc thời gian', 'Rủi ro'],
  },
  {
    key: 'proposal',
    label: 'Đề xuất / Phương án',
    description: 'Trình bày vấn đề và phương án giải quyết.',
    sections: [
      'Bối cảnh',
      'Vấn đề',
      'Phương án đề xuất',
      'Lợi ích',
      'Chi phí và nguồn lực',
      'Bước tiếp theo',
    ],
  },
  {
    key: 'report',
    label: 'Báo cáo / Tổng kết',
    description: 'Tóm tắt kết quả và kiến nghị.',
    sections: ['Tóm tắt', 'Kết quả', 'Số liệu hoặc bằng chứng', 'Khó khăn', 'Kiến nghị'],
  },
  {
    key: 'process',
    label: 'Quy trình / Hướng dẫn',
    description: 'Viết các bước thực hiện để dùng lại.',
    sections: ['Mục đích', 'Khi nào áp dụng', 'Các bước', 'Lưu ý', 'Tài liệu liên quan'],
  },
  {
    key: 'decision',
    label: 'Quyết định',
    description: 'Lưu lựa chọn và lý do đưa ra quyết định.',
    sections: [
      'Vấn đề cần quyết định',
      'Các lựa chọn',
      'Quyết định cuối cùng',
      'Lý do',
      'Người phụ trách',
    ],
  },
];

export function documentPurposeLabel(purpose: DocumentPurpose): string {
  return DOCUMENT_TEMPLATES.find((template) => template.key === purpose)?.label ?? 'Trang tài liệu';
}

export function createDocumentFromTemplate(purpose: DocumentPurpose) {
  const template = DOCUMENT_TEMPLATES.find((item) => item.key === purpose);
  if (!template) throw new Error('Mẫu tài liệu không tồn tại');

  const blocks: PartialBlock[] = template.sections.flatMap((section) => [
    { type: 'heading', props: { level: 2 }, content: section },
    { type: 'paragraph', content: '' },
  ]);

  return {
    purpose_key: purpose,
    title: purpose === 'blank' ? 'Trang không tiêu đề' : `${template.label} mới`,
    content_json: JSON.stringify(blocks),
    content_text: template.sections.join('\n'),
  };
}
