import { type Node, type Edge } from '@xyflow/react';
import { test, expect, describe } from 'bun:test';

import { getLayoutedElements } from './layout-flow';

function createNode(id: string, type?: string): Node {
  return {
    id,
    type: type ?? undefined,
    position: { x: 0, y: 0 },
    data: {},
  };
}

function createEdge(source: string, target: string): Edge {
  return {
    id: `${source}-${target}`,
    source,
    target,
  };
}

describe('getLayoutedElements - adversarial edge cases', () => {
  describe('node type handling', () => {
    test('node with undefined type uses default dimensions (160x60)', () => {
      const node = createNode('A');
      expect(node.type).toBeUndefined();

      const result = getLayoutedElements([node], []);

      expect(result.nodes).toHaveLength(1);
      // dagre places isolated nodes at (width/2, height/2) center → top-left at (0, 0)
      expect(Number.isFinite(result.nodes[0].position.x)).toBe(true);
      expect(Number.isFinite(result.nodes[0].position.y)).toBe(true);
    });

    test('node with null type uses default dimensions', () => {
      const node: Node = {
        id: 'A',
        type: null as unknown as string,
        position: { x: 0, y: 0 },
        data: {},
      };

      const result = getLayoutedElements([node], []);

      expect(result.nodes).toHaveLength(1);
      expect(Number.isFinite(result.nodes[0].position.x)).toBe(true);
      expect(Number.isFinite(result.nodes[0].position.y)).toBe(true);
    });

    test('node with unknown type string uses default dimensions', () => {
      const node = createNode('A', 'someUnknownType');

      const result = getLayoutedElements([node], []);

      expect(result.nodes).toHaveLength(1);
      expect(Number.isFinite(result.nodes[0].position.x)).toBe(true);
      expect(Number.isFinite(result.nodes[0].position.y)).toBe(true);
    });

    test('node with type as empty string uses default dimensions', () => {
      const node = createNode('A', '');

      const result = getLayoutedElements([node], []);

      expect(result.nodes).toHaveLength(1);
      expect(Number.isFinite(result.nodes[0].position.x)).toBe(true);
      expect(Number.isFinite(result.nodes[0].position.y)).toBe(true);
    });

    test('mixed known and unknown types all get valid positions', () => {
      const nodes = [
        createNode('A', 'modelTrigger'),
        createNode('B', 'unknownType'),
        createNode('C', 'condition'),
      ];
      const edges = [createEdge('A', 'B'), createEdge('B', 'C')];

      const result = getLayoutedElements(nodes, edges);

      expect(result.nodes).toHaveLength(3);
      for (const n of result.nodes) {
        expect(typeof n.position.x).toBe('number');
        expect(typeof n.position.y).toBe('number');
        expect(Number.isNaN(n.position.x)).toBe(false);
        expect(Number.isNaN(n.position.y)).toBe(false);
      }
    });
  });

  describe('edge reference to non-existent nodes', () => {
    test('edge referencing non-existent source does not crash', () => {
      const nodes = [createNode('A')];
      const edges = [createEdge('nonexistent', 'A')];

      const result = getLayoutedElements(nodes, edges);

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].position.x).toBeTypeOf('number');
      expect(result.nodes[0].position.y).toBeTypeOf('number');
    });

    test('edge referencing non-existent target does not crash', () => {
      const nodes = [createNode('A')];
      const edges = [createEdge('A', 'nonexistent')];

      const result = getLayoutedElements(nodes, edges);

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].position.x).toBeTypeOf('number');
      expect(result.nodes[0].position.y).toBeTypeOf('number');
    });

    test('edge referencing both non-existent source and target does not crash', () => {
      const nodes = [createNode('A')];
      const edges = [createEdge('ghost1', 'ghost2')];

      const result = getLayoutedElements(nodes, edges);

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].position.x).toBeTypeOf('number');
      expect(result.nodes[0].position.y).toBeTypeOf('number');
    });
  });

  describe('edge with empty source or target', () => {
    test('edge with empty string source does not crash', () => {
      const nodes = [createNode('A'), createNode('B')];
      const edges: Edge[] = [{ id: 'bad1', source: '', target: 'B' }];

      const result = getLayoutedElements(nodes, edges);

      expect(result.nodes).toHaveLength(2);
      for (const n of result.nodes) {
        expect(typeof n.position.x).toBe('number');
        expect(Number.isNaN(n.position.x)).toBe(false);
      }
    });

    test('edge with empty string target does not crash', () => {
      const nodes = [createNode('A'), createNode('B')];
      const edges: Edge[] = [{ id: 'bad2', source: 'A', target: '' }];

      const result = getLayoutedElements(nodes, edges);

      expect(result.nodes).toHaveLength(2);
      for (const n of result.nodes) {
        expect(typeof n.position.y).toBe('number');
        expect(Number.isNaN(n.position.y)).toBe(false);
      }
    });

    test('edge with both empty source and target does not crash', () => {
      const nodes = [createNode('A')];
      const edges: Edge[] = [{ id: 'bad3', source: '', target: '' }];

      const result = getLayoutedElements(nodes, edges);

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].id).toBe('A');
    });
  });

  describe('circular edges', () => {
    test('simple cycle A->B->C->A does not infinite loop', () => {
      const nodes = [createNode('A'), createNode('B'), createNode('C')];
      const edges = [createEdge('A', 'B'), createEdge('B', 'C'), createEdge('C', 'A')];

      const start = performance.now();
      const result = getLayoutedElements(nodes, edges);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(1000);
      expect(result.nodes).toHaveLength(3);
      for (const n of result.nodes) {
        expect(typeof n.position.x).toBe('number');
        expect(typeof n.position.y).toBe('number');
        expect(Number.isNaN(n.position.x)).toBe(false);
        expect(Number.isNaN(n.position.y)).toBe(false);
      }
    });

    test('self-loop A->A does not crash', () => {
      const nodes = [createNode('A')];
      const edges = [createEdge('A', 'A')];

      const start = performance.now();
      const result = getLayoutedElements(nodes, edges);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(1000);
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].position.x).toBeTypeOf('number');
      expect(result.nodes[0].position.y).toBeTypeOf('number');
    });

    test('complex cycle with multiple nodes does not infinite loop', () => {
      const nodes = [
        createNode('A'), createNode('B'), createNode('C'),
        createNode('D'), createNode('E'),
      ];
      const edges = [
        createEdge('A', 'B'), createEdge('B', 'C'), createEdge('C', 'A'),
        createEdge('A', 'D'), createEdge('D', 'E'), createEdge('E', 'B'),
      ];

      const start = performance.now();
      const result = getLayoutedElements(nodes, edges);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(1000);
      expect(result.nodes).toHaveLength(5);
    });
  });

  describe('scalability', () => {
    test('100 nodes in a linear chain completes within reasonable time', () => {
      const nodeIds = Array.from({ length: 100 }, (_, i) => `node${i}`);
      const nodes = nodeIds.map((id) => createNode(id));
      const edges: Edge[] = [];
      for (let i = 0; i < nodeIds.length - 1; i++) {
        edges.push(createEdge(nodeIds[i], nodeIds[i + 1]));
      }

      const start = performance.now();
      const result = getLayoutedElements(nodes, edges, 'TB');
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(2000);
      expect(result.nodes).toHaveLength(100);

      for (let i = 1; i < result.nodes.length; i++) {
        expect(result.nodes[i].position.y).toBeGreaterThanOrEqual(
          result.nodes[i - 1].position.y - 1
        );
      }
    });

    test('100 disconnected nodes all get valid positions', () => {
      const nodes = Array.from({ length: 100 }, (_, i) => createNode(`node${i}`));

      const start = performance.now();
      const result = getLayoutedElements(nodes, []);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(2000);
      expect(result.nodes).toHaveLength(100);

      for (const n of result.nodes) {
        expect(typeof n.position.x).toBe('number');
        expect(typeof n.position.y).toBe('number');
        expect(Number.isNaN(n.position.x)).toBe(false);
        expect(Number.isNaN(n.position.y)).toBe(false);
      }
    });

    test('dense graph (every node connects to next 5) completes within time limit', () => {
      const nodeIds = Array.from({ length: 50 }, (_, i) => `n${i}`);
      const nodes = nodeIds.map((id) => createNode(id));
      const edges: Edge[] = [];
      for (let i = 0; i < nodeIds.length; i++) {
        for (let j = 1; j <= 5 && i + j < nodeIds.length; j++) {
          edges.push(createEdge(nodeIds[i], nodeIds[i + j]));
        }
      }

      const start = performance.now();
      const result = getLayoutedElements(nodes, edges);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(3000);
      expect(result.nodes).toHaveLength(50);
    });
  });

  describe('disconnected components', () => {
    test('two disconnected components each get valid positions', () => {
      const nodes = [
        createNode('A'), createNode('B'),
        createNode('C'), createNode('D'),
      ];
      const edges = [createEdge('A', 'B'), createEdge('C', 'D')];

      const result = getLayoutedElements(nodes, edges);

      expect(result.nodes).toHaveLength(4);

      const nodeA = result.nodes.find((n) => n.id === 'A')!;
      const nodeB = result.nodes.find((n) => n.id === 'B')!;
      const nodeC = result.nodes.find((n) => n.id === 'C')!;
      const nodeD = result.nodes.find((n) => n.id === 'D')!;

      expect(nodeB.position.y).toBeGreaterThan(nodeA.position.y);
      expect(nodeD.position.y).toBeGreaterThan(nodeC.position.y);
    });

    test('three isolated nodes each get valid positions', () => {
      const nodes = [createNode('A'), createNode('B'), createNode('C')];

      const result = getLayoutedElements(nodes, []);

      expect(result.nodes).toHaveLength(3);

      for (const n of result.nodes) {
        expect(Number.isFinite(n.position.x)).toBe(true);
        expect(Number.isFinite(n.position.y)).toBe(true);
      }
    });

    test('isolated node alongside a chain gets valid position', () => {
      const chainNodes = ['A', 'B', 'C'].map((id) => createNode(id));
      const isolated = createNode('isolated');
      const nodes = [...chainNodes, isolated];
      const edges = [createEdge('A', 'B'), createEdge('B', 'C')];

      const result = getLayoutedElements(nodes, edges);

      expect(result.nodes).toHaveLength(4);
      const layoutedIsolated = result.nodes.find((n) => n.id === 'isolated')!;
      expect(Number.isFinite(layoutedIsolated.position.x)).toBe(true);
      expect(Number.isFinite(layoutedIsolated.position.y)).toBe(true);
    });
  });

  describe('injection and special characters', () => {
    test('node ID with path traversal characters works', () => {
      const nodes = [
        createNode('../../../etc/passwd'),
        createNode('A'),
      ];
      const edges = [createEdge('../../../etc/passwd', 'A')];

      const result = getLayoutedElements(nodes, edges);

      expect(result.nodes).toHaveLength(2);
      for (const n of result.nodes) {
        expect(Number.isFinite(n.position.x)).toBe(true);
        expect(Number.isFinite(n.position.y)).toBe(true);
      }
    });

    test('node ID with unicode characters works', () => {
      const nodes = [
        createNode('节点_A'),
        createNode('🔀_node'),
        createNode('\x00_null_byte'),
      ];
      const edges = [createEdge('节点_A', '🔀_node'), createEdge('🔀_node', '\x00_null_byte')];

      const result = getLayoutedElements(nodes, edges);

      expect(result.nodes).toHaveLength(3);
      for (const n of result.nodes) {
        expect(Number.isFinite(n.position.x)).toBe(true);
        expect(Number.isFinite(n.position.y)).toBe(true);
      }
    });

    test('node ID with HTML injection syntax works', () => {
      const nodes = [createNode('<script>alert(1)</script>'), createNode('B')];
      const edges = [createEdge('<script>alert(1)</script>', 'B')];

      const result = getLayoutedElements(nodes, edges);

      expect(result.nodes).toHaveLength(2);
    });
  });

  describe('oversized inputs', () => {
    test('very oversized node type name does not crash', () => {
      const hugeType = 'x'.repeat(10_000);
      const node = createNode('A', hugeType);

      const result = getLayoutedElements([node], []);

      expect(result.nodes).toHaveLength(1);
      expect(Number.isFinite(result.nodes[0].position.x)).toBe(true);
      expect(Number.isFinite(result.nodes[0].position.y)).toBe(true);
    });

    test('oversized node ID does not crash', () => {
      const hugeId = 'A'.repeat(10_000);
      const node = createNode(hugeId);

      const result = getLayoutedElements([node], []);

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].id).toBe(hugeId);
    });

    test('oversized edge source and target do not crash', () => {
      const nodes = [createNode('A'), createNode('B')];
      const hugeId = 'X'.repeat(5000);
      const edges: Edge[] = [
        { id: 'edge1', source: hugeId, target: hugeId + '_suffix' },
      ];

      const result = getLayoutedElements(nodes, edges);

      expect(result.nodes).toHaveLength(2);
    });
  });

  describe('single node scenarios', () => {
    test('single node with no edges gets valid position', () => {
      const node = createNode('solo', 'condition');
      const result = getLayoutedElements([node], []);

      expect(result.nodes).toHaveLength(1);
      // dagre places isolated nodes with center at (width/2, height/2), top-left at (0, 0)
      expect(Number.isFinite(result.nodes[0].position.x)).toBe(true);
      expect(Number.isFinite(result.nodes[0].position.y)).toBe(true);
    });

    test('single node with self-loop gets valid position', () => {
      const node = createNode('solo');
      const edges = [createEdge('solo', 'solo')];

      const result = getLayoutedElements([node], edges);

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].position.x).toBeTypeOf('number');
      expect(result.nodes[0].position.y).toBeTypeOf('number');
    });
  });

  describe('repeated calls (idempotency)', () => {
    test('calling getLayoutedElements twice with same input produces same positions', () => {
      const nodes = [createNode('A'), createNode('B'), createNode('C')];
      const edges = [createEdge('A', 'B'), createEdge('B', 'C')];

      const result1 = getLayoutedElements(nodes, edges);
      const result2 = getLayoutedElements(nodes, edges);

      expect(result1.nodes).toHaveLength(result2.nodes.length);
      for (let i = 0; i < result1.nodes.length; i++) {
        expect(result1.nodes[i].position.x).toBe(result2.nodes[i].position.x);
        expect(result1.nodes[i].position.y).toBe(result2.nodes[i].position.y);
      }
    });
  });
});
