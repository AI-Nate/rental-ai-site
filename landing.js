import { BETA_SIGNUP_TALLY_URL } from './config.js';

const signupLinks = document.querySelectorAll('[data-beta-signup-link]');
const placeholder = document.querySelector('[data-beta-placeholder]');

const tallyUrl = BETA_SIGNUP_TALLY_URL.trim();

for (const link of signupLinks) {
  if (tallyUrl) {
    link.href = tallyUrl;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = link.dataset.readyLabel || 'Join the beta';
    link.removeAttribute('aria-disabled');
  } else {
    link.href = '#beta-signup-placeholder';
    link.textContent = link.dataset.placeholderLabel || 'Beta signup form coming soon';
    link.setAttribute('aria-disabled', 'true');
    link.addEventListener('click', (event) => {
      event.preventDefault();
      placeholder?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
}

if (placeholder) {
  placeholder.hidden = Boolean(tallyUrl);
}
