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
  const CACHE_VERSION = "v2";

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
  // Para cada personaje se arma una lista de candidatas, en orden de confianza:
  //   1. la imagen del recuadro de ficha (infobox) de su página en Fandom,
  //   2. la imagen principal que Fandom asigna a esa página,
  //   3. la imagen del recuadro de su artículo en Wikipedia.
  // Quien visita puede pasar a la siguiente candidata o fijar una URL propia; esa elección se guarda en su navegador.
  const IMG_KEY = "img-" + CACHE_VERSION;
  const CHOICE_KEY = "img-choice-" + CACHE_VERSION;
  const imageCache = store.get(IMG_KEY) || {};      // "id:n" -> candidata ya resuelta
  const choices = store.get(CHOICE_KEY) || {};      // id -> { n } | { url }
  const cands = new Map();                           // id -> { list, steps }

  function fetchJSON(url, ms = 7000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { signal: ctrl.signal })
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)
      .finally(() => clearTimeout(t));
  }

  const enc = encodeURIComponent;
  const MW = "format=json&formatversion=2&origin=*";

  // Extrae el nombre del archivo del parámetro de imagen del infobox.
  // Soporta campos uno por línea o todos en una sola línea, y valores con <gallery> o <tabber>.
  function infoboxFile(text) {
    const m = /\|\s*(?:image|imagen|image1|img|picture|photo)\s*=\s*/i.exec(text);
    if (!m) return null;
    const rest = text.slice(m.index + m[0].length, m.index + m[0].length + 2000);
    const block = rest.match(/^<(gallery|tabber)[^>]*>([\s\S]*?)<\/\1>/i);
    let v;
    if (block) {
      v = block[2];
    } else {
      const end = rest.search(/\n\s*\||\|\s*[^\s=|\[\]{}<>][^=|\[\]{}<>\n]*=|\}\}/);
      v = end >= 0 ? rest.slice(0, end) : rest;
    }
    const f = v.match(/([^\[\]|=\n<>:]+\.(?:png|jpe?g|gif|webp))/i);
    return f ? f[1].trim() : null;
  }

  // Wikis de Fandom en otro idioma viven bajo /<lang>/ (p. ej. kill-la-kill.fandom.com/es/).
  const fandomRoot = s => `https://${s.f}.fandom.com${s.lang ? "/" + s.lang : ""}`;
  const fandomPage = s => `${fandomRoot(s)}/wiki/${s.t}`;

  async function fandomInfobox(src) {
    const base = `${fandomRoot(src)}/api.php`;
    const d = await fetchJSON(`${base}?action=query&prop=revisions&rvprop=content&rvslots=main&redirects=1&titles=${enc(src.t)}&${MW}`);
    const text = d?.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content;
    const file = text && infoboxFile(text);
    if (!file) return null;
    const info = await fetchJSON(`${base}?action=query&prop=imageinfo&iiprop=url&iiurlwidth=640&titles=${enc("File:" + file)}&${MW}`);
    const ii = info?.query?.pages?.[0]?.imageinfo?.[0];
    const url = ii?.thumburl || ii?.url;
    return url ? { src: url, label: "Fandom", page: fandomPage(src) } : null;
  }

  async function pageImage(apiBase, title, extra, label, page) {
    const d = await fetchJSON(`${apiBase}?action=query&prop=pageimages&piprop=thumbnail&pithumbsize=640&redirects=1&titles=${enc(title)}${extra}&${MW}`);
    const url = d?.query?.pages?.find?.(p => p?.thumbnail?.source)?.thumbnail?.source;
    return url ? { src: url, label, page } : null;
  }

  function stepsFor(c) {
    const steps = [];
    for (const s of c.sources) {
      if (s.f) {
        steps.push(() => fandomInfobox(s));
        steps.push(() => pageImage(`${fandomRoot(s)}/api.php`, s.t, "", "Fandom", fandomPage(s)));
      }
      if (s.wp) {
        steps.push(() => pageImage("https://en.wikipedia.org/w/api.php", s.wp, "&pilicense=any", "Wikipedia", `https://en.wikipedia.org/wiki/${s.wp}`));
      }
    }
    return steps;
  }

  // Devuelve la candidata n (0 = la mejor) o null si no hay tantas.
  async function candidateAt(c, n) {
    const key = c.id + ":" + n;
    if (imageCache[key]) return imageCache[key];
    let entry = cands.get(c.id);
    if (!entry) { entry = { list: [], steps: stepsFor(c) }; cands.set(c.id, entry); }
    while (entry.list.length <= n && entry.steps.length) {
      const hit = await entry.steps.shift()();
      if (hit && !entry.list.some(x => x.src === hit.src)) entry.list.push(hit);
    }
    const hit = entry.list[n] || null;
    if (hit) { imageCache[key] = hit; store.set(IMG_KEY, imageCache); }
    return hit;
  }

  function chosenIndex(c) { return choices[c.id]?.n || 0; }

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

  function setCredit(credit, label, page) {
    if (!credit) return;
    credit.textContent = "Imagen: ";
    if (page) {
      const a = el("a", null, label);
      a.href = page; a.target = "_blank"; a.rel = "noopener";
      credit.append(a);
    } else {
      credit.append(document.createTextNode(label));
    }
  }

  // Pinta la foto en `box`. `n` fuerza una candidata; si no, usa la elección guardada.
  // onShown(n) avisa qué candidata quedó visible (null si es URL propia o no hubo imagen).
  function paintPhoto(box, c, credit, n, onShown) {
    const token = Symbol();
    box._token = token;
    box.classList.add("loading");

    const show = (hit, idx) => {
      if (box._token !== token) return;
      if (!hit) {
        placeholder(box, c);
        if (credit) credit.textContent = "No se encontró imagen para este personaje.";
        onShown?.(null, false);
        return;
      }
      box.querySelector(".ph")?.remove();
      let img = box.querySelector("img");
      if (!img) { img = new Image(); box.append(img); }
      img.className = "";
      img.alt = `${c.name} en ${c.work}`;
      img.referrerPolicy = "no-referrer";
      img.decoding = "async";
      img.onload = () => {
        if (box._token !== token) return;
        img.classList.add("ready");
        box.classList.remove("loading");
        setCredit(credit, hit.label, hit.page);
        onShown?.(idx, true);
      };
      img.onerror = () => {
        if (box._token !== token) return;
        if (idx == null) { show(null); return; }
        delete imageCache[c.id + ":" + idx];
        enqueue(() => candidateAt(c, idx + 1)).then(next => show(next, idx + 1));
      };
      img.src = hit.src;
    };

    const own = choices[c.id]?.url || (n == null && c.img);
    if (own && n == null) {
      show({ src: own, label: choices[c.id]?.url ? "URL elegida por ti" : "Imagen fijada", page: choices[c.id]?.url ? own : c.ref }, null);
      return;
    }
    const idx = n ?? chosenIndex(c);
    enqueue(() => candidateAt(c, idx)).then(hit => {
      if (!hit && idx > 0) {
        // la elección guardada ya no existe: vuelve a la primera
        enqueue(() => candidateAt(c, 0)).then(h => show(h, 0));
      } else {
        show(hit, idx);
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

    $("#img-form").hidden = true;
    $("#img-msg").textContent = "";
    paintSheetPhoto();

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

  // ---------- Corrección de imagen en la ficha ----------
  let shownIdx = null;

  function paintSheetPhoto(n) {
    const box = $("#sheet-photo");
    const credit = $("#sheet-credit");
    box.replaceChildren();
    credit.textContent = "";
    shownIdx = null;
    paintPhoto(box, current, credit, n, idx => { shownIdx = idx; });
    $("#img-reset").hidden = !choices[current.id];
  }

  function saveChoices() { store.set(CHOICE_KEY, choices); }

  $("#img-next").addEventListener("click", async () => {
    const c = current;
    const msg = $("#img-msg");
    const from = shownIdx ?? (choices[c.id]?.url ? -1 : chosenIndex(c));
    msg.textContent = "Buscando otra imagen…";
    const next = await enqueue(() => candidateAt(c, from + 1));
    if (c !== current) return;
    if (next) {
      choices[c.id] = { n: from + 1 };
      msg.textContent = "";
    } else {
      delete choices[c.id];
      msg.textContent = "No hay más imágenes en las wikis. Volviste a la primera; puedes pegar una URL propia.";
    }
    saveChoices();
    paintSheetPhoto(next ? from + 1 : 0);
  });

  $("#img-own").addEventListener("click", () => {
    const f = $("#img-form");
    f.hidden = !f.hidden;
    if (!f.hidden) { $("#img-url").value = choices[current.id]?.url || ""; $("#img-url").focus(); }
  });

  $("#img-form").addEventListener("submit", e => {
    e.preventDefault();
    const url = $("#img-url").value.trim();
    if (!/^https?:\/\//i.test(url)) {
      $("#img-msg").textContent = "La URL debe empezar con http:// o https://";
      return;
    }
    choices[current.id] = { url };
    saveChoices();
    $("#img-form").hidden = true;
    $("#img-msg").textContent = "Imagen guardada en este navegador.";
    paintSheetPhoto();
  });

  $("#img-reset").addEventListener("click", () => {
    delete choices[current.id];
    saveChoices();
    $("#img-msg").textContent = "Volviste a la imagen automática.";
    paintSheetPhoto();
  });

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
