/* =============================================================================
 *  신규 작품 롱리스트 (평가 X) — 렌더 로직
 *  데이터: window.LONGLIST (build_longlist.py 산출)
 *  공통 컴포넌트(style.css / longlist_eval.css / common.js)를 그대로 사용해
 *  다른 페이지와 톤앤매너·레이아웃·버튼·게이트·다중선택 UX를 통일한다.
 *  - 그룹 탭 / 출처·카테고리·국가·공개월 다중선택 / 검색 / 제목·공개일 정렬
 *  - 행 클릭 → 상세 펼침(detail-grid) / 페이지네이션 / CSV 내보내기
 * ========================================================================== */
(function () {
  "use strict";

  var esc = (window.Eval && window.Eval.esc) || function (s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  };
  var CFG = window.LLE_CONFIG || {};
  var DATA = window.LONGLIST || { works: [], groups: [], summary: {}, generated_at: "", base: "", window: {} };
  var WORKS = DATA.works || [];
  var PAGE_SIZE = 100;

  // 다중선택 상태 — 빈 Set = 전체
  var srcSet = new Set(), catSet = new Set(), natSet = new Set(), monthSet = new Set();
  var state = { group: "전체", q: "", sortKey: "", sortDir: 1, page: 1, open: {} };

  /* ---------- 유틸 ---------- */
  function uniqSorted(arr) {
    var seen = {}, out = [];
    arr.forEach(function (v) { v = (v || "").trim(); if (v && !seen[v]) { seen[v] = 1; out.push(v); } });
    return out.sort(function (a, b) { return a.localeCompare(b, "ko"); });
  }
  function natKey(v) { return (v || "").trim(); }

  /* ---------- 필터/정렬 ---------- */
  function groupPool() {
    return state.group === "전체" ? WORKS : WORKS.filter(function (w) { return w.구분 === state.group; });
  }
  function applyFilters() {
    var q = state.q.trim().toLowerCase();
    var out = groupPool().filter(function (w) {
      if (srcSet.size && !srcSet.has(w.출처구분)) return false;
      if (catSet.size && !catSet.has(w.카테고리)) return false;
      if (natSet.size && !natSet.has(natKey(w.국가))) return false;
      if (monthSet.size && !monthSet.has(w.공개월)) return false;
      if (q) {
        var hay = (w.제목 + " " + w.출연 + " " + w.감독 + " " + w.줄거리 + " " + w.장르 + " " + (w.해시태그 || "")).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    if (state.sortKey) {
      var k = state.sortKey, dir = state.sortDir;
      out = out.slice().sort(function (a, b) {
        var av = a[k] || "", bv = b[k] || "";
        var c = k === "정렬일" ? (av < bv ? -1 : av > bv ? 1 : 0) : String(av).localeCompare(String(bv), "ko");
        return c * dir;
      });
    }
    return out;
  }

  // 출처 표시 라벨(필터/태그) — 필터 매칭 값(출처구분)은 그대로 두고 보이는 글자만 정정한다.
  var SRC_LABEL = { "수집": "API 및 크롤링", "추가(검증반영)": "웹 검색" };
  function srcLabel(v) { return SRC_LABEL[v] || v; }

  /* ---------- 다중선택 (.ms — 평가 페이지와 동일 UX) ---------- */
  function buildPanel(panelId, values, labelFn) {
    document.getElementById(panelId).innerHTML = values.map(function (v) {
      var lbl = labelFn ? labelFn(v) : v;
      return '<label class="ms-opt"><input type="checkbox" value="' + esc(v) + '" /> ' + esc(lbl) + "</label>";
    }).join("");
  }
  // 현재 그룹 풀 기준으로 옵션 재구성(선택값 중 풀에 남은 것만 유지)
  function rebuildFilterOptions() {
    var pool = groupPool();
    buildPanel("ms-src-panel", uniqSorted(pool.map(function (w) { return w.출처구분; })), srcLabel);
    buildPanel("ms-cat-panel", uniqSorted(pool.map(function (w) { return w.카테고리; })));
    buildPanel("ms-nat-panel", uniqSorted(pool.map(function (w) { return natKey(w.국가); })));
    buildPanel("ms-month-panel", uniqSorted(pool.map(function (w) { return w.공개월; })));
    pruneToPanel("ms-src-panel", srcSet); pruneToPanel("ms-cat-panel", catSet);
    pruneToPanel("ms-nat-panel", natSet); pruneToPanel("ms-month-panel", monthSet);
    syncPanelChecks("ms-src", srcSet); syncPanelChecks("ms-cat", catSet);
    syncPanelChecks("ms-nat", natSet); syncPanelChecks("ms-month", monthSet);
  }
  function pruneToPanel(panelId, set) {
    var avail = {};
    [].slice.call(document.getElementById(panelId).querySelectorAll("input")).forEach(function (c) { avail[c.value] = 1; });
    Array.from(set).forEach(function (v) { if (!avail[v]) set.delete(v); });
  }
  function syncPanelChecks(boxId, set) {
    var box = document.getElementById(boxId);
    [].slice.call(box.querySelectorAll("input[type=checkbox]")).forEach(function (c) { c.checked = set.has(c.value); });
    msLabel(boxId, set);
  }
  function msLabel(boxId, set) {
    var btn = document.getElementById(boxId + "-btn");
    btn.textContent = set.size === 0 ? "전체" : (set.size + "개 선택");
    btn.classList.toggle("on", set.size > 0);
  }
  function wireMS(boxId, set) {
    var box = document.getElementById(boxId);
    var btn = document.getElementById(boxId + "-btn");
    var panel = document.getElementById(boxId + "-panel");
    function open(o) { panel.hidden = !o; btn.setAttribute("aria-expanded", o ? "true" : "false"); }
    btn.addEventListener("click", function (e) { e.stopPropagation(); open(panel.hidden); });
    panel.addEventListener("change", function (e) {
      var c = e.target; if (!c || c.type !== "checkbox") return;
      if (c.checked) set.add(c.value); else set.delete(c.value);
      msLabel(boxId, set); state.page = 1; render();
    });
    document.addEventListener("click", function (e) { if (!box.contains(e.target)) open(false); });
  }

  /* ---------- 그룹 탭 (.cat-tab — 다른 페이지와 동일) ---------- */
  function renderTabs() {
    var tabs = document.getElementById("grpTabs");
    var groups = DATA.groups || [];
    var html = '<button type="button" class="cat-tab' + (state.group === "전체" ? " active" : "") +
      '" data-g="전체">전체 <span class="cat-n">' + WORKS.length + "</span></button>";
    groups.forEach(function (g) {
      html += '<button type="button" class="cat-tab' + (state.group === g.key ? " active" : "") +
        '" data-g="' + esc(g.key) + '">' + esc(g.key) + ' <span class="cat-n">' + g.count + "</span></button>";
    });
    tabs.innerHTML = html;
    [].slice.call(tabs.querySelectorAll(".cat-tab")).forEach(function (b) {
      b.addEventListener("click", function () {
        state.group = b.getAttribute("data-g"); state.page = 1;
        rebuildFilterOptions(); renderTabs(); render();
      });
    });
  }

  /* ---------- 행 상세 (공통 .detail-grid / .kv / .cast-list) ---------- */
  function detailHTML(w) {
    var kv = "";
    function row(label, val) { if (val) kv += "<dt>" + esc(label) + "</dt><dd>" + esc(val) + "</dd>"; }
    row("카테고리", w.카테고리);
    row("국가·지역", w.국가);
    row("공개·개막", w.공개일);
    row("장르·유형", w.장르);
    row("편성·형태", w.편성);
    row("제작·주최", w.감독);
    row("출처", w.출처);
    if (w.URL) kv += '<dt>링크</dt><dd><a href="' + esc(w.URL) + '" target="_blank" rel="noopener">바로가기 ↗</a></dd>';

    var cast = String(w.출연 || "").split(/[,/·]| - /).map(function (s) { return s.trim(); }).filter(Boolean);
    var castHTML = cast.length
      ? '<div class="cast-list">' + cast.map(function (c) { return "<span>" + esc(c) + "</span>"; }).join("") + "</div>"
      : '<span class="muted-note">출연·참여 정보 없음</span>';

    var tags = String(w.해시태그 || "").split(/[\s,#]+/).filter(Boolean);
    var tagHTML = tags.length
      ? '<h4>해시태그</h4><div class="tag-chips">' + tags.map(function (t) { return "<span>#" + esc(t) + "</span>"; }).join("") + "</div>"
      : "";

    return '<div class="detail-inner"><div class="detail-grid">' +
      '<div><h4>줄거리·개요</h4><p class="synopsis">' + esc(w.줄거리 || "정보 없음") + "</p>" +
      "<h4>출연·참여·저자</h4>" + castHTML + tagHTML + "</div>" +
      '<div><h4>기본 정보</h4><dl class="kv">' + kv + "</dl></div>" +
      "</div></div>";
  }

  function renderSortArrows() {
    [].slice.call(document.querySelectorAll("[data-arw]")).forEach(function (el) {
      var k = el.getAttribute("data-arw");
      el.textContent = state.sortKey === k ? (state.sortDir === 1 ? "▲" : "▼") : "";
    });
  }

  /* ---------- 렌더 ---------- */
  function render() {
    var filtered = applyFilters();
    var total = filtered.length;
    var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (state.page > pages) state.page = pages;
    var start = (state.page - 1) * PAGE_SIZE;
    var slice = filtered.slice(start, start + PAGE_SIZE);

    var tbody = document.getElementById("rows");
    document.getElementById("empty").style.display = total ? "none" : "";

    var html = "";
    slice.forEach(function (w) {
      var id = w.번호;
      var isOpen = !!state.open[id];
      var isNew = w.출처구분 !== "수집";          // 출처: "웹 검색"(검증반영 보강분) ↔ "API 및 크롤링"(수집)
      var isFresh = w._diff === "new";            // 직전 배포에 없던 신규 항목(배포 원칙 2)
      var gcls = "gp g-" + (w.구분 || "기타");
      html += '<tr class="row' + (isOpen ? " open" : "") + '" data-id="' + id + '">' +
        '<td class="c-no">' + esc(w.번호) + "</td>" +
        '<td class="c-grp"><span class="' + esc(gcls) + '">' + esc(w.구분 || "-") + "</span></td>" +
        '<td class="c-cat t-cat">' + esc(w.카테고리 || "-") + "</td>" +
        '<td class="c-title t-title"><span class="chev">▶</span> ' + esc(w.제목 || "-") +
          (isFresh ? '<span class="new-badge" title="직전 배포에 없던 신규 항목">신규</span>' : "") + "</td>" +
        '<td class="c-nat">' + esc(w.국가 || "-") + "</td>" +
        '<td class="c-date">' + esc(w.공개일 || "-") + "</td>" +
        '<td class="c-genre">' + esc(w.장르 || "-") + "</td>" +
        '<td class="c-src"><span class="src-tag' + (isNew ? " new" : "") + '">' + (isNew ? "웹 검색" : "API 및 크롤링") + "</span></td>" +
        "</tr>";
      if (isOpen) html += '<tr class="detail"><td colspan="8">' + detailHTML(w) + "</td></tr>";
    });
    tbody.innerHTML = html;

    [].slice.call(tbody.querySelectorAll("tr.row")).forEach(function (tr) {
      tr.addEventListener("click", function () {
        var id = tr.getAttribute("data-id");
        state.open[id] = !state.open[id];
        render();
      });
    });

    document.getElementById("count").textContent = total.toLocaleString("ko") + "건";
    renderSortArrows();
    renderPager(total, pages, start, slice.length);
  }

  function renderPager(total, pages, start, shown) {
    var pager = document.getElementById("pager");
    if (total <= PAGE_SIZE) {
      pager.innerHTML = total ? '<span class="pg-info">전체 ' + total.toLocaleString("ko") + "건</span>" : "";
      return;
    }
    var from = total ? start + 1 : 0, to = start + shown;
    pager.innerHTML =
      '<button class="btn ghost" id="pgPrev" type="button"' + (state.page <= 1 ? " disabled" : "") + ">← 이전</button>" +
      '<span class="pg-info">' + from.toLocaleString("ko") + "–" + to.toLocaleString("ko") +
      " / 전체 " + total.toLocaleString("ko") + "건 · " + state.page + "/" + pages + " 쪽</span>" +
      '<button class="btn ghost" id="pgNext" type="button"' + (state.page >= pages ? " disabled" : "") + ">다음 →</button>";
    var prev = document.getElementById("pgPrev"), next = document.getElementById("pgNext");
    if (prev) prev.addEventListener("click", function () { if (state.page > 1) { state.page--; window.scrollTo(0, 0); render(); } });
    if (next) next.addEventListener("click", function () { if (state.page < pages) { state.page++; window.scrollTo(0, 0); render(); } });
  }

  /* ---------- CSV (현재 필터 결과 전체) ---------- */
  function exportCSV() {
    var cols = ["번호", "구분", "카테고리", "제목", "국가", "공개일", "장르", "편성", "출연", "감독", "해시태그", "줄거리", "URL", "출처", "출처구분", "직전배포대비"];
    var rows = [cols.join(",")];
    applyFilters().forEach(function (w) {
      rows.push(cols.map(function (c) {
        var v = c === "직전배포대비" ? (w._diff === "new" ? "신규" : "기존")
              : (w[c] == null ? "" : String(w[c]));
        if (/[",\n]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
        return v;
      }).join(","));
    });
    var blob = new Blob(["﻿" + rows.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "신규작품_롱리스트_" + (DATA.generated_at || "").replace(/[^\d]/g, "").slice(0, 8) + ".csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  function resetFilters() {
    srcSet.clear(); catSet.clear(); natSet.clear(); monthSet.clear();
    state.q = ""; state.sortKey = ""; state.sortDir = 1; state.page = 1;
    document.getElementById("f-q").value = "";
    rebuildFilterOptions(); render();
  }

  /* ---------- 부트 ---------- */
  function boot() {
    var s = DATA.summary || {};
    document.getElementById("meta").innerHTML =
      "생성 " + esc(DATA.generated_at || "-") + " · 총 <b>" + (s.total || WORKS.length).toLocaleString("ko") +
      "</b>건 (API 및 크롤링 " + (s.수집 || 0).toLocaleString("ko") + " + 웹 검색 " + (s.추가 || 0).toLocaleString("ko") + ")" +
      (s.신규 ? ' · <span class="new-badge" title="직전 배포에 없던 신규 항목">신규</span> ' + s.신규.toLocaleString("ko") + "건" : "");
    var foot = document.getElementById("genFoot");
    if (foot) foot.textContent = "신규 작품 롱리스트 · 입력 베이스 " + (DATA.base || "-") + " · 생성 " + (DATA.generated_at || "-");

    renderTabs();
    rebuildFilterOptions();
    wireMS("ms-src", srcSet); wireMS("ms-cat", catSet); wireMS("ms-nat", natSet); wireMS("ms-month", monthSet);
    render();

    var qIn = document.getElementById("f-q"), t;
    qIn.addEventListener("input", function () { clearTimeout(t); t = setTimeout(function () { state.q = qIn.value; state.page = 1; render(); }, 180); });
    [].slice.call(document.querySelectorAll("th.sortable")).forEach(function (th) {
      th.addEventListener("click", function () {
        var k = th.getAttribute("data-sort");
        if (state.sortKey === k) state.sortDir = -state.sortDir; else { state.sortKey = k; state.sortDir = 1; }
        state.page = 1; render();
      });
    });
    document.getElementById("resetBtn").addEventListener("click", resetFilters);
    document.getElementById("exportBtn").addEventListener("click", exportCSV);
  }

  /* ---------- 접근 암호 게이트 (다른 페이지와 동일 규약 · 세션 공유) ---------- */
  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) { h = ((h << 5) + h) + s.charCodeAt(i); h |= 0; } return String(h >>> 0); }
  var GATE_KEY = "lle_gate_v1";
  function setupGate() {
    var pw = CFG.SITE_PASSWORD || "";
    var gateBack = document.getElementById("gateBack");
    if (!pw) { gateBack.classList.add("hide"); boot(); return; }
    try { if (sessionStorage.getItem(GATE_KEY) === hash(pw)) { gateBack.classList.add("hide"); boot(); return; } } catch (e) {}
    var inp = document.getElementById("gatePw"), msg = document.getElementById("gateMsg");
    function tryGate() {
      if (inp.value === pw) {
        try { sessionStorage.setItem(GATE_KEY, hash(pw)); } catch (e) {}
        gateBack.classList.add("hide"); boot();
      } else { msg.textContent = "암호가 일치하지 않습니다."; inp.value = ""; inp.focus(); }
    }
    document.getElementById("gateBtn").addEventListener("click", tryGate);
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") tryGate(); });
    inp.focus();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setupGate);
  else setupGate();
})();
