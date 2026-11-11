import { dueLabel, todayKST } from "./dates.js";

const main = document.querySelector("#main");
const nav = document.querySelector("#nav");
const view = { data: null, error: "", notice: "", route: { name: "home" } };

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

function money(value) {
  if (value == null || value === "") return "-";
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

function when(value) {
  if (!value) return "-";
  const [day, time] = String(value).split("T");
  const [y, m, d] = day.split("-");
  return time ? `${y}.${m}.${d} ${time.slice(0, 5)}` : `${y}.${m}.${d}`;
}

function options(list, selected) {
  return list.map((item) => `<option ${item === selected ? "selected" : ""}>${esc(item)}</option>`).join("");
}

function projectName(id) {
  return view.data.projects.find((p) => p.id === id)?.name || "현장 없음";
}

function reviewOf(caseId) {
  return view.data.reviews.find((r) => r.caseId === caseId) || null;
}

function openResponses(item) {
  return !["완료", "보류"].includes(item.status);
}

function stamp(dateStr) {
  const label = dueLabel(dateStr);
  if (!label) return "";
  const kind = label.endsWith("지남") ? "over" : label === "오늘" || label === "내일" ? "soon" : "ok";
  return `<span class="stamp ${kind}">${esc(label)}</span>`;
}

function riskPill(risk) {
  const kind = risk === "높음" ? "high" : risk === "중간" ? "mid" : risk === "낮음" ? "low" : "";
  return `<span class="pill ${kind}">${esc(risk || "미평가")}</span>`;
}

async function load() {
  const res = await fetch("/api/state");
  if (!res.ok) throw new Error("목록을 불러오지 못했습니다.");
  view.data = await res.json();
}

async function send(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "저장에 실패했습니다.");
  return data;
}

