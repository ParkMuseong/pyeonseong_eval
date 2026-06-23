/* =============================================================================
 *  신규 작품 롱리스트 (리뉴얼) — 렌더 로직 (자급자족, 외부 의존 없음)
 *  데이터: window.LONGLIST (build_longlist.py 산출)
 *  - 통계 스트립 / 그룹 탭 / 출처·카테고리·국가·공개월 필터 / 검색
 *  - 제목·공개일 정렬 / 페이지네이션 / 행 클릭 상세 / CSV 내보내기
 *  - 평가 점수는 다루지 않는다.
 * ========================================================================== */
(function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  var DATA = window.LONGLIST || { works: [], groups: [], summary: {}, generated_at: "", window: {} };
  var WORKS = DATA.works || [];
  var PAGE_SIZE = 100;

  var state = {
    group: "전체", src: "", cat: "", nat: "", month: "", q: "",
    sortKey: "", sortDir: 1, page: 1, open: {}
  };

  /* ---------- 유틸 ---------- */
  function uniqSorted(arr) {
    var seen = {}, out = [];
    arr.forEach(function (v) { v = (v || "").trim(); if (v && !seen[v]) { seen[v] = 1; out.push(v); } });
    return out.sort(function (a, b) { return a.localeCompare(b, "ko"); });
  }
  function fillSelect(sel, values, allLabel) {
    sel.innerHTML = '<option value="">' + esc(allLabel) + "</option>" +
      values.map(function (v) { return '<option value="' + esc(v) + '">' + esc(v) + "</option>"; }).join("");
  }
  function natKey(v) { return (v || "").trim(); }

  /* ---------- 필터링 ---------- */
  function groupPool() {
    return state.group === "전체" ? WORKS : WORKS.filter(function (w) { return w.구분 === state.group; });
  }
  function applyFilters() {
    var q = state.q.trim().toLowerCase();
    var out = groupPool().filter(function (w) {
      if (state.src && w.출처구분 !== state.src) return false;
      if (state.cat && w.카테고리 !== state.cat) return false;
      if (state.nat && natKey(w.국가) !== state.nat) return false;
      if (state.month && w.공개월 !== state.month) return false;
      if (q) {
        var hay = (w.제목 + " " + w.출연 + " " + w.감독 + " " + w.줄거리 + " " +
          w.장르 + " " + (w.해시태그 || "")).toLowerCase();
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

  /* ---------- 종속 필터 옵션 갱신 ---------- */
  function refreshFilterOptions() {
    var pool = groupPool();
    var fSrc = document.getElementById("f-src");
    var fCat = document.getElementById("f-cat");
    var fNat = document.getElementById("f-nat");
    var fMonth = document.getElementById("f-month");

    fillSelect(fSrc, uniqSorted(pool.map(function (w) { return w.출처구분; })), "전체");
    fillSelect(fCat, uniqSorted(pool.map(function (w) { return w.카테고리; })), "전체 카테고리");
    var nats = uniqSorted(pool.map(function (w) { return natKey(w.국가); }));
    fillSelect(fNat, nats.length <= 80 ? nats : nats.slice(0, 80), "전체");
    fillSelect(fMonth, uniqSorted(pool.map(function (w) { return w.공개월; })), "전체");

    function keep(sel, key) {
      if ([].slice.call(sel.options).some(function (o) { return o.value === state[key]; })) sel.value = state[key];
      else state[key] = "";
    }
    keep(fSrc, "src"); keep(fCat, "cat"); keep(fNat, "nat"); keep(fMonth, "month");
  }

  /* ---------- 통계 스트립 ---------- */
  function renderStats() {
    var s = DATA.summary || {};
    var el = document.getElementById("statstrip");
    var items = [
      { n: (s.total || WORKS.length), l: "전체 후보" },
      { n: (s.수집 || 0), l: "필터링 통과(4~13주)" },
      { n: (s.추가 || 0), l: "신규(검증반영)", add: true },
      { n: (DATA.groups || []).length, l: "그룹" }
    ];
    el.innerHTML = items.map(function (it) {
      return '<div class="stat"><div class="n' + (it.add ? " add" : "") + '">' +
        Number(it.n).toLocaleString("ko") + '</div><div class="l">' + esc(it.l) + "</div></div>";
    }).join("");
  }

  /* ---------- 그룹 탭 ---------- */
  function renderTabs() {
    var tabs = document.getElementById("grpTabs");
    var groups = DATA.groups || [];
    var total = WORKS.length;
    var html = '<button type="button" class="cat-tab' + (state.group === "전체" ? " active" : "") +
      '" data-g="전체">전체 <span class="cat-n">' + total + "</span></button>";
    groups.forEach(function (g) {
      html += '<button type="button" class="cat-tab' + (state.group === g.key ? " active" : "") +
        '" data-g="' + esc(g.key) + '">' + esc(g.key) + ' <span class="cat-n">' + g.count + "</span></button>";
    });
    tabs.innerHTML = html;
    [].slice.call(tabs.querySelectorAll(".cat-tab")).forEach(function (b) {
      b.addEventListener("click", function () {
        state.group = b.getAttribute("data-g");
        state.page = 1;
        refreshFilterOptions();
        renderTabs();
        render();
      });
    });
  }

  /* ---------- 행 상세 ---------- */
  function detailHTML(w) {
    var kv = "";
    function row(label, val) {
      if (!val) return;
      kv += "<dt>" + esc(label) + "</dt><dd>" + esc(val) + "</dd>";
    }
    row("카테고리", w.카테고리);
    row("국가·지역", w.국가);
    row("공개·개막", w.공개일);
    row("장르·유형", w.장르);
    row("편성·형태", w.편성);
    row("제작·주최", w.감독);
    row("출처", w.출처);
    if (w.URL) kv += '<dt>링크</dt><dd><a href="' + esc(w.URL) + '" target="_blank" rel="noopener">' + esc(w.URL) + "</a></dd>";

    var tags = "";
    if (w.해시태그) {
      var arr = String(w.해시태그).split(/[\s,#]+/).filter(Boolean);
      if (arr.length) tags = '<div class="tags">' + arr.map(function (t) {
        return '<span class="tag-chip">#' + esc(t) + "</span>";
      }).join("") + "</div>";
    }

    return '<div class="nl-detail"><div class="dgrid">' +
      '<div><h4>줄거리·개요</h4><p class="synopsis">' + esc(w.줄거리 || "정보 없음") + "</p>" +
      '<h4>출연·참여·저자</h4><p class="synopsis">' + esc(w.출연 || "정보 없음") + "</p>" +
      (tags ? "<h4>해시태그</h4>" + tags : "") + "</div>" +
      '<div><h4>기본 정보</h4><dl class="kv">' + kv + "</dl></div>" +
      "</div></div>";
  }

  /* ---------- 정렬 화살표 ---------- */
  function renderSortArrows() {
    [].slice.call(document.querySelectorAll("[data-arw]")).forEach(function (el) {
      var k = el.getAttribute("data-arw");
      el.textContent = state.sortKey === k ? (state.sortDir === 1 ? "▲" : "▼") : "";
    });
  }

  /* ---------- 렌더 ---------- */
  var filtered = [];
  function render() {
    filtered = applyFilters();
    var total = filtered.length;
    var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (state.page > pages) state.page = pages;
    var start = (state.page - 1) * PAGE_SIZE;
    var slice = filtered.slice(start, start + PAGE_SIZE);

    var tbody = document.getElementById("rows");
    var empty = document.getElementById("empty");
    empty.style.display = total ? "none" : "";

    var html = "";
    slice.forEach(function (w) {
      var id = w.번호;
      var isOpen = !!state.open[id];
      var addBadge = w.출처구분 !== "수집" ? '<span class="add-badge">신규</span>' : "";
      var isAdd = w.출처구분 !== "수집";
      var gcls = "g-" + (w.구분 || "기타");
      html += '<tr class="row' + (isOpen ? " open" : "") + '" data-id="' + id + '">' +
        '<td class="c-no">' + esc(w.번호) + "</td>" +
        '<td class="c-grp"><span class="grp-badge ' + esc(gcls) + '">' + esc(w.구분 || "-") + "</span></td>" +
        '<td class="c-cat">' + esc(w.카테고리 || "-") + "</td>" +
        '<td class="c-title"><span class="chev">▶</span>' + esc(w.제목 || "-") + addBadge + "</td>" +
        '<td class="c-nat">' + esc(w.국가 || "-") + "</td>" +
        '<td class="c-date">' + esc(w.공개일 || "-") + "</td>" +
        '<td class="c-genre">' + esc(w.장르 || "-") + "</td>" +
        '<td class="c-src"><span class="src-tag' + (isAdd ? " add" : "") + '">' + esc(isAdd ? "신규" : "수집") + "</span></td>" +
        "</tr>";
      if (isOpen) {
        html += '<tr class="detail" data-for="' + id + '"><td colspan="8">' + detailHTML(w) + "</td></tr>";
      }
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
    var from = total ? start + 1 : 0;
    var to = start + shown;
    pager.innerHTML =
      '<button id="pgPrev" type="button"' + (state.page <= 1 ? " disabled" : "") + ">← 이전</button>" +
      '<span class="pg-info">' + from.toLocaleString("ko") + "–" + to.toLocaleString("ko") +
      " / 전체 " + total.toLocaleString("ko") + "건 (" + state.page + "/" + pages + " 쪽)</span>" +
      '<button id="pgNext" type="button"' + (state.page >= pages ? " disabled" : "") + ">다음 →</button>";
    var prev = document.getElementById("pgPrev"), next = document.getElementById("pgNext");
    if (prev) prev.addEventListener("click", function () { if (state.page > 1) { state.page--; window.scrollTo(0, 0); render(); } });
    if (next) next.addEventListener("click", function () { if (state.page < pages) { state.page++; window.scrollTo(0, 0); render(); } });
  }

  /* ---------- CSV 내보내기 (현재 필터 결과 전체) ---------- */
  function exportCSV() {
    var cols = ["번호", "구분", "카테고리", "제목", "국가", "공개일", "장르", "편성", "출연", "감독", "해시태그", "줄거리", "URL", "출처", "출처구분"];
    var rows = [cols.join(",")];
    applyFilters().forEach(function (w) {
      rows.push(cols.map(function (c) {
        var v = w[c] == null ? "" : String(w[c]);
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

  /* ---------- 부트 ---------- */
  function boot() {
    var gen = "생성 " + (DATA.generated_at || "-");
    var topEl = document.getElementById("genTop");
    if (topEl) topEl.textContent = gen;
    var foot = document.getElementById("genFoot");
    if (foot) foot.textContent = "베이스: " + (DATA.base || "-") + " · " + gen + " · build_longlist.py";

    renderStats();
    renderTabs();
    refreshFilterOptions();
    render();

    document.getElementById("f-src").addEventListener("change", function () { state.src = this.value; state.page = 1; render(); });
    document.getElementById("f-cat").addEventListener("change", function () { state.cat = this.value; state.page = 1; render(); });
    document.getElementById("f-nat").addEventListener("change", function () { state.nat = this.value; state.page = 1; render(); });
    document.getElementById("f-month").addEventListener("change", function () { state.month = this.value; state.page = 1; render(); });
    var qIn = document.getElementById("f-q");
    var t;
    qIn.addEventListener("input", function () { clearTimeout(t); t = setTimeout(function () { state.q = qIn.value; state.page = 1; render(); }, 180); });

    [].slice.call(document.querySelectorAll("th.sortable")).forEach(function (th) {
      th.addEventListener("click", function () {
        var k = th.getAttribute("data-sort");
        if (state.sortKey === k) state.sortDir = -state.sortDir;
        else { state.sortKey = k; state.sortDir = 1; }
        state.page = 1; render();
      });
    });

    document.getElementById("resetBtn").addEventListener("click", function () {
      state.src = state.cat = state.nat = state.month = state.q = "";
      state.sortKey = ""; state.sortDir = 1;
      qIn.value = ""; state.page = 1;
      refreshFilterOptions(); render();
    });
    document.getElementById("exportBtn").addEventListener("click", exportCSV);
  }

  /* ---------- 접근 암호 게이트 (다른 페이지와 동일 규약 · 세션 공유) ---------- */
  var CFG = window.LLE_CONFIG || {};
  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) { h = ((h << 5) + h) + s.charCodeAt(i); h |= 0; } return String(h >>> 0); }
  var GATE_KEY = "lle_gate_v1";
  function setupGate() {
    var pw = CFG.SITE_PASSWORD || "";
    var gateBack = document.getElementById("gateBack");
    if (!pw) { gateBack.classList.add("hide"); boot(); return; }
    try { if (sessionStorage.getItem(GATE_KEY) === hash(pw)) { gateBack.classList.add("hide"); boot(); return; } } catch (e) {}
    var inp = document.getElementById("gatePw");
    var msg = document.getElementById("gateMsg");
    function tryGate() {
      if (inp.value === pw) {
        try { sessionStorage.setItem(GATE_KEY, hash(pw)); } catch (e) {}
        gateBack.classList.add("hide");
        boot();
      } else { msg.textContent = "암호가 일치하지 않습니다."; inp.value = ""; inp.focus(); }
    }
    document.getElementById("gateBtn").addEventListener("click", tryGate);
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") tryGate(); });
    inp.focus();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setupGate);
  else setupGate();
})();
