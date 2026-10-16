const WINDOW_MS = 10 * 60 * 1000;
const LOCK_MS = 10 * 60 * 1000;
const MAX_FAILURES = 5;

type Attempts = { failures: number[]; lockedUntil: number };

// 仅适用于单进程：状态保存在进程内存，重启清零，不支持多进程/多实例共享。
export class LoginLimiter {
  private attempts = new Map<string, Attempts>();
  private nextCleanupAt = 0;

  constructor(private readonly now: () => number = Date.now) {}

  private key(account: string, ip: string) {
    return JSON.stringify([account, ip]);
  }

  private current(key: string, now: number) {
    // 按需清理过期记录，避免历史账号和 IP 永久占用内存。
    if (now >= this.nextCleanupAt) {
      for (const [storedKey, entry] of this.attempts) {
        if (entry.lockedUntil <= now && entry.failures.every(time => time <= now - WINDOW_MS)) {
          this.attempts.delete(storedKey);
        }
      }
      this.nextCleanupAt = now + 60_000;
    }

    const entry = this.attempts.get(key);
    if (!entry) return undefined;
    if (entry.lockedUntil > now) return entry;
    // 锁定期结束后从零开始，使用严格的滚动十分钟窗口。
    entry.failures = entry.lockedUntil ? [] : entry.failures.filter(time => time > now - WINDOW_MS);
    entry.lockedUntil = 0;
    if (!entry.failures.length) {
      this.attempts.delete(key);
      return undefined;
    }
    return entry;
  }

  isLocked(account: string, ip: string) {
    const now = this.now();
    return (this.current(this.key(account, ip), now)?.lockedUntil ?? 0) > now;
  }

  recordFailure(account: string, ip: string) {
    const now = this.now();
    const key = this.key(account, ip);
    const entry = this.current(key, now) ?? { failures: [], lockedUntil: 0 };
    // 锁定期间的请求不能延长锁定时间。
    if (entry.lockedUntil > now) return true;
    entry.failures.push(now);
    if (entry.failures.length >= MAX_FAILURES) entry.lockedUntil = now + LOCK_MS;
    this.attempts.set(key, entry);
    return entry.lockedUntil > now;
  }

  reset(account: string, ip: string) {
    this.attempts.delete(this.key(account, ip));
  }
}

// 线上 nginx 用 $remote_addr 覆盖 X-Real-IP，客户端无法伪造；
// X-Forwarded-For 由 nginx 追加真实地址到末尾，首个值可被客户端伪造，只取最后一个作回退。
export function loginIp(realIp: string | null, forwardedFor: string | null) {
  const real = realIp?.trim();
  if (real) return real;
  const parts = forwardedFor?.split(",").map(part => part.trim()).filter(Boolean) ?? [];
  return parts.at(-1) || "unknown";
}

export const loginLimiter = new LoginLimiter();
