import { describe, it, expect } from 'vitest';
import { parseDescription } from '../lib/jobs/description-sections';

describe('Description section parser', () => {
  it('detects German headings with colons and dash bullets', () => {
    const blocks = parseDescription(
      'Wir suchen Verstärkung.\n\nAufgaben:\n- Dateneingabe und Ablage\n- Scannen von Dokumenten\n\nAnforderungen:\n- Deutschkenntnisse\n\nWir freuen uns auf Sie.'
    );
    expect(blocks[0]).toEqual({ type: 'paragraph', text: 'Wir suchen Verstärkung.' });
    expect(blocks[1]).toEqual({ type: 'heading', text: 'Aufgaben' });
    expect(blocks[2]).toEqual({
      type: 'list',
      items: ['Dateneingabe und Ablage', 'Scannen von Dokumenten'],
    });
    expect(blocks[3]).toEqual({ type: 'heading', text: 'Anforderungen' });
    expect(blocks[4]).toEqual({ type: 'list', items: ['Deutschkenntnisse'] });
    expect(blocks[5]).toEqual({ type: 'paragraph', text: 'Wir freuen uns auf Sie.' });
  });

  it('detects English headings, bullets, and numbered lists', () => {
    const blocks = parseDescription(
      'About the role\nJoin our team.\n\nResponsibilities\n• Build features\n• Fix bugs\n\nRequirements\n1. React experience\n2. TypeScript'
    );
    expect(blocks).toContainEqual({ type: 'heading', text: 'About the role' });
    expect(blocks).toContainEqual({ type: 'heading', text: 'Responsibilities' });
    expect(blocks).toContainEqual({ type: 'list', items: ['Build features', 'Fix bugs'] });
    expect(blocks).toContainEqual({ type: 'list', items: ['React experience', 'TypeScript'] });
  });

  it('treats ALL CAPS short lines as headings', () => {
    const blocks = parseDescription('BENEFITS\n30 days vacation.\n\nNice extra.');
    expect(blocks[0]).toEqual({ type: 'heading', text: 'BENEFITS' });
  });

  it('keeps heading-less walls as paragraphs and splits very long ones', () => {
    const wall = `${'Lorem ipsum dolor sit amet. '.repeat(30)}`;
    const blocks = parseDescription(wall);
    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks.every((block) => block.type === 'paragraph')).toBe(true);
  });

  it('demotes a trailing heading to a paragraph', () => {
    const blocks = parseDescription('Some intro text.\n\nInteressiert?');
    expect(blocks[blocks.length - 1]).toEqual({ type: 'paragraph', text: 'Interessiert?' });
  });

  it('returns nothing for empty input', () => {
    expect(parseDescription('')).toEqual([]);
    expect(parseDescription(null)).toEqual([]);
  });
});
