import { describe, expect, it } from 'vitest';
import { glossary, pick } from '../i18n/glossary.ko';
import { ALL_COLUMNS, glossaryId } from '../lib/stats';

// CI check from the handoff (section 7b): every stat shown on the site has a glossary entry.
describe('glossary', () => {
  for (const { role, cols } of ALL_COLUMNS) {
    for (const col of cols) {
      const id = glossaryId(col);
      it(`${role}: ${id} has a complete entry`, () => {
        const entry = glossary[id];
        expect(entry, `missing glossary entry "${id}" in src/i18n/glossary.ko.ts`).toBeDefined();
        for (const part of ['label', 'name', 'what', 'read', 'use'] as const) {
          expect(pick(entry[part], role).trim(), `${id}.${part}`).not.toBe('');
        }
      });
    }
  }
});
