import { LIVE_SITE_URL, analyzeSearch, createFeedbackRecord } from './shortlist.js';

const STORAGE_KEY = 'rental-ai-trial-feedback-v2';
const CTA_KEY = 'rental-ai-live-cta-clicked';

const sampleListings = [
  {
    title: 'Astoria no-fee 1BR near N/W',
    source: 'StreetEasy',
    url: 'https://streeteasy.com/example-astoria',
    rent: 2850,
    address: '31-00 30th Ave, Queens, NY',
    neighborhood: 'Astoria',
    borough: 'Queens',
    managerName: '30th Ave Realty',
    contactName: '30th Ave Realty',
    contactMethod: 'leasing@30th.example',
    managerVerified: true,
    recurringFees: [
      { label: 'heat and hot water included', amount: 0 },
      { label: 'internet estimate', amount: 60 },
      { label: 'no parking needed', amount: 0 },
      { label: 'cat rent', amount: 0 }
    ],
    oneTimeFees: [
      { label: 'application fee', amount: 20 },
      { label: 'security deposit', amount: 2850 }
    ],
    backgroundCheckMentioned: true,
    refundabilityStated: true,
    amenities: ['laundry in building', 'fiber internet available', 'cats ok', 'N/W subway nearby'],
    commuteMinutes: 28,
    notes: 'Listing says no-fee and appears on the official brokerage site. 40x income requirement mentioned. Reviews mention responsive management.'
  },
  {
    title: 'Crown Heights broker-fee 2BR',
    source: 'Apartments.com',
    url: 'https://www.apartments.com/example-crown-heights',
    rent: 3200,
    address: '750 Franklin Ave, Brooklyn, NY',
    neighborhood: 'Crown Heights',
    borough: 'Brooklyn',
    managerName: 'Franklin Leasing',
    contactName: 'Franklin Leasing',
    managerVerified: true,
    recurringFees: [
      { label: 'electric estimate', amount: 90 },
      { label: 'internet estimate', amount: 60 },
      { label: 'pet rent', amount: 50 },
      { label: 'no parking', amount: 0 }
    ],
    oneTimeFees: [
      { label: 'application fee', amount: 20 },
      { label: 'security deposit', amount: 3200 },
      { label: 'broker fee', amount: 3200 }
    ],
    backgroundCheckMentioned: true,
    refundabilityStated: true,
    amenities: ['A/C subway nearby', 'laundry nearby', 'dogs ok'],
    commuteMinutes: 36,
    notes: 'Broker fee is disclosed. Confirm move-in total and whether fee changes before signing.'
  },
  {
    title: 'Suspicious Manhattan studio',
    source: 'Facebook Marketplace',
    rent: 1450,
    neighborhood: 'Lower East Side',
    borough: 'Manhattan',
    contactName: 'Alex',
    managerName: 'Essex Management',
    managerVerified: false,
    recurringFees: [{ label: 'utilities unknown', amount: null }],
    oneTimeFees: [{ label: 'application fee', amount: 150 }],
    commuteMinutes: 18,
    notes: 'Poster asks for a Zelle holding deposit before viewing. Text looks copied from another listing and says fee apartment but broker fee amount is unclear.'
  }
];

const app = document.querySelector('#app');
let currentAnalysis = null;

const state = {
  targetArea: 'Astoria / Crown Heights / Lower East Side, NYC',
  monthlyBudget: 3400,
  commuteDestination: 'Union Square',
  commuteThresholdMinutes: 35,
  listingsJson: JSON.stringify(sampleListings, null, 2)
};

render();

