/* =====================================================
   妙傳寺サイト 共通アニメーション スクリプト
   ===================================================== */
(function () {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ====== 季節判定 ======
  const month = new Date().getMonth() + 1;
  let season = 'summer';
  if (month >= 3 && month <= 5) season = 'spring';
  else if (month >= 6 && month <= 8) season = 'summer';
  else if (month >= 9 && month <= 11) season = 'autumn';
  else season = 'winter';
  document.body.classList.add('season-' + season);

  // ====== 1-A. スクロール連動フェードイン ======
  function setupFadeIn() {
    if (reducedMotion) return;
    if (!('IntersectionObserver' in window)) return;
    const targets = document.querySelectorAll(
      'section, .deity-card, .news-item, .grounds-item, .event-item, .feature-card, .prayer-card, .amulet-card, .issue-card, .timeline-item, .card, .faq-item, .form-section'
    );
    if (!targets.length) return;
    document.body.classList.add('has-fade-in');

    targets.forEach(el => {
      const rect = el.getBoundingClientRect();
      // 初期表示の最初の画面に既にある要素はアニメーションせずすぐ表示
      if (rect.top < window.innerHeight * 0.85) {
        el.classList.add('fade-target', 'is-visible');
      } else {
        el.classList.add('fade-target');
      }
    });

    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    targets.forEach(el => {
      if (!el.classList.contains('is-visible')) io.observe(el);
    });
  }

  // ====== スクロール進行バー + 戻るボタン + ヘッダー追従 ======
  function setupScrollUI() {
    // 進行バー
    const progress = document.createElement('div');
    progress.className = 'scroll-progress';
    progress.id = 'scrollProgress';
    document.body.appendChild(progress);

    // 戻るボタン
    const backBtn = document.createElement('button');
    backBtn.className = 'back-to-top';
    backBtn.id = 'backToTop';
    backBtn.setAttribute('aria-label', 'トップへ戻る');
    backBtn.innerHTML = '↑';
    document.body.appendChild(backBtn);
    backBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
    });

    const header = document.querySelector('header');
    let lastScroll = 0;
    let ticking = false;

    function updateScroll() {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const pct = docHeight > 0 ? Math.min((scrollTop / docHeight) * 100, 100) : 0;

      progress.style.width = pct + '%';
      backBtn.classList.toggle('is-visible', scrollTop > 400);

      if (header) {
        header.classList.toggle('is-scrolled', scrollTop > 30);
        // 下スクロールで隠す、上スクロールで再表示
        if (scrollTop > 200 && scrollTop > lastScroll) {
          header.classList.add('is-hidden');
        } else {
          header.classList.remove('is-hidden');
        }
      }

      lastScroll = scrollTop;
      ticking = false;
    }

    window.addEventListener('scroll', () => {
      if (!ticking) {
        window.requestAnimationFrame(updateScroll);
        ticking = true;
      }
    }, { passive: true });
  }

  // ====== 3-E. リップル効果 ======
  function setupRipple() {
    if (reducedMotion) return;
    document.addEventListener('click', (e) => {
      const btn = e.target.closest(
        'button, .submit-btn, .back-btn, .home-btn, .download-btn, .card-link, .toc-grid a, nav.main-nav a'
      );
      if (!btn) return;
      // フォーム送信などを邪魔しない
      const rect = btn.getBoundingClientRect();
      const ripple = document.createElement('span');
      ripple.className = 'ripple-effect';
      const size = Math.max(rect.width, rect.height);
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
      ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
      btn.appendChild(ripple);
      setTimeout(() => ripple.remove(), 750);
    });
  }

  // ====== 1-C / 2-A. 季節のパーティクル ======
  function spawnParticles(containerClass, count, classNames, durations) {
    if (reducedMotion) return;
    const container = document.createElement('div');
    container.className = containerClass;
    document.body.appendChild(container);
    const adjusted = window.innerWidth < 600 ? Math.floor(count * 0.6) : count;
    for (let i = 0; i < adjusted; i++) {
      const p = document.createElement('span');
      const variant = classNames[Math.floor(Math.random() * classNames.length)];
      p.className = variant;
      p.style.left = (Math.random() * 100) + '%';
      const dur = durations[0] + Math.random() * (durations[1] - durations[0]);
      p.style.animationDuration = dur.toFixed(1) + 's';
      p.style.animationDelay = (Math.random() * dur).toFixed(1) + 's';
      p.style.opacity = (0.4 + Math.random() * 0.5).toFixed(2);
      container.appendChild(p);
    }
  }

  function setupSeasonalParticles() {
    if (reducedMotion) return;
    if (season === 'spring') {
      spawnParticles('sakura-container', 14, ['sakura', 'sakura s2', 'sakura s3'], [9, 16]);
    } else if (season === 'autumn') {
      spawnParticles('leaves-container', 12, ['leaf', 'leaf l2', 'leaf l3'], [10, 16]);
    } else if (season === 'winter') {
      spawnParticles('snow-container', 26, ['snowflake', 'snowflake f2', 'snowflake f3'], [9, 14]);
    }
    // 夏は控えめに(パーティクルなし)
  }

  // ====== 初期化 ======
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    setupFadeIn();
    setupScrollUI();
    setupRipple();
    setupSeasonalParticles();
  }
})();
