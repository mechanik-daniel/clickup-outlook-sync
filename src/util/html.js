import { htmlToText } from 'html-to-text';

export function stripHtml(html) {
  if (!html) return '';
  return htmlToText(html, {
    wordwrap: false,
    selectors: [ { selector: 'a', options: { ignoreHref: true } } ]
  }).trim();
}