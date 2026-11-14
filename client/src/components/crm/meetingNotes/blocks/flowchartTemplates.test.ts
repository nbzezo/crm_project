import { describe, expect, it } from 'vitest';
import { FLOWCHART_TEMPLATES, templateSkeleton } from './flowchartTemplates';

describe('mau so do logic', () => {
  it.each(FLOWCHART_TEMPLATES.map((t) => [t.key, t] as const))(
    '%s: moi mui ten noi vao nut co that, khong trung id',
    (_key, template) => {
      const skeleton = templateSkeleton(template);
      const ids = template.nodes.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
      const arrows = skeleton.filter((e) => e.type === 'arrow');
      expect(arrows).toHaveLength(template.edges.length);
      for (const arrow of arrows) {
        expect(ids).toContain((arrow.start as { id: string }).id);
        expect(ids).toContain((arrow.end as { id: string }).id);
      }
      // Lan (neu co) nam duoi cung de khong che hinh.
      if (template.lanes) expect(skeleton[0]?.strokeStyle).toBe('dashed');
    }
  );
});
