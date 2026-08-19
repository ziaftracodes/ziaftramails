require('dotenv').config({ path: '../sender/.env' });
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
const Groq = require('groq-sdk');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ═══════════════════════════════════════════════════════════════
// 🔍 SEARCH PROVIDERS — Stack multiple free APIs
// Serper works now. Add GOOGLE_CSE_KEY/CX and BING_API_KEY later.
// ═══════════════════════════════════════════════════════════════
const searchProviders = [
    {
        name: 'SERPER',
        enabled: !!process.env.SERPER_API_KEY,
        search: async (query) => {
            const res = await fetch('https://google.serper.dev/search', {
                method: 'POST',
                headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' },
                body: JSON.stringify({ q: query, num: 20 })
            });
            if (!res.ok) throw new Error(`Serper ${res.status}`);
            const json = await res.json();
            return (json.organic || []).map(r => ({ title: r.title, url: r.link, snippet: r.snippet || '' }));
        }
    },
    {
        name: 'GOOGLE_CSE',
        enabled: !!process.env.GOOGLE_CSE_KEY && !!process.env.GOOGLE_CSE_CX,
        search: async (query) => {
            const key = process.env.GOOGLE_CSE_KEY;
            const cx = process.env.GOOGLE_CSE_CX;
            const res = await fetch(`https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&q=${encodeURIComponent(query)}&num=10`);
            if (!res.ok) throw new Error(`Google CSE ${res.status}`);
            const json = await res.json();
            return (json.items || []).map(r => ({ title: r.title, url: r.link, snippet: r.snippet || '' }));
        }
    },
    {
        name: 'BING',
        enabled: !!process.env.BING_API_KEY,
        search: async (query) => {
            const res = await fetch(`https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=15`, {
                headers: { 'Ocp-Apim-Subscription-Key': process.env.BING_API_KEY }
            });
            if (!res.ok) throw new Error(`Bing ${res.status}`);
            const json = await res.json();
            return (json.webPages?.value || []).map(r => ({ title: r.name, url: r.url, snippet: r.snippet || '' }));
        }
    }
];

async function webSearch(query) {
    for (const provider of searchProviders) {
        if (!provider.enabled) continue;
        try {
            const results = await provider.search(query);
            console.log(`  🔎 ${provider.name} → ${results.length} results`);
            return results;
        } catch (err) {
            console.log(`  ⚠️ ${provider.name} failed: ${err.message}. Trying next...`);
        }
    }
    console.log(`  ❌ All search providers failed.`);
    return [];
}

// ═══════════════════════════════════════════════════════════════
// 🛡️ EMAIL VALIDATION
// ═══════════════════════════════════════════════════════════════
const JUNK_PATTERNS = [
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.css', '.js',
    'sentry', 'wix', 'example.com', 'test@', 'noreply', 'no-reply',
    'wordpress', '@sentry', 'schema.org', 'cloudflare',
    'amazonaws', 'gravatar', '@2x', '@3x', 'press@', 'media@', 'privacy@',
    'editor@', 'admin@', 'webmaster@', 'newsletter@',
    'abuse@', 'postmaster@', 'hostmaster@',
    'google.com', 'facebook.com', 'twitter.com', 'github.com',
    'instagram.com', 'linkedin.com', 'youtube.com', 'producthunt.com',
    'peerlist.io', 'indiehackers.com', 'ycombinator.com',
];

function isValidEmail(email) {
    if (!email || email.length < 6 || email.length > 254) return false;
    const parts = email.split('@');
    if (parts.length !== 2) return false;
    if (!parts[1].includes('.')) return false;
    const tld = parts[1].split('.').pop();
    if (tld.length < 2 || tld.length > 10) return false;
    const lower = email.toLowerCase();
    if (JUNK_PATTERNS.some(p => lower.includes(p))) return false;
    return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
}

// ═══════════════════════════════════════════════════════════════
// 🕸️ WEB SCRAPING UTILITIES
// ═══════════════════════════════════════════════════════════════
async function fetchPageSafe(url, timeoutMs = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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
    const raw = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    const unique = [...new Set(raw.map(e => e.toLowerCase()))];
    return unique.filter(isValidEmail);
}

