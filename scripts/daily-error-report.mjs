#!/usr/bin/env node

/**
 * Daily ERROR Log Report Script
 *
 * Discovers log-streamer instances via DNS, collects ERROR-level logs
 * from yesterday for all apps, and sends a summary to Slack.
 *
 * Environment variables:
 *   SLACK_WEBHOOK_URL   (required) — Slack Incoming Webhook URL
 *   LOG_STREAMER_HOST   (default: tasks.log-streamer) — DNS discovery host
 *   LOG_STREAMER_PORT   (default: 4003) — log-streamer port
 *   REPORT_NO_ERRORS    (default: false) — send notification even when 0 errors
 *
 * Usage:
 *   node scripts/daily-error-report.mjs
 *
 * Zero npm dependencies — uses only Node.js built-in APIs.
 */

import dns from 'node:dns/promises';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const LOG_STREAMER_HOST = process.env.LOG_STREAMER_HOST || 'tasks.log-streamer';
const LOG_STREAMER_PORT = process.env.LOG_STREAMER_PORT || '4003';
const REPORT_NO_ERRORS = process.env.REPORT_NO_ERRORS === 'true';
const SLACK_CHAR_LIMIT = 40_000;
const FETCH_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

function info(msg) {
  console.log(`[INFO] ${msg}`);
}

function warn(msg) {
  console.error(`[WARN] ${msg}`);
}

function error(msg) {
  console.error(`[ERROR] ${msg}`);
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${url}`);
  }
  return res.json();
}

async function postSlack(webhookUrl, text) {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Slack responded with HTTP ${res.status}: ${body}`);
  }
}

// ---------------------------------------------------------------------------
// DNS discovery
// ---------------------------------------------------------------------------

async function discoverInstances(host) {
  info(`Resolving DNS: ${host}`);
  const ips = await dns.resolve4(host);
  info(`Discovered ${ips.length} instance(s): ${ips.join(', ')}`);
  return ips;
}

// ---------------------------------------------------------------------------
// App list retrieval
// ---------------------------------------------------------------------------

async function fetchAppList(ips, port) {
  for (const ip of ips) {
    const url = `http://${ip}:${port}/api/logs/apps`;
    try {
      const data = await fetchJson(url);
      const names = data.apps.map((a) => a.name);
      info(`Fetched ${names.length} app(s) from ${ip}: ${names.join(', ')}`);
      return names;
    } catch (err) {
      warn(`Failed to fetch app list from ${ip}: ${err.message}`);
    }
  }
  throw new Error('Failed to fetch app list from all instances');
}

// ---------------------------------------------------------------------------
// Error log collection
// ---------------------------------------------------------------------------

async function fetchErrorsForApp(app, date, ips, port) {
  const results = [];

  for (const ip of ips) {
    const url =
      `http://${ip}:${port}/api/logs/search` +
      `?app=${encodeURIComponent(app)}` +
      `&from=${date}&to=${date}` +
      `&level=ERROR&limit=500`;
    try {
      const data = await fetchJson(url);
      results.push(...data.lines);
    } catch (err) {
      warn(`Failed to fetch errors for app="${app}" from ${ip}: ${err.message}`);
    }
  }

  // Deduplicate by timestamp + message
  const seen = new Set();
  const unique = [];
  for (const line of results) {
    const key = `${line.timestamp}|${line.message}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(line);
    }
  }

  // Sort by timestamp ascending
  unique.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));

  return unique;
}

// ---------------------------------------------------------------------------
// Slack message formatting
// ---------------------------------------------------------------------------

function formatTime(timestamp) {
  if (!timestamp) return '??:??:??';
  // timestamp may be ISO or "YYYY-MM-DD HH:MM:SS.sss" format
  const timePart = timestamp.includes('T')
    ? timestamp.split('T')[1]
    : timestamp.split(' ')[1];
  if (!timePart) return timestamp.slice(0, 8);
  return timePart.slice(0, 8); // HH:MM:SS
}

function truncate(str, max) {
  if (!str) return '';
  const firstLine = str.split('\n')[0];
  if (firstLine.length <= max) return firstLine;
  return firstLine.slice(0, max) + '...';
}

function buildSlackMessage(date, appErrors) {
  const parts = [];
  parts.push(`*Daily ERROR Log Report (${date})*`);
  parts.push('');

  let totalErrors = 0;

  for (const { app, errors } of appErrors) {
    totalErrors += errors.length;

    if (errors.length === 0) {
      parts.push(`:white_check_mark: *${app}* \u2014 ERROR \uC5C6\uC74C`);
    } else {
      parts.push(`:red_circle: *${app}* (${errors.length}\uAC74)`);
      for (const line of errors) {
        const time = formatTime(line.timestamp);
        const source = line.source || '-';
        const msg = truncate(line.message, 200);
        parts.push(`> \`${time}\` | ${source} | ${msg}`);
      }
    }
    parts.push('');
  }

  let text = parts.join('\n');

  if (text.length > SLACK_CHAR_LIMIT) {
    const notice = '\n\n:warning: _Report truncated due to Slack message size limit._';
    text = text.slice(0, SLACK_CHAR_LIMIT - notice.length) + notice;
  }

  return { text, totalErrors };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // 1. Validate environment
  if (!SLACK_WEBHOOK_URL) {
    error('SLACK_WEBHOOK_URL environment variable is required');
    process.exit(1);
  }

  const date = getYesterday();
  info(`Generating error report for ${date}`);

  // 2. DNS discovery
  let ips;
  try {
    ips = await discoverInstances(LOG_STREAMER_HOST);
  } catch (err) {
    error(`DNS resolution failed for ${LOG_STREAMER_HOST}: ${err.message}`);
    process.exit(1);
  }

  // 3. Fetch app list
  let apps;
  try {
    apps = await fetchAppList(ips, LOG_STREAMER_PORT);
  } catch (err) {
    error(`App list retrieval failed: ${err.message}`);
    process.exit(1);
  }

  // 4. Collect errors per app
  const appErrors = [];
  for (const app of apps) {
    const errors = await fetchErrorsForApp(app, date, ips, LOG_STREAMER_PORT);
    info(`${app}: ${errors.length} error(s)`);
    appErrors.push({ app, errors });
  }

  // 5. Build Slack message
  const { text, totalErrors } = buildSlackMessage(date, appErrors);

  if (totalErrors === 0 && !REPORT_NO_ERRORS) {
    info('No errors found. Skipping Slack notification (REPORT_NO_ERRORS=false).');
    return;
  }

  info(`Total errors: ${totalErrors}. Sending Slack notification...`);

  // 6. Send to Slack
  try {
    await postSlack(SLACK_WEBHOOK_URL, text);
    info('Slack notification sent successfully.');
  } catch (err) {
    error(`Slack delivery failed: ${err.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
