/* =============================================================================
 *  신규 작품 롱리스트 (평가 X) — 렌더 로직
 *  데이터: window.NEWLIST (build_newlist.py 산출)
 *  - 그룹 탭 / 출처·카테고리·국가·공개월 필터 / 텍스트 검색 / 페이지네이션
 *  - 행 클릭 → 출연·제작·줄거리·링크 상세 펼침
 *  - 평가 점수는 다루지 않는다.
 * ========================================================================== */
(function () {
  "use strict";

  var esc = (window.Eval && window.Eval.esc) || function (s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  };
  var CFG = window.LLE_CONFIG || {};
  var DATA = window.NEWLIST || { works: [], groups: [], summary: {}, generated_at: "", window: {} };
  var WORKS = DATA.works || [];
  var PAGE_SIZE = 100;

  var state = { group: "전체", src: "", cat: "", nat: "", month: "", q: "", page: 1, open: {} };

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
    return groupPool().filter(function (w) {
      if (state.src && w.출처구분 !== state.src) return false;
      if (state.cat && w.카테고리 !== state.cat) return false;
      if (state.nat && natKey(w.국가) !== state.nat) return false;
      if (state.month && w.공개월 !== state.month) return false;
      if (q) {
        var hay = (w.제목 + " " + w.출연 + " " + w.감독 + " " + w.줄거리 + " " + w.장르).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
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
    fillSelect(fNat, nats.length <= 60 ? nats : nats.slice(0, 60), "전체");
    var months = uniqSorted(pool.map(function (w) { return w.공개월; }));
    fillSelect(fMonth, months, "전체");

    if ([].slice.call(fSrc.options).some(function (o) { return o.value === state.src; })) fSrc.value = state.src; else state.src = "";
    if ([].slice.call(fCat.options).some(function (o) { return o.value === state.cat; })) fCat.value = state.cat; else state.cat = "";
    if ([].slice.call(fNat.options).some(function (o) { return o.value === state.nat; })) fNat.value = state.nat; else state.nat = "";
    if ([].slice.call(fMonth.options).some(function (o) { return o.value === state.month; })) fMonth.value = state.month; else state.month = "";
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

    return '<div class="nl-detail"><div class="dgrid">' +
      '<div><h4>줄거리·개요</h4><p class="synopsis">' + esc(w.줄거리 || "정보 없음") + "</p>" +
      "<h4>출연·참여·저자</h4><p class=\"synopsis\">" + esc(w.출연 || "정보 없음") + "</p></div>" +
      '<div><h4>기본 정보</h4><dl class="kv">' + kv + "</dl></div>" +
      "</div></div>";
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
    if (!total) {
      tbody.innerHTML = "";
      empty.style.display = "";
    } else {
      empty.style.display = "none";
    }

    var html = "";
    slice.forEach(function (w) {
      var id = w.번호;
      var isOpen = !!state.open[id];
      var addBadge = w.출처구분 !== "수집" ? '<span class="add-badge">추가</span>' : "";
      var gcls = "g-" + (w.구분 || "기타");
      html += '<tr class="row' + (isOpen ? " open" : "") + '" data-id="' + id + '">' +
        '<td class="c-no">' + esc(w.번호) + "</td>" +
        '<td class="c-grp"><span class="grp-badge ' + esc(gcls) + '">' + esc(w.구분 || "-") + "</span></td>" +
        '<td class="c-cat">' + esc(w.카테고리 || "-") + "</td>" +
        '<td class="c-title"><span class="chev">▶</span>' + esc(w.제목 || "-") + addBadge + "</td>" +
        '<td class="c-nat">' + esc(w.국가 || "-") + "</td>" +
        '<td class="c-date">' + esc(w.공개일 || "-") + "</td>" +
        '<td class="c-genre">' + esc(w.장르 || "-") + "</td>" +
        '<td class="c-src">' + esc(w.출처구분) + "</td>" +
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
    var cols = ["번호", "구분", "카테고리", "제목", "국가", "공개일", "장르", "편성", "출연", "감독", "줄거리", "URL", "출처", "출처구분"];
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
    var s = DATA.summary || {};
    var win = DATA.window || {};
    var winTxt = "";
    if (win.스포츠 && win.스포츠.start) winTxt = " · 추가 윈도우 " + win.스포츠.start + " ~ " + win.스포츠.end;
    document.getElementById("meta").innerHTML =
      "생성 " + esc(DATA.generated_at || "-") + " · 총 <b>" + (s.total || WORKS.length).toLocaleString("ko") +
      "</b>건 (수집 " + (s.수집 || 0).toLocaleString("ko") + " + 추가 " + (s.추가 || 0) + ")" + esc(winTxt);
    var foot = document.getElementById("genFoot");
    if (foot) foot.textContent = "베이스: " + (DATA.base || "-") + " · 생성 " + (DATA.generated_at || "-");

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
    document.getElementById("resetBtn").addEventListener("click", function () {
      state.src = state.cat = state.nat = state.month = state.q = "";
      qIn.value = ""; state.page = 1;
      refreshFilterOptions(); render();
    });
    document.getElementById("exportBtn").addEventListener("click", exportCSV);
  }

  /* ---------- 접근 암호 게이트 (다른 페이지와 세션 공유) ---------- */
  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) { h = ((h << 5) + h) + s.charCodeAt(i); h |= 0; } return String(h >>> 0); }
  var GATE_KEY = "lle_gate_v1";
  (function setupGate() {
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
  })();
})();
