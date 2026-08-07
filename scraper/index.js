require('dotenv').config({ path: '../sender/.env' });
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
const Groq = require('groq-sdk');
const { getJson } = require("serpapi");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const SERPAPI_KEY = process.env.SERPAPI_KEY;

// ═══════════════════════════════════════════════════════════════
// 🔄 ROTATING SEARCH QUERIES — Never scrape the same thing twice
// The system cycles through these queries automatically each day.
// This ensures fresh, diverse leads from different niches & cities.
// ═══════════════════════════════════════════════════════════════
const SEARCH_QUERIES = [
    "web development agencies in New York NY",
    "web development agencies in Los Angeles CA",
    "web design companies in Chicago IL",
    "digital marketing agencies in Austin TX",
    "web development companies in Miami FL",
    "software development agencies in Seattle WA",
    "ecommerce development agencies in San Francisco CA",
    "WordPress development agencies in Denver CO",
    "Shopify development agencies in Boston MA",
    "mobile app development agencies in Atlanta GA",
    "UI UX design agencies in Portland OR",
    "digital agencies in San Diego CA",
    "web design agencies in Dallas TX",
    "IT consulting firms in Washington DC",
    "creative agencies in Brooklyn NY",
];

// Pick today's query based on the day of the year (auto-rotates daily)
const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
const todaysQuery = process.env.CATCHUP_QUERY || SEARCH_QUERIES[dayOfYear % SEARCH_QUERIES.length];

// ═══════════════════════════════════════════════════════════════
// 🛡️ EMAIL VALIDATION — Kill junk emails before they hit the DB
// ═══════════════════════════════════════════════════════════════
const JUNK_PATTERNS = [
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.css', '.js',
    'sentry', 'wix', 'example.com', 'test@', 'noreply', 'no-reply',
    'wordpress', 'developer@', 'support@wordpress', '@sentry',
    'schema.org', 'cloudflare', 'amazonaws', 'gravatar',
    '@2x', '@3x', 'font-face', 'keyframes'
];

function isValidEmail(email) {
    if (!email || email.length < 6 || email.length > 254) return false;
    // Must have exactly one @
    const parts = email.split('@');
    if (parts.length !== 2) return false;
    // Domain must have at least one dot
    if (!parts[1].includes('.')) return false;
    // TLD must be 2-10 chars
    const tld = parts[1].split('.').pop();
    if (tld.length < 2 || tld.length > 10) return false;
    // Must not contain junk patterns
    const lower = email.toLowerCase();
    if (JUNK_PATTERNS.some(p => lower.includes(p))) return false;
    // Must match a strict email regex (no spaces, no weird chars)
    const strictRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return strictRegex.test(email);
}

// ═══════════════════════════════════════════════════════════════
// 🕸️ DEEP CRAWL — Scrape homepage AND contact/about pages
// ═══════════════════════════════════════════════════════════════
async function fetchPageSafe(url, timeoutMs = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'en-US,en;q=0.9',
            },
            redirect: 'follow',
        });
        clearTimeout(timer);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.text();
    } catch (err) {
        clearTimeout(timer);
        throw err;
    }
}

function extractEmails(html) {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const raw = html.match(emailRegex) || [];
    // Deduplicate and validate
    const unique = [...new Set(raw.map(e => e.toLowerCase()))];
    return unique.filter(isValidEmail);
}

function findContactLinks(html, baseUrl) {
    const $ = cheerio.load(html);
    const links = [];
    $('a').each((_, el) => {
        const href = $(el).attr('href');
        const text = $(el).text().toLowerCase();
        if (!href) return;
        const isContactLink = /contact|about|get.in.touch|reach.us|talk.to.us/i.test(href) ||
                              /contact|about|get in touch/i.test(text);
        if (isContactLink) {
            try {
                const fullUrl = new URL(href, baseUrl).href;
                // Only follow links on the same domain
                if (fullUrl.startsWith(baseUrl.replace(/\/$/, '').split('/').slice(0, 3).join('/'))) {
                    links.push(fullUrl);
                }
            } catch { /* invalid URL, skip */ }
        }
    });
    return [...new Set(links)].slice(0, 3); // Max 3 sub-pages
}

