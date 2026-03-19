/**
 * YooService — script.js
 * Version: 2.0 | Production
 * Features: Navigation, ScrollReveal, FAQ, Portfolio Filter,
 *           Counter Animation, Form (Formspree), Chat Widget,
 *           Analytics, Performance optimizations
 */

'use strict';

/* ═══════════════════════════════════════════════════════════
   UTILITY HELPERS
═══════════════════════════════════════════════════════════ */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function debounce(fn, delay = 100) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

function trackEvent(name, params = {}) {
  if (typeof gtag !== 'undefined') {
    gtag('event', name, params);
  }
}

/* ═══════════════════════════════════════════════════════════
   ANNOUNCEMENT BAR
═══════════════════════════════════════════════════════════ */
(function initAnnouncement() {
  const bar = $('#announcement');
  const btn = $('#ann-close');
  if (!bar || !btn) return;

  // Remember dismissed state (sessionStorage)
  if (sessionStorage.getItem('ann_dismissed')) {
    bar.remove();
    return;
  }

  btn.addEventListener('click', () => {
    bar.style.transition = 'opacity .3s ease, max-height .3s ease';
    bar.style.opacity = '0';
    bar.style.maxHeight = '0';
    bar.style.overflow = 'hidden';
    setTimeout(() => bar.remove(), 320);
    sessionStorage.setItem('ann_dismissed', '1');
  });
})();

/* ═══════════════════════════════════════════════════════════
   NAVIGATION — sticky scroll + mobile
═══════════════════════════════════════════════════════════ */
(function initNav() {
  const nav    = $('#nav');
  const ham    = $('#ham');
  const mobNav = $('#mob-nav');
  const btt    = $('#btt');

  if (!nav) return;

  // Scroll effects
  let lastY = 0;
  const onScroll = debounce(() => {
    const y = window.scrollY;
    nav.classList.toggle('scrolled', y > 60);
    if (btt) {
      btt.classList.toggle('show', y > 500);
    }
    lastY = y;
  }, 50);

  window.addEventListener('scroll', onScroll, { passive: true });

  // Mobile nav toggle
  if (ham && mobNav) {
    ham.addEventListener('click', () => {
      const isOpen = mobNav.classList.toggle('open');
      ham.setAttribute('aria-expanded', isOpen);
      mobNav.setAttribute('aria-hidden', !isOpen);
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });
  }

  // Close mobile nav on outside click
  document.addEventListener('click', (e) => {
    if (mobNav && mobNav.classList.contains('open') &&
        !mobNav.contains(e.target) && !ham.contains(e.target)) {
      closeMob();
    }
  });

  // Smooth close on nav link click
  $$('.nav-links a, .mob-nav a').forEach(a => {
    a.addEventListener('click', () => {
      if (window.innerWidth < 768) closeMob();
    });
  });

  // Active nav link on scroll
  const sections = $$('section[id], #hero');
  const navLinks = $$('.nav-links a[href^="#"]');

  const sectionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        navLinks.forEach(l => {
          const active = l.getAttribute('href') === `#${id}`;
          l.style.color = active ? 'var(--lime)' : '';
        });
      }
    });
  }, { rootMargin: '-40% 0px -55% 0px' });

  sections.forEach(s => sectionObserver.observe(s));
})();

function closeMob() {
  const ham    = $('#ham');
  const mobNav = $('#mob-nav');
  if (!mobNav) return;
  mobNav.classList.remove('open');
  ham && ham.setAttribute('aria-expanded', 'false');
  mobNav.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

/* ═══════════════════════════════════════════════════════════
   SCROLL REVEAL
═══════════════════════════════════════════════════════════ */
(function initReveal() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.07, rootMargin: '0px 0px -40px 0px' });

  $$('.rv, .rvl, .rvr').forEach(el => observer.observe(el));
})();

/* ═══════════════════════════════════════════════════════════
   COUNTER ANIMATION (Hero Stats)
═══════════════════════════════════════════════════════════ */
(function initCounters() {
  const counters = $$('[data-count]');
  if (!counters.length) return;

  function animateCounter(el) {
    const target = parseInt(el.dataset.count, 10);
    const duration = 1800;
    const start = performance.now();

    function update(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(eased * target);
      if (progress < 1) requestAnimationFrame(update);
    }

    requestAnimationFrame(update);
  }

  const obs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  counters.forEach(c => obs.observe(c));
})();