function findSubLinks(html, baseUrl) {
    const $ = cheerio.load(html);
    const links = [];
    $('a').each((_, el) => {
        const href = $(el).attr('href');
        const text = $(el).text().toLowerCase();
        if (!href) return;
        if (/contact|about|team|founders/i.test(href) || /contact|about|team|founders/i.test(text)) {
            try {
                const fullUrl = new URL(href, baseUrl).href;
                const base = baseUrl.replace(/\/$/, '').split('/').slice(0, 3).join('/');
                if (fullUrl.startsWith(base)) links.push(fullUrl);
            } catch { }
        }
    });
    return [...new Set(links)].slice(0, 3);
}

function getDomainFromUrl(url) {
    try { return new URL(url).hostname.replace('www.', ''); } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════
// 📧 EMAIL GUESSING — Fallback when scraping finds nothing
// ═══════════════════════════════════════════════════════════════
function guessEmails(domain) {
    return ['hello', 'hi', 'founder', 'team', 'contact', 'info'].map(p => `${p}@${domain}`);
}

// ═══════════════════════════════════════════════════════════════
// 🔗 DEEP EMAIL EXTRACTION — Scrape site + subpages
// ═══════════════════════════════════════════════════════════════
async function extractEmailFromWebsite(url) {
    try {
        const html = await fetchPageSafe(url);
        let emails = extractEmails(html);
        if (emails.length === 0) {
            const subLinks = findSubLinks(html, url);
            for (const link of subLinks) {
                try {
                    const subHtml = await fetchPageSafe(link, 5000);
                    emails.push(...extractEmails(subHtml));
                } catch { }
            }
            emails = [...new Set(emails)];
        }
        const pref = ['founder', 'ceo', 'hello', 'hi', 'team', 'contact'];
        const best = emails.find(e => pref.some(p => e.startsWith(p + '@'))) || emails[0];
        return { email: best || null, html };
    } catch {
        return { email: null, html: null };
    }
}

// ═══════════════════════════════════════════════════════════════
// 🧠 AI: PERSONALIZED INTRO
// ═══════════════════════════════════════════════════════════════
async function getPersonalizedIntro(plainText, name) {
    const fallback = `Saw what you're building at ${name} — love the concept.`;
    try {
        const res = await groq.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: `You are writing a cold email opener to a startup builder. Write ONE specific, genuine sentence about their product.
Rules: Be specific. Mention a feature or audience. Sound like a dev. Max 25 words.
Return ONLY JSON: {"intro": "your sentence here"}`
                },
                { role: 'user', content: plainText.substring(0, 3000) }
            ],
            model: 'qwen/qwen3.6-27b',
            temperature: 0.7,
            response_format: { type: 'json_object' }
        });
        const match = res.choices[0].message.content.match(/\{[\s\S]*\}/);
        if (match) {
            const parsed = JSON.parse(match[0]);
            return parsed.intro || fallback;
        }
        return fallback;
    } catch { return fallback; }
}

// ═══════════════════════════════════════════════════════════════
// 🧠 AI: EXTRACT STARTUP FROM SEARCH RESULT
// Given a search result (title, URL, snippet), use AI to decide
// if it's an actual startup website we should scrape, or junk.
// ═══════════════════════════════════════════════════════════════
const SKIP_DOMAINS = [
    'inc42.com', 'yourstory.com', 'techcrunch.com', 'crunchbase.com',
    'linkedin.com', 'twitter.com', 'x.com', 'instagram.com', 'facebook.com',
    'youtube.com', 'github.com', 'medium.com', 'wikipedia.org',
    'wellfound.com', 'angellist.com', 'glassdoor.com', 'ambitionbox.com',
    'google.com', 'bing.com', 'quora.com', 'reddit.com',
    'naukri.com', 'internshala.com', 'indeed.com', 'monster.com',
    'zoominfo.com', 'tracxn.com', 'peerlist.io', 'indiehackers.com',
    'producthunt.com', 'dev.to', 'hashnode.dev', 'news.ycombinator.com',
    'bbc.com', 'bbc.co.uk', 'forbes.com', 'wsj.com', 'nytimes.com', 'stripe.com',
    'amazon.com', 'apple.com', 'microsoft.com',
    'zerodha.com', 'zoho.com', 'freshworks.com', 'razorpay.com', 'postman.com',
    'swiggy.com', 'zomato.com', 'flipkart.com', 'cred.club', 'groww.in',
    'pine.labs', 'bharatpe.com', 'unacademy.com', 'byjus.com', 'upstox.com',
    'dream11.com', 'meesho.com', 'paytm.com', 'ola.com', 'olacabs.com',
    'browserstack.com', 'cleartax.in', 'chargebee.com', 'innovaccer.com'
];

