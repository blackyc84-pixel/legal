import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const dir = await mkdtemp(path.join(tmpdir(), "legal-dispute-"));
process.env.DATA_PATH = path.join(dir, "store.json");
const { start } = await import("../server.mjs");
const server = await start(0);
const base = `http://127.0.0.1:${server.address().port}`;

async function call(url, options) {
  const res = await fetch(base + url, options);
  const data = await res.json();
  return { status: res.status, data };
}

test.after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await rm(dir, { recursive: true, force: true });
});

test("첫 화면과 스타일은 파일이 그대로 내려온다", async () => {
  const page = await fetch(base + "/");
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.match(html, /<title>분쟁 검토<\/title>/);
  const css = await fetch(base + "/styles.css");
  assert.match(await css.text(), /:root/);
  const js = await fetch(base + "/app.js");
  assert.match(await js.text(), /async function boot/);
});

test("사건 검토와 대응을 저장하고 홈에서 다시 읽는다", async () => {
  const project = await call("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "테스트현장", site: "부산" }),
  });
  assert.equal(project.status, 201);

  const created = await call("/api/cases", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      projectId: project.data.id,
      title: "테스트 공사대금",
      type: "민사(공사대금)",
      stage: "1심",
      ourSide: "피고",
      courtCaseNo: "예시-테스트",
    }),
  });
  assert.equal(created.status, 201);

  const review = await call(`/api/cases/${created.data.id}/review`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ issues: "서면 지시 없는 추가공사", risk: "높음", ourPosition: "다툰다" }),
  });
  assert.equal(review.status, 200);
  assert.equal(review.data.risk, "높음");

  const response = await call(`/api/cases/${created.data.id}/responses`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "준비서면", title: "준비서면 초안", dueAt: "2026-11-20", owner: "법무" }),
  });
  assert.equal(response.status, 201);

  const done = await call(`/api/responses/${response.data.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "완료" }),
  });
  assert.equal(done.data.status, "완료");

  const hearing = await call(`/api/cases/${created.data.id}/hearings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "변론기일", dueAt: "2026-11-21T10:30", place: "301호" }),
  });
  assert.equal(hearing.status, 201);

  const missing = await call("/api/cases", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId: project.data.id, type: "민사(공사대금)", ourSide: "피고" }),
  });
  assert.equal(missing.status, 400);

  const state = await call("/api/state");
  assert.equal(state.data.cases.length, 1);
  assert.equal(state.data.reviews[0].issues, "서면 지시 없는 추가공사");
  assert.equal(state.data.responses[0].status, "완료");
  assert.equal(state.data.hearings[0].place, "301호");
});
