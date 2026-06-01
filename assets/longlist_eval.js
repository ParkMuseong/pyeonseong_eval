/* =============================================================================
 *  편성회의 Agent — 평가 롱리스트 확인 페이지 로직
 *  - 작품 1개 = 3행(사람1 입력 / 사람2 입력 / AI 읽기전용)
 *  - 평점(행별) = 4축 평균(2자리), 총점(작품별) = 사람1·사람2·AI 평점 평균
 *  - 5개 카테고리 AND 필터 / 콘텐츠명 펼치기 / CSV 내보내기 / localStorage 임시저장
 * ========================================================================== */
(function () {
  "use strict";

  var AXES = ["화제성", "독창성", "근접성", "영향성"];
  var FILTERS = ["유형"];            // 단일 선택 필터 (세부유형·장르 필터 제거)
  var countrySel = new Set();        // 국가 다중 선택
  var LS_KEY = "lle_eval_v1";

  var DATA = (window.LONGLIST_DATA || []).slice();
  var META = window.LONGLIST_META || {};
  var esc = (window.Eval && window.Eval.esc) || function (s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  };

  /* ---------- 사람 입력 상태 (콘텐츠명 기준) ---------- */
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem(LS_KEY) || "{}") || {}; } catch (e) { saved = {}; }

  // state[i] = { p1:{점수}, p2:{점수}, r1:{사유}, r2:{사유} }
  var state = DATA.map(function (w) {
    var key = w.콘텐츠명;
    var s = saved[key] || {};
    function pickScore(o) {
      var r = {};
      AXES.forEach(function (a) { r[a] = (o && o[a] != null && o[a] !== "") ? String(o[a]) : null; });
      return r;
    }
    function pickReason(o) {
      var r = {};
      AXES.forEach(function (a) { r[a] = (o && o[a] != null) ? String(o[a]) : ""; });
      return r;
    }
    return { p1: pickScore(s.p1), p2: pickScore(s.p2), r1: pickReason(s.r1), r2: pickReason(s.r2) };
  });

  function persist() {
    var out = {};
    DATA.forEach(function (w, i) {
      out[w.콘텐츠명] = { p1: state[i].p1, p2: state[i].p2, r1: state[i].r1, r2: state[i].r2 };
    });
    try { localStorage.setItem(LS_KEY, JSON.stringify(out)); } catch (e) {}
  }

  /* ---------- 평가자 로그인 (정적·로컬) ---------- */
  var USERS_KEY = "lle_users_v1";
  var SESSION_KEY = "lle_session_v1";
  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) { h = ((h << 5) + h) + s.charCodeAt(i); h |= 0; } return String(h >>> 0); }
  function getUsers() { try { return JSON.parse(localStorage.getItem(USERS_KEY) || "{}") || {}; } catch (e) { return {}; } }
  function saveUsers(u) { try { localStorage.setItem(USERS_KEY, JSON.stringify(u)); } catch (e) {} }
  var currentRole = localStorage.getItem(SESSION_KEY) || null; // 'p1' | 'p2' | null
  var serverNames = {}; // Supabase에서 가져온 평가자 이름 (p1/p2)
  function roleName(role) {
    var u = getUsers()[role];
    return (u && u.name) || serverNames[role] || (role === "p1" ? "평가자1" : "평가자2");
  }
  // 로그인/등록 시도 — 성공 시 null, 실패 시 에러 메시지
  function attemptLogin(role, name, pw) {
    var users = getUsers();
    var rec = users[role];
    if (!rec) {
      if (!name) return "이름을 입력하세요.";
      if (!pw) return "비밀번호를 입력하세요.";
      users[role] = { name: name, pw: hash(pw) };
      saveUsers(users);
    } else {
      if (hash(pw) !== rec.pw) return "비밀번호가 일치하지 않습니다.";
      if (name && name !== rec.name) { rec.name = name; saveUsers(users); }
    }
    currentRole = role;
    try { localStorage.setItem(SESSION_KEY, role); } catch (e) {}
    return null;
  }
  function logout() { currentRole = null; try { localStorage.removeItem(SESSION_KEY); } catch (e) {} }

  /* ---------- Supabase 공용 저장소 동기화 ---------- */
  var CFG = window.LLE_CONFIG || {};
  var SB = null, sbEnabled = false;
  if (CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase && window.supabase.createClient) {
    try { SB = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY); sbEnabled = true; } catch (e) { sbEnabled = false; }
  }
  var indexByName = {};
  DATA.forEach(function (w, i) { indexByName[w.콘텐츠명] = i; });

  function setSync(text, kind) {
    var el = document.getElementById("syncStatus");
    if (!el) return;
    el.textContent = text || "";
    el.className = "sync-status" + (kind ? " " + kind : "");
  }
  function hhmm() {
    var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
    return p(d.getHours()) + ":" + p(d.getMinutes());
  }

  // 서버의 모든 평가를 가져와 state에 병합 (서버 우선)
  function fetchAll() {
    if (!sbEnabled) return Promise.resolve(false);
    setSync("불러오는 중…");
    return SB.from("evaluations").select("*").then(function (res) {
      if (res.error) throw res.error;
      (res.data || []).forEach(function (row) {
        var i = indexByName[row.content_name];
        if (i == null) return;
        var person = row.evaluator;
        if (person !== "p1" && person !== "p2") return;
        var reasonKey = person === "p1" ? "r1" : "r2";
        var sc = row.scores || {}, rs = row.reasons || {};
        AXES.forEach(function (a) {
          if (sc[a] != null && sc[a] !== "") state[i][person][a] = String(sc[a]);
          if (rs[a] != null) state[i][reasonKey][a] = String(rs[a]);
        });
        if (row.evaluator_name) serverNames[person] = row.evaluator_name;
      });
      persist();
      setSync("동기화됨 " + hhmm(), "ok");
      return true;
    }).catch(function (err) {
      console.error("[Supabase] fetch 실패:", err);
      setSync("불러오기 실패 · 로컬 데이터 사용", "err");
      return false;
    });
  }

  // 현재 평가자의 한 작품 평가를 서버에 upsert
  function pushRow(i, person) {
    if (!sbEnabled) return;
    var reasonKey = person === "p1" ? "r1" : "r2";
    var row = {
      content_name: DATA[i].콘텐츠명,
      evaluator: person,
      evaluator_name: roleName(person),
      scores: state[i][person],
      reasons: state[i][reasonKey],
      updated_at: new Date().toISOString()
    };
    setSync("저장 중…");
    SB.from("evaluations").upsert(row, { onConflict: "content_name,evaluator" }).then(function (res) {
      if (res.error) { console.error("[Supabase] 저장 실패:", res.error); setSync("저장 실패 · 로컬 보관됨", "err"); }
      else setSync("저장됨 " + hhmm(), "ok");
    });
  }
  var pushTimers = {};
  function schedulePush(i, person) {
    if (!sbEnabled) return;
    var k = i + "|" + person;
    clearTimeout(pushTimers[k]);
    pushTimers[k] = setTimeout(function () { pushRow(i, person); }, 800);
  }

  /* ---------- 점수 계산 ---------- */
  function parseScore(v) {
    if (v == null || v === "") return { empty: true, valid: true, value: null };
    var n = Number(v);
    if (isNaN(n) || n < 0 || n > 10) return { empty: false, valid: false, value: null };
    return { empty: false, valid: true, value: n };
  }
  // 사람 행 평점: 4축 모두 유효+채워졌을 때만 평균
  function personRating(scores) {
    var sum = 0;
    for (var k = 0; k < AXES.length; k++) {
      var r = parseScore(scores[AXES[k]]);
      if (r.empty || !r.valid) return null;
      sum += r.value;
    }
    return Math.round((sum / AXES.length) * 100) / 100;
  }
  // AI 평점: 엑셀 평점 그대로(없으면 4축 평균)
  function aiRating(w) {
    if (w.평점 != null && w.평점 !== "") return Math.round(Number(w.평점) * 100) / 100;
    var sum = 0, cnt = 0;
    AXES.forEach(function (a) {
      if (w[a] != null && w[a] !== "") { sum += Number(w[a]); cnt++; }
    });
    return cnt ? Math.round((sum / cnt) * 100) / 100 : null;
  }
  // 총점: 사람1·사람2·AI 평점 중 존재하는 것들의 평균
  function totalOf(i) {
    var w = DATA[i];
    var vals = [personRating(state[i].p1), personRating(state[i].p2), aiRating(w)]
      .filter(function (v) { return v != null; });
    if (!vals.length) return null;
    var s = vals.reduce(function (a, b) { return a + b; }, 0);
    return Math.round((s / vals.length) * 100) / 100;
  }
  function fmt2(n) { return n == null ? "" : Number(n).toFixed(2); }

  /* ---------- 공개일 파싱 (공개월·주차) ---------- */
  // 시작일 기준 N월 M주 (주차 = floor((일-1)/7)+1) — 참조 이미지 주차 규칙과 일치
  function openInfo(s) {
    var m = String(s == null ? "" : s).match(/(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
    if (!m) return { key: "미정", label: "미정", sort: 999999 };
    var month = parseInt(m[2], 10);
    if (!m[3]) return { key: month + "-0", label: month + "월 (주 미정)", sort: month * 100 + 90 };
    var day = parseInt(m[3], 10);
    var wk = Math.floor((day - 1) / 7) + 1;
    return { key: month + "-" + wk, label: month + "월 " + wk + "주", sort: month * 100 + wk };
  }
  // 표 셀 표시용 압축형 (YYYY-MM-DD → M/D, 연도 제거)
  function openDisplay(s) {
    s = String(s == null ? "" : s) || "-";
    s = s.replace(/(\d{4})-(\d{1,2})-(\d{1,2})/g, function (_, y, mm, dd) { return parseInt(mm, 10) + "/" + parseInt(dd, 10); });
    s = s.replace(/(\d{4})-(\d{1,2})/g, function (_, y, mm) { return parseInt(mm, 10) + "월"; });
    return s;
  }

  /* ---------- DOM refs ---------- */
  var rowsEl = document.getElementById("rows");
  var emptyEl = document.getElementById("empty");
  var countEl = document.getElementById("count");

  var win = META.window || {};
  document.getElementById("meta").textContent =
    (win.start ? "평가기간 " + openDisplay(win.start) + "~" + openDisplay(win.end) + " · " : "") +
    "총 " + DATA.length + "개 작품 · 10점 척도";
  document.getElementById("genFoot").textContent =
    (META.generated_at ? "데이터 기준: " + META.generated_at + " · " : "") + "원본: " + (META.source || "");

  /* ---------- 필터 옵션 ---------- */
  FILTERS.forEach(function (f) {
    var sel = document.getElementById("f-" + f);
    var vals = Array.from(new Set(DATA.map(function (w) { return (w[f] || "").trim(); }).filter(Boolean)))
      .sort(function (a, b) { return a.localeCompare(b, "ko"); });
    var html = '<option value="">전체</option>';
    vals.forEach(function (v) { html += '<option value="' + esc(v) + '">' + esc(v) + "</option>"; });
    sel.innerHTML = html;
    sel.addEventListener("change", render);
  });

  // 국가 다중 선택 (체크박스 드롭다운)
  (function () {
    var btn = document.getElementById("ms-국가-btn");
    var panel = document.getElementById("ms-국가-panel");
    var box = document.getElementById("ms-국가");
    if (!btn || !panel) return;
    var vals = Array.from(new Set(DATA.map(function (w) { return (w.국가 || "").trim(); }).filter(Boolean)))
      .sort(function (a, b) { return a.localeCompare(b, "ko"); });
    panel.innerHTML = vals.map(function (v) {
      return '<label class="ms-opt"><input type="checkbox" value="' + esc(v) + '" /> ' + esc(v) + "</label>";
    }).join("");
    function syncLabel() {
      btn.textContent = countrySel.size === 0 ? "전체" : (countrySel.size + "개 선택");
      btn.classList.toggle("on", countrySel.size > 0);
    }
    function open(o) { panel.hidden = !o; btn.setAttribute("aria-expanded", o ? "true" : "false"); }
    btn.addEventListener("click", function (e) { e.stopPropagation(); open(panel.hidden); });
    panel.addEventListener("change", function (e) {
      var cb = e.target;
      if (!cb || cb.type !== "checkbox") return;
      if (cb.checked) countrySel.add(cb.value); else countrySel.delete(cb.value);
      syncLabel();
      render();
    });
    document.addEventListener("click", function (e) { if (box && !box.contains(e.target)) open(false); });
    syncLabel();
  })();

  // 공개월·주차 옵션 (데이터의 공개일에서 자동 생성, 월→주차 순 정렬)
  (function () {
    var map = {};
    DATA.forEach(function (w) { var o = openInfo(w.공개일); map[o.key] = { label: o.label, sort: o.sort }; });
    var entries = Object.keys(map)
      .map(function (k) { return { key: k, label: map[k].label, sort: map[k].sort }; })
      .sort(function (a, b) { return a.sort - b.sort; });
    var omHtml = '<option value="">전체</option>';
    entries.forEach(function (e) { omHtml += '<option value="' + esc(e.key) + '">' + esc(e.label) + "</option>"; });
    var omSel = document.getElementById("f-공개월");
    omSel.innerHTML = omHtml;
    omSel.addEventListener("change", render);
  })();

  // AI 평점 기준 슬라이더 (0 = 전체)
  (function () {
    var slider = document.getElementById("f-ai");
    var valEl = document.getElementById("f-ai-val");
    slider.addEventListener("input", function () {
      valEl.textContent = parseFloat(slider.value) === 0 ? "전체" : slider.value;
      render();
    });
  })();

  function currentFilters() {
    var f = {};
    FILTERS.forEach(function (k) { f[k] = document.getElementById("f-" + k).value; });
    return f;
  }
  function visibleIndices() {
    var f = currentFilters();
    var omv = document.getElementById("f-공개월").value;
    var aiMin = parseFloat(document.getElementById("f-ai").value) || 0;
    var out = [];
    DATA.forEach(function (w, i) {
      for (var k = 0; k < FILTERS.length; k++) {
        var key = FILTERS[k];
        if (f[key] && (w[key] || "").trim() !== f[key]) return;
      }
      if (countrySel.size && !countrySel.has((w.국가 || "").trim())) return;
      if (omv && openInfo(w.공개일).key !== omv) return;
      if (aiMin > 0) {
        var r = aiRating(w);
        if (r == null || r < aiMin) return;
      }
      out.push(i);
    });
    return out;
  }

  /* ---------- 렌더 ---------- */
  function badge(cls, txt) { return '<span class="ev-badge ' + cls + '">' + txt + "</span>"; }

  function inputCell(i, person, axis) {
    var v = state[i][person][axis];
    var dis = (currentRole === person) ? "" : " disabled";
    var ttl = dis ? (currentRole ? " title=\"" + roleName(currentRole) + "(으)로 로그인 — 본인 행만 입력 가능\"" : " title=\"로그인 후 입력 가능\"") : "";
    return '<td class="data"><input class="score-in" type="number" min="0" max="10" step="0.5" ' +
      'inputmode="decimal" data-i="' + i + '" data-p="' + person + '" data-a="' + axis + '"' + dis + ttl +
      ' value="' + (v == null ? "" : esc(v)) + '" /></td>';
  }
  function aiCell(w, axis) {
    var v = (w[axis] == null || w[axis] === "") ? "-" : w[axis];
    return '<td class="data ai-val">' + esc(v) + "</td>";
  }
  function rateCellHTML(i, person) {
    var r = personRating(state[i][person]);
    var cls = r == null ? "rating-cell empty" : "rating-cell";
    var b = badge(person, roleName(person));
    return '<td class="' + cls + '" id="rate-' + i + "-" + person + '">' + b +
      (r == null ? "—" : fmt2(r)) + "</td>";
  }

  // 총점 내림차순 비교(빈 총점은 맨 아래, 동점은 원본 순서 유지)
  function cmpTotal(a, b) {
    var ta = totalOf(a), tb = totalOf(b);
    if (ta == null && tb == null) return a - b;
    if (ta == null) return 1;
    if (tb == null) return -1;
    if (tb !== ta) return tb - ta;
    return a - b;
  }

  var rendered = [];   // 현재 화면에 그려진 작품 index 목록
  var groups = {};     // index -> [tr,...] (해당 작품의 행 묶음)

  // 포커스 유지한 채 DOM 노드만 이동해 총점순 재정렬
  function resort() {
    var order = rendered.slice().sort(cmpTotal);
    order.forEach(function (i) {
      var g = groups[i];
      if (g) g.forEach(function (tr) { rowsEl.appendChild(tr); });
    });
  }

  // 사람 평가자별 축별 평가 사유 입력 (상세 영역)
  function reasonsHTML(i) {
    function col(person, reasonKey, label) {
      var editable = (currentRole === person);
      var cls = "rz-col " + (editable ? "editable" : "locked");
      var tag = editable
        ? '<span class="lock-tag" style="border-color:var(--green);color:var(--green)">입력 중</span>'
        : '<span class="lock-tag">' + (currentRole ? "잠금" : "로그인 필요") + "</span>";
      var rows = AXES.map(function (a) {
        var v = state[i][reasonKey][a] || "";
        return '<div class="rz-row"><label>' + a + ' 사유</label>' +
          '<textarea class="reason-in" data-i="' + i + '" data-r="' + reasonKey + '" data-a="' + a + '"' +
          (editable ? "" : " disabled") +
          ' placeholder="' + (editable ? a + " 점수를 그렇게 준 이유" : "") + '">' + esc(v) + "</textarea></div>";
      }).join("");
      return '<div class="' + cls + '"><div class="rz-head">' + esc(label) + tag + "</div>" + rows + "</div>";
    }
    return '<div class="human-reasons"><h4>사람 평가 사유 (축별 입력)</h4><div class="rz-cols">' +
      col("p1", "r1", roleName("p1")) +
      col("p2", "r2", roleName("p2")) +
      "</div></div>";
  }

  // AI 평가사유 "[화제성 N] ... [독창성 N] ... [종합] ..." → 항목별 블록으로 분리
  function reasonBlocks(text) {
    text = String(text == null ? "" : text).trim();
    if (!text) return "";
    var re = /\[([^\]]+)\]\s*([\s\S]*?)(?=\s*\[[^\]]+\]|$)/g;
    var m, out = "", any = false;
    while ((m = re.exec(text))) {
      var label = m[1].trim();
      var body = m[2].trim();
      if (!label && !body) continue;
      any = true;
      out += '<div class="rsn-sec"><div class="rsn-label">[ ' + esc(label) + ' ]</div>' +
        '<div class="rsn-body">' + esc(body) + "</div></div>";
    }
    return any ? out : '<div class="rsn-body">' + esc(text) + "</div>";
  }

  function render() {
    var idxs = visibleIndices().sort(cmpTotal);
    rendered = idxs.slice();
    var html = "";
    idxs.forEach(function (i) {
      var w = DATA[i];
      var tot = totalOf(i);
      var aiR = aiRating(w);

      // 행1: 사람1 (병합 셀 포함)
      html += '<tr class="r-p1" data-work="' + i + '">';
      html += '<td class="merged cat" rowspan="3">' + esc(w.유형 || "-") + "</td>";
      html += '<td class="merged cat" rowspan="3">' + esc(w.세부유형 || "-") + "</td>";
      html += '<td class="merged name" rowspan="3" data-i="' + i + '"><span class="chev">▶</span>' + esc(w.콘텐츠명 || "-") + "</td>";
      html += '<td class="merged genre" rowspan="3">' + esc(w.장르 || "-") + "</td>";
      html += '<td class="merged opendate" rowspan="3">' + esc(openDisplay(w.공개일)) + "</td>";
      html += '<td class="merged platform" rowspan="3">' + esc(w.플랫폼 || "-") + "</td>";
      AXES.forEach(function (a) { html += inputCell(i, "p1", a); });
      html += rateCellHTML(i, "p1");
      html += '<td class="merged total-cell" rowspan="3" id="total-' + i + '">' + (tot == null ? "—" : fmt2(tot)) + "</td>";
      html += "</tr>";

      // 행2: 사람2
      html += '<tr class="r-p2" data-work="' + i + '">';
      AXES.forEach(function (a) { html += inputCell(i, "p2", a); });
      html += rateCellHTML(i, "p2");
      html += "</tr>";

      // 행3: AI (읽기전용)
      html += '<tr class="r-ai" data-work="' + i + '">';
      AXES.forEach(function (a) { html += aiCell(w, a); });
      html += '<td class="rating-cell" data-ai="1">' + badge("ai", "AI") + (aiR == null ? "—" : fmt2(aiR)) + "</td>";
      html += "</tr>";

      // 상세 펼침 행
      html += '<tr class="detail-row" id="detail-' + i + '" data-work="' + i + '" style="display:none"><td colspan="12">' +
        '<div class="lle-detail"><dl class="dl">' +
        (w.순위 ? "<dt>AI 순위</dt><dd>" + esc(w.순위) + "위</dd>" : "") +
        "<dt>감독</dt><dd>" + esc(w.감독 || "-") + "</dd>" +
        "<dt>출연진</dt><dd>" + esc(w.출연진 || "-") + "</dd>" +
        "<dt>줄거리</dt><dd>" + esc(w.줄거리 || "-") + "</dd>" +
        "</dl>" +
        (w.평가사유 ? '<div class="reason-box"><div class="rsn-title">AI 평가사유</div>' + reasonBlocks(w.평가사유) + "</div>" : "") +
        reasonsHTML(i) +
        "</div></td></tr>";
    });

    rowsEl.innerHTML = html;

    // 작품별 행 묶음(p1·p2·ai·detail) 노드 매핑 — 재정렬 시 이동에 사용
    groups = {};
    Array.prototype.forEach.call(rowsEl.querySelectorAll("tr[data-work]"), function (tr) {
      var i = +tr.getAttribute("data-work");
      (groups[i] = groups[i] || []).push(tr);
    });

    emptyEl.style.display = idxs.length ? "none" : "block";
    countEl.textContent = idxs.length + " / " + DATA.length + " 작품";
  }

  /* ---------- 이벤트 (위임) ---------- */
  rowsEl.addEventListener("input", function (e) {
    var el = e.target;
    if (!el.classList) return;

    // 평가 사유 textarea
    if (el.classList.contains("reason-in")) {
      var ri = +el.getAttribute("data-i");
      var rk = el.getAttribute("data-r");
      var ra = el.getAttribute("data-a");
      state[ri][rk][ra] = el.value;
      persist();
      schedulePush(ri, rk === "r1" ? "p1" : "p2");
      return;
    }

    if (!el.classList.contains("score-in")) return;
    var i = +el.getAttribute("data-i");
    var p = el.getAttribute("data-p");
    var a = el.getAttribute("data-a");
    var pr = parseScore(el.value);
    el.classList.toggle("invalid", !pr.valid);
    state[i][p][a] = (el.value === "") ? null : el.value;
    persist();
    schedulePush(i, p);

    // 해당 평가자 평점 셀 갱신
    var rcell = document.getElementById("rate-" + i + "-" + p);
    if (rcell) {
      var r = personRating(state[i][p]);
      rcell.className = r == null ? "rating-cell empty" : "rating-cell";
      rcell.innerHTML = badge(p, roleName(p)) + (r == null ? "—" : fmt2(r));
    }
    // 총점 갱신
    var tcell = document.getElementById("total-" + i);
    if (tcell) { var t = totalOf(i); tcell.textContent = t == null ? "—" : fmt2(t); }
    // ※ 재정렬은 입력 확정 시점(엔터/포커스 이동)에 수행 — 타이핑 중 노드 이동으로
    //    두 자리수("10") 입력이 끊기는 문제를 피하기 위함.
  });

  // 입력 확정(포커스 이동/blur) 시 총점순 재정렬
  rowsEl.addEventListener("change", function (e) {
    if (e.target.classList && e.target.classList.contains("score-in")) resort();
  });

  // 엔터 → 재정렬 후 다음 입력칸으로 이동
  rowsEl.addEventListener("keydown", function (e) {
    var el = e.target;
    if (!el.classList || !el.classList.contains("score-in")) return;
    if (e.key !== "Enter") return;
    e.preventDefault();
    resort();
    var inputs = Array.prototype.slice.call(rowsEl.querySelectorAll("input.score-in"));
    var idx = inputs.indexOf(el);
    if (idx >= 0 && idx < inputs.length - 1) {
      var nxt = inputs[idx + 1];
      nxt.focus();
      nxt.select();
    } else {
      el.blur();
    }
  });

  rowsEl.addEventListener("click", function (e) {
    var nameCell = e.target.closest ? e.target.closest("td.name") : null;
    if (!nameCell) return;
    var i = nameCell.getAttribute("data-i");
    var dr = document.getElementById("detail-" + i);
    if (!dr) return;
    var open = dr.style.display !== "none";
    dr.style.display = open ? "none" : "table-row";
    nameCell.classList.toggle("open", !open);
  });

  document.getElementById("resetBtn").addEventListener("click", function () {
    FILTERS.forEach(function (f) { document.getElementById("f-" + f).value = ""; });
    // 국가 다중선택 초기화
    countrySel.clear();
    var p = document.getElementById("ms-국가-panel");
    if (p) Array.prototype.forEach.call(p.querySelectorAll("input[type=checkbox]"), function (c) { c.checked = false; });
    var b = document.getElementById("ms-국가-btn");
    if (b) { b.textContent = "전체"; b.classList.remove("on"); }
    document.getElementById("f-공개월").value = "";
    document.getElementById("f-ai").value = "0";
    document.getElementById("f-ai-val").textContent = "전체";
    render();
  });

  /* ---------- CSV 내보내기 ---------- */
  function csvCell(v) {
    var s = (v == null) ? "" : String(v);
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function exportCSV() {
    var idxs = visibleIndices();
    var head = ["순위", "콘텐츠명", "유형", "세부유형", "장르", "국가", "공개일", "공개월주차", "플랫폼",
      "평가자", "화제성", "독창성", "근접성", "영향성", "평점", "총점",
      "화제성사유", "독창성사유", "근접성사유", "영향성사유",
      "감독", "출연진", "줄거리", "AI평가사유"];
    var lines = [head.map(csvCell).join(",")];

    idxs.forEach(function (i) {
      var w = DATA[i];
      var tot = totalOf(i);
      var ompub = openInfo(w.공개일).label;
      var rows = [
        { who: roleName("p1"), sc: state[i].p1, rate: personRating(state[i].p1), rsn: state[i].r1 },
        { who: roleName("p2"), sc: state[i].p2, rate: personRating(state[i].p2), rsn: state[i].r2 },
        { who: "AI", sc: { 화제성: w.화제성, 독창성: w.독창성, 근접성: w.근접성, 영향성: w.영향성 }, rate: aiRating(w), rsn: null }
      ];
      rows.forEach(function (rw) {
        var rsn = rw.rsn || {};
        var line = [
          w.순위, w.콘텐츠명, w.유형, w.세부유형, w.장르, w.국가, w.공개일, ompub, w.플랫폼,
          rw.who,
          rw.sc.화제성, rw.sc.독창성, rw.sc.근접성, rw.sc.영향성,
          (rw.rate == null ? "" : fmt2(rw.rate)),
          (tot == null ? "" : fmt2(tot)),
          rsn.화제성 || "", rsn.독창성 || "", rsn.근접성 || "", rsn.영향성 || "",
          w.감독, w.출연진, w.줄거리, w.평가사유
        ];
        lines.push(line.map(csvCell).join(","));
      });
    });

    var csv = "﻿" + lines.join("\r\n");
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var d = new Date();
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    var fname = "평가롱리스트_확인_" + d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + ".csv";
    var a = document.createElement("a");
    a.href = url; a.download = fname;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  document.getElementById("exportBtn").addEventListener("click", exportCSV);

  /* ---------- 로그인 UI 연결 ---------- */
  var loginBack = document.getElementById("loginBack");
  var selectedRole = currentRole || "p1";

  function updateAuthBar() {
    var bar = document.getElementById("authbar");
    var st = document.getElementById("authStatus");
    var btn = document.getElementById("authBtn");
    if (currentRole) {
      bar.classList.add("on");
      st.innerHTML = "로그인: <b>" + esc(roleName(currentRole)) + "</b> · " +
        (currentRole === "p1" ? "평가자1" : "평가자2") + " 행만 입력 가능";
      btn.textContent = "로그아웃";
    } else {
      bar.classList.remove("on");
      st.textContent = "로그인되지 않음 · 읽기 전용";
      btn.textContent = "평가자 로그인";
    }
  }

  function selectRole(role) {
    selectedRole = role;
    Array.prototype.forEach.call(document.querySelectorAll(".role-tab"), function (t) {
      t.classList.toggle("active", t.getAttribute("data-role") === role);
    });
    var u = getUsers()[role];
    document.getElementById("loginName").value = u ? u.name : "";
    document.getElementById("loginPw").placeholder = u ? "비밀번호" : "새 비밀번호 (등록)";
  }
  function openLogin() {
    selectRole(selectedRole);
    document.getElementById("loginPw").value = "";
    document.getElementById("loginMsg").textContent = "";
    loginBack.classList.add("show");
    document.getElementById("loginName").focus();
  }
  function closeLogin() { loginBack.classList.remove("show"); }
  function doLogin() {
    var name = document.getElementById("loginName").value.trim();
    var pw = document.getElementById("loginPw").value;
    var err = attemptLogin(selectedRole, name, pw);
    if (err) { document.getElementById("loginMsg").textContent = err; return; }
    closeLogin();
    updateAuthBar();
    render();
  }

  Array.prototype.forEach.call(document.querySelectorAll(".role-tab"), function (t) {
    t.addEventListener("click", function () {
      selectRole(t.getAttribute("data-role"));
      document.getElementById("loginMsg").textContent = "";
    });
  });
  document.getElementById("loginBtn").addEventListener("click", doLogin);
  document.getElementById("loginPw").addEventListener("keydown", function (e) { if (e.key === "Enter") doLogin(); });
  document.getElementById("loginName").addEventListener("keydown", function (e) { if (e.key === "Enter") document.getElementById("loginPw").focus(); });
  document.getElementById("loginClose").addEventListener("click", closeLogin);
  document.getElementById("loginSkip").addEventListener("click", closeLogin);
  loginBack.addEventListener("click", function (e) { if (e.target === loginBack) closeLogin(); });
  document.getElementById("authBtn").addEventListener("click", function () {
    if (currentRole) { logout(); updateAuthBar(); render(); }
    else openLogin();
  });

  // 수동 동기화 버튼
  document.getElementById("syncBtn").addEventListener("click", function () {
    if (!sbEnabled) { setSync("Supabase 미설정 · 로컬 전용", "err"); return; }
    fetchAll().then(function () { render(); });
  });

  /* ---------- boot (게이트 통과 후 실행) ---------- */
  function boot() {
    updateAuthBar();
    render();
    if (sbEnabled) { fetchAll().then(function () { render(); }); }
    else { setSync("로컬 전용 · Supabase 미설정"); }
    if (!currentRole) openLogin();
  }

  /* ---------- 접근 암호 게이트 ---------- */
  var GATE_KEY = "lle_gate_v1";
  (function setupGate() {
    var pw = CFG.SITE_PASSWORD || "";
    var gateBack = document.getElementById("gateBack");
    if (!pw) { gateBack.classList.add("hide"); boot(); return; }
    try {
      if (sessionStorage.getItem(GATE_KEY) === hash(pw)) { gateBack.classList.add("hide"); boot(); return; }
    } catch (e) {}
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
