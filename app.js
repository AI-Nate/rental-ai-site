import { LIVE_SITE_URL, analyzeSearch, buildListingSearchQueries, createFeedbackRecord, parseListingsFromText, searchResultsToListingText } from './shortlist.js';

const STORAGE_KEY = 'rental-ai-trial-feedback-v3';
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

const samplePlainText = sampleListings.map((listing) => {
  const fees = [...(listing.recurringFees || []), ...(listing.oneTimeFees || [])]
    .map((fee) => `${fee.label}: ${fee.amount == null ? 'unknown' : `$${fee.amount}`}`)
    .join('; ');
  return [
    listing.title,
    listing.url,
    `$${listing.rent} rent`,
    [listing.address, listing.neighborhood, listing.borough].filter(Boolean).join(' · '),
    `Source: ${listing.source}`,
    `Fees: ${fees}`,
    `Commute: ${listing.commuteMinutes} minutes to Union Square`,
    `Amenities: ${(listing.amenities || []).join(', ')}`,
    `Manager: ${listing.managerName || 'unknown'}; contact: ${listing.contactName || listing.contactMethod || 'unknown'}`,
    listing.notes
  ].filter(Boolean).join('\n');
}).join('\n\n---\n\n');

const app = document.querySelector('#app');
let currentAnalysis = null;
let currentSearchPlan = [];
let currentParsedListings = [];
let searchStatus = '';

const state = {
  targetArea: 'Astoria / Crown Heights / Lower East Side, NYC',
  monthlyBudget: 3400,
  bedrooms: 'studio or 1BR',
  moveDate: 'within 60 days',
  commuteDestination: 'Union Square',
  commuteThresholdMinutes: 35,
  mustHaves: 'laundry, subway access, cats ok, reliable internet',
  dealBreakers: 'payment before tour, unclear broker fee, missing address',
  listingText: samplePlainText
};

render();

