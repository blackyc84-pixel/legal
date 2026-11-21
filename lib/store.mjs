import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function dataPath() {
  return process.env.DATA_PATH || path.join(root, "data", "store.json");
}

function samplePath() {
  return path.join(root, "data", "sample.json");
}

const CASE_TYPES = ["민사(공사대금)", "민사(하자)", "민사(채무부존재)", "민사(원상회복)", "민사(기타)", "행정", "형사", "중재"];
const STAGES = ["접수", "1심", "2심", "3심", "조정", "종결"];
const SIDES = ["원고", "피고", "신청인", "피신청인", "기타"];
const CASE_STATUS = ["진행", "종결"];
const RISKS = ["미평가", "낮음", "중간", "높음"];
const RESPONSE_KINDS = ["답변서", "준비서면", "증거", "기일출석", "합의", "사실확인", "기타"];
const RESPONSE_STATUS = ["할 일", "진행", "완료", "보류"];
const HEARING_KINDS = ["변론기일", "선고기일", "준비서면", "송달확인", "조정기일", "기타"];

let chain = Promise.resolve();

function mutate(fn) {
  const run = chain.then(fn, fn);
  chain = run.then(() => {}, () => {});
  return run;
}

function emptyState() {
  return { projects: [], cases: [], reviews: [], responses: [], hearings: [] };
}

async function ensureFile() {
  const file = dataPath();
  try {
    await readFile(file, "utf8");
  } catch {
    await mkdir(path.dirname(file), { recursive: true });
    let seed = JSON.stringify(emptyState(), null, 2);
    if (!process.env.DATA_PATH) {
      seed = await readFile(samplePath(), "utf8");
    }
    await writeFile(file, seed);
  }
}

async function readState() {
  await ensureFile();
  const raw = await readFile(dataPath(), "utf8");
  const data = JSON.parse(raw);
  for (const key of ["projects", "cases", "reviews", "responses", "hearings"]) {
    if (!Array.isArray(data[key])) data[key] = [];
  }
  return data;
}

async function writeState(data) {
  const file = dataPath();
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2));
  await rename(tmp, file);
}

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function text(value, label, { required = false, max = 2000 } = {}) {
  const v = String(value ?? "").trim();
  if (required && !v) fail(`${label} 항목을 입력하세요.`);
  if (v.length > max) fail(`${label} 항목은 ${max}자 이하로 입력하세요.`);
  return v;
}

function oneOf(value, label, options, fallback) {
  const v = String(value ?? "").trim();
  if (!v && fallback) return fallback;
  if (!options.includes(v)) fail(`${label} 값이 올바르지 않습니다.`);
  return v;
}

function dateOnly(value, label, { required = false } = {}) {
  const v = String(value ?? "").trim();
  if (!v) {
    if (required) fail(`${label}을 입력하세요.`);
    return "";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) fail(`${label} 항목은 YYYY-MM-DD 형식이어야 합니다.`);
  return v;
}

function dateTime(value, label) {
  const v = String(value ?? "").trim();
  if (!v) fail(`${label}을 입력하세요.`);
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(v)) fail(`${label} 항목 형식이 올바르지 않습니다.`);
  return v;
}

function money(value) {
  if (value == null || String(value).trim() === "") return null;
  const n = Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) fail("청구금액은 0 이상의 숫자여야 합니다.");
  return Math.round(n);
}

function id() {
  return crypto.randomUUID();
}

export async function getState() {
  return readState();
}

export function createProject(input) {
  return mutate(async () => {
    const data = await readState();
    const project = {
      id: id(),
      name: text(input.name, "현장명", { required: true, max: 80 }),
      site: text(input.site, "소재지", { max: 80 }),
      createdAt: new Date().toISOString(),
    };
    data.projects.push(project);
    await writeState(data);
    return project;
  });
}