function render() {
  app.innerHTML = `
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">NYC renter trial · 5 apartment hunters needed</p>
        <h1>Paste 3–10 NYC listings. Get a tour / ask-first / skip shortlist.</h1>
        <p class="lede">Rental AI is validating whether a lightweight trust-and-budget layer helps real NYC renters make clearer decisions before paying fees or sharing personal data. It does not scrape listings, apply for apartments, process payments, guarantee legitimacy, or provide legal advice.</p>
        <div class="hero-actions">
          <a id="live-cta" class="button-link" href="${LIVE_SITE_URL}" target="_blank" rel="noreferrer">Open live trial site</a>
          <span class="hint">Phase 0-safe: share this link only in approved posts or direct interview asks.</span>
        </div>
      </div>
      <aside class="trial-card" aria-label="Trial goal">
        <strong>Validation target</strong>
        <span>5 completed NYC shortlist runs</span>
        <span>Ask: “Did this help you decide what to tour, ask about, or skip?”</span>
      </aside>
    </section>

    <section class="panel input-panel" aria-labelledby="search-heading">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Step 1</p>
          <h2 id="search-heading">NYC area search details</h2>
        </div>
        <button id="load-sample" class="secondary" type="button">Reload NYC sample</button>
      </div>
      <form id="search-form" class="grid-form">
        <label>Neighborhood / borough target
          <input name="targetArea" value="${escapeAttr(state.targetArea)}" placeholder="e.g., Astoria, Queens or Crown Heights, Brooklyn" />
        </label>
        <label>Monthly housing budget
          <input name="monthlyBudget" type="number" min="1" step="1" value="${escapeAttr(String(state.monthlyBudget))}" />
        </label>
        <label>Commute destination
          <input name="commuteDestination" value="${escapeAttr(state.commuteDestination)}" placeholder="e.g., Union Square, FiDi, Midtown" />
        </label>
        <label>Commute threshold (minutes)
          <input name="commuteThresholdMinutes" type="number" min="1" step="1" value="${escapeAttr(String(state.commuteThresholdMinutes))}" />
        </label>
        <label class="full">Listings JSON (3–10 listing URLs or pasted details)
          <textarea name="listingsJson" spellcheck="false" rows="20">${escapeText(state.listingsJson)}</textarea>
        </label>
        <div class="actions full">
          <button type="submit">Create NYC shortlist</button>
          <p class="hint">For better output, include source URL, rent, address/cross streets, borough/neighborhood, broker/no-fee claim, application fee, deposit, utilities, guarantor/income requirement, manager/contact info, commute estimate, subway access, laundry, pets, and notes from the listing text.</p>
        </div>
      </form>
    </section>

    <section id="results" aria-live="polite"></section>
  `;

  document.querySelector('#live-cta').addEventListener('click', () => localStorage.setItem(CTA_KEY, 'true'));
  document.querySelector('#load-sample').addEventListener('click', () => {
    state.listingsJson = JSON.stringify(sampleListings, null, 2);
    render();
    runAnalysis();
  });
  document.querySelector('#search-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    state.targetArea = String(form.get('targetArea') || '');
    state.monthlyBudget = Number(form.get('monthlyBudget'));
    state.commuteDestination = String(form.get('commuteDestination') || '');
    state.commuteThresholdMinutes = Number(form.get('commuteThresholdMinutes'));
    state.listingsJson = String(form.get('listingsJson') || '[]');
    runAnalysis();
  });

  runAnalysis();
}

function runAnalysis() {
  const results = document.querySelector('#results');
  try {
    const listings = JSON.parse(state.listingsJson);
    currentAnalysis = analyzeSearch({
      targetArea: state.targetArea,
      monthlyBudget: state.monthlyBudget,
      commuteDestination: state.commuteDestination,
      commuteThresholdMinutes: state.commuteThresholdMinutes,
      listings
    });
    results.innerHTML = renderResults(currentAnalysis);
    wireFeedbackForm();
  } catch (error) {
    currentAnalysis = null;
    results.innerHTML = `<section class="panel error"><h2>Can’t create shortlist yet</h2><p>${escapeText(error.message)}</p></section>`;
  }
}

function renderResults(analysis) {
  return `
    <section class="panel summary-card">
      <div>
        <p class="eyebrow">Step 2</p>
        <h2>Shortlist for ${escapeText(analysis.targetArea)}</h2>
        <p>${analysis.listingCount} listings analyzed. Showing the top ${analysis.shortlist.length}; each card has one action, top reasons, and missing questions to ask before touring/applying.</p>
      </div>
      <div class="budget-chip">Budget: ${money(analysis.monthlyBudget)}</div>
    </section>
    <div class="cards">
      ${analysis.shortlist.map((listing, index) => renderListing(listing, index)).join('')}
    </div>
    ${renderFeedbackPanel(analysis)}
  `;
}

