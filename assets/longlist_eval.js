/* =============================================================================
 *  편성회의 Agent — 평가 숏리스트 확인 페이지 로직 (멀티 카테고리)
 *  - 카테고리 탭: 콘텐츠 / 공연·전시 / 스포츠 (window.LONGLIST_DATASETS)
 *  - 작품 1개 = 3행(사람1 입력 / 사람2 입력 / AI 읽기전용)
 *  - 평점(행별) = 4축 평균(2자리), 총점(작품별) = 사람1·사람2·AI 평점 평균
 *  - 카테고리별 컬럼/상세필드/필터를 동적 구성, 입력은 카테고리별로 분리 저장
 * ========================================================================== */
(function () {
  "use strict";

  var AXES = ["화제성", "독창성", "근접성", "영향성"];
  var esc = (window.Eval && window.Eval.esc) || function (s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  };

  /* ---------- 데이터셋 (구버전 호환: 단일 LONGLIST_DATA 도 수용) ----------
   * BASE_DATASETS = 정적 빌드 카테고리(영상/공연전시/스포츠).
   * 여기에 Supabase shortlist(롱리스트에서 올린 작품)를 병합한 뒤,
   * assembleDatasets() 가 통합('전체') 탭을 앞에 붙여 최종 DATASETS 를 만든다. */
  var BASE_DATASETS = window.LONGLIST_DATASETS;
  if (!BASE_DATASETS || !BASE_DATASETS.length) {
    BASE_DATASETS = [{
      key: "콘텐츠", label: "영상", nameField: "콘텐츠명",
      country: true, opendate: true, opendateField: "공개일", filterField: "유형",
      cols: [
        { f: "유형", label: "유형" }, { f: "세부유형", label: "세부유형" },
        { f: "콘텐츠명", label: "콘텐츠명" }, { f: "장르", label: "장르" },
        { f: "공개일", label: "공개일" }, { f: "플랫폼", label: "플랫폼" }
      ],
      detail: [{ f: "감독", label: "감독" }, { f: "출연진", label: "출연진" }, { f: "줄거리", label: "줄거리" }],
      meta: window.LONGLIST_META || {}, works: (window.LONGLIST_DATA || []).slice()
    }];
  }
  var DATASETS = [];   // assembleDatasets() 에서 채움

  // 게임 카테고리 — 정적 빌드에는 없으므로 shortlist 에 게임이 올라오면 동적 생성
  function gameTemplate() {
    return {
      key: "게임", label: "게임", nameField: "콘텐츠명",
      country: true, opendate: true, opendateField: "공개일", filterField: "유형",
      cols: [
        { f: "유형", label: "유형" }, { f: "콘텐츠명", label: "콘텐츠명" },
        { f: "장르", label: "장르" }, { f: "공개일", label: "공개일" }, { f: "플랫폼", label: "플랫폼·기종" }
      ],
      detail: [
        { f: "감독", label: "제작·배급" }, { f: "출연진", label: "주요 인물·성우" },
        { f: "줄거리", label: "개요" }, { f: "해시태그", label: "해시태그" }
      ],
      meta: { generated_at: "", source: "롱리스트에서 올린 작품", count: 0, window: {} },
      works: []
    };
  }

  /* ---------- 통합(전체) 데이터셋 합성 ----------
   * 영상(콘텐츠)·공연전시·스포츠를 한 탭에 모은다.
   * 각 작품의 카테고리·유형/분류·시작일(공개일 또는 기간 시작)을 통합 컬럼으로 노출.
   * 입력 상태는 콘텐츠명 기준 공통 저장소를 쓰므로 개별 탭과 자동 연동된다. */
  function buildAllDataset(dss) {
    var works = [];
    dss.forEach(function (ds) {
      var odf = ds.opendateField || (ds.opendate ? "공개일" : null);
      ds.works.forEach(function (w) {
        var copy = {};
        for (var k in w) { if (Object.prototype.hasOwnProperty.call(w, k)) copy[k] = w[k]; }
        copy.카테고리 = ds.label;
        copy.유형분류 = w.유형 || w.분류 || w.종목 || "";
        // 기간("2026-05-19 ~ 2026-10-25")·공개일 모두 선행 날짜를 시작일로 사용
        var od = odf ? String(w[odf] || "") : "";
        var dm = od.match(/\d{4}-\d{1,2}(?:-\d{1,2})?/);
        copy.시작일 = dm ? dm[0] : od;
        works.push(copy);
      });
    });
    return {
      key: "전체", label: "전체", nameField: "콘텐츠명",
      country: false, opendate: true, opendateField: "시작일", filterField: "카테고리",
      cols: [
        { f: "카테고리", label: "카테고리" }, { f: "유형분류", label: "유형·분류" },
        { f: "콘텐츠명", label: "콘텐츠명" }, { f: "시작일", label: "시작일" }
      ],
      detail: [
        { f: "장르", label: "장르" }, { f: "플랫폼", label: "플랫폼" },
        { f: "감독", label: "감독" }, { f: "출연진", label: "출연진" }, { f: "줄거리", label: "줄거리" },
        { f: "장소지역", label: "장소·지역" }, { f: "개최지", label: "개최지" }, { f: "기간", label: "기간" },
        { f: "주최기획", label: "주최·기획" }, { f: "주최", label: "주최" },
        { f: "출연작가", label: "출연·작가" }, { f: "참가선수", label: "참가·선수" }, { f: "개요", label: "개요" }
      ],
      meta: {
        generated_at: (dss[0] && dss[0].meta && dss[0].meta.generated_at) || "",
        source: "전체 통합", count: works.length, window: {}
      },
      works: works
    };
  }
  // 최종 DATASETS 조립: 카테고리가 2개 이상이면 통합('전체') 탭을 맨 앞에 붙인다.
  function assembleDatasets() {
    DATASETS = (BASE_DATASETS.length > 1)
      ? [buildAllDataset(BASE_DATASETS)].concat(BASE_DATASETS)
      : BASE_DATASETS.slice();
  }

  // shortlist 행을 카테고리별 BASE_DATASETS 에 병합(콘텐츠명 중복 제거, 게임은 동적 생성)
  function mergeShortlist(rows) {
    if (!rows || !rows.length) return;
    var byKey = {};
    BASE_DATASETS.forEach(function (ds) { byKey[ds.key] = ds; });
    rows.forEach(function (r) {
      var cat = r.category || "콘텐츠";
      var ds = byKey[cat];
      if (!ds) {
        if (cat === "게임") { ds = gameTemplate(); byKey[cat] = ds; BASE_DATASETS.push(ds); }
        else { ds = byKey["콘텐츠"] || BASE_DATASETS[0]; }
      }
      if (!ds) return;
      var name = String(r.content_name || (r.work && r.work.콘텐츠명) || "").trim();
      if (!name) return;
      var dup = ds.works.some(function (w) { return String(w.콘텐츠명 || "").trim() === name; });
      if (dup) return;
      var w = r.work || {};
      w.콘텐츠명 = name;
      w._promoted = true;
      ds.works.push(w);
    });
  }

  function fetchShortlist() {
    if (!sbEnabled) return Promise.resolve([]);
    return SB.from("shortlist").select("*").then(function (res) {
      if (res.error) throw res.error;
      return res.data || [];
    }).catch(function (err) { console.warn("[shortlist] 불러오기 실패:", err); return []; });
  }

  /* ---------- 현재 데이터셋 상태 (loadDataset 에서 교체) ---------- */
  var activeIdx = 0;
  var DS, DATA, META, COLS, DETAIL, NAMEFIELD, FILTERFIELD, OPENDATEFIELD, HAS_COUNTRY, HAS_OPENDATE, COLSPAN;
  // 입력 상태는 카테고리와 무관하게 콘텐츠명 기준 공통 저장소에 보관한다.
  // (Supabase 도 content_name 기준이라, 전체↔개별 탭이 같은 작품을 자동 공유한다)
  var LS_KEY = "lle_eval_v2";
  var saved = {}, state = [], indexByName = {}, boundKey = {};
  var countrySel = new Set();   // 국가 다중 선택 (콘텐츠 전용)

  /* ---------- 평가자 로그인 (정적·로컬, 카테고리 공통) ---------- */
  var USERS_KEY = "lle_users_v1";
  var SESSION_KEY = "lle_session_v1";
  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) { h = ((h << 5) + h) + s.charCodeAt(i); h |= 0; } return String(h >>> 0); }
  function getUsers() { try { return JSON.parse(localStorage.getItem(USERS_KEY) || "{}") || {}; } catch (e) { return {}; } }
  function saveUsers(u) { try { localStorage.setItem(USERS_KEY, JSON.stringify(u)); } catch (e) {} }
  var currentRole = localStorage.getItem(SESSION_KEY) || null; // 'p1' | 'p2' | null
  var serverNames = {};

  /* ---------- 이름 토큰 매칭 (build_eval_from_verified.py 의 신규/기존 판정과 동일 규칙) ----------
     배치마다 제목이 연도·회차·라운드·스폰서·괄호부제·띄어쓰기 차이로 약간씩 바뀌어
     콘텐츠명 정확일치가 깨질 수 있다. 핵심 토큰(연도/숫자/스폰서/일반용어 제거)으로
     동일 작품을 다시 이어 붙여 평가자 입력이 끊기지 않게 한다. */
  var NAME_ALIAS = [["에스포츠", "e스포츠"], ["epl", "프리미어리그"], ["프리미어 리그", "프리미어리그"]];
  var NAME_STOP = {};
  ("개막 챔피언십 선수권 본선 정규시즌 토너먼트 플레이오프 결승 준결승 종목 시즌 " +
   "페이즈 그랑프리 gp 인비테이셔널 미드시즌 신한 sol bc카드 한경 aig 카드").split(" ")
    .forEach(function (t) { if (t) NAME_STOP[t] = 1; });
  function coreTokens(name) {
    var s = String(name || "").toLowerCase();
    NAME_ALIAS.forEach(function (p) { s = s.split(p[0]).join(p[1]); });
    s = s.replace(/[()（）〈〉《》\[\]「」『』·\-—–\/,~:.'"‘’“”]/g, " ");
    var out = {};
    s.split(/\s+/).forEach(function (t) {
      if (!t) return;
      if (/^20\d\d(-\d\d)?$/.test(t)) return;   // 연도(2026, 2026-27)
      if (/^제?\d+회$/.test(t)) return;          // 제48회 / 16회
      if (/^\d+강$/.test(t)) return;             // 16강
      if (/^\d+차전$/.test(t)) return;           // 1차전
      if (/^\d+$/.test(t)) return;               // 순수 숫자
      if (/^[a-z]$/.test(t)) return;             // 단일 알파벳
      if (NAME_STOP[t]) return;
      out[t] = 1;
    });
    return Object.keys(out);
  }
  function tokenMatch(cur, hist) {
    if (!cur.length || !hist.length) return false;
    var hs = {}; hist.forEach(function (t) { hs[t] = 1; });
    var inter = cur.filter(function (t) { return hs[t]; });
    if (inter.length >= 2) return true;          // 공통 토큰 2개 이상 → 동일
    if (inter.length >= 1) {                      // 공통 1개 + 한쪽이 부분집합 → 동일
      var cs = {}; cur.forEach(function (t) { cs[t] = 1; });
      var curSub = cur.every(function (t) { return hs[t]; });
      var histSub = hist.every(function (t) { return cs[t]; });
      if (curSub || histSub) return true;
    }
    return false;
  }
  function roleName(role) {
    var u = getUsers()[role];
    return (u && u.name) || serverNames[role] || (role === "p1" ? "평가자1" : "평가자2");
  }
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

  /* ---------- Supabase 공용 저장소 ---------- */
  var CFG = window.LLE_CONFIG || {};
  var SB = null, sbEnabled = false;
  if (CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase && window.supabase.createClient) {
    try { SB = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY); sbEnabled = true; } catch (e) { sbEnabled = false; }
  }
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
  // 서버의 모든 평가를 가져와 현재 카테고리 state 에 병합 (이름이 현 데이터셋에 있는 행만)
  function fetchAll() {
    if (!sbEnabled) return Promise.resolve(false);
    setSync("불러오는 중…");
    return SB.from("evaluations").select("*").then(function (res) {
      if (res.error) throw res.error;
      var rows = (res.data || []).filter(function (row) {
        return row.evaluator === "p1" || row.evaluator === "p2";
      });
      function applyRow(i, row) {
        var person = row.evaluator;
        var reasonKey = person === "p1" ? "r1" : "r2";
        var sc = row.scores || {}, rs = row.reasons || {};
        AXES.forEach(function (a) {
          if (sc[a] != null && sc[a] !== "") state[i][person][a] = String(sc[a]);
          if (rs[a] != null) state[i][reasonKey][a] = String(rs[a]);
        });
        if (row.evaluator_name) serverNames[person] = row.evaluator_name;
      }
      // 1) 콘텐츠명 정확 일치 (기존 동작). 못 맞춘 행은 orphan 으로 모은다.
      var exactBound = {}, orphans = [];
      rows.forEach(function (row) {
        var i = indexByName[row.content_name];
        if (i == null) { orphans.push(row); return; }
        applyRow(i, row);
        exactBound[i + "|" + row.evaluator] = true;
      });
      // 2) 퍼지 재연결 — 이름이 약간 바뀐 행을 토큰 매칭으로 복구한다.
      //    안전장치: 현재 목록에서 '유일하게' 매칭될 때만, 그리고 같은 평가자의
      //    정확 일치(최신 입력)가 이미 있으면 덮어쓰지 않는다(오연결·역행 방지).
      var workTokens = DATA.map(function (w) { return coreTokens(w.콘텐츠명); });
      var reconnected = 0;
      orphans.forEach(function (row) {
        var ct = coreTokens(row.content_name);
        if (!ct.length) return;
        var hit = -1, multi = false;
        for (var i = 0; i < DATA.length; i++) {
          if (tokenMatch(ct, workTokens[i])) {
            if (hit === -1) hit = i; else { multi = true; break; }
          }
        }
        if (hit === -1 || multi) return;                    // 못 찾음 또는 모호 → 건너뜀
        if (exactBound[hit + "|" + row.evaluator]) return;  // 최신 정확 입력 우선
        applyRow(hit, row);
        boundKey[hit] = boundKey[hit] || {};
        boundKey[hit][row.evaluator] = row.content_name;    // 저장은 원래 행으로 보내 중복 방지
        reconnected++;
      });
      persist();
      setSync("동기화됨 " + hhmm() + (reconnected ? " · 이름변경 재연결 " + reconnected : ""), "ok");
      if (reconnected) console.info("[재연결] 이름이 바뀐 평가입력 " + reconnected + "건을 토큰 매칭으로 복구했습니다.");
      return true;
    }).catch(function (err) {
      console.error("[Supabase] fetch 실패:", err);
      setSync("불러오기 실패 · 로컬 데이터 사용", "err");
      return false;
    });
  }
  function pushRow(i, person) {
    if (!sbEnabled) return;
    var reasonKey = person === "p1" ? "r1" : "r2";
    // 퍼지 재연결된 항목은 DB의 원래(이전 이름) 행을 그대로 갱신해 중복 행을 만들지 않는다.
    var keyName = (boundKey[i] && boundKey[i][person]) || DATA[i].콘텐츠명;
    var row = {
      content_name: keyName,
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

  function persist() {
    // 현 데이터셋(전체 또는 개별)의 작품만 갱신하고 나머지는 보존한다.
    var out = {};
    try { out = JSON.parse(localStorage.getItem(LS_KEY) || "{}") || {}; } catch (e) { out = {}; }
    DATA.forEach(function (w, i) {
      out[w.콘텐츠명] = { p1: state[i].p1, p2: state[i].p2, r1: state[i].r1, r2: state[i].r2 };
    });
    try { localStorage.setItem(LS_KEY, JSON.stringify(out)); } catch (e) {}
  }

  /* ---------- 점수 계산 ---------- */
  function parseScore(v) {
    if (v == null || v === "") return { empty: true, valid: true, value: null };
    var n = Number(v);
    if (isNaN(n) || n < 0 || n > 10) return { empty: false, valid: false, value: null };
    return { empty: false, valid: true, value: n };
  }
  function personRating(scores) {
    var sum = 0;
    for (var k = 0; k < AXES.length; k++) {
      var r = parseScore(scores[AXES[k]]);
      if (r.empty || !r.valid) return null;
      sum += r.value;
    }
    return Math.round((sum / AXES.length) * 100) / 100;
  }
  function aiRating(w) {
    if (w.평점 != null && w.평점 !== "") return Math.round(Number(w.평점) * 100) / 100;
    var sum = 0, cnt = 0;
    AXES.forEach(function (a) {
      if (w[a] != null && w[a] !== "") { sum += Number(w[a]); cnt++; }
    });
    return cnt ? Math.round((sum / cnt) * 100) / 100 : null;
  }
  function totalOf(i) {
    var w = DATA[i];
    var vals = [personRating(state[i].p1), personRating(state[i].p2), aiRating(w)]
      .filter(function (v) { return v != null; });
    if (!vals.length) return null;
    var s = vals.reduce(function (a, b) { return a + b; }, 0);
    return Math.round((s / vals.length) * 100) / 100;
  }
  function fmt2(n) { return n == null ? "" : Number(n).toFixed(2); }

  /* ---------- 공개일 파싱 (콘텐츠 전용) ---------- */
  function openInfo(s) {
    var m = String(s == null ? "" : s).match(/(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
    if (!m) return { key: "미정", label: "미정", sort: 999999 };
    var month = parseInt(m[2], 10);
    if (!m[3]) return { key: month + "-0", label: month + "월 (주 미정)", sort: month * 100 + 90 };
    var day = parseInt(m[3], 10);
    var wk = Math.floor((day - 1) / 7) + 1;
    return { key: month + "-" + wk, label: month + "월 " + wk + "주", sort: month * 100 + wk };
  }
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
  var typeBtn = document.getElementById("ms-유형-btn");
  var typePanel = document.getElementById("ms-유형-panel");
  var typeLbl = document.getElementById("lbl-유형");
  var omBtn = document.getElementById("ms-공개월-btn");
  var omPanel = document.getElementById("ms-공개월-panel");
  var typeSet = new Set();    // 선택된 유형/분류/종목 (다중 선택)
  var monthSet = new Set();   // 선택된 공개월·주차 key (다중 선택)

  /* ---------- 컬럼 너비 ---------- */
  function colWidth(c) {
    if (c.f === NAMEFIELD) return 200;
    var w = {
      "유형": 72, "세부유형": 140, "장르": 120, "공개일": 80, "플랫폼": 116,
      "분류": 76, "형태장르": 150, "장소지역": 170, "개최지": 150, "기간": 140,
      "카테고리": 84, "유형분류": 96, "시작일": 88, "종목": 84
    };
    return w[c.f] || 120;
  }
  function leadCellClass(c) {
    if (c.f === NAMEFIELD) return "name";
    if (c.f === "장르") return "genre";
    if (c.f === "공개일" || c.f === "시작일") return "opendate";
    if (c.f === "플랫폼") return "platform";
    return "cat";
  }

  /* ---------- 헤더(콜그룹·컬럼행·타이틀) 빌드 ---------- */
  function buildHeader() {
    var colg = document.getElementById("lle-colgroup");
    var colrow = document.getElementById("lle-colrow");
    var title = document.getElementById("lle-title");

    var cg = "";
    COLS.forEach(function (c) { cg += '<col style="width:' + colWidth(c) + 'px" />'; });
    AXES.forEach(function () { cg += '<col style="width:60px" />'; });
    cg += '<col style="width:80px" />';  // 평점
    cg += '<col style="width:80px" />';  // 총점
    colg.innerHTML = cg;

    var cr = "";
    COLS.forEach(function (c) { cr += "<th>" + esc(c.label) + "</th>"; });
    AXES.forEach(function (a) { cr += '<th class="axis">' + esc(a) + "</th>"; });
    cr += "<th>평점</th><th class=\"total\">총점</th>";
    colrow.innerHTML = cr;

    COLSPAN = COLS.length + AXES.length + 2;
    title.setAttribute("colspan", COLSPAN);
    title.textContent = "편성회의 " + DS.label + " 평가 숏리스트 · 사람 평가자 2인 입력 + AI 평가";
  }

  /* ---------- 필터 옵션 빌드 (데이터셋 전환 시 재구성) ---------- */
  function buildFilters() {
    // 유형/분류/종목 다중 필터
    typeLbl.textContent = FILTERFIELD;
    var vals = Array.from(new Set(DATA.map(function (w) { return (w[FILTERFIELD] || "").trim(); }).filter(Boolean)))
      .sort(function (a, b) { return a.localeCompare(b, "ko"); });
    typePanel.innerHTML = vals.map(function (v) {
      return '<label class="ms-opt"><input type="checkbox" value="' + esc(v) + '" /> ' + esc(v) + "</label>";
    }).join("");
    typeSet.clear();
    typeBtn.textContent = "전체"; typeBtn.classList.remove("on");

    // 국가 다중 선택 (콘텐츠 전용)
    var fgCountry = document.getElementById("fg-국가");
    var panel = document.getElementById("ms-국가-panel");
    var btn = document.getElementById("ms-국가-btn");
    countrySel.clear();
    if (HAS_COUNTRY) {
      fgCountry.style.display = "";
      var cvals = Array.from(new Set(DATA.map(function (w) { return (w.국가 || "").trim(); }).filter(Boolean)))
        .sort(function (a, b) { return a.localeCompare(b, "ko"); });
      panel.innerHTML = cvals.map(function (v) {
        return '<label class="ms-opt"><input type="checkbox" value="' + esc(v) + '" /> ' + esc(v) + "</label>";
      }).join("");
      btn.textContent = "전체"; btn.classList.remove("on");
    } else {
      fgCountry.style.display = "none";
    }

    // 공개월·주차 다중 선택
    var fgOpen = document.getElementById("fg-공개월");
    monthSet.clear();
    omBtn.textContent = "전체"; omBtn.classList.remove("on");
    if (HAS_OPENDATE) {
      fgOpen.style.display = "";
      var map = {};
      DATA.forEach(function (w) { var o = openInfo(w[OPENDATEFIELD]); map[o.key] = { label: o.label, sort: o.sort }; });
      var entries = Object.keys(map)
        .map(function (k) { return { key: k, label: map[k].label, sort: map[k].sort }; })
        .sort(function (a, b) { return a.sort - b.sort; });
      omPanel.innerHTML = entries.map(function (e) {
        return '<label class="ms-opt"><input type="checkbox" value="' + esc(e.key) + '" /> ' + esc(e.label) + "</label>";
      }).join("");
    } else {
      fgOpen.style.display = "none";
      omPanel.innerHTML = "";
    }
  }

  function clearMS(set, btnId, panelId) {
    set.clear();
    var p = document.getElementById(panelId);
    if (p) Array.prototype.forEach.call(p.querySelectorAll("input[type=checkbox]"), function (c) { c.checked = false; });
    var b = document.getElementById(btnId);
    if (b) { b.textContent = "전체"; b.classList.remove("on"); }
  }
  function resetFilters() {
    clearMS(typeSet, "ms-유형-btn", "ms-유형-panel");
    clearMS(monthSet, "ms-공개월-btn", "ms-공개월-panel");
    clearMS(countrySel, "ms-국가-btn", "ms-국가-panel");
    var ai = document.getElementById("f-ai");
    ai.value = "0";
    document.getElementById("f-ai-val").textContent = "전체";
  }

  function visibleIndices() {
    var aiMin = parseFloat(document.getElementById("f-ai").value) || 0;
    var out = [];
    DATA.forEach(function (w, i) {
      if (typeSet.size && !typeSet.has((w[FILTERFIELD] || "").trim())) return;
      if (HAS_COUNTRY && countrySel.size && !countrySel.has((w.국가 || "").trim())) return;
      if (HAS_OPENDATE && monthSet.size && !monthSet.has(openInfo(w[OPENDATEFIELD]).key)) return;
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
  function cmpTotal(a, b) {
    var ta = totalOf(a), tb = totalOf(b);
    if (ta == null && tb == null) return a - b;
    if (ta == null) return 1;
    if (tb == null) return -1;
    if (tb !== ta) return tb - ta;
    return a - b;
  }

  var rendered = [];
  var groups = {};
  function resort() {
    var order = rendered.slice().sort(cmpTotal);
    order.forEach(function (i) {
      var g = groups[i];
      if (g) g.forEach(function (tr) { rowsEl.appendChild(tr); });
    });
  }

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

  function leadCellsHTML(i, w) {
    var html = "";
    COLS.forEach(function (c) {
      if (c.f === NAMEFIELD) {
        var newBadge = (w._diff === "new") ? '<span class="new-badge" title="직전 배포에 없던 신규 항목">신규</span>' : "";
        var promBadge = w._promoted ? '<span class="new-badge prom" title="롱리스트에서 올린 작품">추가</span>' : "";
        html += '<td class="merged name" rowspan="3" data-i="' + i + '"><span class="chev">▶</span>' + esc(w[c.f] || "-") + promBadge + newBadge + "</td>";
      } else {
        var val = (c.f === "공개일" || c.f === "시작일") ? openDisplay(w[c.f]) : (w[c.f] || "-");
        html += '<td class="merged ' + leadCellClass(c) + '" rowspan="3">' + esc(val) + "</td>";
      }
    });
    return html;
  }

  function detailHTML(i, w) {
    var dl = "";
    if (w.순위) dl += "<dt>AI 순위</dt><dd>" + esc(w.순위) + "위</dd>";
    DETAIL.forEach(function (d) {
      var dv = w[d.f];
      if (dv == null || dv === "") return;  // 통합 탭처럼 카테고리별로 비는 필드는 숨김
      dl += "<dt>" + esc(d.label) + "</dt><dd>" + esc(dv) + "</dd>";
    });
    return '<tr class="detail-row" id="detail-' + i + '" data-work="' + i + '" style="display:none"><td colspan="' + COLSPAN + '">' +
      '<div class="lle-detail"><dl class="dl">' + dl + "</dl>" +
      (w.평가사유 ? '<div class="reason-box"><div class="rsn-title">AI 평가사유</div>' + reasonBlocks(w.평가사유) + "</div>" : "") +
      reasonsHTML(i) +
      "</div></td></tr>";
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
      html += leadCellsHTML(i, w);
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
      html += detailHTML(i, w);
    });

    rowsEl.innerHTML = html;

    groups = {};
    Array.prototype.forEach.call(rowsEl.querySelectorAll("tr[data-work]"), function (tr) {
      var i = +tr.getAttribute("data-work");
      (groups[i] = groups[i] || []).push(tr);
    });

    emptyEl.style.display = idxs.length ? "none" : "block";
    countEl.textContent = idxs.length + " / " + DATA.length + " 작품";
  }

  /* ---------- CSV 내보내기 ---------- */
  function csvCell(v) {
    var s = (v == null) ? "" : String(v);
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function exportCSV() {
    var idxs = visibleIndices();
    var leadLabels = COLS.map(function (c) { return c.label; });
    var detailLabels = DETAIL.map(function (d) { return d.label; });
    var head = ["순위"].concat(leadLabels);
    if (HAS_OPENDATE) head.push("공개월주차");
    head = head.concat(["평가자", "화제성", "독창성", "근접성", "영향성", "평점", "총점",
      "화제성사유", "독창성사유", "근접성사유", "영향성사유"], detailLabels, ["AI평가사유"]);
    var lines = [head.map(csvCell).join(",")];

    idxs.forEach(function (i) {
      var w = DATA[i];
      var tot = totalOf(i);
      var leadVals = COLS.map(function (c) { return w[c.f]; });
      var omLabel = HAS_OPENDATE ? openInfo(w[OPENDATEFIELD]).label : null;
      var detailVals = DETAIL.map(function (d) { return w[d.f]; });
      var rows = [
        { who: roleName("p1"), sc: state[i].p1, rate: personRating(state[i].p1), rsn: state[i].r1 },
        { who: roleName("p2"), sc: state[i].p2, rate: personRating(state[i].p2), rsn: state[i].r2 },
        { who: "AI", sc: { 화제성: w.화제성, 독창성: w.독창성, 근접성: w.근접성, 영향성: w.영향성 }, rate: aiRating(w), rsn: null }
      ];
      rows.forEach(function (rw) {
        var rsn = rw.rsn || {};
        var line = [w.순위].concat(leadVals);
        if (HAS_OPENDATE) line.push(omLabel);
        line = line.concat([
          rw.who,
          rw.sc.화제성, rw.sc.독창성, rw.sc.근접성, rw.sc.영향성,
          (rw.rate == null ? "" : fmt2(rw.rate)),
          (tot == null ? "" : fmt2(tot)),
          rsn.화제성 || "", rsn.독창성 || "", rsn.근접성 || "", rsn.영향성 || ""
        ], detailVals, [w.평가사유]);
        lines.push(line.map(csvCell).join(","));
      });
    });

    var csv = "﻿" + lines.join("\r\n");
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var d = new Date();
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    var fname = "평가숏리스트_" + DS.label + "_" + d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + ".csv";
    var a = document.createElement("a");
    a.href = url; a.download = fname;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---------- 데이터셋 로드/전환 ---------- */
  function loadDataset(idx) {
    activeIdx = idx;
    DS = DATASETS[idx];
    DATA = DS.works.slice();
    META = DS.meta || {};
    COLS = DS.cols;
    DETAIL = DS.detail;
    NAMEFIELD = DS.nameField || "콘텐츠명";
    FILTERFIELD = DS.filterField || "유형";
    OPENDATEFIELD = DS.opendateField || "공개일";
    HAS_COUNTRY = !!DS.country;
    HAS_OPENDATE = !!DS.opendate;

    try { saved = JSON.parse(localStorage.getItem(LS_KEY) || "{}") || {}; } catch (e) { saved = {}; }
    state = DATA.map(function (w) {
      var s = saved[w.콘텐츠명] || {};
      function pickScore(o) { var r = {}; AXES.forEach(function (a) { r[a] = (o && o[a] != null && o[a] !== "") ? String(o[a]) : null; }); return r; }
      function pickReason(o) { var r = {}; AXES.forEach(function (a) { r[a] = (o && o[a] != null) ? String(o[a]) : ""; }); return r; }
      return { p1: pickScore(s.p1), p2: pickScore(s.p2), r1: pickReason(s.r1), r2: pickReason(s.r2) };
    });
    indexByName = {};
    boundKey = {};
    DATA.forEach(function (w, i) { indexByName[w.콘텐츠명] = i; });

    // 헤더 텍스트
    var win = META.window || {};
    document.getElementById("meta").textContent =
      (win.start ? "평가기간 " + openDisplay(win.start) + "~" + openDisplay(win.end) + " · " : "") +
      "총 " + DATA.length + "개 · 10점 척도";
    document.getElementById("genFoot").textContent =
      (META.generated_at ? "데이터 기준: " + META.generated_at + " · " : "") + "원본: " + (META.source || "");

    buildHeader();
    buildFilters();
    render();
    if (sbEnabled) { fetchAll().then(function () { render(); }); }
  }

  /* ---------- 카테고리 탭 ---------- */
  function buildTabs() {
    var el = document.getElementById("catTabs");
    if (!el) return;
    el.innerHTML = DATASETS.map(function (d, idx) {
      return '<button type="button" class="cat-tab' + (idx === activeIdx ? " active" : "") + '" data-idx="' + idx + '">' +
        esc(d.label) + ' <span class="cat-n">' + d.works.length + "</span></button>";
    }).join("");
    Array.prototype.forEach.call(el.querySelectorAll(".cat-tab"), function (t) { t.classList.toggle("active", +t.getAttribute("data-idx") === activeIdx); });
  }

  /* ---------- 일회성 이벤트 와이어링 ---------- */
  function wireOnce() {
    // 다중 선택 드롭다운(유형/분류·공개월·국가) 공통 토글
    function wireMS(boxId, btnId, panelId, set) {
      var btn = document.getElementById(btnId);
      var panel = document.getElementById(panelId);
      var box = document.getElementById(boxId);
      if (!btn || !panel) return;
      function syncLabel() {
        btn.textContent = set.size === 0 ? "전체" : (set.size + "개 선택");
        btn.classList.toggle("on", set.size > 0);
      }
      function open(o) { panel.hidden = !o; btn.setAttribute("aria-expanded", o ? "true" : "false"); }
      btn.addEventListener("click", function (e) { e.stopPropagation(); open(panel.hidden); });
      panel.addEventListener("change", function (e) {
        var cb = e.target;
        if (!cb || cb.type !== "checkbox") return;
        if (cb.checked) set.add(cb.value); else set.delete(cb.value);
        syncLabel();
        render();
      });
      document.addEventListener("click", function (e) { if (box && !box.contains(e.target)) open(false); });
    }
    wireMS("ms-유형", "ms-유형-btn", "ms-유형-panel", typeSet);
    wireMS("ms-공개월", "ms-공개월-btn", "ms-공개월-panel", monthSet);
    wireMS("ms-국가", "ms-국가-btn", "ms-국가-panel", countrySel);

    // AI 평점 슬라이더
    (function () {
      var slider = document.getElementById("f-ai");
      var valEl = document.getElementById("f-ai-val");
      slider.addEventListener("input", function () {
        valEl.textContent = parseFloat(slider.value) === 0 ? "전체" : slider.value;
        render();
      });
    })();

    document.getElementById("resetBtn").addEventListener("click", function () { resetFilters(); render(); });
    document.getElementById("exportBtn").addEventListener("click", exportCSV);

    // 카테고리 탭 전환
    var tabsEl = document.getElementById("catTabs");
    if (tabsEl) {
      tabsEl.addEventListener("click", function (e) {
        var t = e.target.closest ? e.target.closest(".cat-tab") : null;
        if (!t) return;
        var idx = +t.getAttribute("data-idx");
        if (idx === activeIdx) return;
        activeIdx = idx;
        buildTabs();
        resetFilters();
        loadDataset(idx);
      });
    }

    /* 행 입력 이벤트 (위임) */
    rowsEl.addEventListener("input", function (e) {
      var el = e.target;
      if (!el.classList) return;
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
      var rcell = document.getElementById("rate-" + i + "-" + p);
      if (rcell) {
        var r = personRating(state[i][p]);
        rcell.className = r == null ? "rating-cell empty" : "rating-cell";
        rcell.innerHTML = badge(p, roleName(p)) + (r == null ? "—" : fmt2(r));
      }
      var tcell = document.getElementById("total-" + i);
      if (tcell) { var t = totalOf(i); tcell.textContent = t == null ? "—" : fmt2(t); }
    });

    rowsEl.addEventListener("change", function (e) {
      if (e.target.classList && e.target.classList.contains("score-in")) resort();
    });

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
        nxt.focus(); nxt.select();
      } else { el.blur(); }
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

    wireLoginUI();
    document.getElementById("syncBtn").addEventListener("click", function () {
      if (!sbEnabled) { setSync("Supabase 미설정 · 로컬 전용", "err"); return; }
      // 새로 올라온 shortlist 항목까지 반영(재조립 후 점수 동기화)
      fetchShortlist().then(mergeShortlist).then(function () {
        assembleDatasets(); buildTabs(); loadDataset(activeIdx);
      });
    });
  }

  /* ---------- 로그인 UI ---------- */
  var selectedRole;
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
    selectRole(selectedRole || currentRole || "p1");
    document.getElementById("loginPw").value = "";
    document.getElementById("loginMsg").textContent = "";
    document.getElementById("loginBack").classList.add("show");
    document.getElementById("loginName").focus();
  }
  function closeLogin() { document.getElementById("loginBack").classList.remove("show"); }
  function doLogin() {
    var name = document.getElementById("loginName").value.trim();
    var pw = document.getElementById("loginPw").value;
    var err = attemptLogin(selectedRole, name, pw);
    if (err) { document.getElementById("loginMsg").textContent = err; return; }
    closeLogin();
    updateAuthBar();
    render();
  }
  function wireLoginUI() {
    var loginBack = document.getElementById("loginBack");
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
  }

  /* ---------- boot (게이트 통과 후 실행) ---------- */
  function boot() {
    wireOnce();
    updateAuthBar();
    function finish() {
      assembleDatasets();
      buildTabs();
      loadDataset(activeIdx);          // loadDataset 내부에서 fetchAll(점수)까지 수행
      if (!sbEnabled) setSync("로컬 전용 · Supabase 미설정");
      if (!currentRole) openLogin();
    }
    // 롱리스트에서 올린 작품(shortlist)을 먼저 병합한 뒤 화면 구성
    if (sbEnabled) fetchShortlist().then(mergeShortlist).then(finish).catch(finish);
    else finish();
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
