const HIGH_RISK_SOURCE_PATTERN = /(craigslist|facebook|fb marketplace|marketplace)/i;
const WIRE_PAYMENT_PATTERN = /(wire|western union|moneygram|gift card|cashapp|zelle|crypto|bitcoin|venmo)/i;
const BEFORE_TOUR_PATTERN = /(before (a )?(tour|viewing|showing)|prior to (viewing|showing)|hold(ing)? deposit|reserve|sight unseen)/i;
const INTERNET_PATTERN = /(internet|fiber|wi[- ]?fi|broadband|remote work|work from home)/i;
const PARKING_PATTERN = /parking|garage|street permit/i;
const PET_PATTERN = /pet|dog|cat/i;
const LAUNDRY_PATTERN = /laundry|washer|dryer|w\/d/i;
const NYC_BOROUGH_PATTERN = /(manhattan|brooklyn|queens|bronx|staten island|nyc|new york)/i;

export const LIVE_SITE_URL = 'https://ai-nate.github.io/rental-ai-site/';

export const AFFORDABILITY = Object.freeze({
  WITHIN: 'within budget',
  NEAR: 'near limit',
  OVER: 'over budget',
  MISSING: 'missing cost data'
});

export const RISK = Object.freeze({
  LOW: 'low risk',
  MEDIUM: 'medium risk',
  HIGH: 'high risk'
});

export const RECOMMENDATION = Object.freeze({
  TOUR: 'tour',
  ASK_FIRST: 'ask first',
  SKIP: 'skip'
});

export function analyzeSearch(input) {
  const normalized = normalizeSearchInput(input);
  const analyzed = normalized.listings.map((listing, index) => analyzeListing(normalized, listing, index));
  const recommendationMix = analyzed.reduce((mix, listing) => {
    mix[listing.recommendation] = (mix[listing.recommendation] || 0) + 1;
    return mix;
  }, {});

  return {
    targetArea: normalized.targetArea,
    monthlyBudget: normalized.monthlyBudget,
    commuteDestination: normalized.commuteDestination,
    commuteThresholdMinutes: normalized.commuteThresholdMinutes,
    listingCount: analyzed.length,
    recommendationMix,
    shortlist: [...analyzed]
      .sort((a, b) => b.score.total - a.score.total || a.estimatedMonthlyCost - b.estimatedMonthlyCost)
      .slice(0, 5),
    allListings: analyzed,
    generatedAt: new Date().toISOString(),
    liveSiteUrl: LIVE_SITE_URL
  };
}

export function normalizeSearchInput(input) {
  const monthlyBudget = moneyToNumber(input?.monthlyBudget);
  const commuteThresholdMinutes = numberOrNull(input?.commuteThresholdMinutes);
  const listings = Array.isArray(input?.listings) ? input.listings : [];

  if (!Number.isFinite(monthlyBudget) || monthlyBudget <= 0) {
    throw new Error('Enter a monthly housing budget greater than $0.');
  }

  if (listings.length < 3 || listings.length > 10) {
    throw new Error('Enter 3–10 rental listings to create a trustworthy shortlist.');
  }

  return {
    targetArea: clean(input?.targetArea) || 'NYC neighborhood or borough not specified',
    monthlyBudget,
    commuteDestination: clean(input?.commuteDestination),
    commuteThresholdMinutes,
    listings: listings.map(normalizeListing)
  };
}

