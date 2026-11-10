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
    toastTimer = setTimeout(() => toastEl.classList.remove('is-show'), 3200);
  };

  /* theme */
  $('.theme-toggle').addEventListener('click', () => {
    const root = document.documentElement;
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    try { localStorage.setItem('vtitek-theme', next); } catch (e) {}
  });

  /* nav: scrolled state, progress bar, active link */
  const nav = $('.nav');
  const progress = $('.progress');
  const onScroll = () => {
    const y = scrollY;
    nav.classList.toggle('is-scrolled', y > 20);
    const max = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
  };
  addEventListener('scroll', onScroll, { passive: true });
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
    menu.classList.toggle('is-open', open);
    menu.setAttribute('aria-hidden', String(!open));
    document.body.style.overflow = open ? 'hidden' : '';
  };
  burger.addEventListener('click', () => setMenu(burger.getAttribute('aria-expanded') !== 'true'));
  $$('a', menu).forEach((a) => a.addEventListener('click', () => setMenu(false)));
  addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

  /* reveal on scroll with sibling stagger */
  const revealObs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      revealObs.unobserve(e.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  $$('.reveal').forEach((el) => {
    const siblings = [...el.parentElement.children].filter((c) => c.classList.contains('reveal'));
    el.style.setProperty('--d', `${Math.min(siblings.indexOf(el), 6) * 0.08}s`);
    revealObs.observe(el);
  });

  /* counters */
  const counterObs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target;
      const to = +el.dataset.to;
      const dur = reduceMotion ? 0 : 1600;
      const start = performance.now();
      const tick = (now) => {
        const p = dur ? Math.min((now - start) / dur, 1) : 1;
        el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      counterObs.unobserve(el);
    });
  }, { threshold: 0.6 });
  $$('.counter').forEach((c) => counterObs.observe(c));

  /* typed words */
  const typed = $('.typed');
  if (typed && !reduceMotion) {
    const words = typed.dataset.words.split('|');
    let w = 0, i = words[0].length, deleting = true;
    const step = () => {
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

  /* custom cursor + magnetic buttons + spotlight + tilt (desktop only) */
  if (finePointer && !reduceMotion) {
    const ring = $('.cursor');
    const dot = $('.cursor-dot');
    let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;
    addEventListener('mousemove', (e) => {
      mx = e.clientX; my = e.clientY;
      document.body.classList.add('has-cursor');
      dot.style.transform = `translate(${mx}px, ${my}px)`;
    });
    document.addEventListener('mouseleave', () => document.body.classList.remove('has-cursor'));
    const loop = () => {
      rx += (mx - rx) * 0.18; ry += (my - ry) * 0.18;
      ring.style.transform = `translate(${rx}px, ${ry}px)`;
      requestAnimationFrame(loop);
    };
    loop();
    $$('a, button, label, input, textarea, summary').forEach((el) => {
      el.addEventListener('mouseenter', () => ring.classList.add('is-hover'));
      el.addEventListener('mouseleave', () => ring.classList.remove('is-hover'));
    });

    $$('.magnetic').forEach((btn) => {
      btn.addEventListener('mousemove', (e) => {
        const r = btn.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2;
        const y = e.clientY - r.top - r.height / 2;
        btn.style.transform = `translate(${x * 0.25}px, ${y * 0.35}px)`;
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
        card.style.transform = `perspective(900px) rotateY(${px * 10}deg) rotateX(${-py * 10}deg) translateY(-4px)`;
      });
      card.addEventListener('mouseleave', () => { card.style.transform = ''; });
    });
  }

  /* portfolio filter */
  $$('.filter').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.filter').forEach((b) => b.classList.toggle('is-active', b === btn));
      const f = btn.dataset.filter;
      $$('.work').forEach((w) => {
        const show = f === 'all' || w.dataset.cat === f;
        w.classList.toggle('is-hidden', !show);
        if (show) w.classList.add('is-in');
      });
    });
  });

  /* calculator */
  const calc = $('.calc');
  const totalEl = $('.calc__total');
  const daysEl = $('.calc__days');
  const pagesOut = $('.pages-out');
  const range = $('.range', calc);
  const fmt = (n) => new Intl.NumberFormat('ru-RU').format(n) + ' ₽';
  let shown = 0, anim;
  const recalc = () => {
    const type = $('input[name="type"]:checked', calc);
    const base = +type.value;
    const pages = +range.value;
    const extras = $$('input[name="extra"]:checked', calc).reduce((s, el) => s + +el.value, 0);
    const urgent = $('input[name="urgent"]', calc).checked;
    const included = base === 25000 ? 1 : base === 60000 ? 10 : 15;
    const perPage = base === 120000 ? 4000 : 3000;
    let total = base + Math.max(0, pages - included) * perPage + extras;
    if (urgent) total *= 1.3;
    total = Math.round(total / 1000) * 1000;

    let days = (base === 25000 ? 7 : base === 60000 ? 14 : 21) + Math.ceil(Math.max(0, pages - included) / 3);
    if (urgent) days = Math.ceil(days * 0.6);

    pagesOut.textContent = pages;
    range.style.setProperty('--fill', `${((pages - range.min) / (range.max - range.min)) * 100}%`);
    daysEl.textContent = `Срок: ~${days} дн.`;
    calc.dataset.summary = `${type.nextElementSibling.textContent}, ${pages} стр., ~${fmt(total)}`;

    cancelAnimationFrame(anim);
    const from = shown, start = performance.now();
    const tick = (now) => {
      const p = reduceMotion ? 1 : Math.min((now - start) / 500, 1);
      shown = Math.round(from + (total - from) * (1 - Math.pow(1 - p, 3)));
      totalEl.textContent = fmt(shown);
      if (p < 1) anim = requestAnimationFrame(tick);
    };
    anim = requestAnimationFrame(tick);
  };
  calc.addEventListener('input', recalc);
  recalc();

  /* prefill form message from plan / calculator */
  const msg = $('#f-msg');
  $$('[data-plan]').forEach((a) => a.addEventListener('click', () => { msg.value = `Интересует тариф «${a.dataset.plan}».`; }));
  $('.calc__cta').addEventListener('click', () => { msg.value = `Расчёт из калькулятора: ${calc.dataset.summary}.`; });

  /* contact form: no backend yet — opens Telegram/mail with the message */
  const form = $('.form');
  const status = $('.form__status');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    let ok = true;
    $$('[required]', form).forEach((input) => {
      const bad = !input.value.trim();
      input.closest('.field').classList.toggle('is-invalid', bad);
      if (bad) ok = false;
    });
    if (!ok) { status.textContent = 'Заполните имя и контакт 🙏'; return; }
    const data = new FormData(form);
    const body = `Имя: ${data.get('name')}\nКонтакт: ${data.get('contact')}\n\n${data.get('message') || ''}`;
    window.location.href = `mailto:hello@vtitek.ru?subject=${encodeURIComponent('Заявка с сайта vtitek')}&body=${encodeURIComponent(body)}`;
    status.textContent = '';
    form.reset();
    toast('Спасибо! Заявка подготовлена — отвечу в течение часа 🚀');
  });
  $$('[required]', form).forEach((i) => i.addEventListener('input', () => i.closest('.field').classList.remove('is-invalid')));

  /* hero canvas: connected particles reacting to the cursor */
  const canvas = $('.hero__canvas');
  if (canvas && !reduceMotion) {
    const ctx = canvas.getContext('2d');
    let w, h, dpr, pts = [], mouse = { x: -999, y: -999 }, running = true;
    const resize = () => {
      dpr = Math.min(devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.min(90, Math.floor((w * h) / 16000));
      pts = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35 }));
    };
    resize();
    addEventListener('resize', resize);
    canvas.parentElement.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
    });
    canvas.parentElement.addEventListener('mouseleave', () => { mouse.x = mouse.y = -999; });
    new IntersectionObserver(([e]) => { running = e.isIntersecting; if (running) draw(); }).observe(canvas);

    function draw() {
      if (!running) return;
      ctx.clearRect(0, 0, w, h);
      const light = document.documentElement.dataset.theme === 'light';
      const rgb = light ? '90,70,200' : '170,160,255';
      for (const p of pts) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        const dx = p.x - mouse.x, dy = p.y - mouse.y, d = Math.hypot(dx, dy);
        if (d < 120) { p.x += dx / d * 1.2; p.y += dy / d * 1.2; }
      }
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        for (let j = i + 1; j < pts.length; j++) {
          const b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 130) {
            ctx.strokeStyle = `rgba(${rgb},${(1 - d / 130) * 0.35})`;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
        ctx.fillStyle = `rgba(${rgb},0.8)`;
        ctx.beginPath(); ctx.arc(a.x, a.y, 1.6, 0, Math.PI * 2); ctx.fill();
      }
      requestAnimationFrame(draw);
    }
  }
})();