// ═══════════════════════════════════════════════════════════════
// 🧠 AI PERSONALIZATION — Smarter, more natural intros
// ═══════════════════════════════════════════════════════════════
async function getPersonalizedIntro(plainText, agencyName) {
    const fallback = `I came across ${agencyName}'s impressive portfolio and wanted to reach out about a potential collaboration.`;
    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: `You are an expert at writing cold email opening lines. Given text scraped from a web agency's website, write ONE short, specific, genuine sentence that compliments something concrete about their work — a specific client they served, a technology they specialize in, an award they won, or a project they showcased. 
                    
Rules:
- Be specific. Reference a real detail from the text.
- Sound like a human, not a bot. No buzzwords.
- Address the agency as "your team" or by name.
- Maximum 30 words.
- Return JSON: {"intro": "your sentence here"}`
                },
                { role: 'user', content: plainText.substring(0, 3000) }
            ],
            model: 'llama-3.1-8b-instant',
            response_format: { type: 'json_object' },
            temperature: 0.7,
        });

        const parsed = JSON.parse(chatCompletion.choices[0].message.content);
        return parsed.intro || parsed.personalizedIntro || fallback;
    } catch (err) {
        console.warn(`  ⚠️ Groq failed: ${err.message}`);
        return fallback;
    }
}

