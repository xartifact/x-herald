import { test, expect, describe } from 'bun:test';
import { type Node, type Edge } from '@xyflow/react';
import { getLayoutedElements } from './layout-flow';

function createNode(id: string, type: string = 'modelTrigger'): Node {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: {},
  };
}

function createEdge(source: string, target: string, sourceHandle?: string): Edge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    sourceHandle,
  };
}

describe('getLayoutedElements', () => {
  test('empty input returns empty arrays', () => {
    const result = getLayoutedElements([], []);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  test('single node gets position assigned', () => {
    const node = createNode('A');
    const result = getLayoutedElements([node], []);

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe('A');
    expect(result.nodes[0].position).toBeDefined();
    expect(result.nodes[0].position.x).toBeTypeOf('number');
    expect(result.nodes[0].position.y).toBeTypeOf('number');
  });

  test('chain of 3 nodes A->B->C in TB direction', () => {
    const nodes = [createNode('A'), createNode('B'), createNode('C')];
    const edges = [createEdge('A', 'B'), createEdge('B', 'C')];
    const result = getLayoutedElements(nodes, edges, 'TB');

    expect(result.nodes).toHaveLength(3);
    const nodeA = result.nodes.find((n) => n.id === 'A')!;
    const nodeB = result.nodes.find((n) => n.id === 'B')!;
    const nodeC = result.nodes.find((n) => n.id === 'C')!;

    // In TB direction, y increases as we go down the chain
    expect(nodeB.position.y).toBeGreaterThan(nodeA.position.y);
    expect(nodeC.position.y).toBeGreaterThan(nodeB.position.y);
  });

  test('multiple branches A->B, A->C places B and C at same level', () => {
    const nodes = [createNode('A'), createNode('B'), createNode('C')];
    const edges = [createEdge('A', 'B'), createEdge('A', 'C')];
    const result = getLayoutedElements(nodes, edges, 'TB');

    const nodeB = result.nodes.find((n) => n.id === 'B')!;
    const nodeC = result.nodes.find((n) => n.id === 'C')!;

    // B and C should be at the same rank (same y coordinate)
    expect(nodeB.position.y).toBe(nodeC.position.y);
  });

  test('different node types get different dimensions', () => {
    const nodes = [createNode('A', 'modelTrigger'), createNode('B', 'condition')];
    const edges = [createEdge('A', 'B')];
    const result = getLayoutedElements(nodes, edges, 'TB');

    const nodeA = result.nodes.find((n) => n.id === 'A')!;
    const nodeB = result.nodes.find((n) => n.id === 'B')!;

    // Condition node (height 80) vs modelTrigger (height 60)
    // Both should have valid positions, and the layout should account for different sizes
    expect(nodeA.position.y).toBeTypeOf('number');
    expect(nodeB.position.y).toBeTypeOf('number');
    expect(nodeB.position.y).toBeGreaterThan(nodeA.position.y);
  });

  test('LR direction produces horizontal layout', () => {
    const nodes = [createNode('A'), createNode('B'), createNode('C')];
    const edges = [createEdge('A', 'B'), createEdge('B', 'C')];
    const result = getLayoutedElements(nodes, edges, 'LR');

    const nodeA = result.nodes.find((n) => n.id === 'A')!;
    const nodeB = result.nodes.find((n) => n.id === 'B')!;
    const nodeC = result.nodes.find((n) => n.id === 'C')!;

    // In LR direction, x increases as we go right in the chain
    expect(nodeB.position.x).toBeGreaterThan(nodeA.position.x);
    expect(nodeC.position.x).toBeGreaterThan(nodeB.position.x);
  });

  test('does not mutate input nodes', () => {
    const originalNode = createNode('A');
    const originalPosition = { ...originalNode.position };
    const nodes = [originalNode];
    const edges: Edge[] = [];

    getLayoutedElements(nodes, edges, 'TB');

    // Input node position should remain unchanged
    expect(originalNode.position).toEqual(originalPosition);
  });

  test('LR direction sets correct sourcePosition and targetPosition', () => {
    const nodes = [createNode('A'), createNode('B')];
    const edges = [createEdge('A', 'B')];
    const result = getLayoutedElements(nodes, edges, 'LR');

    const nodeA = result.nodes.find((n) => n.id === 'A')!;
    const nodeB = result.nodes.find((n) => n.id === 'B')!;

    expect(nodeA.sourcePosition).toBe('right');
    expect(nodeA.targetPosition).toBe('left');
    expect(nodeB.sourcePosition).toBe('right');
    expect(nodeB.targetPosition).toBe('left');
  });

  test('TB direction does not set sourcePosition/targetPosition', () => {
    const nodes = [createNode('A'), createNode('B')];
    const edges = [createEdge('A', 'B')];
    const result = getLayoutedElements(nodes, edges, 'TB');

    const nodeA = result.nodes.find((n) => n.id === 'A')!;
    const nodeB = result.nodes.find((n) => n.id === 'B')!;

    expect(nodeA.sourcePosition).toBeUndefined();
    expect(nodeA.targetPosition).toBeUndefined();
    expect(nodeB.sourcePosition).toBeUndefined();
    expect(nodeB.targetPosition).toBeUndefined();
  });

  test('sourceHandle grouping in TB mode: branches with different sourceHandles are laid out', () => {
    const nodeA = createNode('A', 'condition');
    const nodeB = createNode('B', 'target');
    const nodeC = createNode('C', 'target');
    const nodes = [nodeA, nodeB, nodeC];
    const edges = [
      createEdge('A', 'B', 'true'),
      createEdge('A', 'C', 'false'),
    ];
    const result = getLayoutedElements(nodes, edges, 'TB');

    const layoutedB = result.nodes.find((n) => n.id === 'B')!;
    const layoutedC = result.nodes.find((n) => n.id === 'C')!;

    // Both B and C should have valid positions
    expect(Number.isFinite(layoutedB.position.x)).toBe(true);
    expect(Number.isFinite(layoutedB.position.y)).toBe(true);
    expect(Number.isFinite(layoutedC.position.x)).toBe(true);
    expect(Number.isFinite(layoutedC.position.y)).toBe(true);

    // Both should be below node A (TB direction: y increases downward)
    const layoutedA = result.nodes.find((n) => n.id === 'A')!;
    expect(layoutedB.position.y).toBeGreaterThan(layoutedA.position.y);
    expect(layoutedC.position.y).toBeGreaterThan(layoutedA.position.y);

    // B and C should be at different horizontal positions (grouped by sourceHandle)
    expect(layoutedB.position.x).not.toBe(layoutedC.position.x);
  });

  test('sourceHandle grouping in LR mode: branches with different sourceHandles are laid out', () => {
    const nodeA = createNode('A', 'condition');
    const nodeB = createNode('B', 'target');
    const nodeC = createNode('C', 'target');
    const nodes = [nodeA, nodeB, nodeC];
    const edges = [
      createEdge('A', 'B', 'true'),
      createEdge('A', 'C', 'false'),
    ];
    const result = getLayoutedElements(nodes, edges, 'LR');

    const layoutedB = result.nodes.find((n) => n.id === 'B')!;
    const layoutedC = result.nodes.find((n) => n.id === 'C')!;

    // Both B and C should have valid positions
    expect(Number.isFinite(layoutedB.position.x)).toBe(true);
    expect(Number.isFinite(layoutedB.position.y)).toBe(true);
    expect(Number.isFinite(layoutedC.position.x)).toBe(true);
    expect(Number.isFinite(layoutedC.position.y)).toBe(true);

    // Both should be to the right of node A (LR direction: x increases rightward)
    const layoutedA = result.nodes.find((n) => n.id === 'A')!;
    expect(layoutedB.position.x).toBeGreaterThan(layoutedA.position.x);
    expect(layoutedC.position.x).toBeGreaterThan(layoutedA.position.x);

    // B and C should be at different vertical positions (grouped by sourceHandle in LR)
    expect(layoutedB.position.y).not.toBe(layoutedC.position.y);

    // LR direction should set correct source/target positions
    expect(layoutedB.sourcePosition).toBe('right');
    expect(layoutedB.targetPosition).toBe('left');
    expect(layoutedC.sourcePosition).toBe('right');
    expect(layoutedC.targetPosition).toBe('left');
  });
});