function isActualStartupSite(url) {
    const domain = getDomainFromUrl(url);
    if (!domain) return false;
    return !SKIP_DOMAINS.some(d => domain.includes(d));
}

// ═══════════════════════════════════════════════════════════════
// 📦 SOURCE MODULES
// ═══════════════════════════════════════════════════════════════

// ── TWITTER / X ──
// Strategy: Search for builder tweets WITHOUT site: operator.
// We search for the BUILDER SIGNAL keywords. Serper returns a mix
// of tweets and articles — we filter for x.com results OR actual
// startup websites mentioned in the results.
const twitterSource = {
    name: 'Twitter/X',
    queries: [
        'just launched startup Bangalore SaaS twitter',
        'building SaaS India founder twitter',
        'shipped startup Bangalore founder twitter',
        'MRR startup India founder',
        'bootstrapped Bangalore startup founder',
        'my startup Bangalore founder SaaS',
        'co-founder building Bangalore SaaS startup',
        'solo founder India SaaS building',
        'quit my job startup India founder building',
        'buildinpublic India founder SaaS',
        'pre-seed Bangalore startup founder raised',
        'first paying customer startup India founder',
        'MVP launched Bangalore startup founder',
        'building startup Delhi founder SaaS',
        'launched SaaS Hyderabad startup founder',
        'startup founder Pune building SaaS product',
        'side project turned startup India founder revenue',
        'indie hacker Bangalore SaaS product',
        'working on SaaS Mumbai founder startup building',
        'raised pre-seed India startup founder building',
    ],
};

// ── INSTAGRAM ──
const instagramSource = {
    name: 'Instagram',
    queries: [
        'startup founder Bangalore instagram building',
        'startup journey India founder instagram',
        'launched my startup India instagram',
        'tech startup Bangalore founder instagram',
        'co-founder startup India building instagram',
        'bootstrapped startup India founder instagram',
        'SaaS startup India founder instagram',
        'building a product India startup instagram',
    ],
};

// ── PRODUCT HUNT ──
const productHuntSource = {
    name: 'Product Hunt',
    queries: [
        'producthunt.com India maker launched SaaS',
        'producthunt.com Bangalore maker product',
        'producthunt.com India startup launched new',
        'producthunt.com Mumbai Delhi startup launched',
        'producthunt.com Indian founder product SaaS',
        'producthunt.com Hyderabad Pune startup maker',
    ],
    fetchLeads: async () => {
        console.log(`  📡 Hitting Product Hunt API...`);
        const query = `{
            posts(order: NEWEST, first: 30) {
                edges {
                    node {
                        name
                        tagline
                        website
                        makers {
                            name
                            websiteUrl
                        }
                    }
                }
            }
        }`;
        try {
            const res = await fetch('https://api.producthunt.com/v2/api/graphql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query })
            });
            if (!res.ok) return null;
            const data = await res.json();
            const leads = [];
            for (const edge of (data?.data?.posts?.edges || [])) {
                const post = edge.node;
                if (!post.website) continue;
                const maker = post.makers?.[0];
                leads.push({
                    name: post.name,
                    website: post.website,
                    personName: maker?.name || null,
                    tagline: post.tagline || '',
                });
            }
            return leads;
        } catch {
            return null;
        }
    }
};

