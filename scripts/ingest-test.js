/**
 * One-off test ingestion: fetch a small sample of Publi24 car listings and
 * store them as Listing entries in Postgres via Strapi's Document Service.
 *
 * This is a throwaway smoke test, not the real worker (see Q9 in the design
 * log): it proves the fetch -> parse -> persist path works end to end on a
 * capped sample. Run with: node scripts/ingest-test.js [count]
 *
 * Crawl etiquette (per CONTEXT.md / grilling decisions):
 *  - only fetches URLs discovered from Publi24's public sitemap (robots.txt
 *    allows sitemap-discovered ad pages; it disallows /Search/, /DetailAd/
 *    and parameterized /anunturi/? pages, none of which this script touches)
 *  - ~1 request/second, sequential, with an honest User-Agent
 *  - stores seller display name only (no phone/contact info), hotlinks images
 */

const { compileStrapi, createStrapi } = require('@strapi/strapi');

const SITEMAP_URL =
  'https://www.publi24.ro/Sitemaps/sitemap-publi24-articles-by-category-Auto%20moto-1.xml';
const USER_AGENT = 'Mozilla/5.0 (compatible; car-aggregator-prototype; test-ingest)';
const REQUEST_DELAY_MS = 1000;
const DEFAULT_COUNT = 100;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url, { retryOn5xx = true } = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'ro' },
  });
  if (!res.ok) {
    if (retryOn5xx && (res.status === 429 || res.status >= 500)) {
      await sleep(5000);
      const retry = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'ro' },
      });
      if (!retry.ok) throw new Error(`HTTP ${retry.status} for ${url}`);
      return retry.text();
    }
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.text();
}

async function discoverAdUrls(limit) {
  const xml = await fetchText(SITEMAP_URL);
  const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  return locs.filter((u) => u.includes('/masini-second-hand/')).slice(0, limit);
}

function extractJsonLd(html) {
  const match = html.match(
    /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/
  );
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    // Publi24 sometimes embeds unescaped literal newlines/CRs inside JSON
    // string values (e.g. a seller's multi-line description), which is
    // invalid JSON. Normalize raw newlines to spaces and retry once.
    try {
      return JSON.parse(match[1].replace(/[\r\n]+/g, ' '));
    } catch {
      return null;
    }
  }
}

function externalIdFromUrl(url) {
  const file = url.split('/').pop() || '';
  return file.replace(/\.html$/, '');
}

function toListingData(url, ld) {
  const num = (v) => (v === undefined || v === null || v === '' ? undefined : Number(v));
  return {
    sourceUrl: url,
    source: 'publi24',
    externalId: externalIdFromUrl(url),
    title: ld.name,
    description: ld.description,
    make: ld.manufacturer?.name,
    model: ld.model,
    year: num(ld.vehicleModelDate),
    mileageKm: num(ld.mileageFromOdometer?.value),
    fuelType: ld.fuelType,
    engineDisplacementCc: num(ld.vehicleEngine?.engineDisplacement?.value),
    enginePowerHp: num(ld.vehicleEngine?.enginePower?.value),
    bodyType: ld.bodyType,
    price: num(ld.offers?.price),
    currency: ld.offers?.priceCurrency,
    sellerName: ld.offers?.seller?.name,
    imageUrl: ld.image?.[0]?.contentUrl,
    fetchedAt: new Date().toISOString(),
  };
}

async function main() {
  const count = Number(process.argv[2]) || DEFAULT_COUNT;

  console.log(`Discovering up to ${count} ad URLs from the Publi24 sitemap...`);
  const urls = await discoverAdUrls(count);
  console.log(`Found ${urls.length} candidate URLs.`);

  console.log('Booting Strapi...');
  const appContext = await compileStrapi();
  const app = await createStrapi(appContext).load();
  app.log.level = 'error';

  const results = { created: 0, updated: 0, skipped: 0, failed: 0 };

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    process.stdout.write(`[${i + 1}/${urls.length}] ${url} ... `);
    try {
      const html = await fetchText(url);
      const ld = extractJsonLd(html);
      if (!ld || ld['@type'] !== 'Vehicle') {
        console.log('skipped (no Vehicle JSON-LD)');
        results.skipped++;
      } else {
        const data = toListingData(url, ld);
        const existing = await app.documents('api::listing.listing').findFirst({
          filters: { sourceUrl: { $eq: url } },
        });
        if (existing) {
          await app.documents('api::listing.listing').update({
            documentId: existing.documentId,
            data,
          });
          results.updated++;
          console.log('updated');
        } else {
          await app.documents('api::listing.listing').create({ data });
          results.created++;
          console.log('created');
        }
      }
    } catch (err) {
      results.failed++;
      console.log(`FAILED: ${err.message}`);
    }
    if (i < urls.length - 1) await sleep(REQUEST_DELAY_MS);
  }

  console.log('\nDone.', results);
  await app.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
