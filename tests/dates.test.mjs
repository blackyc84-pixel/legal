import assert from "node:assert/strict";
import test from "node:test";
import { dayDiff, dueLabel } from "../public/dates.js";

test("기한 표시는 서울 날짜 기준으로 계산한다", () => {
  assert.equal(dayDiff("2026-11-11", "2026-11-11"), 0);
  assert.equal(dueLabel("2026-11-11", "2026-11-11"), "오늘");
  assert.equal(dueLabel("2026-11-12", "2026-11-11"), "내일");
  assert.equal(dueLabel("2026-11-09", "2026-11-11"), "2일 지남");
  assert.equal(dueLabel("2026-11-13T14:20", "2026-11-11"), "D-2");
});
