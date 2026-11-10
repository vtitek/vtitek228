(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

  $('.year').textContent = new Date().getFullYear();

  /* toast */
  const toastEl = $('.toast');
  let toastTimer;
  const toast = (msg) => {
    toastEl.textContent = msg;
    toastEl.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-show'), 3600);
  };

  /* theme */
  const themeMeta = $('meta[name="theme-color"]');
  const applyThemeMeta = () => { themeMeta.content = document.documentElement.dataset.theme === 'light' ? '#f6f6fb' : '#07070c'; };
  applyThemeMeta();
  $('.theme-toggle').addEventListener('click', () => {
    const root = document.documentElement;
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    applyThemeMeta();
    try { localStorage.setItem('vtitek-theme', next); } catch (e) {}
  });

  /* nav state + progress bar, throttled to one update per frame */
  const nav = $('.nav');
  const progress = $('.progress');
  let scrollQueued = false;
  const onScroll = () => {
    scrollQueued = false;
    const y = scrollY;
    nav.classList.toggle('is-scrolled', y > 20);
    const max = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${max > 0 ? Math.min(y / max, 1) : 0})`;
  };
  addEventListener('scroll', () => {
    if (!scrollQueued) { scrollQueued = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  onScroll();

  const links = $$('.nav__links a');
  const sectionObs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      links.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === `#${e.target.id}`));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  $$('main section[id]').forEach((s) => sectionObs.observe(s));

  /* mobile menu */
  const burger = $('.burger');
  const menu = $('.mobile-menu');
  const setMenu = (open) => {
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    menu.classList.toggle('is-open', open);
    menu.inert = !open;
    document.documentElement.classList.toggle('menu-open', open);
  };
  setMenu(false);
  burger.addEventListener('click', () => setMenu(burger.getAttribute('aria-expanded') !== 'true'));
  $$('a', menu).forEach((a) => a.addEventListener('click', () => setMenu(false)));
  addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
  matchMedia('(min-width: 1025px)').addEventListener('change', (e) => { if (e.matches) setMenu(false); });

  /* reveal on scroll; the class is dropped afterwards so hover/tilt transitions are not delayed */
  const revealObs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target;
      el.classList.add('is-in');
      revealObs.unobserve(el);
      const done = () => { el.classList.remove('reveal', 'is-in'); el.style.removeProperty('--d'); };
      el.addEventListener('transitionend', (ev) => { if (ev.target === el && ev.propertyName === 'opacity') done(); }, { once: false });
      setTimeout(done, 1600);
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });
  $$('.reveal').forEach((el) => {
    const siblings = [...el.parentElement.children].filter((c) => c.classList.contains('reveal'));
    el.style.setProperty('--d', `${Math.min(siblings.indexOf(el), 5) * 0.07}s`);
    revealObs.observe(el);
  });

  /* counters */
  const counterObs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target;
      const to = +el.dataset.to;
      counterObs.unobserve(el);
      if (reduceMotion) { el.textContent = to; return; }
      const start = performance.now();
      const tick = (now) => {
        const p = Math.min((now - start) / 1600, 1);
        el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, { threshold: 0.5 });
  $$('.counter').forEach((c) => counterObs.observe(c));

  /* typed words */
  const typed = $('.typed');
  if (typed && !reduceMotion) {
    const words = typed.dataset.words.split('|');
    let w = 0, i = words[0].length, deleting = true;
    const step = () => {
      if (document.hidden) { setTimeout(step, 500); return; }
      const word = words[w];
      i += deleting ? -1 : 1;
      typed.textContent = word.slice(0, i);
      let delay = deleting ? 55 : 95;
      if (!deleting && i === word.length) { deleting = true; delay = 2000; }
      else if (deleting && i === 0) { deleting = false; w = (w + 1) % words.length; delay = 300; }
      setTimeout(step, delay);
    };
    setTimeout(step, 2400);
  }

  /* reviews: marquee on desktop (needs a duplicated set), native swipe on touch */
  const reviews = $('.reviews');
  if (reviews && finePointer && !reduceMotion) {
    const track = $('.reviews__track', reviews);
    [...track.children].forEach((r) => {
      const clone = r.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      track.appendChild(clone);
    });
    reviews.classList.add('is-marquee');
  }

  /* desktop-only pointer effects */
  if (finePointer && !reduceMotion) {
    const ring = $('.cursor');
    const dot = $('.cursor-dot');
    let mx = -100, my = -100, rx = mx, ry = my, raf = 0;
    const follow = () => {
      rx += (mx - rx) * 0.2; ry += (my - ry) * 0.2;
      ring.style.transform = `translate(${rx}px, ${ry}px)`;
      raf = Math.abs(mx - rx) + Math.abs(my - ry) > 0.3 ? requestAnimationFrame(follow) : 0;
    };
    addEventListener('mousemove', (e) => {
      mx = e.clientX; my = e.clientY;
      document.body.classList.add('has-cursor');
      dot.style.transform = `translate(${mx}px, ${my}px)`;
      if (!raf) raf = requestAnimationFrame(follow);
    }, { passive: true });
    document.addEventListener('mouseleave', () => document.body.classList.remove('has-cursor'));
    const interactive = 'a, button, label, input, textarea, summary, select';
    document.addEventListener('mouseover', (e) => ring.classList.toggle('is-hover', !!e.target.closest(interactive)));

    $$('.magnetic').forEach((btn) => {
      btn.addEventListener('mousemove', (e) => {
        const r = btn.getBoundingClientRect();
        btn.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.25}px, ${(e.clientY - r.top - r.height / 2) * 0.35}px)`;
      });
      btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
    });

    $$('.spotlight').forEach((card) => {
      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${e.clientX - r.left}px`);
        card.style.setProperty('--my', `${e.clientY - r.top}px`);
      });
    });

    $$('.tilt').forEach((card) => {
      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = `perspective(900px) rotateY(${px * 8}deg) rotateX(${-py * 8}deg) translateY(-4px)`;
      });
      card.addEventListener('mouseleave', () => { card.style.transform = ''; });
    });
  }

  /* portfolio filter */
  $$('.filter').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.filter').forEach((b) => {
        b.classList.toggle('is-active', b === btn);
        b.setAttribute('aria-pressed', String(b === btn));
      });
      const f = btn.dataset.filter;
      $$('.work').forEach((w) => {
        const show = f === 'all' || w.dataset.cat === f;
        w.classList.toggle('is-hidden', !show);
        if (show) w.classList.remove('reveal', 'is-in');
      });
    });
  });

  /* calculator */
  const calc = $('.calc');
  const totalEls = $$('.calc__total');
  const daysEls = $$('.calc__days');
  const pagesOut = $('.pages-out');
  const range = $('.range', calc);
  const fmt = (n) => new Intl.NumberFormat('ru-RU').format(n) + ' ₽';
  const TYPES = {
    25000: { included: 1, perPage: 3000, days: 7 },
    60000: { included: 10, perPage: 3000, days: 14 },
    120000: { included: 15, perPage: 4000, days: 21 },
  };
  let shown = 0, anim;
  const recalc = () => {
    const type = $('input[name="type"]:checked', calc);
    const base = +type.value;
    const t = TYPES[base];
    const pages = +range.value;
    const extraPages = Math.max(0, pages - t.included);
    const extras = $$('input[name="extra"]:checked', calc).reduce((s, el) => s + +el.value, 0);
    const urgent = $('input[name="urgent"]', calc).checked;
    let total = base + extraPages * t.perPage + extras;
    if (urgent) total *= 1.3;
    total = Math.round(total / 1000) * 1000;
    let days = t.days + Math.ceil(extraPages / 3);
    if (urgent) days = Math.ceil(days * 0.6);

    pagesOut.textContent = pages;
    range.setAttribute('aria-valuetext', `${pages} стр.`);
    range.style.setProperty('--fill', `${((pages - range.min) / (range.max - range.min)) * 100}%`);
    daysEls.forEach((el) => { el.textContent = `Срок: ~${days} дн.`; });
    calc.dataset.summary = `${type.nextElementSibling.textContent}, ${pages} стр., ~${fmt(total)}, ~${days} дн.`;

    cancelAnimationFrame(anim);
    const from = shown, start = performance.now();
    const tick = (now) => {
      const p = reduceMotion ? 1 : Math.min((now - start) / 450, 1);
      shown = Math.round(from + (total - from) * (1 - Math.pow(1 - p, 3)));
      totalEls.forEach((el) => { el.textContent = fmt(shown); });
      if (p < 1) anim = requestAnimationFrame(tick);
    };
    anim = requestAnimationFrame(tick);
  };
  calc.addEventListener('input', recalc);
  calc.addEventListener('change', recalc);
  recalc();

  /* prefill form message from plan / calculator */
  const msg = $('#f-msg');
  $$('[data-plan]').forEach((a) => a.addEventListener('click', () => { msg.value = `Интересует тариф «${a.dataset.plan}».`; }));
  $$('.calc__cta').forEach((a) => a.addEventListener('click', () => { msg.value = `Расчёт из калькулятора: ${calc.dataset.summary}.`; }));

  /* contact form: no backend yet — hands the message to the visitor's mail app */
  const form = $('.form');
  const status = $('.form__status');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    let firstBad = null;
    $$('[required]', form).forEach((input) => {
      const bad = !input.value.trim();
      input.closest('.field').classList.toggle('is-invalid', bad);
      input.setAttribute('aria-invalid', String(bad));
      if (bad && !firstBad) firstBad = input;
    });
    if (firstBad) { status.textContent = 'Заполните имя и контакт 🙏'; firstBad.focus(); return; }
    const data = new FormData(form);
    const body = `Имя: ${data.get('name')}\nКонтакт: ${data.get('contact')}\n\n${data.get('message') || ''}`;
    window.location.href = `mailto:hello@vtitek.ru?subject=${encodeURIComponent('Заявка с сайта vtitek')}&body=${encodeURIComponent(body)}`;
    status.textContent = '';
    form.reset();
    toast('Спасибо! Открываю почту — отвечу в течение часа 🚀');
  });
  $$('[required]', form).forEach((i) => i.addEventListener('input', () => {
    i.closest('.field').classList.remove('is-invalid');
    i.removeAttribute('aria-invalid');
  }));

  /* hero canvas: connected particles, paused off-screen and in background tabs */
  const canvas = $('.hero__canvas');
  if (canvas && !reduceMotion) {
    const ctx = canvas.getContext('2d');
    const LINK = 130, LINK2 = LINK * LINK;
    let w = 0, h = 0, pts = [], mouse = { x: -999, y: -999 }, visible = true, raf = 0;
    const seed = () => {
      const cap = finePointer ? 80 : 32;
      const n = Math.min(cap, Math.floor((w * h) / 17000));
      pts = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35 }));
    };
    const resize = () => {
      const nw = canvas.clientWidth, nh = canvas.clientHeight;
      const widthChanged = nw !== w;
      w = nw; h = nh;
      const dpr = Math.min(devicePixelRatio || 1, finePointer ? 2 : 1.5);
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // mobile address-bar show/hide only changes height; keep particles instead of re-seeding
      if (widthChanged || !pts.length) seed();
    };
    resize();
    new ResizeObserver(resize).observe(canvas);
    if (finePointer) {
      canvas.parentElement.addEventListener('mousemove', (e) => {
        const r = canvas.getBoundingClientRect();
        mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
      }, { passive: true });
      canvas.parentElement.addEventListener('mouseleave', () => { mouse.x = mouse.y = -999; });
    }
    const start = () => { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(draw); };
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; start(); }).observe(canvas);
    document.addEventListener('visibilitychange', start);

    function draw() {
      raf = 0;
      if (!visible || document.hidden) return;
      ctx.clearRect(0, 0, w, h);
      const rgb = document.documentElement.dataset.theme === 'light' ? '90,70,200' : '170,160,255';
      for (const p of pts) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        const dx = p.x - mouse.x, dy = p.y - mouse.y, d2 = dx * dx + dy * dy;
        if (d2 < 14400 && d2 > 0) { const d = Math.sqrt(d2); p.x += dx / d * 1.2; p.y += dy / d * 1.2; }
      }
      ctx.lineWidth = 1;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        for (let j = i + 1; j < pts.length; j++) {
          const b = pts[j], dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
          if (d2 < LINK2) {
            ctx.strokeStyle = `rgba(${rgb},${(1 - Math.sqrt(d2) / LINK) * 0.35})`;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }
      ctx.fillStyle = `rgba(${rgb},0.8)`;
      ctx.beginPath();
      for (const a of pts) { ctx.moveTo(a.x + 1.6, a.y); ctx.arc(a.x, a.y, 1.6, 0, Math.PI * 2); }
      ctx.fill();
      start();
    }
    start();
  }
})();