function renderListing(listing, index) {
  return `
    <article class="listing-card">
      <div class="listing-header">
        <div>
          <p class="rank">#${index + 1} · ${escapeText(listing.source)}</p>
          <h3>${escapeText(listing.title)}</h3>
          <p class="muted">${escapeText([listing.address, listing.neighborhood, listing.borough].filter(Boolean).join(' · ') || 'Address/neighborhood missing')}</p>
        </div>
        <div class="score"><strong>${listing.score.total}</strong><span>/100</span></div>
      </div>
      <div class="labels">
        ${label(listing.affordability, labelTone(listing.affordability))}
        ${label(listing.risk, labelTone(listing.risk))}
        ${label(listing.recommendation, labelTone(listing.recommendation))}
      </div>
      <dl class="facts-grid">
        <div><dt>Known monthly cost</dt><dd>${money(listing.estimatedMonthlyCost)}</dd></div>
        <div><dt>Rent</dt><dd>${listing.rent == null ? 'Missing' : money(listing.rent)}</dd></div>
        <div><dt>App fee</dt><dd>${listing.feeChecklist.applicationFee == null ? 'Ask' : money(listing.feeChecklist.applicationFee)}</dd></div>
        <div><dt>Broker/no-fee</dt><dd>${escapeText(listing.feeChecklist.brokerFee == null ? listing.feeChecklist.brokerFeeStatus : money(listing.feeChecklist.brokerFee))}</dd></div>
      </dl>
      ${renderList('Top reasons', listing.topReasons)}
      ${renderList('Fee / NYC application checklist', [...listing.feeChecklist.facts, ...listing.feeChecklist.flags])}
      ${renderList('Scam / trust checklist', [...listing.trustChecklist.facts, ...listing.trustChecklist.flags])}
      ${renderList('Local fit notes', listing.localFit.notes.length ? listing.localFit.notes : ['No local-fit details supplied yet.'])}
      ${renderList('Ask before touring/applying', listing.missingInfo.length ? listing.missingInfo : ['No major missing items detected. Still verify details through official channels.'])}
    </article>
  `;
}

function renderFeedbackPanel(analysis) {
  const stored = getStoredFeedback();
  return `
    <section class="panel feedback-panel" aria-labelledby="feedback-heading">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Step 3</p>
          <h2 id="feedback-heading">Trial feedback capture</h2>
          <p>After each renter finishes a shortlist, save whether it helped them decide what to tour, ask about, or skip. Records stay in this browser and can be exported as JSONL for <code>feedback.jsonl</code>.</p>
        </div>
        <div class="budget-chip">Saved: ${stored.length}</div>
      </div>
      <form id="feedback-form" class="feedback-form">
        <fieldset>
          <legend>Did this help you decide what to tour, ask about, or skip?</legend>
          ${['yes', 'no', 'unsure'].map((value) => `<label class="radio"><input type="radio" name="feedbackAnswer" value="${value}" ${value === 'yes' ? 'checked' : ''} /> ${value}</label>`).join('')}
        </fieldset>
        <label class="full">Optional comment
          <textarea name="feedbackComment" rows="4" placeholder="What changed your decision? What was confusing or missing?"></textarea>
        </label>
        <label class="full">Optional contact for a 10-minute follow-up
          <input name="contact" placeholder="email, Reddit username, or leave blank" />
        </label>
        <div class="actions full">
          <button type="submit">Save feedback record</button>
          <button id="download-feedback" class="secondary" type="button">Download JSONL</button>
          <p class="hint">This record includes completed shortlist count, listings submitted, recommendation mix, answer/comment/contact, and whether the live-site CTA was clicked.</p>
        </div>
      </form>
      <pre id="feedback-preview" class="feedback-preview">${escapeText(toJsonl(stored.slice(-3))) || 'No saved feedback yet.'}</pre>
    </section>
  `;
}

function wireFeedbackForm() {
  const form = document.querySelector('#feedback-form');
  const download = document.querySelector('#download-feedback');
  if (!form || !download) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const record = createFeedbackRecord({
      analysis: currentAnalysis,
      feedbackAnswer: data.get('feedbackAnswer'),
      feedbackComment: data.get('feedbackComment'),
      contact: data.get('contact'),
      liveCtaClicked: localStorage.getItem(CTA_KEY) === 'true'
    });
    const stored = getStoredFeedback();
    stored.push(record);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    document.querySelector('#feedback-preview').textContent = toJsonl(stored.slice(-3));
    form.reset();
  });
  download.addEventListener('click', () => {
    const blob = new Blob([toJsonl(getStoredFeedback()) + '\n'], { type: 'application/x-jsonlines' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'feedback.jsonl';
    anchor.click();
    URL.revokeObjectURL(url);
  });
}

function getStoredFeedback() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toJsonl(records) {
  return records.map((record) => JSON.stringify(record)).join('\n');
}

function renderList(title, items) {
  return `
    <details open>
      <summary>${escapeText(title)}</summary>
      <ul>${items.map((item) => `<li>${escapeText(item)}</li>`).join('')}</ul>
    </details>
  `;
}

function label(text, tone) {
  return `<span class="label ${tone}">${escapeText(text)}</span>`;
}

function labelTone(text) {
  if (/skip|over|high/.test(text)) return 'bad';
  if (/ask|near|medium|missing/.test(text)) return 'warn';
  return 'good';
}

function money(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value || 0);
}

function escapeText(value) {
  return String(value ?? '').replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]);
}

function escapeAttr(value) {
  return escapeText(value).replace(/"/g, '&quot;');
}
