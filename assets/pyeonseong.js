/* =============================================================================
 *  편성회의 Agent — 월간 편성표 페이지 로직 (평가 롱리스트 연동)
 *  · 데이터 출처: longlist_data.js(window.LONGLIST_DATASETS) + 평가 입력값
 *    - 평가 입력값은 평가 롱리스트 페이지와 동일한 공통 저장소(localStorage "lle_eval_v2")
 *    - Supabase 가 설정돼 있으면 다른 기기의 점수도 불러와 병합(읽기 전용)
 *  · 각 작품의 시작일(공개일 또는 기간 시작) → n월 m주 로 분류
 *  · n월 m주 안에서 총점(AI + 평가자1·2 평균) 내림차순 → 1·2·3등, 나머지는 대안
 *  · 평가 페이지에서 점수를 바꾸면 이 페이지의 순위도 함께 바뀐다.
 * ========================================================================== */
(function () {
  "use strict";

  var CFG = window.LLE_CONFIG || {};
  var DATASETS = window.LONGLIST_DATASETS || [];
  var AXES = ["화제성", "독창성", "근접성", "영향성"];
  var SAVE_KEY = "lle_eval_v2";   // 평가 롱리스트 페이지와 공유하는 공통 저장소

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) { h = ((h << 5) + h) + s.charCodeAt(i); h |= 0; } return String(h >>> 0); }
  function fmt2(n) { return n == null ? "—" : Number(n).toFixed(2); }

  /* 공개일/기간 압축 표기 (YYYY-MM-DD → M/D) */
  function openDisplay(s) {
    s = String(s == null ? "" : s) || "-";
    s = s.replace(/(\d{4})-(\d{1,2})-(\d{1,2})/g, function (_, y, m, d) { return parseInt(m, 10) + "/" + parseInt(d, 10); });
    s = s.replace(/(\d{4})-(\d{1,2})/g, function (_, y, m) { return parseInt(m, 10) + "월"; });
    return s;
  }

  /* 시작일 → 월·주차 (평가 페이지 openInfo 와 동일 규칙: 주 = floor((일-1)/7)+1) */
  function openInfo(s) {
    var m = String(s == null ? "" : s).match(/(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
    if (!m) return { month: null, week: null, monthLabel: "미정", weekLabel: "주 미정", sort: 9999990 };
    var month = parseInt(m[2], 10);
    if (!m[3]) return { month: month, week: null, monthLabel: month + "월", weekLabel: "주 미정", sort: month * 100 + 90 };
    var day = parseInt(m[3], 10);
    var wk = Math.floor((day - 1) / 7) + 1;
    return { month: month, week: wk, monthLabel: month + "월", weekLabel: wk + "주", sort: month * 100 + wk };
  }

  /* ---------- 점수 계산 (평가 롱리스트와 동일) ---------- */
  function parseScore(v) {
    if (v == null || v === "") return null;
    var n = Number(v);
    if (isNaN(n) || n < 0 || n > 10) return null;
    return n;
  }
  function personRating(scores) {
    if (!scores) return null;
    var sum = 0;
    for (var k = 0; k < AXES.length; k++) {
      var r = parseScore(scores[AXES[k]]);
      if (r == null) return null;   // 4축 모두 입력돼야 평점 산출
      sum += r;
    }
    return Math.round((sum / AXES.length) * 100) / 100;
  }
  function aiRating(w) {
    if (w.평점 != null && w.평점 !== "") return Math.round(Number(w.평점) * 100) / 100;
    var sum = 0, cnt = 0;
    AXES.forEach(function (a) { if (w[a] != null && w[a] !== "") { sum += Number(w[a]); cnt++; } });
    return cnt ? Math.round((sum / cnt) * 100) / 100 : null;
  }

  /* ---------- 평가 입력값 저장소 (localStorage + Supabase) ---------- */
  var SAVED = {};
  function loadLocal() { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "{}") || {}; } catch (e) { return {}; } }
  function ratingsOf(name, w) {
    var sc = SAVED[name] || {};
    var p1 = personRating(sc.p1), p2 = personRating(sc.p2), ai = aiRating(w);
    var vals = [p1, p2, ai].filter(function (v) { return v != null; });
    var total = vals.length ? Math.round((vals.reduce(function (a, b) { return a + b; }, 0) / vals.length) * 100) / 100 : null;
    return { p1: p1, p2: p2, ai: ai, total: total };
  }

  function setSync(text, kind) {
    var el = document.getElementById("syncStatus");
    if (!el) return;
    el.textContent = text || "";
    el.className = "sync-status" + (kind ? " " + kind : "");
  }
  function hhmm() { var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; }; return p(d.getHours()) + ":" + p(d.getMinutes()); }

  function supaMerge(done) {
    if (!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase && window.supabase.createClient)) { setSync("로컬 전용"); return done(false); }
    var SB;
    try { SB = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY); } catch (e) { setSync("동기화 불가", "err"); return done(false); }
    setSync("불러오는 중…");
    SB.from("evaluations").select("*").then(function (res) {
      if (res.error) throw res.error;
      (res.data || []).forEach(function (row) {
        var name = row.content_name, person = row.evaluator;
        if (person !== "p1" && person !== "p2") return;
        if (!SAVED[name]) SAVED[name] = {};
        if (row.scores) SAVED[name][person] = row.scores;   // 서버 점수를 우선 반영(타 기기 동기화)
      });
      setSync("동기화됨 " + hhmm(), "ok");
      done(true);
    }).catch(function (err) {
      console.error("[Supabase] fetch 실패:", err);
      setSync("불러오기 실패 · 로컬 사용", "err");
      done(false);
    });
  }

  /* ---------- 작품 평탄화 (3개 카테고리 → 단일 목록) ---------- */
  function fieldLabel(ds) { return ds.key === "콘텐츠" ? "영상" : ds.label; }
  function catLabel(ds, w) { return (ds.key === "콘텐츠" ? (w.유형 || "") : (w.분류 || "")) || "-"; }
  function dateVal(ds, w) { return w[ds.opendateField || "공개일"] || ""; }

  var FLAT = [];
  DATASETS.forEach(function (ds) {
    (ds.works || []).forEach(function (w) {
      var dv = dateVal(ds, w);
      FLAT.push({ name: w.콘텐츠명, 분야: fieldLabel(ds), 카테고리: catLabel(ds, w), date: dv, oi: openInfo(dv), w: w });
    });
  });

  /* ---------- 월→주차 그룹화 ---------- */
  function buildMonths() {
    var map = {}, order = [];
    FLAT.forEach(function (it) {
      var ml = it.oi.monthLabel;
      if (!map[ml]) { map[ml] = { label: ml, monthSort: (it.oi.month == null ? 9999 : it.oi.month), weeks: {} }; order.push(ml); }
      var mo = map[ml];
      var wl = it.oi.weekLabel;
      if (!mo.weeks[wl]) { mo.weeks[wl] = { label: wl, weekSort: (it.oi.week == null ? 99 : it.oi.week), items: [] }; }
      mo.weeks[wl].items.push(it);
    });
    order.sort(function (a, b) { return map[a].monthSort - map[b].monthSort; });
    return { map: map, order: order };
  }

  /* ---------- 평가사유 [축] 블록 파싱 ---------- */
  function reasonBlocks(text) {
    text = String(text == null ? "" : text).trim();
    if (!text) return "";
    var re = /\[([^\]]+)\]\s*([\s\S]*?)(?=\s*\[[^\]]+\]|$)/g, m, out = "", any = false;
    while ((m = re.exec(text))) {
      var label = m[1].trim(), body = m[2].trim();
      if (!label && !body) continue;
      any = true;
      out += '<span class="rsn-sec"><b>[' + esc(label) + "]</b> " + esc(body) + "</span> ";
    }
    return any ? out : esc(text);
  }

  /* ---------- 주차 기간(달력 기준) 표기 ---------- */
  function weekPeriod(monthNum, weekNum) {
    if (monthNum == null || weekNum == null) return "";
    var s = (weekNum - 1) * 7 + 1, e = weekNum * 7;
    return monthNum + "/" + s + " ~ " + monthNum + "/" + e;
  }

  var monthTabsEl = document.getElementById("monthTabs");
  var weeksEl = document.getElementById("weeks");
  var metaEl = null;
  var MONTHS = { map: {}, order: [] };
  var current = null;

  function renderMonth(label) {
    current = label;
    Array.prototype.forEach.call(monthTabsEl.querySelectorAll(".month-tab"), function (b) {
      b.classList.toggle("active", b.getAttribute("data-m") === label);
    });
    var mo = MONTHS.map[label];
    if (!mo) { weeksEl.innerHTML = '<div class="empty">표시할 편성 데이터가 없습니다.</div>'; return; }

    // 주차 정렬
    var weeks = Object.keys(mo.weeks).map(function (k) { return mo.weeks[k]; })
      .sort(function (a, b) { return a.weekSort - b.weekSort; });

    var totalItems = 0, html = "";
    weeks.forEach(function (wk) {
      // 총점 계산 후 내림차순(빈 총점은 뒤로)
      var ranked = wk.items.map(function (it) { return { it: it, r: ratingsOf(it.name, it.w) }; })
        .sort(function (a, b) {
          var ta = a.r.total, tb = b.r.total;
          if (ta == null && tb == null) return a.it.name.localeCompare(b.it.name, "ko");
          if (ta == null) return 1;
          if (tb == null) return -1;
          if (tb !== ta) return tb - ta;
          return a.it.name.localeCompare(b.it.name, "ko");
        });
      totalItems += ranked.length;

      var period = weekPeriod(mo.monthSort < 9999 ? mo.monthSort : null, wk.weekSort < 99 ? wk.weekSort : null);
      html += '<div class="week"><div class="week-head"><span class="w">' + esc(label + " " + wk.label) +
        '</span><span class="period">' + esc(period) + "</span></div>";

      ranked.forEach(function (row, idx) {
        var it = row.it, r = row.r;
        var isAlt = idx >= 3;
        var rank = isAlt ? "대안" : String(idx + 1) + "등";
        var w = it.w;
        html += '<div class="pick' + (isAlt ? " alt" : "") + '">' +
          '<span class="rank">' + esc(rank) + "</span>" +
          '<div class="body">' +
            '<div class="line1">' +
              '<span class="title">' + esc(it.name) + "</span>" +
              '<span class="field">' + esc(it.분야) + "</span>" +
              '<span class="cat">' + esc(it.카테고리) + "</span>" +
              '<span class="date">' + esc(openDisplay(it.date)) + "</span>" +
              '<span class="score">총점 ' + fmt2(r.total) + "</span>" +
            "</div>" +
            '<div class="score-break">AI ' + fmt2(r.ai) + " · 평가자1 " + fmt2(r.p1) + " · 평가자2 " + fmt2(r.p2) + "</div>" +
            (w.평가사유 ? '<p class="reason">' + reasonBlocks(w.평가사유) + "</p>" : "") +
          "</div>" +
        "</div>";
      });
      html += "</div>";
    });

    weeksEl.innerHTML = html || '<div class="empty">표시할 편성 데이터가 없습니다.</div>';
    if (metaEl) metaEl.textContent = label + " · " + totalItems + "개 항목";
  }

  function renderAll() {
    MONTHS = buildMonths();
    if (!MONTHS.order.length) {
      weeksEl.innerHTML = '<div class="empty">평가 데이터가 없습니다. build_eval_from_verified.py 로 longlist_data.js 를 생성했는지 확인하세요.</div>';
      return;
    }
    var tabHtml = "";
    MONTHS.order.forEach(function (m) { tabHtml += '<button type="button" class="month-tab" data-m="' + esc(m) + '">' + esc(m) + "</button>"; });
    monthTabsEl.innerHTML = tabHtml + '<span class="pyeon-meta" id="pyeonMeta"></span>';
    metaEl = document.getElementById("pyeonMeta");

    var nowM = (new Date().getMonth() + 1) + "월";
    var def = (current && MONTHS.map[current]) ? current
      : (MONTHS.order.indexOf(nowM) >= 0 ? nowM : MONTHS.order[0]);
    renderMonth(def);
  }

  function boot() {
    monthTabsEl.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest(".month-tab") : null;
      if (b) renderMonth(b.getAttribute("data-m"));
    });

    SAVED = loadLocal();
    renderAll();   // 로컬 기준 즉시 표시
    document.getElementById("genFoot").textContent =
      ((DATASETS[0] && DATASETS[0].meta && DATASETS[0].meta.generated_at) ? "데이터 기준: " + DATASETS[0].meta.generated_at + " · " : "") +
      "원본: 평가 롱리스트 연동";

    supaMerge(function () { renderAll(); });   // 서버 점수 병합 후 갱신

    // 다른 탭/창에서 평가 점수가 바뀌면 즉시 반영
    window.addEventListener("storage", function (e) {
      if (e.key === SAVE_KEY) { SAVED = loadLocal(); renderAll(); }
    });
    // 페이지 복귀 시 로컬 최신화
    window.addEventListener("focus", function () { SAVED = loadLocal(); renderAll(); });
  }

  /* ---------- 접근 암호 게이트 (평가 페이지와 세션 공유) ---------- */
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