// ── PEERLIST ──
const peerlistSource = {
    name: 'Peerlist',
    queries: [
        'peerlist.io Bangalore founder startup',
        'peerlist.io India startup builder SaaS',
        'peerlist.io founder building SaaS India',
        'peerlist.io co-founder Bangalore product',
        'peerlist.io Delhi founder startup building',
        'peerlist.io Mumbai founder SaaS startup',
        'peerlist.io Hyderabad Pune founder startup',
    ],
};

// ── INDIEHACKERS ──
const indieHackersSource = {
    name: 'IndieHackers',
    queries: [
        'indiehackers.com India launched product milestone',
        'indiehackers.com Bangalore founder startup',
        'indiehackers.com India MRR revenue startup',
        'indiehackers.com India SaaS launched building',
        'indiehackers.com Indian founder shipped product',
    ],
};

// ── SHOW HN ──
const showHNSource = {
    name: 'ShowHN',
    queries: [
        'Show HN India startup launched',
        'Show HN Bangalore SaaS product',
        'Show HN Indian founder built',
        'news.ycombinator.com India startup launched',
        'Show HN Mumbai Delhi startup SaaS',
    ],
};

// ── DEV.TO / HASHNODE ──
const devBlogSource = {
    name: 'DevBlogs',
    queries: [
        'dev.to building a SaaS India founder',
        'dev.to my startup India journey launched',
        'dev.to launched startup Bangalore building',
        'hashnode.dev building SaaS India startup',
        'hashnode.dev launched startup India founder',
        'dev.to side project India startup revenue',
    ],
};

// ═══════════════════════════════════════════════════════════════
// 📅 DAILY ROTATION — 8 days, then repeat
// ═══════════════════════════════════════════════════════════════
const ALL_SOURCES = [
    twitterSource,      // Day 0
    twitterSource,      // Day 1 (Twitter x2)
    instagramSource,    // Day 2
    instagramSource,    // Day 3 (IG x2)
    productHuntSource,  // Day 4
    peerlistSource,     // Day 5
    indieHackersSource, // Day 6
    { ...showHNSource, queries: [...showHNSource.queries, ...devBlogSource.queries] }, // Day 7 (combined)
];

// ═══════════════════════════════════════════════════════════════
// 🔗 PROCESS A SEARCH RESULT — Extract the actual startup website
// ═══════════════════════════════════════════════════════════════
async function processSearchResult(result) {
    const url = result.url;
    const domain = getDomainFromUrl(url);

    // CASE 1: Result IS a startup website (not a social/news site)
    if (isActualStartupSite(url)) {
        const name = result.title.split(/[-|–—]/).shift().trim();
        return { name, website: url, personName: null };
    }

    // CASE 2: Result is a social/news page — use AI to extract the startup
    // This handles: x.com tweets, instagram posts, PH pages, peerlist profiles, etc.
    try {
        const html = await fetchPageSafe(url, 8000);
        const $ = cheerio.load(html);
        $('script, style, nav, footer, header').remove();
        const plainText = $('body').text().replace(/\s+/g, ' ').substring(0, 4000);

        const extraction = await groq.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: `You extract EARLY-STAGE startup info from web pages. Given text from a social media post, profile, or article, find the specific early-stage startup or indie product being discussed.
Return ONLY a JSON object: {"startup_name": "name or null", "website_url": "url or null"}

STRICT RULES:
- ONLY extract 1-5 person startups, indie projects, and newly launched MVPs.
- DO NOT extract massive unicorns, established enterprises, or billion-dollar companies (e.g. Zerodha, Zoho, Freshworks, Stripe, Razorpay). If the text is about a unicorn, return nulls.
- Return the startup's OWN website, NOT the social media URL.
- If you can see a product name but no URL, guess: [productname].com or [productname].io
- If there's no specific early-stage startup mentioned, return nulls.`
                },
                { role: 'user', content: plainText }
            ],
            model: 'qwen/qwen3.6-27b',
            temperature: 0.1,
            response_format: { type: 'json_object' }
        });

        const match = extraction.choices[0].message.content.match(/\{[\s\S]*\}/);
        if (match) {
            const parsed = JSON.parse(match[0]);
            if (parsed.startup_name && parsed.website_url) {
                const websiteUrl = parsed.website_url.startsWith('http') ? parsed.website_url : `https://${parsed.website_url}`;
                if (isActualStartupSite(websiteUrl)) {
                    console.log(`  🎯 AI extracted: ${parsed.startup_name} → ${websiteUrl}`);
                    return { name: parsed.startup_name, website: websiteUrl, personName: null };
                }
            }
        }
    } catch (err) {
        console.log(`  ⚠️ AI extraction failed: ${err.message}`);
    }

    return null;
}

