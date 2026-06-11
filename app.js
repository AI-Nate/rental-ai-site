import { analyzeSearch } from './shortlist.js';

const sampleListings = [
  {
    title: 'Maple Garden 1BR',
    source: 'Zillow',
    url: 'https://www.zillow.com/example-maple',
    rent: 1800,
    address: '100 Maple St',
    neighborhood: 'North Loop',
    managerName: 'Maple Property Group',
    contactName: 'Maple Property Group',
    contactMethod: 'leasing@maple.example',
    managerVerified: true,
    recurringFees: [
      { label: 'utilities', amount: 150 },
      { label: 'parking', amount: 75 },
      { label: 'pet rent', amount: 0 }
    ],
    oneTimeFees: [
      { label: 'application fee', amount: 45 },
      { label: 'security deposit', amount: 1800 }
    ],
    backgroundCheckMentioned: true,
    refundabilityStated: true,
    portabilityStated: false,
    amenities: ['fiber internet', 'in-unit laundry', 'garage parking', 'cats ok'],
    commuteMinutes: 22,
    notes: 'Official manager site confirms the same unit. Reviews mention responsive manager.'
  },
  {
    title: 'Oak Loft',
    source: 'Apartments.com',
    url: 'https://www.apartments.com/example-oak',
    rent: 2050,
    address: '22 Oak Ave',
    neighborhood: 'Downtown',
    managerName: 'Oak Leasing',
    contactName: 'Oak Leasing',
    managerVerified: true,
    recurringFees: [
      { label: 'utilities', amount: 150 },
      { label: 'parking', amount: 50 },
      { label: 'pet rent', amount: 25 }
    ],
    oneTimeFees: [
      { label: 'application fee', amount: 60 },
      { label: 'security deposit', amount: 1000 }
    ],
    backgroundCheckMentioned: true,
    refundabilityStated: true,
    amenities: ['internet ready', 'shared laundry', 'dogs ok'],
    commuteMinutes: 29,
    notes: 'Manager reputation is positive in supplied notes.'
  },
  {
    title: 'Too-good-to-be-true studio',
    source: 'Facebook Marketplace',
    rent: 950,
    neighborhood: 'Downtown-adjacent',
    contactName: 'Alex',
    managerName: 'Sunrise Property Management',
    managerVerified: false,
    recurringFees: [{ label: 'utilities unknown', amount: null }],
    oneTimeFees: [{ label: 'application fee', amount: null }],
    commuteMinutes: 18,
    notes: 'Owner asks for a Zelle holding deposit before viewing to reserve the apartment.'
  }
];

const app = document.querySelector('#app');

const state = {
  targetArea: 'Minneapolis, MN',
  monthlyBudget: 2300,
  commuteDestination: 'Central Station',
  commuteThresholdMinutes: 30,
  listingsJson: JSON.stringify(sampleListings, null, 2)
};

render();

function render() {
  app.innerHTML = `
    <section class="hero">
      <p class="eyebrow">Verified Rental Shortlist Assistant</p>
      <h1>Rank rentals by all-in budget, fee risk, scam signals, and local fit.</h1>
      <p class="lede">Paste 3–10 listings you found elsewhere. Rental AI does not scrape, apply, collect SSNs, process payments, or guarantee legitimacy; it shows what it used and what you still need to ask.</p>
    </section>

    <section class="panel input-panel" aria-labelledby="search-heading">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Step 1</p>
          <h2 id="search-heading">Area search details</h2>
        </div>
        <button id="load-sample" class="secondary" type="button">Reload sample</button>
      </div>
      <form id="search-form" class="grid-form">
        <label>Target area
          <input name="targetArea" value="${escapeAttr(state.targetArea)}" placeholder="e.g., Minneapolis, MN" />
        </label>
        <label>Monthly housing budget
          <input name="monthlyBudget" type="number" min="1" step="1" value="${escapeAttr(String(state.monthlyBudget))}" />
        </label>
        <label>Commute destination
          <input name="commuteDestination" value="${escapeAttr(state.commuteDestination)}" placeholder="e.g., Central Station" />
        </label>
        <label>Commute threshold (minutes)
          <input name="commuteThresholdMinutes" type="number" min="1" step="1" value="${escapeAttr(String(state.commuteThresholdMinutes))}" />
        </label>
        <label class="full">Listings JSON (3–10 listings from listing URLs or pasted details)
          <textarea name="listingsJson" spellcheck="false" rows="20">${escapeText(state.listingsJson)}</textarea>
        </label>
        <div class="actions full">
          <button type="submit">Create shortlist</button>
          <p class="hint">Tip: include rent, address/neighborhood, source, recurring fees, deposits/application fees, manager/contact info, commute minutes, and notes from the listing text.</p>
        </div>
      </form>
    </section>

    <section id="results" aria-live="polite"></section>
  `;

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
    const analysis = analyzeSearch({
      targetArea: state.targetArea,
      monthlyBudget: state.monthlyBudget,
      commuteDestination: state.commuteDestination,
      commuteThresholdMinutes: state.commuteThresholdMinutes,
      listings
    });
    results.innerHTML = renderResults(analysis);
  } catch (error) {
    results.innerHTML = `<section class="panel error"><h2>Can’t create shortlist yet</h2><p>${escapeText(error.message)}</p></section>`;
  }
}

function renderResults(analysis) {
  return `
    <section class="panel summary-card">
      <div>
        <p class="eyebrow">Step 2</p>
        <h2>Shortlist for ${escapeText(analysis.targetArea)}</h2>
        <p>${analysis.listingCount} listings analyzed. Showing the top ${analysis.shortlist.length}; every recommendation includes supporting facts and missing information.</p>
      </div>
      <div class="budget-chip">Budget: ${money(analysis.monthlyBudget)}</div>
    </section>
    <div class="cards">
      ${analysis.shortlist.map((listing, index) => renderListing(listing, index)).join('')}
    </div>
  `;
}

function renderListing(listing, index) {
  return `
    <article class="listing-card">
      <div class="listing-header">
        <div>
          <p class="rank">#${index + 1} · ${escapeText(listing.source)}</p>
          <h3>${escapeText(listing.title)}</h3>
          <p class="muted">${escapeText([listing.address, listing.neighborhood].filter(Boolean).join(' · ') || 'Address/neighborhood missing')}</p>
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
        <div><dt>Application fee</dt><dd>${listing.feeChecklist.applicationFee == null ? 'Ask' : money(listing.feeChecklist.applicationFee)}</dd></div>
        <div><dt>Deposit</dt><dd>${listing.feeChecklist.deposit == null ? 'Ask' : money(listing.feeChecklist.deposit)}</dd></div>
      </dl>
      ${renderList('Why this recommendation', listing.supportingFacts)}
      ${renderList('Fee / application checklist', [...listing.feeChecklist.facts, ...listing.feeChecklist.flags])}
      ${renderList('Trust checklist', [...listing.trustChecklist.facts, ...listing.trustChecklist.flags])}
      ${renderList('Local fit notes', listing.localFit.notes.length ? listing.localFit.notes : ['No local-fit details supplied yet.'])}
      ${renderList('Ask before touring/applying', listing.missingInfo.length ? listing.missingInfo : ['No major missing items detected. Still verify details through official channels.'])}
    </article>
  `;
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
  if (/ask|near|medium/.test(text)) return 'warn';
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
