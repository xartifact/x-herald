import { mock } from 'bun:test'
import type { Database } from '../db/client'

type ResultType = 'select' | 'insert' | 'update' | 'delete'

function createChainable(type: ResultType, results: Map<ResultType, unknown>) {
  const self: Record<string, unknown> = {
    from: () => self,
    where: () => self,
    limit: () => self,
    offset: () => self,
    orderBy: () => self,
    groupBy: () => self,
    $dynamic: () => self,
    set: () => self,
    values: () => self,
    returning: () => Promise.resolve(results.get(type)),
    then: (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) => {
      const result = results.get(type) ?? (type === 'select' ? [] : undefined)
      if (
        result &&
        typeof result === 'object' &&
        'then' in result &&
        typeof (result as Promise<unknown>).then === 'function'
      ) {
        ;(result as Promise<unknown>).then(resolve, reject)
      } else {
        resolve(result)
      }
    },
  }
  return self
}

export interface MockDb extends Database {
  _setResult(type: ResultType, value: unknown): void
  _getResult(type: ResultType): unknown
  _select: ReturnType<typeof mock>
  _insert: ReturnType<typeof mock>
  _update: ReturnType<typeof mock>
  _delete: ReturnType<typeof mock>
}

export function createMockDb(): MockDb {
  const results = new Map<ResultType, unknown>()

  const setResult = (type: ResultType, value: unknown) => {
    results.set(type, value)
  }

  const getResult = (type: ResultType) => {
    return results.get(type)
  }

  const selectMock = mock(() => createChainable('select', results))
  const insertMock = mock(() => createChainable('insert', results))
  const updateMock = mock(() => createChainable('update', results))
  const deleteMock = mock(() => createChainable('delete', results))

  const db = {
    _setResult: setResult,
    _getResult: getResult,
    select: selectMock,
    insert: insertMock,
    update: updateMock,
    delete: deleteMock,
    _select: selectMock,
    _insert: insertMock,
    _update: updateMock,
    _delete: deleteMock,
  }

  return db as unknown as MockDb
}