// ═══════════════════════════════════════════════════════════════
// 🚀 MAIN ENGINE
// ═══════════════════════════════════════════════════════════════
async function run() {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);

    // Allow forcing a source via env var
    const forceSource = process.env.SOURCE;
    let source;
    if (forceSource) {
        source = ALL_SOURCES.find(s => s.name.toLowerCase().includes(forceSource.toLowerCase()));
        if (!source) {
            console.error(`❌ Unknown source: ${forceSource}`);
            console.log(`Available: ${[...new Set(ALL_SOURCES.map(s => s.name))].join(', ')}`);
            process.exit(1);
        }
    } else {
        source = ALL_SOURCES[dayOfYear % ALL_SOURCES.length];
    }

    const queryIndex = dayOfYear % source.queries.length;
    const todaysQuery = process.env.CATCHUP_QUERY || source.queries[queryIndex];

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  🚀 BUILDER OUTREACH SCRAPER`);
    console.log(`  📦 Source:  ${source.name}`);
    console.log(`  🔍 Query:  ${todaysQuery}`);
    console.log(`  📅 Day:    ${dayOfYear}`);
    console.log(`${'═'.repeat(60)}\n`);

    const MAX_LEADS = parseInt(process.env.SCRAPE_LIMIT) || 20;
    const validStartups = [];

    try {
        let searchResults = [];

        // ── Direct API path (e.g. Product Hunt) ──
        if (source.fetchLeads) {
            const directLeads = await source.fetchLeads();
            if (directLeads && directLeads.length > 0) {
                console.log(`  ✅ Got ${directLeads.length} leads from direct API\n`);
                for (const lead of directLeads) {
                    if (validStartups.length >= MAX_LEADS) break;
                    console.log(`🏢 ${lead.name} (${lead.website})`);
                    
                    const { data: existing } = await supabase.from('startups').select('id').eq('name', lead.name).limit(1);
                    if (existing && existing.length > 0) {
                        console.log(`  ⏭️ Already in DB. Skipping.`);
                        continue;
                    }

                    const { email, html } = await extractEmailFromWebsite(lead.website);
                    const domain = getDomainFromUrl(lead.website);
                    const finalEmail = email || (domain ? guessEmails(domain)[0] : null);
                    
                    if (!finalEmail) {
                        console.log(`  ⚠️ No email found. Skipping.`);
                        continue;
                    }

                    const isGuessed = !email;
                    console.log(`  📧 ${finalEmail}${isGuessed ? ' (guessed)' : ''}`);

                    let intro = `Saw ${lead.name} on Product Hunt — ${lead.tagline || 'love the concept'}.`;
                    if (html) {
                        const $ = cheerio.load(html);
                        $('script, style, nav, footer, header').remove();
                        const text = $('body').text().replace(/\s+/g, ' ').trim();
                        if (text.length > 100) {
                            intro = await getPersonalizedIntro(text, lead.name);
                        }
                    }

                    validStartups.push({
                        name: lead.name,
                        website: lead.website,
                        email: finalEmail,
                        pitch_angle: source.name.toLowerCase().replace(/[\s\/]+/g, '_'),
                        personalized_intro: intro,
                        source: `BuilderScraper | ${source.name}`,
                    });
                    console.log(`  ✅ Added!\n`);
                    await new Promise(r => setTimeout(r, 1500));
                }
            } else {
                console.log(`  ⚠️ Direct API unavailable or empty, falling back to search...`);
                searchResults = await webSearch(todaysQuery);
            }
        } else {
            console.log(`⏳ Searching...`);
            searchResults = await webSearch(todaysQuery);
        }

        if (searchResults.length > 0) {
            console.log(``);
            for (const result of searchResults) {
                if (validStartups.length >= MAX_LEADS) break;

            const shortTitle = result.title.substring(0, 55);
            const shortUrl = result.url.substring(0, 50);
            console.log(`🏢 ${shortTitle}... (${shortUrl})`);

            try {
                // Step 1: Figure out the actual startup website
                const target = await processSearchResult(result);
                if (!target) {
                    console.log(`  ⚠️ No startup extracted. Skipping.`);
                    continue;
                }

                const { name, website, personName } = target;
                console.log(`  📌 Target: ${name} (${website})`);

                // Step 2: Dedupe check
                const { data: existing } = await supabase
                    .from('startups')
                    .select('id')
                    .or(`name.eq.${name},website.eq.${website}`)
                    .limit(1);
                if (existing && existing.length > 0) {
                    console.log(`  ⏭️ Already in DB. Skipping.`);
                    continue;
                }

                // Step 3: Extract email from their website
                const { email, html } = await extractEmailFromWebsite(website);
                let finalEmail = email;

                // Step 4: Fallback — guess common email patterns
                if (!finalEmail) {
                    const domain = getDomainFromUrl(website);
                    if (domain) {
                        const guesses = guessEmails(domain);
                        finalEmail = guesses[0]; // hello@domain.com
                        console.log(`  🎲 No email on site. Best guess: ${finalEmail}`);
                    }
                }

                if (!finalEmail) {
                    console.log(`  ⚠️ No email found. Skipping.`);
                    continue;
                }

                console.log(`  📧 ${finalEmail}`);

                // Step 5: AI personalized intro
                let intro = `Saw what you're building at ${name} — love the concept.`;
                if (html) {
                    const $ = cheerio.load(html);
                    $('script, style, nav, footer, header').remove();
                    const text = $('body').text().replace(/\s+/g, ' ').trim();
                    if (text.length > 100) {
                        console.log(`  🧠 Generating AI intro...`);
                        intro = await getPersonalizedIntro(text, name);
                    }
                }

                validStartups.push({
                    name,
                    website,
                    email: finalEmail,
                    pitch_angle: source.name.toLowerCase().replace(/[\s\/]+/g, '_'),
                    personalized_intro: intro,
                    source: `BuilderScraper | ${source.name} | ${todaysQuery.substring(0, 40)}`,
                });

                console.log(`  ✅ Added!\n`);
                await new Promise(r => setTimeout(r, 2000));

            } catch (err) {
                console.log(`  ❌ Failed: ${err.message}`);
            }
        }
    }

        // ── Insert to Supabase ──
        if (validStartups.length > 0) {
            console.log(`\n💾 Injecting ${validStartups.length} builders into DB...`);
            const { error } = await supabase
                .from('startups')
                .upsert(validStartups, { onConflict: 'email', ignoreDuplicates: true });
            if (error) console.error(`❌ DB Error: ${error.message}`);
            else console.log(`✅ Success!`);
        } else {
            console.log(`\n⚠️ No builders found today.`);
        }

        // ── Report ──
        console.log(`\n${'═'.repeat(60)}`);
        console.log(`  📋 BUILDER SCRAPER REPORT`);
        console.log(`${'═'.repeat(60)}`);
        console.log(`  📦 Source:  ${source.name}`);
        console.log(`  🔍 Query:  ${todaysQuery}`);
        console.log(`  🎯 Found:  ${validStartups.length} builders`);
        console.log(`${'═'.repeat(60)}\n`);

    } catch (error) {
        console.error("❌ FATAL:", error.message);
    }
}

run();