function render() {
  app.innerHTML = `
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">NYC renter trial · 5 apartment hunters needed</p>
        <h1>Tell us what you need. We’ll search, then analyze the best leads.</h1>
        <p class="lede">Rental AI now starts with a renter-needs interview instead of asking people to copy JSON. It builds targeted listing searches, accepts normal pasted listing text, and turns what it finds into a tour / ask-first / skip shortlist. It does not apply for apartments, process payments, guarantee legitimacy, or provide legal advice.</p>
        <div class="hero-actions">
          <a id="live-cta" class="button-link" href="${LIVE_SITE_URL}" target="_blank" rel="noreferrer">Open live trial site</a>
          <span class="hint">Phase 0-safe: use with approved posts or direct interview asks.</span>
        </div>
      </div>
      <aside class="trial-card" aria-label="Trial goal">
        <strong>Validation target</strong>
        <span>5 completed renter-needs interviews + shortlist runs</span>
        <span>Ask: “Did this help you decide what to tour, ask about, or skip?”</span>
      </aside>
    </section>

    <section class="panel input-panel" aria-labelledby="needs-heading">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Step 1</p>
          <h2 id="needs-heading">Renter-needs interview</h2>
        </div>
        <button id="load-sample" class="secondary" type="button">Reload NYC sample</button>
      </div>
      <form id="needs-form" class="grid-form">
        <label>Neighborhood / borough target
          <input name="targetArea" value="${escapeAttr(state.targetArea)}" placeholder="e.g., Astoria, Queens or Crown Heights, Brooklyn" />
        </label>
        <label>Max monthly housing budget
          <input name="monthlyBudget" type="number" min="1" step="1" value="${escapeAttr(String(state.monthlyBudget))}" />
        </label>
        <label>Bedrooms / layout
          <input name="bedrooms" value="${escapeAttr(state.bedrooms)}" placeholder="studio, 1BR, 2BR" />
        </label>
        <label>Move timing
          <input name="moveDate" value="${escapeAttr(state.moveDate)}" placeholder="ASAP, July 1, within 60 days" />
        </label>
        <label>Commute destination
          <input name="commuteDestination" value="${escapeAttr(state.commuteDestination)}" placeholder="e.g., Union Square, FiDi, Midtown" />
        </label>
        <label>Commute threshold (minutes)
          <input name="commuteThresholdMinutes" type="number" min="1" step="1" value="${escapeAttr(String(state.commuteThresholdMinutes))}" />
        </label>
        <label class="span-2">Must-haves
          <input name="mustHaves" value="${escapeAttr(state.mustHaves)}" placeholder="laundry, pets, elevator, subway, remote-work internet" />
        </label>
        <label class="full">Deal-breakers / risk concerns
          <input name="dealBreakers" value="${escapeAttr(state.dealBreakers)}" placeholder="payment before tour, unclear broker fee, far commute, no pets" />
        </label>
        <div class="actions full">
          <button type="submit">Build search plan</button>
          <button id="auto-search" class="secondary" type="button">Search automatically if available</button>
          <p class="hint">We’ll generate targeted listing searches from these answers. If <code>SERPAPI_API_KEY</code> is configured on the server, automatic search can fetch candidates; otherwise the app falls back to one-click search links and plain-text paste.</p>
        </div>
      </form>
    </section>

    <section id="search-plan" class="panel search-panel" aria-live="polite"></section>

    <section class="panel input-panel" aria-labelledby="listing-text-heading">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Step 2</p>
          <h2 id="listing-text-heading">Paste listing text — no JSON required</h2>
          <p class="hint">Paste 3–10 listing snippets, listing pages, URLs with descriptions, or notes from the searches. Separate listings with a blank line or <code>---</code>.</p>
        </div>
      </div>
      <form id="analysis-form" class="grid-form">
        <label class="full">Listing details found from search
          <textarea name="listingText" spellcheck="false" rows="18">${escapeText(state.listingText)}</textarea>
        </label>
        <div class="actions full">
          <button type="submit">Analyze listings</button>
          <p class="hint">The parser extracts rent, URL/source, neighborhood/borough, fee language, commute mentions, amenities, manager/contact clues, and risk language from normal pasted text.</p>
        </div>
      </form>
    </section>

    <section id="results" aria-live="polite"></section>
  `;

  document.querySelector('#live-cta').addEventListener('click', () => localStorage.setItem(CTA_KEY, 'true'));
  document.querySelector('#load-sample').addEventListener('click', () => {
    Object.assign(state, {
      targetArea: 'Astoria / Crown Heights / Lower East Side, NYC',
      monthlyBudget: 3400,
      bedrooms: 'studio or 1BR',
      moveDate: 'within 60 days',
      commuteDestination: 'Union Square',
      commuteThresholdMinutes: 35,
      mustHaves: 'laundry, subway access, cats ok, reliable internet',
      dealBreakers: 'payment before tour, unclear broker fee, missing address',
      listingText: samplePlainText
    });
    render();
  });
  document.querySelector('#needs-form').addEventListener('submit', (event) => {
    event.preventDefault();
    updateNeedsFromForm(event.currentTarget);
    currentSearchPlan = buildListingSearchQueries(state);
    searchStatus = '';
    renderSearchPlan();
  });
  document.querySelector('#auto-search').addEventListener('click', async () => {
    updateNeedsFromForm(document.querySelector('#needs-form'));
    currentSearchPlan = buildListingSearchQueries(state);
    await runAutomaticSearch();
  });
  document.querySelector('#analysis-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    state.listingText = String(form.get('listingText') || '');
    runAnalysis();
  });

  currentSearchPlan = buildListingSearchQueries(state);
  renderSearchPlan();
  runAnalysis();
}

