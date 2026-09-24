/** JSON-compatible values supported by the diff and patch helpers. */
export type JsonPrimitive = string | number | boolean | null

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

/** A JSON Patch operation (RFC 6902's add, remove, and replace subset). */
export type JsonPatchOperation =
  | { op: 'add'; path: string; value: JsonValue }
  | { op: 'remove'; path: string }
  | { op: 'replace'; path: string; value: JsonValue }

export type JsonDiff = JsonPatchOperation[]

function escapePathSegment(segment: string): string {
  return segment.replaceAll('~', '~0').replaceAll('/', '~1')
}

function unescapePathSegment(segment: string): string {
  return segment.replace(/~(0|1)/g, (_, escaped: string) => (escaped === '0' ? '~' : '/'))
}

function pathSegments(path: string): string[] {
  if (path === '') return []
  if (!path.startsWith('/')) throw new Error(`Invalid JSON Pointer path: ${path}`)

  return path
    .slice(1)
    .split('/')
    .map((segment) => {
      if (/~(?![01])/.test(segment)) throw new Error(`Invalid JSON Pointer escape: ${segment}`)
      return unescapePathSegment(segment)
    })
}

function cloneJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(cloneJsonValue)
  if (value !== null && typeof value === 'object') {
    const result: { [key: string]: JsonValue } = {}
    for (const [key, child] of Object.entries(value)) {
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        value: cloneJsonValue(child),
        writable: true,
      })
    }
    return result
  }
  return value
}

function isJsonObject(value: JsonValue): value is { [key: string]: JsonValue } {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function valuesEqual(left: JsonValue, right: JsonValue): boolean {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => valuesEqual(value, right[index]!))
    )
  }
  if (isJsonObject(left) && isJsonObject(right)) {
    const leftKeys = Object.keys(left)
    const rightKeys = Object.keys(right)
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every((key) => Object.hasOwn(right, key) && valuesEqual(left[key]!, right[key]!))
    )
  }
  return false
}

function appendDiff(source: JsonValue, target: JsonValue, path: string, diff: JsonDiff): void {
  if (valuesEqual(source, target)) return

  if (Array.isArray(source) && Array.isArray(target)) {
    const sharedLength = Math.min(source.length, target.length)
    for (let index = 0; index < sharedLength; index++) {
      appendDiff(source[index]!, target[index]!, `${path}/${index}`, diff)
    }
    for (let index = source.length - 1; index >= target.length; index--) {
      diff.push({ op: 'remove', path: `${path}/${index}` })
    }
    for (let index = sharedLength; index < target.length; index++) {
      diff.push({ op: 'add', path: `${path}/-`, value: cloneJsonValue(target[index]!) })
    }
    return
  }

  if (isJsonObject(source) && isJsonObject(target)) {
    for (const key of Object.keys(source)) {
      if (!Object.hasOwn(target, key)) {
        diff.push({ op: 'remove', path: `${path}/${escapePathSegment(key)}` })
      }
    }
    for (const [key, value] of Object.entries(target)) {
      const childPath = `${path}/${escapePathSegment(key)}`
      if (!Object.hasOwn(source, key)) {
        diff.push({ op: 'add', path: childPath, value: cloneJsonValue(value) })
      } else appendDiff(source[key]!, value, childPath, diff)
    }
    return
  }
  diff.push({ op: 'replace', path, value: cloneJsonValue(target) })
}

/** Creates a deterministic JSON Patch diff that transforms source into target. */
export function createJsonDiff(source: unknown, target: unknown): JsonDiff {
  const diff: JsonDiff = []
  appendDiff(source as JsonValue, target as JsonValue, '', diff)
  return diff
}

/** Backward-compatible name for callers that describe the result as a stored diff. */
export const computeJsonDiff = createJsonDiff

function arrayIndex(segment: string, length: number, allowAppend: boolean): number {
  if (allowAppend && segment === '-') return length
  if (!/^(0|[1-9]\d*)$/.test(segment)) throw new Error(`Invalid array index: ${segment}`)
  const index = Number(segment)
  if (!Number.isSafeInteger(index) || index > length)
    throw new Error(`Array index out of bounds: ${segment}`)
  return index
}

/** Applies a JSON Patch diff without mutating the source value. */
export function applyJsonDiff(source: JsonValue, diff: JsonDiff): JsonValue {
  let result = cloneJsonValue(source)

  for (const operation of diff) {
    const segments = pathSegments(operation.path)
    if (segments.length === 0) {
      if (operation.op === 'remove') throw new Error('Cannot remove the root JSON value')
      result = cloneJsonValue(operation.value)
      continue
    }

    const key = segments.pop()!
    let parent = result
    for (const segment of segments) {
      if (Array.isArray(parent)) {
        const index = arrayIndex(segment, parent.length, false)
        parent = parent[index]!
      } else if (isJsonObject(parent)) {
        if (!Object.hasOwn(parent, segment))
          throw new Error(`Missing JSON Pointer path: ${operation.path}`)
        parent = parent[segment]!
      } else {
        throw new Error(`Cannot traverse JSON Pointer path: ${operation.path}`)
      }
    }

    if (Array.isArray(parent)) {
      const index = arrayIndex(key, parent.length, operation.op === 'add')
      if (operation.op === 'add') parent.splice(index, 0, cloneJsonValue(operation.value))
      else if (operation.op === 'remove') {
        if (index >= parent.length) throw new Error(`Array index out of bounds: ${key}`)
        parent.splice(index, 1)
      } else {
        if (index >= parent.length) throw new Error(`Array index out of bounds: ${key}`)
        parent[index] = cloneJsonValue(operation.value)
      }
    } else if (isJsonObject(parent)) {
      if (operation.op === 'add' || operation.op === 'replace') {
        Object.defineProperty(parent, key, {
          configurable: true,
          enumerable: true,
          value: cloneJsonValue(operation.value),
          writable: true,
        })
      } else {
        if (!Object.hasOwn(parent, key))
          throw new Error(`Missing JSON Pointer path: ${operation.path}`)
        delete parent[key]
      }
    } else {
      throw new Error(`Cannot modify JSON Pointer path: ${operation.path}`)
    }
  }

  return result
}
