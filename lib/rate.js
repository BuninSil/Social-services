/** Ограничитель частоты: скользящее окно в памяти процесса.
    Хватает для одного инстанса; за несколькими нужен общий Redis. */

const buckets = new Map();

const LIMITS = {
  login:    { max: 8,  windowMs: 5 * 60_000 },   // подбор пароля
  register: { max: 5,  windowMs: 60 * 60_000 },  // фермы аккаунтов
  post:     { max: 12, windowMs: 10 * 60_000 },
  comment:  { max: 30, windowMs: 10 * 60_000 },
  message:  { max: 60, windowMs: 10 * 60_000 },
  report:   { max: 10, windowMs: 60 * 60_000 },
};

/** @returns {{ok: boolean, retryAfter: number}} retryAfter — в секундах */
export function hit(action, key) {
  const limit = LIMITS[action];
  if (!limit) return { ok: true, retryAfter: 0 };

  const id = `${action}:${key}`;
  const now = Date.now();
  const fresh = (buckets.get(id) || []).filter((t) => now - t < limit.windowMs);

  if (fresh.length >= limit.max) {
    buckets.set(id, fresh);
    return { ok: false, retryAfter: Math.ceil((limit.windowMs - (now - fresh[0])) / 1000) };
  }
  fresh.push(now);
  buckets.set(id, fresh);
  return { ok: true, retryAfter: 0 };
}

/** Снять счётчик — например, после удачного входа. */
export const clear = (action, key) => buckets.delete(`${action}:${key}`);

// чтобы карта не росла бесконечно на долгоживущем процессе
setInterval(() => {
  const now = Date.now();
  const longest = Math.max(...Object.values(LIMITS).map((l) => l.windowMs));
  for (const [id, times] of buckets) {
    if (!times.length || now - times[times.length - 1] > longest) buckets.delete(id);
  }
}, 10 * 60_000).unref();