/* ═══════════════════════════════════════════════════════════
   FAQ ACCORDION
═══════════════════════════════════════════════════════════ */
function toggleFAQ(btn) {
  const item = btn.closest('.faq-item');
  const answer = item.querySelector('.faq-a');
  const isOpen = btn.getAttribute('aria-expanded') === 'true';

  // Close all
  $$('.faq-q[aria-expanded="true"]').forEach(q => {
    if (q !== btn) {
      q.setAttribute('aria-expanded', 'false');
      q.closest('.faq-item').querySelector('.faq-a').classList.remove('open');
    }
  });

  // Toggle current
  btn.setAttribute('aria-expanded', !isOpen);
  answer.classList.toggle('open', !isOpen);

  // Track engagement
  if (!isOpen) {
    const question = btn.querySelector('span:first-child')?.textContent?.trim();
    trackEvent('faq_opened', { question: question?.substring(0, 60) });
  }
}

// Keyboard support for FAQ
document.addEventListener('keydown', e => {
  if (e.target.classList.contains('faq-q') && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    toggleFAQ(e.target);
  }
});

/* ═══════════════════════════════════════════════════════════
   PORTFOLIO FILTER
═══════════════════════════════════════════════════════════ */
function filterPF(cat, btn) {
  // Update buttons
  $$('.pf-btn').forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-pressed', 'false');
  });
  btn.classList.add('active');
  btn.setAttribute('aria-pressed', 'true');

  // Filter cards
  $$('.pf-card').forEach(card => {
    const show = cat === 'all' || card.dataset.cat === cat;
    card.style.display = show ? '' : 'none';
    if (show) {
      card.style.animation = 'none';
      void card.offsetWidth; // reflow
      card.style.animation = 'scaleIn .3s ease both';
    }
  });

  trackEvent('portfolio_filter', { category: cat });
}

/* ═══════════════════════════════════════════════════════════
   CONTACT FORM — Formspree
═══════════════════════════════════════════════════════════ */
(function initForm() {
  const form = $('#contact-form');
  if (!form) return;

  form.addEventListener('submit', handleSubmit);
})();

async function handleSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const btn  = $('#cf-btn');
  const txt  = $('#btn-txt');

  // Validate
  if (!validateForm()) return;

  // Disable and show loading
  btn.disabled = true;
  if (txt) txt.textContent = 'Sending…';
  btn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> <span>Sending…</span>';

  const data = {
    name:    $('#fn')?.value?.trim(),
    email:   $('#fe')?.value?.trim(),
    phone:   $('#fp')?.value?.trim(),
    service: $('#fs')?.value,
    budget:  $('#fb')?.value,
    message: $('#fm')?.value?.trim(),
    _subject: `New Quote Request — ${$('#fs')?.value || 'General'} from ${$('#fn')?.value?.trim()}`,
    _replyto: $('#fe')?.value?.trim(),
  };

  try {
    const res = await fetch('https://formspree.io/f/mwvryvjj', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(data)
    });

    if (res.ok) {
      // Success
      const formFields = $('#form-fields');
      const formSuccess = $('#form-success');
      if (formFields) formFields.style.display = 'none';
      if (formSuccess) formSuccess.style.display = 'block';

      // Track conversion
      trackEvent('contact_form_submit', {
        service: data.service,
        budget: data.budget
      });

      // Google Ads conversion (if configured)
      if (typeof gtag !== 'undefined') {
        gtag('event', 'conversion', { 'send_to': 'AW-XXXXXXXXXX/XXXXXXXXXX' });
      }

    } else {
      const errData = await res.json();
      const errMsg = errData?.errors?.map(x => x.message).join(', ') || 'Please try again.';
      showFormError(`Error: ${errMsg}`);
      resetButton();
    }

  } catch (err) {
    console.error('Form error:', err);
    showFormError('Network error. Please email us at yoowebsites@gmail.com or message on WhatsApp.');
    resetButton();
  }
}

function validateForm() {
  let valid = true;

  const fields = [
    { id: 'fn', errId: 'fn-err', msg: 'Please enter your name.' },
    { id: 'fe', errId: 'fe-err', msg: 'Please enter a valid email address.', type: 'email' },
    { id: 'fm', errId: 'fm-err', msg: 'Please describe your project.' },
  ];

  fields.forEach(({ id, errId, msg, type }) => {
    const el  = $(`#${id}`);
    const err = $(`#${errId}`);
    if (!el) return;

    const val = el.value.trim();
    let isInvalid = !val;

    if (type === 'email' && val) {
      isInvalid = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
    }

    if (isInvalid) {
      el.classList.add('error');
      if (err) err.textContent = msg;
      valid = false;
    } else {
      el.classList.remove('error');
      if (err) err.textContent = '';
    }
  });

  return valid;
}

