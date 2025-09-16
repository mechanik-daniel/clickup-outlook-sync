import { stripHtml } from '../../util/html.js';
import { config } from '../../config/index.js';

const fullBodyRe = () => new RegExp(config.sync.clickupTaskIdRegex);
const clickupUrlRe = /https?:\/\/(?:app\.)?clickup\.com\/t\/([A-Za-z0-9_-]+)/i;

export function extractTaskId(event) {
  const rawHtml = event?.body?.content || event?.bodyPreview || '';
  // First: look for embedded ClickUp URL directly in raw HTML (captures href attributes too)
  const embeddedUrlMatch = rawHtml.match(clickupUrlRe);
  if (embeddedUrlMatch) {
    const candidate = embeddedUrlMatch[1];
    if (new RegExp(config.sync.clickupTaskIdRegex).test(candidate)) {
      return { taskId: candidate, method: 'url_embedded' };
    }
    return { taskId: candidate, method: 'url_embedded_unvalidated' };
  }

  const text = stripHtml(rawHtml);
  if (!text) return null;

  // Case: entire stripped body is just the full URL
  if (clickupUrlRe.test(text)) {
    const m = text.match(clickupUrlRe);
    if (m) {
      const candidate = m[1];
      if (new RegExp(config.sync.clickupTaskIdRegex).test(candidate)) {
        return { taskId: candidate, method: 'url_full_body' };
      }
      return { taskId: candidate, method: 'url_full_body_unvalidated' };
    }
  }

  // Case: entire body equals ID directly
  if (fullBodyRe().test(text) && !text.includes(' ')) {
    return { taskId: text, method: 'body_exact' };
  }

  // Prefix pattern (tid#<id>)
  const prefix = config.sync.clickupPrefixedPattern;
  const escapedPrefix = prefix.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const prefixedRe = new RegExp(`${escapedPrefix}([A-Za-z0-9_-]+)`, 'i');
  const m2 = text.match(prefixedRe);
  if (m2) {
    const candidate = m2[1];
    if (new RegExp(config.sync.clickupTaskIdRegex).test(candidate)) {
      return { taskId: candidate, method: 'prefixed' };
    }
    return { taskId: candidate, method: 'prefixed_unvalidated' };
  }
  return null;
}