function route() {
  const hash = decodeURIComponent(location.hash.replace(/^#/, "") || "/");
  if (hash === "/new") return { name: "new" };
  const match = hash.match(/^\/cases\/([^/]+)$/);
  if (match) return { name: "case", id: match[1] };
  return { name: "home" };
}

function renderNav() {
  const { route: current, data } = view;
  const groups = data.projects.map((project) => {
    const cases = data.cases.filter((item) => item.projectId === project.id);
    const links = cases.map((item) => `
      <a class="case-link ${current.name === "case" && current.id === item.id ? "active" : ""}" href="#/cases/${esc(item.id)}">
        <strong>${esc(item.title)}</strong>
        <span>${esc(item.courtCaseNo || item.stage)} · ${esc(item.status)}</span>
      </a>`).join("") || `<p class="empty small">사건이 없습니다.</p>`;
    return `<p class="project-label">${esc(project.name)}</p>${links}`;
  }).join("");
  nav.innerHTML = `
    <div class="nav-head">
      <strong>사건</strong>
      <a class="text-btn" href="#/new">새 사건</a>
    </div>
    <a class="case-link ${current.name === "home" ? "active" : ""}" href="#/"><strong>오늘 할 일</strong><span>기일과 대응</span></a>
    ${groups || `<p class="empty">등록된 현장이 없습니다.</p>`}
  `;
}

function home() {
  const today = todayKST();
  const hearings = view.data.hearings
    .filter((item) => !item.done)
    .map((item) => ({ ...item, case: view.data.cases.find((c) => c.id === item.caseId) }))
    .filter((item) => item.case)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const responses = view.data.responses
    .filter(openResponses)
    .map((item) => ({ ...item, case: view.data.cases.find((c) => c.id === item.caseId) }))
    .filter((item) => item.case)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const unreviewed = view.data.cases.filter((item) => item.status === "진행" && !reviewOf(item.id));

  const hearingHtml = hearings.slice(0, 6).map((item) => `
    <div class="item">
      ${stamp(item.dueAt)}
      <button class="click" data-go="${esc(item.caseId)}">
        <h3>${esc(item.case.title)}</h3>
        <p class="small muted">${esc(item.kind)} · ${esc(when(item.dueAt))} · ${esc(item.place || "장소 미정")}</p>
      </button>
      <span class="small">${esc(projectName(item.case.projectId))}</span>
    </div>`).join("") || `<p class="empty">예정된 기일이 없습니다.</p>`;

  const responseHtml = responses.slice(0, 6).map((item) => `
    <div class="item">
      ${stamp(item.dueAt)}
      <button class="click" data-go="${esc(item.caseId)}">
        <h3>${esc(item.title)}</h3>
        <p class="small muted">${esc(item.case.title)} · ${esc(item.kind)} · ${esc(item.owner)}</p>
      </button>
      <span class="pill">${esc(item.status)}</span>
    </div>`).join("") || `<p class="empty">열린 대응이 없습니다.</p>`;

  const reviewHtml = unreviewed.map((item) => `
    <div class="item">
      <span class="stamp soon">검토 전</span>
      <button class="click" data-go="${esc(item.id)}"><h3>${esc(item.title)}</h3><p class="small muted">${esc(projectName(item.projectId))}</p></button>
      <span class="small">${esc(item.ourSide)}</span>
    </div>`).join("") || `<p class="empty">진행 중인 사건은 모두 검토 메모가 있습니다.</p>`;

  return `
    <div class="grid">
      <section class="stack">
        <article class="card"><h2>가까운 기일</h2>${hearingHtml}</article>
        <article class="card"><h2>대응 할 일</h2>${responseHtml}</article>
        <article class="card"><h2>검토가 없는 사건</h2>${reviewHtml}</article>
      </section>
      <section class="stack">
        <article class="card">
          <h2>현장 추가</h2>
          <form class="form" data-action="create-project">
            <label>현장명<input name="name" required maxlength="80" placeholder="예시 현장" /></label>
            <label>소재지<input name="site" maxlength="80" placeholder="서울" /></label>
            <button class="primary" type="submit">현장 등록</button>
          </form>
        </article>
        <article class="card">
          <h2>기준일</h2>
          <p>서울 기준 ${esc(today.replaceAll("-", "."))}</p>
          <p class="small muted">예시 사건은 사용법을 보여 주기 위한 자료입니다. 실제 사건번호는 들어 있지 않습니다.</p>
        </article>
      </section>
    </div>`;
}

function casePage(id) {
  const item = view.data.cases.find((c) => c.id === id);
  if (!item) return `<article class="card"><h2>사건을 찾을 수 없습니다.</h2><a href="#/">오늘 할 일로</a></article>`;
  const review = reviewOf(item.id);
  const responses = view.data.responses.filter((r) => r.caseId === item.id).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const hearings = view.data.hearings.filter((h) => h.caseId === item.id).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const opts = view.data.options;

  const responseRows = responses.map((row) => `
    <div class="item">
      ${stamp(row.dueAt)}
      <div>
        <h3>${esc(row.title)}</h3>
        <p class="small muted">${esc(row.kind)} · ${esc(when(row.dueAt))} · ${esc(row.owner)}${row.note ? ` · ${esc(row.note)}` : ""}</p>
      </div>
      <select data-action="response-status" data-id="${esc(row.id)}" aria-label="대응 상태">
        ${options(opts.RESPONSE_STATUS, row.status)}
      </select>
    </div>`).join("") || `<p class="empty">등록된 대응이 없습니다.</p>`;

  const hearingRows = hearings.map((row) => `
    <div class="item">
      ${row.done ? `<span class="stamp ok">완료</span>` : stamp(row.dueAt)}
      <div>
        <h3>${esc(row.kind)}</h3>
        <p class="small muted">${esc(when(row.dueAt))} · ${esc(row.place || "장소 미정")}${row.note ? ` · ${esc(row.note)}` : ""}</p>
      </div>
      <button class="ghost" data-action="hearing-done" data-id="${esc(row.id)}" data-done="${row.done ? "1" : "0"}">${row.done ? "되돌리기" : "완료"}</button>
    </div>`).join("") || `<p class="empty">등록된 기일이 없습니다.</p>`;

  return `
    <div class="stack">
      <article class="card">
        <div class="row">
          <div>
            <p class="small muted">${esc(projectName(item.projectId))}</p>
            <h2>${esc(item.title)}</h2>
          </div>
          <div class="pills">${riskPill(review?.risk)}<span class="pill">${esc(item.stage)}</span><span class="pill">${esc(item.status)}</span></div>
        </div>
        <dl class="meta">
          <div><dt>사건번호</dt><dd>${esc(item.courtCaseNo || "-")}</dd></div>
          <div><dt>법원</dt><dd>${esc(item.court || "-")}</dd></div>
          <div><dt>유형</dt><dd>${esc(item.type)}</dd></div>
          <div><dt>당사 지위</dt><dd>${esc(item.ourSide)}</dd></div>
          <div><dt>상대방</dt><dd>${esc(item.opponent || "-")}</dd></div>
          <div><dt>청구금액</dt><dd>${esc(money(item.claimAmount))}</dd></div>
          <div><dt>수임</dt><dd>${esc(item.lawFirm || "-")}</dd></div>
        </dl>
        ${item.summary ? `<p>${esc(item.summary)}</p>` : ""}
        <form class="form two" data-action="update-case" data-id="${esc(item.id)}">
          <label>단계<select name="stage">${options(opts.STAGES, item.stage)}</select></label>
          <label>상태<select name="status">${options(opts.CASE_STATUS, item.status)}</select></label>
          <button class="ghost" type="submit">사건 상태 저장</button>
        </form>
      </article>

      <div class="grid">
        <article class="card">
          <h2>검토</h2>
          ${review ? `<p class="small muted">마지막 저장 ${esc(when(review.updatedAt))}</p>` : `<p class="empty">아직 검토 메모가 없습니다.</p>`}
          <form class="form" data-action="save-review" data-id="${esc(item.id)}">
            <label>사실관계<textarea name="facts">${esc(review?.facts)}</textarea></label>
            <label>쟁점<textarea name="issues">${esc(review?.issues)}</textarea></label>
            <div class="two">
              <label>우리 입장<textarea name="ourPosition">${esc(review?.ourPosition)}</textarea></label>
              <label>상대 입장<textarea name="theirPosition">${esc(review?.theirPosition)}</textarea></label>
            </div>
            <label>관련 법령<textarea name="statutes" placeholder="법령명과 조문. 최신 여부는 따로 확인합니다.">${esc(review?.statutes)}</textarea></label>
            <label>리스크<select name="risk">${options(opts.RISKS, review?.risk || "미평가")}</select></label>
            <label>검토 결론<textarea name="conclusion">${esc(review?.conclusion)}</textarea></label>
            <button class="primary" type="submit">검토 저장</button>
          </form>
        </article>
        <section class="stack">
          <article class="card">
            <div class="row"><h2>대응 메모</h2><button class="ghost" type="button" data-action="copy-brief" data-id="${esc(item.id)}">복사</button></div>
            <div class="brief" id="brief">${esc(brief(item, review, responses, hearings))}</div>
          </article>
          <article class="card">
            <h2>대응</h2>
            ${responseRows}
            <form class="form" data-action="add-response" data-id="${esc(item.id)}">
              <div class="two">
                <label>유형<select name="kind">${options(opts.RESPONSE_KINDS, "준비서면")}</select></label>
                <label>기한<input type="date" name="dueAt" required /></label>
              </div>
              <label>내용<input name="title" required maxlength="160" placeholder="이번 기일에 낼 서면" /></label>
              <div class="two">
                <label>담당<input name="owner" maxlength="40" placeholder="법무" /></label>
                <label>메모<input name="note" maxlength="2000" /></label>
              </div>
              <button class="primary" type="submit">대응 추가</button>
            </form>
          </article>
          <article class="card">
            <h2>기일</h2>
            ${hearingRows}
            <form class="form" data-action="add-hearing" data-id="${esc(item.id)}">
              <div class="two">
                <label>구분<select name="kind">${options(opts.HEARING_KINDS, "변론기일")}</select></label>
                <label>일시<input type="datetime-local" name="dueAt" required /></label>
              </div>
              <div class="two">
                <label>장소<input name="place" maxlength="80" placeholder="법정" /></label>
                <label>메모<input name="note" maxlength="500" /></label>
              </div>
              <button class="primary" type="submit">기일 추가</button>
            </form>
          </article>
        </section>
      </div>
    </div>`;
}

function brief(item, review, responses, hearings) {
  const nextResponse = responses.find(openResponses);
  const nextHearing = hearings.find((h) => !h.done);
  return [
    `[대응 메모] ${item.title}`,
    `현장: ${projectName(item.projectId)}`,
    `법원: ${item.court || "-"} / ${item.courtCaseNo || "-"}`,
    `지위: ${item.ourSide} / 단계: ${item.stage}`,
    `쟁점: ${review?.issues || "-"}`,
    `우리 입장: ${review?.ourPosition || "-"}`,
    `상대 입장: ${review?.theirPosition || "-"}`,
    `법령 메모: ${review?.statutes || "-"}`,
    `리스크: ${review?.risk || "미평가"}`,
    `결론: ${review?.conclusion || "-"}`,
    nextResponse ? `다음 대응: ${nextResponse.kind} · ${nextResponse.title} · ${nextResponse.dueAt} · ${nextResponse.status}` : "다음 대응: 없음",
    nextHearing ? `다음 기일: ${nextHearing.kind} · ${when(nextHearing.dueAt)} · ${nextHearing.place || "장소 미정"}` : "다음 기일: 없음",
  ].join("\n");
}

function newCase() {
  const opts = view.data.options;
  const projects = view.data.projects.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
  return `
    <article class="card">
      <h2>사건 등록</h2>
      <form class="form" data-action="create-case">
        <div class="two">
          <label>현장<select name="projectId" required>${projects}</select></label>
          <label>사건명<input name="title" required maxlength="120" /></label>
        </div>
        <div class="three">
          <label>유형<select name="type">${options(opts.CASE_TYPES, "민사(공사대금)")}</select></label>
          <label>단계<select name="stage">${options(opts.STAGES, "1심")}</select></label>
          <label>당사 지위<select name="ourSide">${options(opts.SIDES, "피고")}</select></label>
        </div>
        <div class="three">
          <label>사건번호<input name="courtCaseNo" maxlength="40" placeholder="예시-2026가합1004" /></label>
          <label>법원<input name="court" maxlength="80" /></label>
          <label>상대방<input name="opponent" maxlength="80" /></label>
        </div>
        <div class="two">
          <label>청구금액<input name="claimAmount" inputmode="numeric" /></label>
          <label>수임 로펌<input name="lawFirm" maxlength="80" /></label>
        </div>
        <label>개요<textarea name="summary"></textarea></label>
        <button class="primary" type="submit">등록</button>
      </form>
    </article>`;
}

function draw() {
  if (!view.data) {
    main.innerHTML = `<article class="card"><p>불러오는 중입니다.</p></article>`;
    return;
  }
  renderNav();
  const banner = [
    view.error ? `<p class="banner">${esc(view.error)}</p>` : "",
    view.notice ? `<p class="banner ok">${esc(view.notice)}</p>` : "",
  ].join("");
  const body = view.route.name === "case" ? casePage(view.route.id) : view.route.name === "new" ? newCase() : home();
  main.innerHTML = banner + body;
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function onSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  const action = form.dataset.action;
  const id = form.dataset.id;
  const button = form.querySelector("button[type=submit]");
  if (button) button.disabled = true;
  view.error = "";
  try {
    const body = formData(form);
    if (action === "create-project") {
      await send("/api/projects", "POST", body);
      view.notice = "현장을 등록했습니다.";
    } else if (action === "create-case") {
      const created = await send("/api/cases", "POST", body);
      await load();
      location.hash = `#/cases/${created.id}`;
      view.route = route();
      view.notice = "사건을 등록했습니다.";
      draw();
      return;
    } else if (action === "save-review") {
      await send(`/api/cases/${id}/review`, "PUT", body);
      view.notice = "검토를 저장했습니다.";
    } else if (action === "add-response") {
      await send(`/api/cases/${id}/responses`, "POST", body);
      view.notice = "대응을 추가했습니다.";
    } else if (action === "add-hearing") {
      await send(`/api/cases/${id}/hearings`, "POST", body);
      view.notice = "기일을 추가했습니다.";
    } else if (action === "update-case") {
      await send(`/api/cases/${id}`, "PATCH", body);
      view.notice = "사건 상태를 저장했습니다.";
    }
    await load();
  } catch (error) {
    view.error = error.message;
  } finally {
    if (button) button.disabled = false;
    draw();
  }
}

async function onChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement) || target.dataset.action !== "response-status") return;
  view.error = "";
  try {
    await send(`/api/responses/${target.dataset.id}`, "PATCH", { status: target.value });
    view.notice = "대응 상태를 바꿨습니다.";
    await load();
  } catch (error) {
    view.error = error.message;
  }
  draw();
}

