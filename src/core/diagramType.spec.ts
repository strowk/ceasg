import { describe, it, expect } from 'vitest';
import { detectDiagramType, isVisuallyEditable } from './diagramType';

describe('diagramType', () => {
  it('detects flowchart from graph/flowchart', () => {
    expect(detectDiagramType('graph TD\nA-->B')).toBe('flowchart');
    expect(detectDiagramType('flowchart LR\nA-->B')).toBe('flowchart');
  });
  it('detects sequence', () => { expect(detectDiagramType('sequenceDiagram\nA->>B: x')).toBe('sequence'); });
  it('flowchart is visually editable; sequence is not', () => {
    expect(isVisuallyEditable('flowchart')).toBe(true);
    expect(isVisuallyEditable('sequence')).toBe(false);
  });
});