export function analyzeListing(search, listing, index = 0) {
  const evidence = [];
  const missing = [];
  const recurringFees = normalizeFeeList(listing.recurringFees);
  const oneTimeFees = normalizeFeeList(listing.oneTimeFees);
  const rent = moneyToNumber(listing.rent);

  if (!Number.isFinite(rent) || rent <= 0) {
    missing.push('monthly rent');
  } else {
    evidence.push(`Listed rent is ${formatMoney(rent)}.`);
  }

  const knownRecurring = recurringFees.filter((fee) => Number.isFinite(fee.amount));
  const estimatedMonthlyCost = (Number.isFinite(rent) ? rent : 0) + knownRecurring.reduce((sum, fee) => sum + fee.amount, 0);
  for (const fee of knownRecurring) evidence.push(`Includes recurring ${fee.label}: ${formatMoney(fee.amount)}.`);

  const missingRecurring = missingRecurringCosts(listing, recurringFees);
  missing.push(...missingRecurring);
  if (missingRecurring.length) evidence.push(`Missing recurring cost details: ${missingRecurring.join(', ')}.`);

  const feeChecklist = buildFeeChecklist(listing, oneTimeFees);
  const trustChecklist = buildTrustChecklist(search, listing, estimatedMonthlyCost);
  const localFit = buildLocalFit(search, listing);
  const affordability = affordabilityLabel(estimatedMonthlyCost, search.monthlyBudget, { rent, missingRecurring, feeChecklist });
  evidence.push(`Known monthly estimate is ${formatMoney(estimatedMonthlyCost)} vs. ${formatMoney(search.monthlyBudget)} budget (${affordability}).`);

  const risk = riskLabel(feeChecklist, trustChecklist);
  const score = scoreListing({ search, affordability, feeChecklist, trustChecklist, localFit, estimatedMonthlyCost, missing });
  const recommendation = recommend({ affordability, risk, feeChecklist, trustChecklist, localFit });
  const missingInfo = missingInfoToAsk(missing, feeChecklist, trustChecklist, localFit);

  return {
    id: clean(listing.id) || `listing-${index + 1}`,
    title: clean(listing.title) || clean(listing.address) || `Listing ${index + 1}`,
    source: clean(listing.source) || sourceFromUrl(listing.url) || 'source not specified',
    url: clean(listing.url),
    address: clean(listing.address),
    neighborhood: clean(listing.neighborhood),
    borough: clean(listing.borough),
    rent: Number.isFinite(rent) ? rent : null,
    estimatedMonthlyCost,
    affordability,
    risk,
    recommendation,
    feeChecklist,
    trustChecklist,
    localFit,
    topReasons: topReasons({ affordability, risk, feeChecklist, trustChecklist, localFit, estimatedMonthlyCost, budget: search.monthlyBudget }),
    missingInfo,
    supportingFacts: evidence.concat(score.reasons),
    score
  };
}

export function normalizeListing(listing = {}) {
  return {
    ...listing,
    title: clean(listing.title),
    source: clean(listing.source),
    url: clean(listing.url),
    rent: moneyToNumber(listing.rent),
    address: clean(listing.address),
    neighborhood: clean(listing.neighborhood),
    borough: clean(listing.borough),
    contactName: clean(listing.contactName),
    managerName: clean(listing.managerName),
    contactMethod: clean(listing.contactMethod),
    amenities: normalizeStringList(listing.amenities),
    notes: clean(listing.notes),
    commuteMinutes: numberOrNull(listing.commuteMinutes),
    managerVerified: Boolean(listing.managerVerified),
    recurringFees: normalizeFeeList(listing.recurringFees),
    oneTimeFees: normalizeFeeList(listing.oneTimeFees)
  };
}

export function createFeedbackRecord({ analysis, feedbackAnswer, feedbackComment = '', contact = '', liveCtaClicked = false }) {
  if (!analysis) throw new Error('Create a shortlist before saving feedback.');
  return {
    recordedAt: new Date().toISOString(),
    liveSiteUrl: LIVE_SITE_URL,
    targetArea: analysis.targetArea,
    completedShortlist: true,
    listingsSubmitted: analysis.listingCount,
    recommendationMix: analysis.recommendationMix,
    feedbackAnswer: clean(feedbackAnswer) || 'unsure',
    comment: clean(feedbackComment),
    contact: clean(contact),
    liveCtaClicked: Boolean(liveCtaClicked)
  };
}