export function createCase(input) {
  return mutate(async () => {
    const data = await readState();
    const projectId = text(input.projectId, "현장", { required: true, max: 80 });
    if (!data.projects.some((p) => p.id === projectId)) fail("현장을 찾을 수 없습니다.", 404);
    const item = {
      id: id(),
      projectId,
      title: text(input.title, "사건명", { required: true, max: 120 }),
      courtCaseNo: text(input.courtCaseNo, "사건번호", { max: 40 }),
      court: text(input.court, "법원", { max: 80 }),
      type: oneOf(input.type, "유형", CASE_TYPES),
      stage: oneOf(input.stage, "단계", STAGES, "1심"),
      ourSide: oneOf(input.ourSide, "당사 지위", SIDES),
      opponent: text(input.opponent, "상대방", { max: 80 }),
      claimAmount: money(input.claimAmount),
      lawFirm: text(input.lawFirm, "수임 로펌", { max: 80 }),
      summary: text(input.summary, "개요", { max: 4000 }),
      status: "진행",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    data.cases.push(item);
    await writeState(data);
    return item;
  });
}

export function updateCase(caseId, input) {
  return mutate(async () => {
    const data = await readState();
    const item = data.cases.find((c) => c.id === caseId);
    if (!item) fail("사건을 찾을 수 없습니다.", 404);
    if (input.stage != null) item.stage = oneOf(input.stage, "단계", STAGES);
    if (input.status != null) item.status = oneOf(input.status, "상태", CASE_STATUS);
    if (input.summary != null) item.summary = text(input.summary, "개요", { max: 4000 });
    if (input.courtCaseNo != null) item.courtCaseNo = text(input.courtCaseNo, "사건번호", { max: 40 });
    if (input.court != null) item.court = text(input.court, "법원", { max: 80 });
    if (input.opponent != null) item.opponent = text(input.opponent, "상대방", { max: 80 });
    if (input.lawFirm != null) item.lawFirm = text(input.lawFirm, "수임 로펌", { max: 80 });
    if (input.claimAmount != null) item.claimAmount = money(input.claimAmount);
    item.updatedAt = new Date().toISOString();
    if (item.stage === "종결") item.status = "종결";
    await writeState(data);
    return item;
  });
}

export function saveReview(caseId, input) {
  return mutate(async () => {
    const data = await readState();
    if (!data.cases.some((c) => c.id === caseId)) fail("사건을 찾을 수 없습니다.", 404);
    const review = {
      id: id(),
      caseId,
      facts: text(input.facts, "사실관계", { max: 4000 }),
      issues: text(input.issues, "쟁점", { max: 4000 }),
      ourPosition: text(input.ourPosition, "우리 입장", { max: 4000 }),
      theirPosition: text(input.theirPosition, "상대 입장", { max: 4000 }),
      statutes: text(input.statutes, "관련 법령", { max: 2000 }),
      risk: oneOf(input.risk, "리스크", RISKS, "미평가"),
      conclusion: text(input.conclusion, "검토 결론", { max: 4000 }),
      updatedAt: new Date().toISOString(),
    };
    if (![review.facts, review.issues, review.ourPosition, review.theirPosition, review.statutes, review.conclusion].some(Boolean)) {
      fail("검토 내용을 하나 이상 입력하세요.");
    }
    data.reviews = data.reviews.filter((r) => r.caseId !== caseId);
    data.reviews.push(review);
    await writeState(data);
    return review;
  });
}

export function addResponse(caseId, input) {
  return mutate(async () => {
    const data = await readState();
    if (!data.cases.some((c) => c.id === caseId)) fail("사건을 찾을 수 없습니다.", 404);
    const item = {
      id: id(),
      caseId,
      kind: oneOf(input.kind, "대응 유형", RESPONSE_KINDS),
      title: text(input.title, "대응 내용", { required: true, max: 160 }),
      dueAt: dateOnly(input.dueAt, "기한", { required: true }),
      status: "할 일",
      owner: text(input.owner, "담당", { max: 40 }) || "법무",
      note: text(input.note, "메모", { max: 2000 }),
      createdAt: new Date().toISOString(),
    };
    data.responses.push(item);
    await writeState(data);
    return item;
  });
}

export function updateResponse(responseId, input) {
  return mutate(async () => {
    const data = await readState();
    const item = data.responses.find((r) => r.id === responseId);
    if (!item) fail("대응 항목을 찾을 수 없습니다.", 404);
    if (input.status != null) item.status = oneOf(input.status, "상태", RESPONSE_STATUS);
    if (input.note != null) item.note = text(input.note, "메모", { max: 2000 });
    await writeState(data);
    return item;
  });
}

export function addHearing(caseId, input) {
  return mutate(async () => {
    const data = await readState();
    if (!data.cases.some((c) => c.id === caseId)) fail("사건을 찾을 수 없습니다.", 404);
    const item = {
      id: id(),
      caseId,
      kind: oneOf(input.kind, "기일 구분", HEARING_KINDS),
      dueAt: dateTime(input.dueAt, "기일"),
      place: text(input.place, "장소", { max: 80 }),
      note: text(input.note, "메모", { max: 500 }),
      done: false,
    };
    data.hearings.push(item);
    await writeState(data);
    return item;
  });
}

export function updateHearing(hearingId, input) {
  return mutate(async () => {
    const data = await readState();
    const item = data.hearings.find((h) => h.id === hearingId);
    if (!item) fail("기일을 찾을 수 없습니다.", 404);
    if (input.done != null) item.done = Boolean(input.done);
    await writeState(data);
    return item;
  });
}

export const OPTIONS = { CASE_TYPES, STAGES, SIDES, CASE_STATUS, RISKS, RESPONSE_KINDS, RESPONSE_STATUS, HEARING_KINDS };
