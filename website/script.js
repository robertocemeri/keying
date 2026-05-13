// Minimal landing-page enhancements.
// Avoid framework-y choices — this should ship fast and be auditable.

(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Reveal-on-scroll for any element marked `.reveal`.
  const reveals = document.querySelectorAll(".reveal");
  if (reveals.length && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 }
    );
    reveals.forEach((el) => io.observe(el));
  }

  // Animate the FAQ open/close beyond the native `details` toggle.
  document.querySelectorAll(".faq__item").forEach((d) => {
    const body = d.querySelector(".faq__body");
    if (!body) return;
    body.style.overflow = "hidden";
    body.style.transition = reduce ? "" : "max-height 0.3s ease, opacity 0.25s ease";
    const close = () => {
      body.style.maxHeight = "0px";
      body.style.opacity = "0";
    };
    const open = () => {
      body.style.maxHeight = body.scrollHeight + "px";
      body.style.opacity = "1";
    };
    if (!d.open) close();
    else open();
    d.addEventListener("toggle", () => (d.open ? open() : close()));
  });

  // Ticker — pause on hover.
  const ticker = document.querySelector(".ticker__track");
  if (ticker) {
    const parent = ticker.parentElement;
    parent?.addEventListener("mouseenter", () => (ticker.style.animationPlayState = "paused"));
    parent?.addEventListener("mouseleave", () => (ticker.style.animationPlayState = "running"));
  }

  // Soft parallax on the terminal panel — purely decorative.
  const term = document.querySelector(".hero__panel .terminal");
  if (term && !reduce) {
    document.addEventListener("mousemove", (e) => {
      const r = term.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = (e.clientX - cx) / window.innerWidth;
      const dy = (e.clientY - cy) / window.innerHeight;
      term.style.transform = `perspective(1200px) rotateX(${(-dy * 3).toFixed(2)}deg) rotateY(${(dx * 3).toFixed(2)}deg) translateZ(0)`;
    });
  }
})();
