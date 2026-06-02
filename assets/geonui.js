/* =============================================================================
 *  편성회의 Agent — 실무자 건의 페이지 로직
 *  · 유형: 기능 건의(feature) / 사용자 편의 건의(ux)
 *  · 작성자명 + 내용 입력 → 등록. 상태(접수/검토중/완료) 토글, 삭제 가능.
 *  · 저장: Supabase 'suggestions' 테이블(설정 시 전체 공유) + 없으면 localStorage 로컬 보관
 *  · 접근 암호 게이트는 다른 페이지와 동일(config.js SITE_PASSWORD · 세션 공유)
 * ========================================================================== */
(function () {
  "use strict";

  var CFG = window.LLE_CONFIG || {};
  var LS_KEY = "geonui_v1";
  var NAME_KEY = "geonui_name";
  var KINDS = { feature: "기능 건의", ux: "사용자 편의 건의" };
  var STATUSES = ["접수", "검토중", "완료"];

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) { h = ((h << 5) + h) + s.charCodeAt(i); h |= 0; } return String(h >>> 0); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function fmtTime(iso) {
    var d = iso ? new Date(iso) : new Date();
    if (isNaN(d.getTime())) return "";
    return (d.getMonth() + 1) + "/" + d.getDate() + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function uid() { return "loc-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8); }
  function hhmm() { var d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function setSync(t, k) { var el = document.getElementById("syncStatus"); if (!el) return; el.textContent = t || ""; el.className = "sync-status" + (k ? " " + k : ""); }

  /* ---- Supabase ---- */
  var SB = null;
  if (CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase && window.supabase.createClient) {
    try { SB = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY); } catch (e) { SB = null; }
  }
  var mode = "local";   // 'remote' | 'local'
  var ITEMS = [];
  var filter = "all";
  var curKind = "feature";

  /* ---- DOM ---- */
  var listEl, emptyEl, nameEl, bodyEl;

  function loadLocal() { try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]") || []; } catch (e) { return []; } }
  function saveLocal(arr) { try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); } catch (e) {} }

  function fetchItems(cb) {
    if (SB) {
      setSync("불러오는 중…");
      SB.from("suggestions").select("*").order("created_at", { ascending: false }).then(function (res) {
        if (res.error) {
          console.warn("[suggestions] 테이블 접근 실패 → 로컬 전용:", res.error.message);
          mode = "local"; ITEMS = loadLocal();
          setSync("로컬 전용 · 공유 테이블 미설정", "err");
        } else {
          mode = "remote"; ITEMS = res.data || [];
          setSync("동기화됨 " + hhmm(), "ok");
        }
        cb && cb();
      }).catch(function (e) {
        console.error(e); mode = "local"; ITEMS = loadLocal();
        setSync("로컬 전용 · 연결 실패", "err"); cb && cb();
      });
    } else {
      mode = "local"; ITEMS = loadLocal();
      setSync("로컬 전용 · Supabase 미설정"); cb && cb();
    }
  }

  function submit() {
    var author = (nameEl.value || "").trim();
    var body = (bodyEl.value || "").trim();
    if (!author) { alert("작성자 이름을 입력하세요."); nameEl.focus(); return; }
    if (!body) { alert("건의 내용을 입력하세요."); bodyEl.focus(); return; }
    try { localStorage.setItem(NAME_KEY, author); } catch (e) {}
    var rec = { author: author, kind: curKind, body: body, status: "접수" };
    if (mode === "remote") {
      setSync("등록 중…");
      SB.from("suggestions").insert(rec).then(function (res) {
        if (res.error) { alert("등록 실패: " + res.error.message); setSync("등록 실패", "err"); return; }
        bodyEl.value = ""; setSync("등록됨 " + hhmm(), "ok"); fetchItems(render);
      });
    } else {
      rec.id = uid(); rec.created_at = new Date().toISOString();
      ITEMS.unshift(rec); saveLocal(ITEMS); bodyEl.value = "";
      setSync("저장됨(로컬) " + hhmm(), "ok"); render();
    }
  }

  function delItem(id) {
    if (!confirm("이 건의를 삭제할까요?")) return;
    if (mode === "remote") {
      SB.from("suggestions").delete().eq("id", id).then(function (res) {
        if (res.error) { alert("삭제 실패: " + res.error.message); return; }
        fetchItems(render);
      });
    } else {
      ITEMS = ITEMS.filter(function (x) { return x.id !== id; }); saveLocal(ITEMS); render();
    }
  }

  function cycleStatus(id, cur) {
    var next = STATUSES[(STATUSES.indexOf(cur) + 1) % STATUSES.length];
    if (mode === "remote") {
      SB.from("suggestions").update({ status: next }).eq("id", id).then(function (res) {
        if (res.error) { alert("상태 변경 실패: " + res.error.message); return; }
        fetchItems(render);
      });
    } else {
      ITEMS.forEach(function (x) { if (x.id === id) x.status = next; }); saveLocal(ITEMS); render();
    }
  }

  function counts() {
    var c = { all: ITEMS.length, feature: 0, ux: 0 };
    ITEMS.forEach(function (x) { if (x.kind === "feature") c.feature++; else if (x.kind === "ux") c.ux++; });
    return c;
  }

  function render() {
    var c = counts();
    document.getElementById("n-all").textContent = c.all;
    document.getElementById("n-feature").textContent = c.feature;
    document.getElementById("n-ux").textContent = c.ux;

    var rows = ITEMS.filter(function (x) { return filter === "all" || x.kind === filter; });
    if (!rows.length) { listEl.innerHTML = ""; emptyEl.style.display = "block"; return; }
    emptyEl.style.display = "none";
    listEl.innerHTML = rows.map(function (x) {
      var st = x.status || "접수";
      return '<div class="geon-item">' +
        '<div class="gi-head">' +
          '<span class="gi-kind ' + esc(x.kind) + '">' + esc(KINDS[x.kind] || x.kind) + "</span>" +
          '<span class="gi-author">' + esc(x.author) + "</span>" +
          '<span class="gi-time">' + esc(fmtTime(x.created_at)) + "</span>" +
          '<span class="gi-status" data-s="' + esc(st) + '" data-id="' + esc(x.id) + '" title="클릭하여 상태 변경">' + esc(st) + "</span>" +
        "</div>" +
        '<div class="gi-body">' + esc(x.body) + "</div>" +
        '<div class="gi-foot"><button class="gi-del" data-id="' + esc(x.id) + '">삭제</button></div>' +
      "</div>";
    }).join("");
  }

  function wire() {
    nameEl = document.getElementById("gName");
    bodyEl = document.getElementById("gBody");
    listEl = document.getElementById("list");
    emptyEl = document.getElementById("empty");
    try { var n = localStorage.getItem(NAME_KEY); if (n) nameEl.value = n; } catch (e) {}

    Array.prototype.forEach.call(document.querySelectorAll(".kind-tab"), function (t) {
      t.addEventListener("click", function () {
        curKind = t.getAttribute("data-kind");
        Array.prototype.forEach.call(document.querySelectorAll(".kind-tab"), function (o) { o.classList.toggle("active", o === t); });
      });
    });

    document.getElementById("filterTabs").addEventListener("click", function (e) {
      var t = e.target.closest ? e.target.closest(".cat-tab") : null;
      if (!t) return;
      filter = t.getAttribute("data-filter");
      Array.prototype.forEach.call(document.querySelectorAll("#filterTabs .cat-tab"), function (o) { o.classList.toggle("active", o === t); });
      render();
    });

    document.getElementById("submitBtn").addEventListener("click", submit);
    bodyEl.addEventListener("keydown", function (e) { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") submit(); });

    listEl.addEventListener("click", function (e) {
      var del = e.target.closest ? e.target.closest(".gi-del") : null;
      if (del) { delItem(del.getAttribute("data-id")); return; }
      var st = e.target.closest ? e.target.closest(".gi-status") : null;
      if (st) { cycleStatus(st.getAttribute("data-id"), st.getAttribute("data-s")); return; }
    });
  }

  function boot() {
    wire();
    document.getElementById("meta").textContent = "기능 · 사용자 편의 건의 게시판";
    var foot = document.getElementById("genFoot");
    if (foot) foot.textContent = "실무자 건의 · 편성회의 Agent";
    fetchItems(render);
  }

  /* ---- 접근 암호 게이트 (평가 페이지와 세션 공유) ---- */
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