function buildFeeChecklist(listing, oneTimeFees) {
  const text = listingText(listing);
  const applicationFee = firstMoneyFor(/application fee|app fee/i, oneTimeFees, text);
  const deposit = firstMoneyFor(/deposit|security|move[- ]?in/i, oneTimeFees, text);
  const brokerFee = explicitMoneyFor(/broker fee|broker's fee|broker/i, oneTimeFees);
  const brokerFeeStatus = brokerFee != null ? 'stated' : /no[- ]?fee|no broker fee/i.test(text) ? 'claimed no-fee' : /broker|agent fee|fee apartment/i.test(text) ? 'unclear' : 'not stated';
  const guarantorRequirement = /guarantor|required income|40x|80x|third-party guarantor/i.test(text) ? 'mentioned' : 'unknown';
  const asksPaymentBeforeTour = Boolean(listing.paymentBeforeTour) || (BEFORE_TOUR_PATTERN.test(text) && /pay|payment|deposit|fee|send|zelle|wire|venmo/i.test(text));
  const backgroundCheckMentioned = Boolean(listing.backgroundCheckMentioned) || /background check|tenant screening|credit check|screening report/i.test(text);
  const refundabilityStated = Boolean(listing.refundabilityStated) || /refundable|non[- ]?refundable/i.test(text);
  const portabilityStated = Boolean(listing.portabilityStated) || /portable|reuse|transfer/i.test(text);
  const unusuallyHighApplicationFee = applicationFee != null && applicationFee > 100;
  const nonRefundableApplicationFee = applicationFee != null && /non[- ]?refundable[^.]{0,60}(application|app)/i.test(text);

  const flags = [];
  const facts = [];
  if (applicationFee == null) flags.push('Application fee is not stated.');
  else facts.push(`Application fee found: ${formatMoney(applicationFee)}.`);
  if (unusuallyHighApplicationFee) flags.push(`Application fee is unusually high for a NYC trial (${formatMoney(applicationFee)}); confirm before applying.`);
  if (nonRefundableApplicationFee) flags.push('Application fee appears non-refundable; confirm before paying.');
  if (deposit == null) flags.push('Security deposit or move-in deposit is not stated.');
  else facts.push(`Deposit / move-in fee found: ${formatMoney(deposit)}.`);
  if (brokerFee != null) facts.push(`Broker fee found: ${formatMoney(brokerFee)}.`);
  if (brokerFeeStatus === 'claimed no-fee') facts.push('Listing claims no broker fee; confirm who pays the broker before applying.');
  if (brokerFeeStatus === 'unclear' || brokerFeeStatus === 'not stated') flags.push('Broker fee / no-fee status is unclear.');
  if (guarantorRequirement === 'mentioned') facts.push('Guarantor or income requirement is mentioned.');
  else flags.push('Guarantor / income requirement is not stated.');
  if (asksPaymentBeforeTour) flags.push('Payment appears to be requested before a tour or signed lease.');
  if (backgroundCheckMentioned) facts.push('Background check or tenant screening is mentioned.');
  else flags.push('Background check / screening policy is not stated.');
  if (refundabilityStated) facts.push('Refundability is stated.');
  else flags.push('Refundability of fees is not stated.');
  if (portabilityStated) facts.push('Application/screening portability is stated.');

  return {
    applicationFee,
    deposit,
    brokerFee,
    brokerFeeStatus,
    guarantorRequirement,
    unusuallyHighApplicationFee,
    nonRefundableApplicationFee,
    backgroundCheckMentioned,
    refundabilityStated,
    portabilityStated,
    asksPaymentBeforeTour,
    facts,
    flags
  };
}

function buildTrustChecklist(search, listing, estimatedMonthlyCost) {
  const text = listingText(listing);
  const source = clean(listing.source) || sourceFromUrl(listing.url);
  const addressMissing = !clean(listing.address);
  const highRiskSource = HIGH_RISK_SOURCE_PATTERN.test(source || '');
  const wireOrGiftCard = Boolean(listing.asksWireGiftCard) || WIRE_PAYMENT_PATTERN.test(text);
  const duplicateSignal = Boolean(listing.duplicateSignal) || /copied|duplicate|reposted|same photos|stolen|too good to be true/i.test(text);
  const contactMismatch = Boolean(listing.contactMismatch) || (listing.contactName && listing.managerName && lower(listing.contactName) !== lower(listing.managerName));
  const managerVerified = Boolean(listing.managerVerified);
  const tooGoodToBeTrue = estimatedMonthlyCost > 0 && search.monthlyBudget > 0 && estimatedMonthlyCost < search.monthlyBudget * 0.65;

  const facts = [];
  const flags = [];
  if (source) facts.push(`Source platform/channel: ${source}.`);
  else flags.push('Source platform is missing.');
  if (addressMissing) flags.push('Address is missing or incomplete.');
  else facts.push(`Address/neighborhood supplied: ${listing.address || listing.neighborhood}.`);
  if (highRiskSource) flags.push('Marketplace/social source: verify the address and manager through an official building or company channel.');
  if (wireOrGiftCard) flags.push('Listing mentions wire, gift-card, instant-transfer, crypto, or similar payment.');
  if (duplicateSignal) flags.push('Supplied text suggests duplicate/copied/reposted listing signals.');
  if (contactMismatch) flags.push('Contact and manager names do not match.');
  if (managerVerified) facts.push('User marked manager/property channel as verified.');
  else flags.push('Manager has not been verified through an official property/company channel.');
  if (tooGoodToBeTrue) flags.push('Known monthly cost is far below budget; compare against similar NYC listings for too-good-to-be-true pricing.');

  return { source, addressMissing, highRiskSource, wireOrGiftCard, duplicateSignal, contactMismatch, managerVerified, tooGoodToBeTrue, facts, flags };
}

function buildLocalFit(search, listing) {
  const text = listingText(listing);
  const notes = [];
  const missing = [];
  const commuteMinutes = numberOrNull(listing.commuteMinutes);
  const commuteDestination = clean(search.commuteDestination);

  if (clean(listing.neighborhood) || clean(listing.borough)) notes.push(`NYC area: ${[listing.neighborhood, listing.borough].filter(Boolean).join(', ')}.`);
  else missing.push('NYC neighborhood/borough or cross streets');

  if (commuteDestination && commuteMinutes != null) {
    const threshold = search.commuteThresholdMinutes;
    if (threshold != null) {
      notes.push(`Commute to ${commuteDestination}: ${commuteMinutes} min (${commuteMinutes <= threshold ? 'within' : 'over'} ${threshold} min target).`);
    } else {
      notes.push(`Commute to ${commuteDestination}: ${commuteMinutes} min.`);
    }
  } else if (commuteDestination) {
    missing.push(`commute time to ${commuteDestination}`);
  }

  if (/subway|train|bus|ferry|mta|transit|station|express/i.test(text)) notes.push('Transit access is mentioned.');
  else missing.push('nearest subway/transit details');

  for (const [pattern, label] of [[INTERNET_PATTERN, 'internet/remote work'], [PARKING_PATTERN, 'parking'], [PET_PATTERN, 'pets'], [LAUNDRY_PATTERN, 'laundry']]) {
    if (pattern.test(text)) notes.push(`${label} mentioned.`);
    else missing.push(`${label} details`);
  }

  if (/review|rating|reputation|property manager|management|landlord/i.test(text)) notes.push('Building/manager reputation or reviews mentioned.');
  else missing.push('building/manager reputation or reviews');

  return { notes, missing, commuteMinutes };
}

function scoreListing({ search, affordability, feeChecklist, trustChecklist, localFit, estimatedMonthlyCost, missing }) {
  const reasons = [];
  let budgetScore = affordability === AFFORDABILITY.WITHIN ? 40 : affordability === AFFORDABILITY.NEAR ? 28 : affordability === AFFORDABILITY.MISSING ? 20 : 8;
  if (estimatedMonthlyCost && estimatedMonthlyCost <= search.monthlyBudget * 0.8 && affordability !== AFFORDABILITY.MISSING) budgetScore += 3;
  const severeTrustFlags = [trustChecklist.wireOrGiftCard, trustChecklist.addressMissing, trustChecklist.contactMismatch, trustChecklist.duplicateSignal].filter(Boolean).length;
  const severeFeeFlags = [feeChecklist.asksPaymentBeforeTour, feeChecklist.unusuallyHighApplicationFee].filter(Boolean).length;
  const trustScore = Math.max(0, 35 - severeTrustFlags * 10 - severeFeeFlags * 8 - feeChecklist.flags.length * 2 - trustChecklist.flags.length);
  const localScore = Math.max(0, 15 - localFit.missing.length * 2 - (localFit.notes.length ? 0 : 3));
  const completenessScore = Math.max(0, 10 - missing.length - feeChecklist.flags.length - Math.floor(trustChecklist.flags.length / 2));
  const total = Math.round(budgetScore + trustScore + localScore + completenessScore);

  reasons.push(`Score ${total}/100 = budget ${Math.round(budgetScore)}, trust/fees ${Math.round(trustScore)}, local fit ${Math.round(localScore)}, completeness ${Math.round(completenessScore)}.`);
  return { total, budgetScore: Math.round(budgetScore), trustScore: Math.round(trustScore), localScore: Math.round(localScore), completenessScore: Math.round(completenessScore), reasons };
}

function riskLabel(feeChecklist, trustChecklist) {
  if (feeChecklist.asksPaymentBeforeTour || trustChecklist.wireOrGiftCard || trustChecklist.contactMismatch) return RISK.HIGH;
  if (feeChecklist.applicationFee == null || feeChecklist.deposit == null || feeChecklist.brokerFeeStatus === 'unclear' || feeChecklist.unusuallyHighApplicationFee) return RISK.HIGH;
  if (trustChecklist.addressMissing || trustChecklist.duplicateSignal || trustChecklist.tooGoodToBeTrue || !trustChecklist.managerVerified) return RISK.MEDIUM;
  if (feeChecklist.flags.length + trustChecklist.flags.length > 4) return RISK.MEDIUM;
  return RISK.LOW;
}

function recommend({ affordability, risk, feeChecklist, trustChecklist, localFit }) {
  const severeScam = feeChecklist.asksPaymentBeforeTour || trustChecklist.wireOrGiftCard || trustChecklist.contactMismatch;
  const poorCommute = localFit.commuteMinutes != null && localFit.commuteMinutes > 0 && localFit.notes.some((note) => /over \d+ min target/.test(note));
  if (severeScam || (affordability === AFFORDABILITY.OVER && risk === RISK.HIGH)) return RECOMMENDATION.SKIP;
  if (affordability === AFFORDABILITY.WITHIN && risk === RISK.LOW && !poorCommute) return RECOMMENDATION.TOUR;
  return RECOMMENDATION.ASK_FIRST;
}

function topReasons({ affordability, risk, feeChecklist, trustChecklist, localFit, estimatedMonthlyCost, budget }) {
  const reasons = [`Known monthly cost is ${formatMoney(estimatedMonthlyCost)} against a ${formatMoney(budget)} budget (${affordability}).`];
  if (risk === RISK.HIGH) reasons.push('High fee/trust risk requires answers before applying.');
  if (feeChecklist.brokerFeeStatus === 'claimed no-fee') reasons.push('No-fee claim is present but should be confirmed.');
  if (feeChecklist.brokerFee != null) reasons.push(`Broker fee is stated at ${formatMoney(feeChecklist.brokerFee)}.`);
  if (trustChecklist.managerVerified) reasons.push('Manager/property channel is marked verified.');
  else reasons.push('Manager/property channel still needs official verification.');
  if (localFit.notes.length) reasons.push(localFit.notes[0]);
  return reasons.slice(0, 4);
}

function missingInfoToAsk(missing, feeChecklist, trustChecklist, localFit) {
  return unique([
    ...missing,
    ...feeChecklist.flags.map((flag) => flag.replace(/\.$/, '')),
    ...trustChecklist.flags.map((flag) => flag.replace(/\.$/, '')),
    ...localFit.missing
  ]).slice(0, 12);
}

function affordabilityLabel(estimatedMonthlyCost, budget, { rent, missingRecurring, feeChecklist }) {
  const missingCostData = !Number.isFinite(rent) || missingRecurring.length > 0 || feeChecklist.applicationFee == null || feeChecklist.deposit == null || feeChecklist.brokerFeeStatus === 'unclear' || feeChecklist.brokerFeeStatus === 'not stated' || feeChecklist.guarantorRequirement === 'unknown';
  if (missingCostData) return AFFORDABILITY.MISSING;
  if (estimatedMonthlyCost > budget) return AFFORDABILITY.OVER;
  if (estimatedMonthlyCost >= budget * 0.9) return AFFORDABILITY.NEAR;
  return AFFORDABILITY.WITHIN;
}

function missingRecurringCosts(listing, recurringFees) {
  const labels = recurringFees.map((fee) => lower(fee.label));
  const missing = [];
  const text = listingText(listing);
  if (!labels.some((label) => /util|water|trash|electric|gas|heat|internet/.test(label)) && !/utilities included|tenant pays|water|trash|electric|gas|heat included/i.test(text)) missing.push('utilities / monthly services');
  if (!labels.some((label) => /parking|garage/.test(label)) && !/parking included|no parking|garage|street parking|no car/i.test(text)) missing.push('parking cost if needed');
  if (!labels.some((label) => /pet/.test(label)) && !/no pets|pet rent|pet fee|dogs|cats/i.test(text)) missing.push('pet rent/fees if applicable');
  if (!/laundry|washer|dryer|w\/d|laundromat/i.test(text)) missing.push('laundry cost/access');
  return missing;
}

function explicitMoneyFor(pattern, fees) {
  const explicit = fees.find((fee) => pattern.test(fee.label) && Number.isFinite(fee.amount));
  return explicit ? explicit.amount : null;
}

function firstMoneyFor(pattern, fees, text) {
  const explicit = explicitMoneyFor(pattern, fees);
  if (explicit != null) return explicit;
  const match = text.match(new RegExp(`${pattern.source}[^$0-9]{0,28}\\$?([0-9][0-9,.]*)`, 'i'));
  return match ? moneyToNumber(match[1]) : null;
}

function normalizeFeeList(fees) {
  if (!Array.isArray(fees)) return [];
  return fees
    .map((fee) => typeof fee === 'string' ? { label: fee, amount: null } : fee)
    .map((fee) => ({ label: clean(fee?.label) || 'fee', amount: moneyToNumber(fee?.amount), cadence: clean(fee?.cadence) }))
    .filter((fee) => fee.label);
}

function normalizeStringList(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map(clean).filter(Boolean);
  return [];
}

function listingText(listing) {
  return [listing.title, listing.source, listing.url, listing.address, listing.neighborhood, listing.borough, listing.contactName, listing.managerName, listing.contactMethod, listing.notes, ...(listing.amenities || []), ...(listing.recurringFees || []).map((fee) => `${fee.label} ${fee.amount ?? ''}`), ...(listing.oneTimeFees || []).map((fee) => `${fee.label} ${fee.amount ?? ''}`)].filter(Boolean).join(' ');
}

function sourceFromUrl(url) {
  if (!url) return '';
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function lower(value) {
  return clean(value).toLowerCase();
}

function numberOrNull(value) {
  const parsed = moneyToNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function moneyToNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[$,]/g, '').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMoney(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value || 0);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