// Clear errors on input
document.addEventListener('input', (e) => {
  if (e.target.classList.contains('error')) {
    e.target.classList.remove('error');
    const errEl = document.getElementById(e.target.id + '-err');
    if (errEl) errEl.textContent = '';
  }
});

function showFormError(msg) {
  // Show error as notification
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#ff5c4d;color:#fff;padding:12px 24px;border-radius:999px;font-size:.88rem;font-weight:600;z-index:9999;box-shadow:0 8px 24px rgba(255,92,77,.35);animation:fadeUp .3s ease both';
  div.textContent = msg;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 5000);
}

function resetButton() {
  const btn = $('#cf-btn');
  if (!btn) return;
  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-paper-plane" aria-hidden="true"></i> <span>Send Free Quote Request</span>';
}

/* ═══════════════════════════════════════════════════════════
   CHAT WIDGET
═══════════════════════════════════════════════════════════ */
function closeChat() {
  const popup  = $('#chat-popup');
  const toggle = $('#chat-toggle');
  if (popup) {
    popup.hidden = true;
    toggle?.setAttribute('aria-expanded', 'false');
  }
}

(function initChat() {
  const toggle = $('#chat-toggle');
  const popup  = $('#chat-popup');
  if (!toggle || !popup) return;

  toggle.addEventListener('click', () => {
    const isHidden = popup.hidden;
    popup.hidden = !isHidden;
    toggle.setAttribute('aria-expanded', isHidden);

    if (isHidden) {
      // Remove badge
      const badge = toggle.querySelector('.chat-badge');
      if (badge) badge.style.display = 'none';
      trackEvent('chat_widget_opened');
    }
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !popup.hidden) closeChat();
  });

  // Show with delay if user has scrolled 30%
  const observer = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) {
      setTimeout(() => {
        if (popup.hidden) {
          // Subtle pulse to draw attention
          toggle.style.animation = 'pulse-ring 1s ease both';
        }
      }, 8000);
    }
  }, { threshold: 0.5 });

  const pricingSection = $('#pricing');
  if (pricingSection) observer.observe(pricingSection);
})();

/* ═══════════════════════════════════════════════════════════
   SMOOTH SCROLL FOR ANCHOR LINKS
═══════════════════════════════════════════════════════════ */
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[href^="#"]');
  if (!link) return;

  const id = link.getAttribute('href').slice(1);
  const target = document.getElementById(id);
  if (!target) return;

  e.preventDefault();

  // Offset for sticky nav
  const navH = $('#nav')?.offsetHeight || 64;
  const y = target.getBoundingClientRect().top + window.scrollY - navH - 8;

  window.scrollTo({ top: y, behavior: 'smooth' });

  // Update URL
  history.pushState(null, '', `#${id}`);

  // Track navigation
  trackEvent('anchor_click', { target: id });
});

/* ═══════════════════════════════════════════════════════════
   LAZY LOAD IMAGES (Native + fallback)
═══════════════════════════════════════════════════════════ */
(function initLazyLoad() {
  if ('loading' in HTMLImageElement.prototype) return; // Native lazy load supported

  // Fallback for older browsers
  const images = $$('img[loading="lazy"]');
  const imgObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        if (img.dataset.src) img.src = img.dataset.src;
        imgObserver.unobserve(img);
      }
    });
  }, { rootMargin: '200px 0px' });

  images.forEach(img => imgObserver.observe(img));
})();

/* ═══════════════════════════════════════════════════════════
   PERFORMANCE — Prefetch on hover
═══════════════════════════════════════════════════════════ */
(function initPrefetch() {
  $$('a[href]:not([href^="#"]):not([href^="mailto"]):not([href^="tel"]):not([href^="https://wa"])').forEach(link => {
    link.addEventListener('mouseenter', () => {
      const prefetch = document.createElement('link');
      prefetch.rel = 'prefetch';
      prefetch.href = link.href;
      if (!$(`link[href="${link.href}"]`)) {
        document.head.appendChild(prefetch);
      }
    }, { once: true });
  });
})();

/* ═══════════════════════════════════════════════════════════
   COPY EMAIL TO CLIPBOARD
═══════════════════════════════════════════════════════════ */
(function initEmailCopy() {
  $$('a[href^="mailto:"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const email = link.href.replace('mailto:', '');
      if (navigator.clipboard) {
        // Allow default action but also copy
        navigator.clipboard.writeText(email).catch(() => {});
      }
    });
  });
})();