async function onClick(event) {
  const go = event.target.closest("[data-go]");
  if (go) {
    location.hash = `#/cases/${go.dataset.go}`;
    return;
  }
  const button = event.target.closest("[data-action]");
  if (!button) return;
  if (button.dataset.action === "copy-brief") {
    const text = document.querySelector("#brief")?.textContent || "";
    try {
      await navigator.clipboard.writeText(text);
      view.notice = "대응 메모를 복사했습니다.";
      view.error = "";
    } catch {
      view.error = "복사에 실패했습니다. 메모를 직접 선택해 복사하세요.";
    }
    draw();
    return;
  }
  if (button.dataset.action === "hearing-done") {
    view.error = "";
    try {
      await send(`/api/hearings/${button.dataset.id}`, "PATCH", { done: button.dataset.done !== "1" });
      view.notice = "기일 상태를 바꿨습니다.";
      await load();
    } catch (error) {
      view.error = error.message;
    }
    draw();
  }
}

async function boot() {
  view.route = route();
  try {
    await load();
  } catch (error) {
    main.innerHTML = `<article class="card"><p class="banner">${esc(error.message)}</p></article>`;
    return;
  }
  draw();
  window.addEventListener("hashchange", () => {
    view.route = route();
    view.error = "";
    draw();
  });
  document.body.addEventListener("submit", onSubmit);
  document.body.addEventListener("change", onChange);
  document.body.addEventListener("click", onClick);
}

boot();
