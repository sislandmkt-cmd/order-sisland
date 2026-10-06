/* =========================================================================
   Order SISLAND — base de datos local para la DEMO pública
   -------------------------------------------------------------------------
   Guarda los pedidos en el navegador (localStorage) y los sincroniza en
   tiempo real entre pestañas abiertas del MISMO navegador:
     · Pestaña 1: menú del cliente        →  /
     · Pestaña 2: pantalla de cocina      →  /#cocina   (PIN 1234)
     · Pestaña 3: pantalla de caja        →  /#caja     (PIN 1234)
   No necesita servidor. Para producción (varios dispositivos) se sustituye
   este archivo por una base de datos real (Firebase / Supabase) sin tocar
   el resto del código, porque expone la misma interfaz.
   ========================================================================= */
(function () {
  if (window.claude && window.claude.use) return; // dentro de Claude se usa la base real

  var KEY = "order_sisland_demo_v1";
  var listeners = [];

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function save(all) {
    try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) {}
    notify();
  }
  function notify() { listeners.slice().forEach(function (fn) { try { fn(); } catch (e) {} }); }

  // Cambios hechos en otra pestaña
  window.addEventListener("storage", function (e) { if (e.key === KEY) notify(); });

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function subscribe(fn) {
    listeners.push(fn);
    setTimeout(fn, 0);
    return function () { listeners = listeners.filter(function (l) { return l !== fn; }); };
  }

  function docRef(coll, id) {
    return {
      id: id,
      update: function (patch) {
        var all = load();
        if (!all[coll] || !all[coll][id]) return Promise.reject(new Error("No existe"));
        Object.assign(all[coll][id], patch);
        save(all);
        return Promise.resolve();
      },
      onSnapshot: function (cb) {
        return subscribe(function () {
          var d = (load()[coll] || {})[id];
          cb({ exists: !!d, id: id, data: function () { return d ? Object.assign({}, d) : undefined; } });
        });
      }
    };
  }

  function query(coll, field, dir, max) {
    return {
      orderBy: function (f, d) { return query(coll, f, d || "asc", max); },
      limit: function (n) { return query(coll, field, dir, n); },
      onSnapshot: function (cb) {
        return subscribe(function () {
          var rows = load()[coll] || {};
          var docs = Object.keys(rows).map(function (id) {
            var d = rows[id];
            return { id: id, data: function () { return Object.assign({}, d); } };
          });
          if (field) {
            docs.sort(function (a, b) {
              var x = a.data()[field], y = b.data()[field];
              var r = x < y ? -1 : x > y ? 1 : 0;
              return dir === "desc" ? -r : r;
            });
          }
          if (max) docs = docs.slice(0, max);
          cb({ docs: docs });
        });
      }
    };
  }

  var db = {
    collection: function (coll) {
      var q = query(coll, null, "asc", null);
      q.add = function (data) {
        var all = load();
        var id = newId();
        all[coll] = all[coll] || {};
        all[coll][id] = Object.assign({}, data);
        save(all);
        return Promise.resolve(docRef(coll, id));
      };
      return q;
    },
    doc: function (path) {
      var p = path.split("/");
      return docRef(p[0], p[1]);
    }
  };

  window.claude = { use: function (name) {
    return name === "db" ? Promise.resolve(db) : Promise.reject(new Error("No disponible"));
  } };

  window.OrderSislandDemo = {
    reset: function () { try { localStorage.removeItem(KEY); } catch (e) {} notify(); }
  };

  // ---- Barra de demo: accesos a las 3 pantallas ----
  function bar() {
    var h = location.hash;
    var css = document.createElement("style");
    css.textContent =
      ".sl-demo{position:fixed;top:calc(8px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);z-index:50;" +
      "display:flex;align-items:center;gap:2px;padding:4px;border-radius:999px;background:rgba(20,15,10,.82);" +
      "backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);font:600 12px/1 'Source Sans 3','Segoe UI',sans-serif;" +
      "box-shadow:0 4px 16px rgba(0,0,0,.2);max-width:calc(100% - 16px);white-space:nowrap}" +
      ".sl-demo span{color:#E9DCC7;padding:0 8px 0 10px;letter-spacing:.06em;font-size:10.5px;text-transform:uppercase}" +
      ".sl-demo a{color:#F4ECDF;text-decoration:none;padding:7px 11px;border-radius:999px}" +
      ".sl-demo a.on{background:#C1442A;color:#FFF7EE}" +
      ".sl-demo.sl-bottom{top:auto;bottom:calc(12px + env(safe-area-inset-bottom,0px))}" +
      ".sl-demo button{border:none;background:none;color:#B9AC98;font:inherit;padding:7px 9px;cursor:pointer}";
    document.head.appendChild(css);
    var el = document.createElement("div");
    el.className = "sl-demo" + (h === "#cocina" || h === "#caja" ? " sl-bottom" : "");
    el.innerHTML =
      '<span>Demo</span>' +
      '<a href="#" class="' + (h !== "#cocina" && h !== "#caja" ? "on" : "") + '" target="_self">Menú</a>' +
      '<a href="#cocina" class="' + (h === "#cocina" ? "on" : "") + '" target="sl_cocina">Cocina</a>' +
      '<a href="#caja" class="' + (h === "#caja" ? "on" : "") + '" target="sl_caja">Caja</a>' +
      '<button type="button" title="Borrar pedidos de prueba">↺</button>';
    el.querySelector("button").onclick = function () {
      if (confirm("¿Borrar todos los pedidos de prueba?")) window.OrderSislandDemo.reset();
    };
    // Cocina y Caja se abren en su propia pestaña para ver el pedido llegar en vivo
    el.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function (e) {
        var t = a.getAttribute("target");
        if (t === "_self") { e.preventDefault(); location.href = location.pathname; return; }
        e.preventDefault();
        window.open(location.pathname + a.getAttribute("href"), t);
      });
    });
    document.body.appendChild(el);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bar);
  else bar();
})();
