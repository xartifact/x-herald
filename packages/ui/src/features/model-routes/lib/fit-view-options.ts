import type { Edge, FitViewOptions, Node } from '@xyflow/react'

/**
 * Conservative defaults for node bounding-box math. Used only when nodes do
 * not carry measured width/height yet (e.g. before the first viewport tick).
 * Tuned to match the wider nodes in this editor (~160-200px wide).
 */
const DEFAULT_NODE_WIDTH = 200
const DEFAULT_NODE_HEIGHT = 80

/**
 * Tiered fitView heuristics.
 *
 * More nodes → smaller padding (less empty canvas) and tighter maxZoom (the
 * overview has to fit a lot of content). Less nodes → more padding + zoom in,
 * so a lone node doesn't look lost in an empty canvas.
 */
interface FitTier {
  padding: number
  maxZoom: number
  minZoom: number
}

const FIT_TIERS: ReadonlyArray<{ max: number; tier: FitTier }> = [
  { max: 0, tier: { padding: 0.5, maxZoom: 1.5, minZoom: 0.5 } },
  { max: 1, tier: { padding: 0.3, maxZoom: 1.5, minZoom: 0.5 } },
  { max: 5, tier: { padding: 0.2, maxZoom: 1.2, minZoom: 0.4 } },
  { max: 20, tier: { padding: 0.15, maxZoom: 1.0, minZoom: 0.3 } },
  { max: 50, tier: { padding: 0.1, maxZoom: 0.8, minZoom: 0.2 } },
  { max: Number.POSITIVE_INFINITY, tier: { padding: 0.05, maxZoom: 0.5, minZoom: 0.1 } },
]

const FIT_DURATION_MS = 200

/**
 * Aspect-ratio thresholds: if the graph bounding box is much wider than tall
 * (or vice versa), bump the corresponding padding so it does not kiss the
 * canvas edges. Only kicks in when there's a real skew — width/height > 3 or
 * height/width > 3.
 */
const ASPECT_HORIZONTAL_THRESHOLD = 3
const ASPECT_VERTICAL_THRESHOLD = 0.33
const ELONGATED_PADDING_BOOST = 0.15

export interface GraphStats {
  nodeCount: number
  edgeCount: number
  /** x extent of the node bounding box (right - left). */
  width: number
  /** y extent of the node bounding box (bottom - top). */
  height: number
}

/**
 * Compute a bounding box + count summary for the current graph. Pure function
 * — depends only on the inputs.
 */
export function computeGraphStats(nodes: Node[], edges: Edge[]): GraphStats {
  if (nodes.length === 0) {
    return { nodeCount: 0, edgeCount: edges.length, width: 0, height: 0 }
  }

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const n of nodes) {
    const x = n.position?.x ?? 0
    const y = n.position?.y ?? 0
    const w = n.width ?? DEFAULT_NODE_WIDTH
    const h = n.height ?? DEFAULT_NODE_HEIGHT
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x + w > maxX) maxX = x + w
    if (y + h > maxY) maxY = y + h
  }

  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    width: maxX - minX,
    height: maxY - minY,
  }
}

/**
 * Pick the right FitTier for a given node count.
 */
export function pickFitTier(nodeCount: number): FitTier {
  for (const { max, tier } of FIT_TIERS) {
    if (nodeCount <= max) return tier
  }
  // Unreachable (last tier has max=Infinity) but keeps the type narrow.
  return FIT_TIERS[FIT_TIERS.length - 1].tier
}

/**
 * For an elongated graph, bump the padding on the elongated axis so the
 * bounding box does not sit flush against the viewport edge.
 */
function paddingForAspect(tier: FitTier, width: number, height: number): FitViewOptions['padding'] {
  let top = tier.padding
  let bottom = tier.padding
  let left = tier.padding
  let right = tier.padding

  // 零尺寸（空画布或所有节点同位）不计算 aspect，避免空图被当作无穷横长触发 boost。
  if (width > 0 && height > 0) {
    const aspect = width / height
    if (aspect >= ASPECT_HORIZONTAL_THRESHOLD) {
      left += ELONGATED_PADDING_BOOST
      right += ELONGATED_PADDING_BOOST
    }
    if (aspect <= ASPECT_VERTICAL_THRESHOLD) {
      top += ELONGATED_PADDING_BOOST
      bottom += ELONGATED_PADDING_BOOST
    }
  }

  return { top, right, bottom, left }
}

/**
 * Compute dynamic FitViewOptions based on graph metrics.
 *
 * Tiered heuristics:
 * - 0 nodes: 0.5 padding (empty canvas, comfortable)
 * - 1 node:  0.3 padding, maxZoom 1.5
 * - 2-5:     0.2 padding, maxZoom 1.2
 * - 6-20:    0.15 padding, maxZoom 1.0
 * - 21-50:   0.1 padding, maxZoom 0.8
 * - 50+:     0.05 padding, maxZoom 0.5
 *
 * Aspect-ratio aware: an elongated graph (width/height > 3 or < 0.33) gets
 * extra padding on the long axis.
 *
 * Always returns a non-zero duration so the refit is animated (snappy 200ms).
 */
export function computeFitViewOptions(nodes: Node[], edges: Edge[]): FitViewOptions {
  const stats = computeGraphStats(nodes, edges)
  const tier = pickFitTier(stats.nodeCount)
  const padding = paddingForAspect(tier, stats.width, stats.height)

  return {
    padding,
    minZoom: tier.minZoom,
    maxZoom: tier.maxZoom,
    duration: FIT_DURATION_MS,
  }
}

/**
 * Decide whether a refit is justified given the change between prev and
 * current graph stats. Returns true for:
 * - first measurement (prev is null)
 * - node count changed
 * - edge count changed significantly (>= 20% or absolute jump >= 3)
 * - bounding box grew or shrank by more than 25% on either axis
 *
 * Returns false for in-place data edits (property panel, label rename) that
 * do not move geometry around.
 */
export function shouldRefit(prev: GraphStats | null, current: GraphStats): boolean {
  if (!prev) return true
  if (prev.nodeCount !== current.nodeCount) return true

  const edgeDelta = Math.abs(current.edgeCount - prev.edgeCount)
  if (edgeDelta >= 3) return true
  if (prev.edgeCount > 0 && edgeDelta / prev.edgeCount >= 0.2) return true

  const widthDelta = Math.abs(current.width - prev.width)
  const heightDelta = Math.abs(current.height - prev.height)
  const widthRatio = prev.width > 0 ? widthDelta / prev.width : widthDelta
  const heightRatio = prev.height > 0 ? heightDelta / prev.height : heightDelta
  if (widthRatio > 0.25 || heightRatio > 0.25) return true

  return false
}