function updateNeedsFromForm(formElement) {
  const form = new FormData(formElement);
  state.targetArea = String(form.get('targetArea') || '');
  state.monthlyBudget = Number(form.get('monthlyBudget'));
  state.bedrooms = String(form.get('bedrooms') || '');
  state.moveDate = String(form.get('moveDate') || '');
  state.commuteDestination = String(form.get('commuteDestination') || '');
  state.commuteThresholdMinutes = Number(form.get('commuteThresholdMinutes'));
  state.mustHaves = String(form.get('mustHaves') || '');
  state.dealBreakers = String(form.get('dealBreakers') || '');
}

function renderSearchPlan() {
  const panel = document.querySelector('#search-plan');
  if (!panel) return;
  panel.innerHTML = `
    <div class="section-heading">
      <div>
        <p class="eyebrow">Search plan</p>
        <h2>Search automatically when configured, or use fallback links</h2>
        <p class="hint">If this app is served by the local Rental AI server with <code>SERPAPI_API_KEY</code>, automatic search fetches real web results. On static hosting or without the key, use these targeted links and paste listing text below.</p>
        ${searchStatus ? `<p class="search-status">${escapeText(searchStatus)}</p>` : ''}
      </div>
      <div class="budget-chip">${currentSearchPlan.length} searches</div>
    </div>
    <div class="search-links">
      ${currentSearchPlan.map((item) => `<a class="search-link" href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer"><strong>${escapeText(item.label)}</strong><span>${escapeText(item.query)}</span></a>`).join('')}
    </div>
  `;
}


async function runAutomaticSearch() {
  searchStatus = 'Searching listing sources…';
  renderSearchPlan();
  const button = document.querySelector('#auto-search');
  if (button) button.disabled = true;
  try {
    const response = await fetch('./api/listing-search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(state)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || payload.error || 'Automatic search is unavailable from this deployment.');
    }
    const listingText = searchResultsToListingText(payload.results || []);
    if (!listingText) throw new Error('Automatic search returned no usable listing snippets.');
    state.listingText = listingText;
    const textarea = document.querySelector('textarea[name="listingText"]');
    if (textarea) textarea.value = state.listingText;
    searchStatus = `Automatic search found ${(payload.results || []).length} candidate snippets. Unknown listing fields are left blank until the listing text states them.`;
    renderSearchPlan();
    runAnalysis();
  } catch (error) {
    searchStatus = `${error.message} Fallback: open the targeted search links and paste 3–10 listing snippets or URLs below.`;
    renderSearchPlan();
  } finally {
    const latestButton = document.querySelector('#auto-search');
    if (latestButton) latestButton.disabled = false;
  }
}

function runAnalysis() {
  const results = document.querySelector('#results');
  try {
    currentParsedListings = parseListingsFromText(state.listingText);
    currentAnalysis = analyzeSearch({
      targetArea: state.targetArea,
      monthlyBudget: state.monthlyBudget,
      commuteDestination: state.commuteDestination,
      commuteThresholdMinutes: state.commuteThresholdMinutes,
      listings: currentParsedListings
    });
    results.innerHTML = renderResults(currentAnalysis);
    wireFeedbackForm();
  } catch (error) {
    currentAnalysis = null;
    results.innerHTML = `<section class="panel error"><h2>Can’t create shortlist yet</h2><p>${escapeText(error.message)}</p><p class="hint">Try pasting at least 3 listing snippets with rent and source/URL. JSON still works if pasted as raw listing text, but it is no longer required.</p></section>`;
  }
}

function renderResults(analysis) {
  return `
    <section class="panel summary-card">
      <div>
        <p class="eyebrow">Step 3</p>
        <h2>Shortlist for ${escapeText(analysis.targetArea)}</h2>
        <p>${analysis.listingCount} listings analyzed from pasted text. Showing the top ${analysis.shortlist.length}; each card has one action, top reasons, and missing questions to ask before touring/applying.</p>
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
          <h3>${listing.url ? `<a href="${escapeAttr(listing.url)}" target="_blank" rel="noreferrer">${escapeText(listing.title)}</a>` : escapeText(listing.title)}</h3>
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
          <p class="eyebrow">Step 4</p>
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
