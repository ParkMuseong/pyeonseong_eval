/* =============================================================================
 *  편성회의 Agent — 월간 편성표 페이지 로직
 *  · "N월 편성" 시트를 월 탭 + 주차별 편성표로 표시 (읽기 전용)
 *  · 접근 암호 게이트는 평가 페이지와 동일 (config.js SITE_PASSWORD / 세션 공유)
 * ========================================================================== */
(function () {
  "use strict";

  var CFG = window.LLE_CONFIG || {};
  var DATA = window.PYEON_DATA || { months: [], sheets: {} };

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) { h = ((h << 5) + h) + s.charCodeAt(i); h |= 0; } return String(h >>> 0); }

  /* 공개일 압축 표기 (YYYY-MM-DD → M/D, 연도 제거) */
  function openDisplay(s) {
    s = String(s == null ? "" : s) || "-";
    s = s.replace(/(\d{4})-(\d{1,2})-(\d{1,2})/g, function (_, y, m, d) { return parseInt(m, 10) + "/" + parseInt(d, 10); });
    s = s.replace(/(\d{4})-(\d{1,2})/g, function (_, y, m) { return parseInt(m, 10) + "월"; });
    return s;
  }

  /* 검증 파싱: "통과 (medium)" → {status, conf, cls} */
  function parseVerify(v) {
    v = String(v || "");
    var m = v.match(/^([^(]+?)\s*(?:\(([^)]*)\))?$/);
    var status = m ? m[1].trim() : v.trim();
    var conf = m && m[2] ? m[2].trim() : "";
    var cls = "pass";
    if (/이의/.test(status)) cls = "obj";
    else if (/ai/i.test(status)) cls = "ai";
    return { status: status, conf: conf, cls: cls };
  }

  var monthTabsEl = document.getElementById("monthTabs");
  var weeksEl = document.getElementById("weeks");
  var metaEl = document.getElementById("pyeonMeta");
  var current = null;

  function renderMonth(label) {
    current = label;
    Array.prototype.forEach.call(monthTabsEl.querySelectorAll(".month-tab"), function (b) {
      b.classList.toggle("active", b.getAttribute("data-m") === label);
    });
    var items = DATA.sheets[label] || [];
    // 주차 순서 보존하며 그룹화
    var order = [], groups = {};
    items.forEach(function (it) {
      var w = it.주차 || "-";
      if (!groups[w]) { groups[w] = { period: it.기간 || "", picks: [] }; order.push(w); }
      groups[w].picks.push(it);
    });

    var html = "";
    order.forEach(function (w) {
      var g = groups[w];
      html += '<div class="week"><div class="week-head"><span class="w">' + esc(w) +
        '</span><span class="period">' + esc(openDisplay(g.period)) + "</span></div>";
      g.picks.forEach(function (it) {
        var isAlt = String(it.순위) === "대안";
        var rank = isAlt ? "대안" : esc(it.순위);
        var ver = parseVerify(it.검증);
        html += '<div class="pick' + (isAlt ? " alt" : "") + '">' +
          '<span class="rank">' + rank + "</span>" +
          '<div class="body">' +
            '<div class="line1">' +
              '<span class="title">' + esc(it.제목) + "</span>" +
              '<span class="field">' + esc(it.분야 || "-") + "</span>" +
              '<span class="cat">' + esc(it.카테고리 || "-") + "</span>" +
              '<span class="date">' + esc(openDisplay(it.공개일)) + "</span>" +
              (it.검증 ? '<span class="verify ' + ver.cls + '">' + esc(ver.status) +
                (ver.conf ? ' <span class="conf">' + esc(ver.conf) + "</span>" : "") + "</span>" : "") +
            "</div>" +
            (it.편성사유 ? '<p class="reason">' + esc(it.편성사유) + "</p>" : "") +
          "</div>" +
        "</div>";
      });
      html += "</div>";
    });
    weeksEl.innerHTML = html || '<div class="empty">표시할 편성 데이터가 없습니다.</div>';
    metaEl.textContent = label + " · " + items.length + "개 항목";
  }

  function boot() {
    if (!DATA.months.length) {
      weeksEl.innerHTML = '<div class="empty">편성 데이터가 없습니다. build_pyeonseong.py 를 실행했는지 확인하세요.</div>';
      return;
    }
    // 월 탭 생성
    var tabHtml = "";
    DATA.months.forEach(function (m) { tabHtml += '<button type="button" class="month-tab" data-m="' + esc(m) + '">' + esc(m) + "</button>"; });
    monthTabsEl.innerHTML = tabHtml + '<span class="pyeon-meta" id="pyeonMeta"></span>';
    metaEl = document.getElementById("pyeonMeta");
    monthTabsEl.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest(".month-tab") : null;
      if (b) renderMonth(b.getAttribute("data-m"));
    });
    // 현재 월(있으면) 기본 선택, 없으면 첫 번째
    var nowM = (new Date().getMonth() + 1) + "월";
    var def = DATA.months.indexOf(nowM) >= 0 ? nowM : DATA.months[0];
    renderMonth(def);
    document.getElementById("genFoot").textContent =
      (DATA.generated_at ? "데이터 기준: " + DATA.generated_at + " · " : "") + "원본: " + (DATA.source || "");
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
