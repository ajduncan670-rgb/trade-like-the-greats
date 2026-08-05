const CURRENT_PAGE = window.location.pathname.split('/').pop() || 'index.html';

const TRADERS_TICKER = [
  'Chris Camillo · Social Arbitrage','Mark Minervini · Momentum Breakout',
  'Jesse Livermore · Trend Following','Warren Buffett · Value Investing',
  'Peter Lynch · Growth at Value','George Soros · Macro Reflexivity',
  'Jim Simons · Quantitative Edge','Paul Tudor Jones · Risk First',
  'Stan Druckenmiller · Concentrate Everything','Ross Cameron · High-Velocity Day Trading',
  'Benjamin Graham · Margin of Safety','William O\'Neil · CAN SLIM',
  'David Tepper · Distressed Value','Carl Icahn · Activist Contrarian',
  'Nicolas Darvas · Box Theory','Ed Seykota · Systems Trading',
  'Michael Burry · Deep Contrarian','Howard Marks · Second-Level Thinking',
  'Ray Dalio · All-Weather Portfolio','Cathie Wood · Disruptive Innovation',
];

function buildTicker() {
  const doubled = [...TRADERS_TICKER, ...TRADERS_TICKER];
  return doubled.map(t => `<span class="ticker-item">${t}</span>`).join('');
}

function navActive(href) {
  return CURRENT_PAGE === href ? 'class="active"' : '';
}

function injectNav() {
  const el = document.getElementById('nav-placeholder');
  if (!el) return;
  el.outerHTML = `
    <div class="ticker-bar" aria-hidden="true"><div class="ticker-track">${buildTicker()}</div></div>
    <nav id="site-nav" role="navigation" aria-label="Main navigation">
      <div class="nav-inner">
        <a href="index.html" class="nav-logo">Trader <span>Atlas</span></a>
        <ul class="nav-links" role="list">
          <li><a href="how-it-works.html" ${navActive('how-it-works.html')}>How it works</a></li>
          <li><a href="traders.html" ${navActive('traders.html')}>The 25 Greats</a></li>
          <li><a href="pricing.html" ${navActive('pricing.html')}>Pricing</a></li>
          <li><a href="blog.html" ${navActive('blog.html')}>Insights</a></li>
          <li><a href="about.html" ${navActive('about.html')}>About</a></li>
          <li><a href="pricing.html" class="nav-cta">Get access</a></li>
        </ul>
        <button class="nav-hamburger" aria-label="Open menu" aria-expanded="false" onclick="toggleMenu(this)">
          <span></span><span></span><span></span>
        </button>
      </div>
      <div class="mobile-menu" id="mobile-menu">
        <ul>
          <a href="how-it-works.html">How it works</a>
          <a href="traders.html">The 25 Greats</a>
          <a href="pricing.html">Pricing</a>
          <a href="blog.html">Insights</a>
          <a href="about.html">About</a>
          <a href="pricing.html" style="color:var(--emerald);font-weight:600;">Get access</a>
        </ul>
      </div>
    </nav>`;
}

function toggleMenu(btn) {
  const menu = document.getElementById('mobile-menu');
  const open = menu.classList.toggle('open');
  btn.setAttribute('aria-expanded', open);
}

function injectFooter() {
  const el = document.getElementById('footer-placeholder');
  if (!el) return;
  el.outerHTML = `
    <footer id="site-footer" role="contentinfo">
      <div class="container">
        <div class="footer-grid">
          <div class="footer-brand">
            <a href="index.html" class="nav-logo" style="font-size:16px;">Trader <span>Atlas</span></a>
            <p>An AI-powered trading methodology engine that lets you analyze any stock through the frameworks of 25 legendary traders. Built for serious students of the market.</p>
            <p style="margin-top:10px;font-style:italic;font-size:13px;color:var(--slate);">Trade like the greats.</p>
          </div>
          <div class="footer-col">
            <h5>Product</h5>
            <ul>
              <li><a href="how-it-works.html">How it works</a></li>
              <li><a href="traders.html">The 25 Greats</a></li>
              <li><a href="pricing.html">Pricing</a></li>
            </ul>
          </div>
          <div class="footer-col">
            <h5>Learn</h5>
            <ul>
              <li><a href="blog.html">Insights</a></li>
              <li><a href="about.html">About</a></li>
              <li><a href="faq.html">FAQ</a></li>
            </ul>
          </div>
          <div class="footer-col">
            <h5>Legal</h5>
            <ul>
              <li><a href="disclaimer.html">Disclaimer</a></li>
              <li><a href="disclaimer.html#privacy">Privacy</a></li>
              <li><a href="disclaimer.html#terms">Terms</a></li>
            </ul>
          </div>
        </div>
        <div class="footer-bottom">
          <p class="footer-legal">All content is for educational and informational purposes only. Nothing on this platform constitutes personalized investment advice or a solicitation to buy or sell any security. Trader Atlas is not affiliated with, endorsed by, or connected to any of the traders or individuals referenced. Past methodology performance does not guarantee future results. Always conduct your own research and consult a qualified financial advisor before making investment decisions.</p>
          <p class="footer-copy">© ${new Date().getFullYear()} Trader Atlas</p>
        </div>
      </div>
    </footer>`;
}

document.addEventListener('DOMContentLoaded', () => { injectNav(); injectFooter(); });
