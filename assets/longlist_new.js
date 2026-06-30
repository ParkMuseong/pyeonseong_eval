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

  // 평가 숏리스트 올리기 상태
  var selSet = new Set();          // 선택된 작품(번호)
  var promotedSet = new Set();     // 이미 Supabase shortlist 에 올라간 작품(제목)
  var WORK_BY_ID = {};             // 번호 → work
  WORKS.forEach(function (w) { WORK_BY_ID[w.번호] = w; });

  /* ---------- Supabase (평가 페이지와 동일 설정 공유) ---------- */
  var SB = null, sbEnabled = false;
  if (CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase && window.supabase.createClient) {
    try { SB = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY); sbEnabled = true; } catch (e) { sbEnabled = false; }
  }

  // 롱리스트 구분 → 평가 페이지 카테고리 키 (숏리스트 데이터셋 key 와 일치시킴)
  function evalCategory(group) {
    switch (group) {
      case "영상": return "콘텐츠";
      case "공연": case "전시": return "공연전시";
      case "스포츠": return "스포츠";
      case "도서": return "도서";
      case "게임": return "게임";
      // 문화·축제 등 매핑되지 않은 그룹은 그룹명 그대로 전달 → 평가 페이지에서 해당 카테고리 탭 생성
      default: return group || "콘텐츠";
    }
  }
  // 날짜 문자열에서 시작일(선행 yyyy-mm[-dd]) 추출
  function startDate(s) {
    var m = String(s || "").match(/\d{4}[.\-]\d{1,2}(?:[.\-]\d{1,2})?/);
    return m ? m[0].replace(/\./g, "-") : "";
  }
  // 롱리스트 work → 평가 페이지 카테고리별 행(work) 형식으로 매핑
  function toEvalWork(w) {
    var cat = evalCategory(w.구분);
    var base = {
      콘텐츠명: (w.제목 || "").trim(),
      국가: w.국가 || "", 장르: w.장르 || "", 공개일: w.공개일 || "",
      해시태그: w.해시태그 || "", URL: w.URL || "", 출처: w.출처 || "",
      _promoted: true, _promoted_src: w.출처 || ""
    };
    if (cat === "공연전시") {
      base.분류 = w.카테고리 || ""; base.형태장르 = w.장르 || "";
      base.장소지역 = w.국가 || ""; base.기간 = w.공개일 || ""; base.시작일 = startDate(w.공개일);
      base.주최기획 = w.감독 || ""; base.출연작가 = w.출연 || ""; base.개요 = w.줄거리 || "";
    } else if (cat === "스포츠") {
      base.종목 = w.카테고리 || ""; base.대회유형 = w.장르 || "";
      base.개최지 = w.국가 || ""; base.시작일 = startDate(w.공개일) || w.공개일 || "";
      base["세부/리그"] = ""; base.중계 = w.편성 || ""; base.주최 = w.감독 || "";
      base.주요참가 = w.출연 || ""; base.개요 = w.줄거리 || "";
    } else if (cat === "도서") {
      // 롱리스트 도서 행: 카테고리=분류, 장르=장르형태, 편성=출간형태, 공개일=출간일,
      //                  감독=출판사, 출연=저자·역자, 줄거리=개요
      base.분류 = w.카테고리 || ""; base.장르형태 = w.장르 || "";
      base.출간형태 = w.편성 || ""; base.출간일 = startDate(w.공개일) || w.공개일 || "";
      base.출판사 = w.감독 || ""; base.원작국가 = w.국가 || "";
      base.저자역자 = w.출연 || ""; base.개요 = w.줄거리 || "";
    } else {  // 콘텐츠 / 게임 / 기타 — 동일 컬럼 구성
      base.유형 = w.카테고리 || ""; base.세부유형 = "";
      base.플랫폼 = w.편성 || ""; base.감독 = w.감독 || "";
      base.출연진 = w.출연 || ""; base.줄거리 = w.줄거리 || "";
    }
    return { category: cat, content_name: base.콘텐츠명, work: base };
  }

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
      var pid = (w.제목 || "").trim();
      var isProm = promotedSet.has(pid);
      var isSel = selSet.has(id);
      var selCell = isProm
        ? '<td class="c-sel"><button type="button" class="prom-chip" data-id="' + id + '" title="클릭하면 평가 숏리스트에서 내립니다">올림 ✕</button></td>'
        : '<td class="c-sel"><input type="checkbox" class="row-sel" data-id="' + id + '"' + (isSel ? " checked" : "") + " /></td>";
      html += '<tr class="row' + (isOpen ? " open" : "") + (isProm ? " promoted" : "") + '" data-id="' + id + '">' +
        selCell +
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
      if (isOpen) html += '<tr class="detail"><td colspan="9">' + detailHTML(w) + "</td></tr>";
    });
    tbody.innerHTML = html;

    [].slice.call(tbody.querySelectorAll("tr.row")).forEach(function (tr) {
      tr.addEventListener("click", function (e) {
        if (e.target.closest && e.target.closest(".c-sel")) return;  // 체크박스 칸 클릭은 상세 토글 제외
        var id = tr.getAttribute("data-id");
        state.open[id] = !state.open[id];
        render();
      });
    });
    // 행 선택 체크박스 (상세 토글과 분리)
    [].slice.call(tbody.querySelectorAll("input.row-sel")).forEach(function (cb) {
      cb.addEventListener("click", function (e) { e.stopPropagation(); });
      cb.addEventListener("change", function () {
        var id = +cb.getAttribute("data-id");
        if (cb.checked) selSet.add(id); else selSet.delete(id);
        syncSelAll(slice);
        updatePromoteBar();
      });
    });
    // '올림 ✕' 버튼 → 평가 숏리스트에서 내리기
    [].slice.call(tbody.querySelectorAll("button.prom-chip")).forEach(function (b) {
      b.addEventListener("click", function (e) { e.stopPropagation(); doDemote(+b.getAttribute("data-id")); });
    });
    syncSelAll(slice);
    updatePromoteBar();

    document.getElementById("count").textContent = total.toLocaleString("ko") + "건";
    renderSortArrows();
    renderPager(total, pages, start, slice.length);
  }

  // 현재 페이지의 '올리기 가능'(미등록) 행 기준으로 전체선택 체크 상태 동기화
  function syncSelAll(slice) {
    var box = document.getElementById("selAll");
    if (!box) return;
    var selectable = slice.filter(function (w) { return !promotedSet.has((w.제목 || "").trim()); });
    var chosen = selectable.filter(function (w) { return selSet.has(w.번호); });
    box.checked = selectable.length > 0 && chosen.length === selectable.length;
    box.indeterminate = chosen.length > 0 && chosen.length < selectable.length;
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

  /* ---------- 평가 숏리스트 올리기 ---------- */
  function setPbStatus(text, kind) {
    var el = document.getElementById("pbStatus");
    if (!el) return;
    el.textContent = text || "";
    el.className = "pb-status" + (kind ? " " + kind : "");
  }
  function updatePromoteBar() {
    var n = selSet.size;
    var cnt = document.getElementById("pbCount");
    var btn = document.getElementById("promoteBtn");
    if (cnt) cnt.textContent = n ? (n.toLocaleString("ko") + "건 선택됨") : "선택된 작품 없음";
    if (btn) btn.disabled = n === 0 || !sbEnabled;
  }
  // 이미 올라간 작품 목록을 Supabase 에서 가져와 표시(중복 등록 방지)
  function fetchPromoted() {
    if (!sbEnabled) return Promise.resolve();
    return SB.from("shortlist").select("content_name").then(function (res) {
      if (res.error) throw res.error;
      promotedSet = new Set((res.data || []).map(function (r) { return (r.content_name || "").trim(); }));
    }).catch(function (err) {
      console.warn("[shortlist] 목록 조회 실패:", err);
    });
  }
  function doPromote() {
    if (!sbEnabled) { setPbStatus("Supabase 미설정 · 올리기 불가", "err"); return; }
    var ids = Array.from(selSet);
    if (!ids.length) return;
    var rows = ids.map(function (id) {
      var w = WORK_BY_ID[id];
      if (!w) return null;
      var m = toEvalWork(w);
      if (!m.content_name) return null;
      return { content_name: m.content_name, category: m.category, work: m.work, promoted_by: "" };
    }).filter(Boolean);
    if (!rows.length) { setPbStatus("올릴 항목이 없습니다", "err"); return; }

    var btn = document.getElementById("promoteBtn");
    if (btn) btn.disabled = true;
    setPbStatus("올리는 중…");
    SB.from("shortlist").upsert(rows, { onConflict: "content_name" }).then(function (res) {
      if (res.error) throw res.error;
      rows.forEach(function (r) { promotedSet.add(r.content_name); });
      selSet.clear();
      setPbStatus(rows.length.toLocaleString("ko") + "건을 평가 숏리스트로 올렸습니다 ✓", "ok");
      render();
    }).catch(function (err) {
      console.error("[shortlist] 저장 실패:", err);
      setPbStatus("저장 실패 — " + (err.message || "네트워크/권한 확인"), "err");
      if (btn) btn.disabled = false;
    });
  }

  // 평가 숏리스트에서 내리기(해당 작품 행 삭제) — 점수 데이터(evaluations)는 별도 테이블이라 건드리지 않음
  function doDemote(id) {
    if (!sbEnabled) { setPbStatus("Supabase 미설정 · 내리기 불가", "err"); return; }
    var w = WORK_BY_ID[id];
    if (!w) return;
    var name = (w.제목 || "").trim();
    if (!name) return;
    if (!window.confirm('"' + name + '" 을(를) 평가 숏리스트에서 내릴까요?\n(롱리스트에는 그대로 남고, 평가 페이지에서 제외됩니다)')) return;
    setPbStatus("내리는 중…");
    SB.from("shortlist").delete().eq("content_name", name).then(function (res) {
      if (res.error) throw res.error;
      promotedSet.delete(name);
      selSet.delete(id);
      setPbStatus('"' + name + '" 을(를) 내렸습니다 ✓', "ok");
      render();
    }).catch(function (err) {
      console.error("[shortlist] 내리기 실패:", err);
      setPbStatus("내리기 실패 — " + (err.message || "네트워크/권한 확인"), "err");
    });
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

    // 올리기 바
    var selAll = document.getElementById("selAll");
    if (selAll) selAll.addEventListener("change", function () {
      var slice = applyFilters().slice((state.page - 1) * PAGE_SIZE, (state.page - 1) * PAGE_SIZE + PAGE_SIZE);
      slice.forEach(function (w) {
        if (promotedSet.has((w.제목 || "").trim())) return;
        if (selAll.checked) selSet.add(w.번호); else selSet.delete(w.번호);
      });
      render();
    });
    document.getElementById("selClearBtn").addEventListener("click", function () { selSet.clear(); setPbStatus(""); render(); });
    document.getElementById("promoteBtn").addEventListener("click", doPromote);

    // 이미 올라간 항목을 불러와 표시(없으면 무시) — Supabase 비활성 시 안내
    if (sbEnabled) { fetchPromoted().then(render); }
    else { setPbStatus("Supabase 미설정 · 로컬에서는 올리기 비활성", "err"); }
    updatePromoteBar();
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