/* ═══════════════════════════════════════════════════════════
   SERVICE WORKER REGISTRATION (PWA / Caching)
═══════════════════════════════════════════════════════════ */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      console.log('[SW] Registered:', reg.scope);
    }).catch(err => {
      // SW not found — not critical
    });
  });
}

/* ═══════════════════════════════════════════════════════════
   SEARCH CONSOLE / ANALYTICS EVENTS
═══════════════════════════════════════════════════════════ */
(function initTracking() {
  // Track CTA clicks
  $$('[class*="btn-primary"], [class*="btn-outline"], .nav-cta').forEach(btn => {
    btn.addEventListener('click', () => {
      trackEvent('cta_click', {
        cta_text: btn.textContent?.trim()?.substring(0, 40),
        cta_location: btn.closest('section')?.id || 'nav'
      });
    });
  });

  // Track portfolio card views
  const pfObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const title = entry.target.querySelector('h3')?.textContent;
        trackEvent('portfolio_item_viewed', { item: title });
        pfObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  $$('.pf-card').forEach(c => pfObserver.observe(c));

  // Track scroll depth
  const depths = [25, 50, 75, 90];
  const tracked = new Set();

  window.addEventListener('scroll', debounce(() => {
    const scrollPct = Math.round(
      (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100
    );
    depths.forEach(d => {
      if (scrollPct >= d && !tracked.has(d)) {
        tracked.add(d);
        trackEvent('scroll_depth', { depth: d });
      }
    });
  }, 200), { passive: true });

  // Track time on page
  const startTime = Date.now();
  window.addEventListener('beforeunload', () => {
    const seconds = Math.round((Date.now() - startTime) / 1000);
    if (seconds > 5) {
      trackEvent('time_on_page', { seconds });
    }
  });
})();

/* ═══════════════════════════════════════════════════════════
   TYPEWRITER EFFECT (Optional — hero or quote section)
═══════════════════════════════════════════════════════════ */
(function initTypewriter() {
  const el = $('#typewriter');
  if (!el) return;

  const phrases = [
    'Website Design Pakistan',
    'Logo Design',
    'Real Estate Websites',
    'SEO Optimization',
    'Landing Page Design'
  ];

  let pi = 0, ci = 0, deleting = false;

  function type() {
    const current = phrases[pi];
    if (deleting) {
      el.textContent = current.slice(0, ci--);
    } else {
      el.textContent = current.slice(0, ++ci);
    }

    let delay = deleting ? 40 : 70;
    if (!deleting && ci === current.length) {
      delay = 2200;
      deleting = true;
    } else if (deleting && ci === 0) {
      deleting = false;
      pi = (pi + 1) % phrases.length;
      delay = 350;
    }

    setTimeout(type, delay);
  }

  type();
})();

/* ═══════════════════════════════════════════════════════════
   TOOLTIP INIT (Accessible)
═══════════════════════════════════════════════════════════ */
$$('[data-tooltip]').forEach(el => {
  el.setAttribute('tabindex', '0');
  el.setAttribute('aria-describedby', 'tooltip');

  el.addEventListener('mouseenter', showTooltip);
  el.addEventListener('focus', showTooltip);
  el.addEventListener('mouseleave', hideTooltip);
  el.addEventListener('blur', hideTooltip);
});

function showTooltip(e) {
  const text = e.currentTarget.dataset.tooltip;
  let tip = $('#tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'tooltip';
    tip.role = 'tooltip';
    tip.style.cssText = 'position:fixed;background:var(--ink2);color:var(--text);border:1px solid var(--border);padding:6px 12px;border-radius:8px;font-size:.78rem;z-index:9999;pointer-events:none;max-width:200px;line-height:1.4';
    document.body.appendChild(tip);
  }
  tip.textContent = text;
  const rect = e.currentTarget.getBoundingClientRect();
  tip.style.left = `${rect.left}px`;
  tip.style.top  = `${rect.bottom + 6}px`;
  tip.hidden = false;
}

function hideTooltip() {
  const tip = $('#tooltip');
  if (tip) tip.hidden = true;
}

/* ═══════════════════════════════════════════════════════════
   INIT ON DOM READY
═══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  console.log('%c⚡ YooService v2.0 | yooservice.github.io', 'color:#c8f135;font-weight:bold;font-size:13px;');

  // Add loaded class for CSS transitions
  document.documentElement.classList.add('js-loaded');
});
