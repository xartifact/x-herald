import dagre from '@dagrejs/dagre';
import { type Node, type Edge, Position } from '@xyflow/react';

interface NodeDimensions {
  width: number;
  height: number;
}

const NODE_DIMENSIONS: Record<string, NodeDimensions> = {
  modelTrigger: { width: 160, height: 60 },
  condition: { width: 180, height: 80 },
  target: { width: 160, height: 70 },
  reject: { width: 160, height: 60 },
  fallback: { width: 160, height: 60 },
  default: { width: 160, height: 60 },
};

export type LayoutDirection = 'TB' | 'LR';

export function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction: LayoutDirection = 'TB',
): { nodes: Node[]; edges: Edge[] } {
  if (nodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 50, ranksep: 80 });

  for (const node of nodes) {
    const dimensions = NODE_DIMENSIONS[node.type ?? 'default'] ?? NODE_DIMENSIONS.default;
    g.setNode(node.id, { width: dimensions.width, height: dimensions.height });
  }

  for (const edge of edges) {
    if (!edge.source || !edge.target) {
      continue;
    }
    g.setEdge(edge.source, edge.target, { label: edge.sourceHandle ?? '' });
  }

  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = g.node(node.id);
    const dimensions = NODE_DIMENSIONS[node.type ?? 'default'] ?? NODE_DIMENSIONS.default;
    const layoutedNode = {
      ...node,
      position: {
        x: (nodeWithPosition.x ?? 0) - dimensions.width / 2,
        y: (nodeWithPosition.y ?? 0) - dimensions.height / 2,
      },
    };

    if (direction === 'LR') {
      layoutedNode.sourcePosition = Position.Right;
      layoutedNode.targetPosition = Position.Left;
    }

    return layoutedNode;
  });

  return { nodes: layoutedNodes, edges };
}
