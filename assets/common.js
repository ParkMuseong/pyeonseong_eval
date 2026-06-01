/* =============================================================================
 *  편성회의 Agent — 공통 로직 (점수 계산 · 상세 렌더 · 모달)
 * ========================================================================== */
(function () {
  "use strict";

  const AXES = ["화제성", "독창성", "근접성", "영향성"];
  window.AXES = AXES;

  // 평가자 1인의 평점 = 네 축 평균
  function ratingOf(ev) {
    const s = AXES.reduce((a, k) => a + (Number(ev[k]) || 0), 0);
    return s / AXES.length;
  }
  // 작품 총점 = 평가자들 평점의 평균
  function totalOf(work) {
    if (!work.평가들 || !work.평가들.length) return 0;
    const s = work.평가들.reduce((a, ev) => a + ratingOf(ev), 0);
    return s / work.평가들.length;
  }
  // 축별 평균 (평가자 평균)
  function axisAvg(work, axis) {
    if (!work.평가들 || !work.평가들.length) return 0;
    const s = work.평가들.reduce((a, ev) => a + (Number(ev[axis]) || 0), 0);
    return s / work.평가들.length;
  }
  function fmt(n) {
    return Number.isInteger(n) ? String(n) : n.toFixed(n * 100 % 100 === 0 ? 2 : 3).replace(/0+$/, "").replace(/\.$/, "");
  }
  // 1~5 → 색상 클래스 (반올림)
  function scoreClass(v) {
    const r = Math.max(1, Math.min(5, Math.round(v)));
    return "s-" + r;
  }
  function scoreChip(v) {
    return `<span class="score ${scoreClass(v)}">${fmt(Math.round(v * 10) / 10)}</span>`;
  }

  window.Eval = { AXES, ratingOf, totalOf, axisAvg, fmt, scoreClass, scoreChip };

  /* ---- 상세 콘텐츠 HTML (롱리스트 인라인 + 숏리스트 모달 공용) ---- */
  function detailHTML(work) {
    const cast = (work.출연 || [])
      .map((c) => `<span>${esc(c)}</span>`)
      .join("");
    const breakdown = AXES.map((axis) => {
      const v = axisAvg(work, axis);
      return `<div class="sb"><span class="lab">${axis}</span>${scoreChip(v)}</div>`;
    }).join("");
    const reason = work.사유
      ? `<div class="reason-box"><b>평가 사유 —</b> ${esc(work.사유)}</div>`
      : "";
    return `
      <div class="detail-grid">
        <div>
          <h4>줄거리</h4>
          <p class="synopsis">${esc(work.줄거리 || "줄거리 정보 없음")}</p>
          <h4>출연진</h4>
          <div class="cast-list">${cast || '<span style="border:none;color:var(--muted)">출연 정보 없음</span>'}</div>
        </div>
        <div>
          <h4>기본 정보</h4>
          <dl class="kv">
            <dt>대분류</dt><dd>${esc(work.대분류 || "-")} · ${esc(work.소분류 || "-")}</dd>
            <dt>장르</dt><dd>${esc(work.장르 || "-")}</dd>
            <dt>감독</dt><dd>${esc(work.감독 || "-")}</dd>
            <dt>공개일</dt><dd>${esc(work.공개일 || work.기간 || "-")}</dd>
            <dt>플랫폼</dt><dd>${esc(work.플랫폼 || "-")}</dd>
          </dl>
          <h4 style="margin-top:18px">평가 점수 (평균)</h4>
          <div class="score-breakdown">${breakdown}</div>
        </div>
      </div>
      ${reason}
    `;
  }
  window.Eval.detailHTML = detailHTML;

  /* ---- 모달 ---- */
  function ensureModal() {
    let back = document.getElementById("modalBack");
    if (back) return back;
    back = document.createElement("div");
    back.id = "modalBack";
    back.className = "modal-back";
    back.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-head">
          <button class="modal-close" aria-label="닫기">&times;</button>
          <div style="flex:1">
            <h2 id="modalTitle"></h2>
            <div class="meta-line" id="modalMeta"></div>
          </div>
          <div class="total-badge"><b id="modalTotal"></b><span>총점 (5점)</span></div>
        </div>
        <div class="modal-body" id="modalBody"></div>
      </div>`;
    document.body.appendChild(back);
    const close = () => back.classList.remove("show");
    back.querySelector(".modal-close").addEventListener("click", close);
    back.addEventListener("click", (e) => { if (e.target === back) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    return back;
  }
  function openModal(work) {
    const back = ensureModal();
    back.querySelector("#modalTitle").textContent = work.제목;
    back.querySelector("#modalMeta").textContent =
      `${work.구분 || ""} · ${work.대분류 || ""} / ${work.소분류 || ""} · ${work.기간 || work.공개일 || ""}`;
    back.querySelector("#modalTotal").textContent = fmt(Math.round(totalOf(work) * 1000) / 1000);
    back.querySelector("#modalBody").innerHTML = detailHTML(work);
    back.classList.add("show");
    back.querySelector(".modal").scrollTop = 0;
  }
  window.Eval.openModal = openModal;

  /* ---- util ---- */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  window.Eval.esc = esc;

  /* ---- 활성 nav 표시 ---- */
  document.addEventListener("DOMContentLoaded", function () {
    const page = (location.pathname.split("/").pop() || "index.html");
    document.querySelectorAll(".nav a[data-page]").forEach((a) => {
      if (a.getAttribute("data-page") === page) a.classList.add("active");
    });
  });
})();
