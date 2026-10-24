(() => {
  "use strict";

  const CH = window.CHARACTERS;
  const LV = window.LEVELS;
  const PARTS = [
    ["ropa", "Ropa"],
    ["pelo", "Pelo"],
    ["maquillaje", "Maquillaje"],
    ["accesorios", "Accesorios"]
  ];
  const CACHE_VERSION = "v1";

  const $ = (s, el = document) => el.querySelector(s);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  // ---------- Almacenamiento seguro ----------
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } }
  };

  // ---------- Estado ----------
  const state = {
    maxLevel: 5,
    cats: new Set(),
    q: ""
  };
  let visible = [];
  let current = null;

  const progress = store.get("checklist") || {};
  const doneCount = id => PARTS.filter(([k]) => progress[id]?.[k]).length;

  // ---------- Imágenes desde la web ----------
  // Busca la imagen principal de la página del personaje en Fandom o Wikipedia (API de MediaWiki con CORS abierto).
  const imageCache = store.get("img-" + CACHE_VERSION) || {};
  const pending = new Map();

  function fetchJSON(url, ms = 6000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { signal: ctrl.signal })
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)
      .finally(() => clearTimeout(t));
  }

  function firstThumb(data) {
    const pages = data?.query?.pages;
    if (!pages) return null;
    for (const p of Object.values(pages)) {
      if (p?.thumbnail?.source) return p.thumbnail.source;
    }
    return null;
  }

  async function lookup(src) {
    const params = "action=query&prop=pageimages&piprop=thumbnail&pithumbsize=640&redirects=1&format=json&origin=*";
    if (src.f) {
      const base = `https://${src.f}.fandom.com/api.php`;
      const t = encodeURIComponent(src.t);
      let url = firstThumb(await fetchJSON(`${base}?${params}&titles=${t}`));
      if (!url) {
        const d = await fetchJSON(`${base}?action=imageserving&wisTitle=${t}&format=json&origin=*`);
        url = d?.image?.imageserving || null;
      }
      if (url) return { src: url, label: "Fandom", page: `https://${src.f}.fandom.com/wiki/${src.t}` };
    }
    if (src.wp) {
      const t = encodeURIComponent(src.wp);
      const url = firstThumb(await fetchJSON(`https://en.wikipedia.org/w/api.php?${params}&pilicense=any&titles=${t}`));
      if (url) {
        return {
          src: url,
          label: src.work ? "Wikipedia (imagen de la obra)" : "Wikipedia",
          page: `https://en.wikipedia.org/wiki/${src.wp}`
        };
      }
    }
    return null;
  }

  // Devuelve la primera imagen disponible a partir de la fuente `from`.
  async function resolveImage(c, from = 0) {
    if (c.img && from === 0) return { src: c.img, label: "Imagen fijada", page: c.ref, idx: -1 };
    const cached = imageCache[c.id];
    if (cached && from === 0) return cached;
    for (let i = Math.max(0, from); i < c.sources.length; i++) {
      const hit = await lookup(c.sources[i]);
      if (hit) {
        hit.idx = i;
        if (from === 0) { imageCache[c.id] = hit; store.set("img-" + CACHE_VERSION, imageCache); }
        return hit;
      }
    }
    return null;
  }

  // Cola con concurrencia limitada para no saturar las APIs.
  const queue = [];
  let running = 0;
  function enqueue(job) {
    return new Promise(res => { queue.push({ job, res }); pump(); });
  }
  function pump() {
    while (running < 4 && queue.length) {
      const { job, res } = queue.shift();
      running++;
      job().then(res, () => res(null)).finally(() => { running--; pump(); });
    }
  }

  function placeholder(box, c, note) {
    box.classList.remove("loading");
    box.querySelector("img")?.remove();
    if (box.querySelector(".ph")) return;
    const ph = el("div", "ph");
    const ini = c.name.split(/\s+/).map(w => w[0]).slice(0, 2).join("");
    ph.append(el("span", "ini", ini), el("span", "ph-note", note || "Sin imagen disponible"));
    box.append(ph);
  }

  // Pinta la foto en `box` y opcionalmente el crédito en `credit`.
  function paintPhoto(box, c, credit, from = 0) {
    box.classList.add("loading");
    const key = c.id + ":" + from;
    let p = pending.get(key);
    if (!p) { p = enqueue(() => resolveImage(c, from)); pending.set(key, p); }
    p.then(hit => {
      pending.delete(key);
      if (!hit) {
        placeholder(box, c);
        if (credit) credit.textContent = "No se encontró imagen. Revisa la ficha original.";
        return;
      }
      box.querySelector(".ph")?.remove();
      let img = box.querySelector("img");
      if (!img) { img = new Image(); box.append(img); }
      img.className = "";
      img.alt = `${c.name} en ${c.work}`;
      img.referrerPolicy = "no-referrer";
      img.decoding = "async";
      img.onload = () => { img.classList.add("ready"); box.classList.remove("loading"); };
      img.onerror = () => {
        if (hit.idx >= 0 && hit.idx + 1 < c.sources.length) {
          if (from === 0) { delete imageCache[c.id]; store.set("img-" + CACHE_VERSION, imageCache); }
          paintPhoto(box, c, credit, hit.idx + 1);
        } else {
          placeholder(box, c);
        }
      };
      img.src = hit.src;
      if (credit) {
        credit.textContent = "Imagen: ";
        const a = el("a", null, hit.label);
        a.href = hit.page; a.target = "_blank"; a.rel = "noopener";
        credit.append(a);
      }
    });
  }

  const io = "IntersectionObserver" in window
    ? new IntersectionObserver(entries => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          io.unobserve(e.target);
          const c = CH.find(x => x.id === e.target.dataset.id);
          if (c) paintPhoto(e.target, c);
        }
      }, { rootMargin: "300px 0px" })
    : null;

  // ---------- Controles ----------
  function pips(level) {
    const w = el("span", "pips");
    w.setAttribute("aria-hidden", "true");
    for (let i = 1; i <= 5; i++) w.append(el("i", i <= level ? "f" : ""));
    return w;
  }

  function buildMeter() {
    const wrap = $(".meter-bars");
    for (let n = 1; n <= 5; n++) {
      const b = el("button", "bar");
      b.type = "button";
      b.setAttribute("role", "radio");
      b.dataset.n = n;
      b.append(el("span", "n", n), el("span", "l", LV[n].name));
      b.addEventListener("click", () => { state.maxLevel = n; render(); });
      b.addEventListener("keydown", e => {
        const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        state.maxLevel = Math.min(5, Math.max(1, state.maxLevel + d));
        render();
        wrap.children[state.maxLevel - 1].focus();
      });
      wrap.append(b);
    }
  }

  function syncMeter() {
    [...$(".meter-bars").children].forEach((b, i) => {
      const n = i + 1;
      b.classList.toggle("on", n <= state.maxLevel);
      b.classList.toggle("top", n === state.maxLevel);
      b.setAttribute("aria-checked", String(n === state.maxLevel));
      b.tabIndex = n === state.maxLevel ? 0 : -1;
    });
    $("#meter-hint").textContent = state.maxLevel === 5
      ? "Mostrando todos los niveles."
      : `Mostrando hasta el nivel ${state.maxLevel}: ${LV[state.maxLevel].hint.toLowerCase()}`;
  }

  function buildChips() {
    const cats = [...new Set(CH.flatMap(c => c.cat))].sort((a, b) => a.localeCompare(b, "es"));
    const box = $("#chips");
    for (const c of cats) {
      const b = el("button", "chip", c);
      b.type = "button";
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", () => {
        state.cats.has(c) ? state.cats.delete(c) : state.cats.add(c);
        b.setAttribute("aria-pressed", String(state.cats.has(c)));
        render();
      });
      box.append(b);
    }
  }

  const norm = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  function matches(c) {
    if (c.level > state.maxLevel) return false;
    if (state.cats.size && !c.cat.some(x => state.cats.has(x))) return false;
    if (state.q) {
      const hay = norm([c.name, c.alias || "", c.work, c.key].join(" "));
      if (!hay.includes(norm(state.q))) return false;
    }
    return true;
  }

  // ---------- Galería ----------
  function card(c, i) {
    const li = el("li");
    const b = el("button", "card");
    b.type = "button";
    b.style.setProperty("--tilt", `${(((i * 37) % 7) - 3) * 0.5}deg`);
    b.setAttribute("aria-label", `${c.name}, ${c.work}. Nivel ${c.level}, ${LV[c.level].name}`);

    const photo = el("div", "photo");
    photo.dataset.id = c.id;
    b.append(photo);

    const d = doneCount(c.id);
    if (d) b.append(el("span", "done-badge", d === 4 ? "Listo" : `${d}/4`));

    b.append(el("p", "card-name", c.name), el("p", "card-work", c.work));
    const foot = el("div", "card-foot");
    foot.append(el("span", "card-key", c.key), pips(c.level));
    b.append(foot);

    b.addEventListener("click", () => openSheet(c));
    li.append(b);

    if (io) io.observe(photo); else paintPhoto(photo, c);
    return li;
  }

  function render() {
    syncMeter();
    visible = CH.filter(matches).sort((a, b) => a.level - b.level);
    const root = $("#levels");
    root.replaceChildren();

    let i = 0;
    for (let n = 1; n <= 5; n++) {
      const group = visible.filter(c => c.level === n);
      if (!group.length) continue;
      const sec = el("section", "level-group");
      sec.setAttribute("aria-labelledby", "lv-" + n);
      const head = el("div", "level-head");
      const h = el("h2");
      h.id = "lv-" + n;
      h.append(el("span", "lv-n", n), document.createTextNode(LV[n].name));
      head.append(h, el("p", null, LV[n].hint));
      const ul = el("ul", "grid");
      group.forEach(c => ul.append(card(c, i++)));
      sec.append(head, ul);
      root.append(sec);
    }

    $("#count").textContent = visible.length === CH.length
      ? `${CH.length} personajes`
      : `${visible.length} de ${CH.length} personajes`;
    $("#empty").hidden = visible.length > 0;
  }

  // ---------- Ficha ----------
  const sheet = $("#sheet");

  function openSheet(c) {
    current = c;
    $("#sheet-work").textContent = `${c.work} · ${c.cat.join(", ")}`;
    $("#sheet-name").textContent = c.name;
    $("#sheet-alias").textContent = c.alias ? `También: ${c.alias}` : "";
    const lv = $("#sheet-level");
    lv.replaceChildren(pips(c.level), document.createTextNode(`Nivel ${c.level}: ${LV[c.level].name}`));
    $("#sheet-desc").textContent = c.desc;
    $("#sheet-tip").textContent = c.consejo;
    $("#sheet-ref").href = c.ref;

    const box = $("#sheet-photo");
    box.replaceChildren();
    const credit = $("#sheet-credit");
    credit.textContent = "";
    paintPhoto(box, c, credit);

    const list = $("#checklist");
    list.replaceChildren();
    for (const [k, label] of PARTS) {
      const li = el("li");
      const lab = el("label");
      const cb = el("input");
      cb.type = "checkbox";
      cb.checked = !!progress[c.id]?.[k];
      cb.addEventListener("change", () => {
        progress[c.id] = progress[c.id] || {};
        progress[c.id][k] = cb.checked;
        store.set("checklist", progress);
        syncProgress();
      });
      const txt = el("span");
      txt.append(el("span", "k", label), el("span", "v", c[k]));
      lab.append(cb, txt);
      li.append(lab);
      list.append(li);
    }
    syncProgress();
    syncPager();

    if (location.hash !== "#" + c.id) history.replaceState(null, "", "#" + c.id);
    if (!sheet.open) {
      if (typeof sheet.showModal === "function") sheet.showModal(); else sheet.setAttribute("open", "");
    }
    sheet.scrollTop = 0;
  }

  function syncProgress() {
    const d = doneCount(current.id);
    $("#progress-bar").style.width = `${(d / 4) * 100}%`;
    $("#progress-text").textContent = d === 4 ? "Tienes todo. Disfraz listo." : `${d} de 4 listos`;
  }

  function list() { return visible.length ? visible : CH; }

  function syncPager() {
    const l = list();
    const i = l.indexOf(current);
    $("#prev").disabled = i <= 0;
    $("#next").disabled = i < 0 || i >= l.length - 1;
  }

  function step(d) {
    const l = list();
    const i = l.indexOf(current);
    const n = l[i + d];
    if (n) openSheet(n);
  }

  function closeSheet() {
    if (typeof sheet.close === "function") sheet.close(); else sheet.removeAttribute("open");
  }

  sheet.addEventListener("close", () => {
    history.replaceState(null, "", location.pathname + location.search);
    render(); // actualiza las insignias de progreso
  });
  sheet.addEventListener("click", e => { if (e.target === sheet) closeSheet(); });
  $("#sheet-close").addEventListener("click", closeSheet);
  $("#prev").addEventListener("click", () => step(-1));
  $("#next").addEventListener("click", () => step(1));

  // ---------- Eventos generales ----------
  let t;
  $("#q").addEventListener("input", e => {
    clearTimeout(t);
    t = setTimeout(() => { state.q = e.target.value.trim(); render(); }, 120);
  });

  $("#random").addEventListener("click", () => {
    const l = list();
    openSheet(l[Math.floor(Math.random() * l.length)]);
  });

  $("#reset").addEventListener("click", () => {
    state.maxLevel = 5; state.cats.clear(); state.q = "";
    $("#q").value = "";
    document.querySelectorAll(".chip").forEach(b => b.setAttribute("aria-pressed", "false"));
    render();
  });

  buildMeter();
  buildChips();
  render();

  const fromHash = CH.find(c => "#" + c.id === location.hash);
  if (fromHash) openSheet(fromHash);
})();
