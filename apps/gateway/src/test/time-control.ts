export function createTimeController() {
  let currentTime = 1_700_000_000_000;
  return {
    now: () => currentTime,
    advance: (ms: number) => { currentTime += ms; },
    set: (ts: number) => { currentTime = ts; },
  };
}
