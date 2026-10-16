import assert from "node:assert/strict";
import { test } from "node:test";
import { loginIp, LoginLimiter } from "../lib/login-limit";

const TEN_MINUTES = 10 * 60 * 1000;

function setup() {
  let now = 0;
  return { limiter: new LoginLimiter(() => now), advance: (ms: number) => { now += ms; } };
}

test("十分钟内第五次失败立即锁定，并从该次失败起锁定十分钟", () => {
  const { limiter, advance } = setup();
  for (let i = 0; i < 4; i++) {
    assert.equal(limiter.recordFailure("a", "ip"), false);
    assert.equal(limiter.isLocked("a", "ip"), false);
  }
  advance(TEN_MINUTES - 1);
  assert.equal(limiter.recordFailure("a", "ip"), true);
  advance(TEN_MINUTES - 1);
  assert.equal(limiter.isLocked("a", "ip"), true);
  advance(1);
  assert.equal(limiter.isLocked("a", "ip"), false);
  assert.equal(limiter.recordFailure("a", "ip"), false);
});

test("滚动窗口剔除满十分钟的失败，保留较新的失败", () => {
  const { limiter, advance } = setup();
  limiter.recordFailure("a", "ip");
  advance(1);
  for (let i = 0; i < 3; i++) limiter.recordFailure("a", "ip");
  advance(TEN_MINUTES - 1);
  assert.equal(limiter.recordFailure("a", "ip"), false);
  assert.equal(limiter.recordFailure("a", "ip"), true);
});

test("相同账号不同 IP 和相同 IP 不同账号分别计数", () => {
  const { limiter } = setup();
  for (let i = 0; i < 5; i++) limiter.recordFailure("a", "ip1");
  assert.equal(limiter.isLocked("a", "ip1"), true);
  assert.equal(limiter.isLocked("a", "ip2"), false);
  assert.equal(limiter.isLocked("b", "ip1"), false);
  // 账号和 IP 的拼接不能碰撞。
  for (let i = 0; i < 5; i++) limiter.recordFailure("a:b", "c");
  assert.equal(limiter.isLocked("a", "b:c"), false);
});

test("登录成功清零当前账号和 IP，不影响其他组合", () => {
  const { limiter } = setup();
  for (let i = 0; i < 4; i++) limiter.recordFailure("a", "ip");
  for (let i = 0; i < 5; i++) limiter.recordFailure("b", "ip");
  limiter.reset("a", "ip");
  assert.equal(limiter.recordFailure("a", "ip"), false);
  assert.equal(limiter.isLocked("b", "ip"), true);
});

test("锁定期间重复失败不延长锁定，过期后重新累计五次", () => {
  const { limiter, advance } = setup();
  for (let i = 0; i < 5; i++) limiter.recordFailure("a", "ip");
  advance(TEN_MINUTES - 1);
  assert.equal(limiter.recordFailure("a", "ip"), true);
  advance(1);
  assert.equal(limiter.isLocked("a", "ip"), false);
  for (let i = 0; i < 4; i++) assert.equal(limiter.recordFailure("a", "ip"), false);
  assert.equal(limiter.recordFailure("a", "ip"), true);
});

test("新进程实例从零计数，过期窗口不继续累计", () => {
  const { limiter, advance } = setup();
  for (let i = 0; i < 4; i++) limiter.recordFailure("a", "ip");
  advance(TEN_MINUTES);
  assert.equal(limiter.recordFailure("a", "ip"), false);
  assert.equal(new LoginLimiter().isLocked("a", "ip"), false);
});

test("IP 优先取 nginx 覆盖的 x-real-ip，回退时取 x-forwarded-for 最后一个值", () => {
  assert.equal(loginIp(" 198.51.100.7 ", "1.2.3.4, 198.51.100.7"), "198.51.100.7");
  assert.equal(loginIp(null, " 203.0.113.9 (伪造), 198.51.100.7 "), "198.51.100.7");
  assert.equal(loginIp(null, "2001:db8::1"), "2001:db8::1");
  assert.equal(loginIp(null, null), "unknown");
  assert.equal(loginIp("", " , "), "unknown");
});