// ═══════════════════════════════════════════════════════════════
// 🚀 MAIN ENGINE — The full scraper pipeline
// ═══════════════════════════════════════════════════════════════
async function runCloudScraper() {
    const startTime = Date.now();
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  🤖 ZIAFTRA SERVERLESS SCRAPER v4.0`);
    console.log(`${'═'.repeat(60)}`);
    console.log(`  📅 Date:    ${new Date().toISOString().split('T')[0]}`);
    console.log(`  🔍 Query:   "${todaysQuery}"`);
    console.log(`  🔄 Rotation: Day ${dayOfYear} → Query #${(dayOfYear % SEARCH_QUERIES.length) + 1}/${SEARCH_QUERIES.length}`);
    console.log(`${'═'.repeat(60)}\n`);

    if (!SERPAPI_KEY) {
        console.error("❌ FATAL: SERPAPI_KEY is missing!");
        process.exit(1);
    }

    // Check how many leads we already have to avoid bloating
    const { count: existingCount } = await supabase
        .from('agencies')
        .select('*', { count: 'exact', head: true });
    console.log(`📊 Existing leads in DB: ${existingCount || 0}`);

    try {
        // ── PHASE 1: Query SerpApi ──
        console.log(`\n⏳ Querying SerpApi (Google Maps engine)...`);
        const json = await getJson({
            engine: "google_maps",
            q: todaysQuery,
            type: "search",
            api_key: SERPAPI_KEY,
        });

        const rawAgencies = json.local_results || [];
        console.log(`✅ SerpApi returned ${rawAgencies.length} results\n`);

        if (rawAgencies.length === 0) {
            console.log(`⚠️ Zero results. The query may be too specific. Exiting gracefully.`);
            return;
        }

        // ── PHASE 2: Deep investigation ──
        const validAgencies = [];
        const MAX_LEADS = parseInt(process.env.SCRAPE_LIMIT) || 15;
        let investigated = 0;
        let emailsFound = 0;
        let skipped = 0;

        for (const agency of rawAgencies) {
            if (validAgencies.length >= MAX_LEADS) break;
            investigated++;

            const label = `[${investigated}/${rawAgencies.length}]`;
            console.log(`${label} 🏢 ${agency.title}`);

            if (!agency.website) {
                console.log(`${label} ⚠️ No website. Skipping.`);
                skipped++;
                continue;
            }

            // Check if this agency already exists in DB
            const { data: existing } = await supabase
                .from('agencies')
                .select('email')
                .eq('name', agency.title)
                .limit(1);

            if (existing && existing.length > 0) {
                console.log(`${label} ⏭️ Already in DB. Skipping.`);
                skipped++;
                continue;
            }

            try {
                // Fetch homepage
                console.log(`${label} 🌐 Fetching: ${agency.website}`);
                const homepageHtml = await fetchPageSafe(agency.website);
                let allEmails = extractEmails(homepageHtml);

                // If no email on homepage, deep crawl contact/about pages
                if (allEmails.length === 0) {
                    const contactLinks = findContactLinks(homepageHtml, agency.website);
                    if (contactLinks.length > 0) {
                        console.log(`${label} 🔎 Deep crawling ${contactLinks.length} sub-page(s)...`);
                    }
                    for (const link of contactLinks) {
                        try {
                            const subHtml = await fetchPageSafe(link, 8000);
                            const subEmails = extractEmails(subHtml);
                            allEmails.push(...subEmails);
                        } catch { /* sub-page failed, move on */ }
                    }
                    allEmails = [...new Set(allEmails)];
                }

                if (allEmails.length === 0) {
                    console.log(`${label} ⚠️ No valid email found.`);
                    skipped++;
                    continue;
                }

                // Pick the best email (prefer info@, hello@, contact@ over generic ones)
                const preferredPrefixes = ['info', 'hello', 'contact', 'enquiry', 'enquiries', 'team', 'projects', 'business'];
                let bestEmail = allEmails.find(e => preferredPrefixes.some(p => e.startsWith(p + '@'))) || allEmails[0];

                console.log(`${label} 🎯 EMAIL: ${bestEmail}`);
                emailsFound++;

                // Extract text for AI
                const $ = cheerio.load(homepageHtml);
                $('script, style, nav, footer, header').remove();
                const plainText = $('body').text().replace(/\s+/g, ' ').trim();

                // Get AI personalization
                console.log(`${label} 🧠 Generating personalized intro...`);
                const personalizedIntro = await getPersonalizedIntro(plainText, agency.title);
                console.log(`${label} ✨ "${personalizedIntro.substring(0, 80)}..."`);

                validAgencies.push({
                    name: agency.title,
                    website: agency.website,
                    email: bestEmail,
                    personalized_intro: personalizedIntro,
                    status: 'PENDING',
                    source: `SerpApi v4 | ${todaysQuery}`,
                    created_at: new Date().toISOString(),
                });

                // Polite delay between website fetches
                await new Promise(r => setTimeout(r, 2000));

            } catch (err) {
                console.log(`${label} ❌ Failed: ${err.message}`);
                skipped++;
            }
        }

        // ── PHASE 3: Database injection ──
        if (validAgencies.length > 0) {
            console.log(`\n${'─'.repeat(60)}`);
            console.log(`💾 Injecting ${validAgencies.length} leads into Supabase...`);
            const { error } = await supabase
                .from('agencies')
                .upsert(validAgencies, { onConflict: 'email', ignoreDuplicates: true });

            if (error) {
                console.error(`❌ DB Error: ${error.message}`);
            } else {
                console.log(`✅ ${validAgencies.length} new leads saved!`);
            }
        }

        // ── Summary ──
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n${'═'.repeat(60)}`);
        console.log(`  📋 SCRAPER REPORT`);
        console.log(`${'═'.repeat(60)}`);
        console.log(`  🏢 Investigated:  ${investigated}`);
        console.log(`  🎯 Emails Found:  ${emailsFound}`);
        console.log(`  ⏭️  Skipped:       ${skipped}`);
        console.log(`  💾 New Leads:      ${validAgencies.length}`);
        console.log(`  ⏱️  Duration:      ${elapsed}s`);
        console.log(`${'═'.repeat(60)}\n`);

    } catch (error) {
        console.error("❌ FATAL SCRAPER ERROR:", error.message);
        process.exit(1);
    }
}

runCloudScraper();
