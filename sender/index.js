require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

// Initialize clients
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const randomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);

// ═══════════════════════════════════════════════════════════════
// 📧 SUBJECT LINE ROTATION — Different subjects = higher open rates
// The system picks a random subject for each email so inbox
// providers don't flag us as bulk spam.
// ═══════════════════════════════════════════════════════════════
function getWebDevSubjectLine(agencyName) {
    const subjects = [
        `Extra development capacity for ${agencyName}`,
        `Overflow dev work — free trial for ${agencyName}`,
        `Quick question for ${agencyName}'s team`,
        `Partnership idea for ${agencyName}`,
        `Full-stack dev available for ${agencyName} projects`,
        `Free trial task for ${agencyName} — no strings attached`,
    ];
    return subjects[Math.floor(Math.random() * subjects.length)];
}

function getMarketingSubjectLine(agencyName) {
    const subjects = [
        `Landing page help for ${agencyName} campaigns`,
        `Overflow landing page builds for ${agencyName}`,
        `Free landing page trial for ${agencyName}`,
        `Extra web dev hands for ${agencyName} campaigns`,
        `Partnership idea for ${agencyName}`,
    ];
    return subjects[Math.floor(Math.random() * subjects.length)];
}

// ═══════════════════════════════════════════════════════════════
// 🛡️ EMAIL VALIDATION — Don't waste sends on garbage addresses
// ═══════════════════════════════════════════════════════════════
function isValidEmail(email) {
    if (!email || email.length < 6 || email.length > 254) return false;
    const strictRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return strictRegex.test(email);
}

// ═══════════════════════════════════════════════════════════════
// 🔥 WARM-UP ENGINE — Auto-scales sending volume over time
// ═══════════════════════════════════════════════════════════════
async function getDynamicWarmupSettings() {
    const { data: firstSent, error } = await supabase
        .from('agencies')
        .select('last_contacted_at')
        .not('last_contacted_at', 'is', null)
        .order('last_contacted_at', { ascending: true })
        .limit(1);

    const START_LIMIT = 50;
    const MAX_LIMIT = 600;
    const START_MIN_DELAY = 60000;
    const END_MIN_DELAY = 15000;
    const START_MAX_DELAY = 150000;
    const END_MAX_DELAY = 45000;
    const WARMUP_DAYS = 30;

    if (error || !firstSent || firstSent.length === 0) {
        if (!error) console.log("  🌱 First day of outreach! Warm-up Day 1.");
        else console.warn("  ⚠️ Could not check warmup history. Defaulting to Day 1.");
        return { limit: START_LIMIT, minDelay: START_MIN_DELAY, maxDelay: START_MAX_DELAY };
    }

    const startDate = new Date(firstSent[0].last_contacted_at);
    startDate.setUTCHours(0, 0, 0, 0);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const diffDays = Math.floor(Math.abs(today - startDate) / (1000 * 60 * 60 * 24));

    if (diffDays >= WARMUP_DAYS) {
        console.log(`  🔥 Day ${diffDays + 1} | Fully Warmed Up! | Limit: ${MAX_LIMIT}`);
        return { limit: MAX_LIMIT, minDelay: END_MIN_DELAY, maxDelay: END_MAX_DELAY };
    }

    // Linear interpolation for smooth daily scaling
    const progress = diffDays / WARMUP_DAYS;
    const currentLimit = Math.floor(START_LIMIT + (MAX_LIMIT - START_LIMIT) * progress);
    const currentMinDelay = Math.floor(START_MIN_DELAY - (START_MIN_DELAY - END_MIN_DELAY) * progress);
    const currentMaxDelay = Math.floor(START_MAX_DELAY - (START_MAX_DELAY - END_MAX_DELAY) * progress);

    console.log(`  🔥 Day ${diffDays + 1} | Scaling Up | Limit: ${currentLimit}`);
    return { limit: currentLimit, minDelay: currentMinDelay, maxDelay: currentMaxDelay };
}

// ═══════════════════════════════════════════════════════════════
// 📡 PROVIDER FUNCTIONS — Multi-provider load balancer
// ═══════════════════════════════════════════════════════════════
async function sendViaResend(toEmail, toName, subject, htmlContent) {
    const { error } = await resend.emails.send({
        from: `Fayz <${process.env.SENDER_EMAIL}>`,
        to: [toEmail],
        subject: subject,
        html: htmlContent,
    });
    if (error) throw new Error(error.message);
}

async function sendViaBrevo(toEmail, toName, subject, htmlContent) {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'api-key': process.env.BREVO_API_KEY,
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            sender: { name: 'Fayz', email: process.env.SENDER_EMAIL },
            to: [{ email: toEmail, name: toName }],
            subject: subject,
            htmlContent: htmlContent
        })
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(`Brevo: ${JSON.stringify(err)}`);
    }
}



// ═══════════════════════════════════════════════════════════════
// 📝 EMAIL TEMPLATE — Professional, clean HTML email
// ═══════════════════════════════════════════════════════════════
function buildWebDevEmailHtml(agency) {
    return `
<p>Hey team,</p>
<p>${agency.personalized_intro || `I was checking out your work at ${agency.name} and really liked what I saw.`}</p>
<p>I'm a full-stack dev based in India (React, Next.js, Node.js). I know digital agencies often have more client work than internal capacity during busy months.</p>
<p>If your team ever gets overloaded and needs an extra pair of hands to offload web apps, API integrations, or just crank out code, I can step in as a reliable external partner.</p>
<p>I know trusting a new dev is risky, so I'm happy to do a small free trial task just to prove my speed and code quality. Worth a quick chat?</p>
<p>
Best,<br>
Fayz<br>
Full-Stack Developer<br>
<a href="https://fayzz.in">fayzz.in</a>
</p>`.trim();
}

function buildMarketingEmailHtml(agency) {
    return `
<p>Hey team,</p>
<p>${agency.personalized_intro || `I was checking out your campaigns at ${agency.name} and really liked your approach.`}</p>
<p>I'm a web developer specializing in fast-turnaround landing pages. I know performance agencies often get bottlenecked launching new campaigns for clients.</p>
<p>If your internal team ever needs an extra set of hands to rapidly build out clean, high-converting landing pages or funnels, I can step in to clear the backlog.</p>
<p>I know trusting a new dev is risky, so I'm happy to build one landing page completely free just to prove my speed and quality. Worth a quick chat?</p>
<p>
Best,<br>
Fayz<br>
Web Developer<br>
<a href="https://fayzz.in">fayzz.in</a>
</p>`.trim();
}

// ═══════════════════════════════════════════════════════════════
// 🚀 MAIN SENDER ENGINE
// ═══════════════════════════════════════════════════════════════
async function runSender() {
    const startTime = Date.now();
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  🚀 ZIAFTRA MAILS — MEGA LOAD BALANCER v4.0`);
    console.log(`${'═'.repeat(60)}`);
    console.log(`  📅 Date:   ${new Date().toISOString().split('T')[0]}`);
    console.log(`  📧 From:   ${process.env.SENDER_EMAIL}`);
    console.log(`  🏃 Mode:   ${process.env.DRY_RUN === 'true' ? 'DRY RUN' : 'LIVE'}`);
    console.log(`${'═'.repeat(60)}\n`);

    try {
        const warmupSettings = await getDynamicWarmupSettings();
        // DAILY_LIMIT env var can only act as a safety CAP, never reduce the warm-up limit
        const overrideCap = parseInt(process.env.DAILY_LIMIT, 10);
        const DAILY_LIMIT = (overrideCap && overrideCap > warmupSettings.limit) ? overrideCap : warmupSettings.limit;

        console.log(`\n🔍 Fetching up to ${DAILY_LIMIT} PENDING leads...`);
        const { data: leads, error } = await supabase
            .from('agencies')
            .select('*')
            .eq('status', 'PENDING')
            .limit(DAILY_LIMIT);

        if (error) throw error;
        if (!leads || leads.length === 0) {
            console.log('✅ No pending leads found. Everything is up to date.');
            return;
        }

        // Filter out invalid emails before sending
        const validLeads = leads.filter(l => isValidEmail(l.email));
        const invalidLeads = leads.filter(l => !isValidEmail(l.email));

        if (invalidLeads.length > 0) {
            console.log(`\n🗑️ Marking ${invalidLeads.length} invalid email(s) as INVALID:`);
            for (const bad of invalidLeads) {
                console.log(`   ❌ ${bad.email}`);
                await supabase
                    .from('agencies')
                    .update({ status: 'INVALID' })
                    .eq('id', bad.id);
            }
        }

        if (validLeads.length === 0) {
            console.log('✅ No valid pending leads to send.');
            return;
        }

        console.log(`🎯 ${validLeads.length} valid leads queued. Beginning sequence...\n`);

        // Provider capacity tracker
        const providers = [
            { name: 'RESEND',  fn: sendViaResend,  limit: 100, used: 0, enabled: !!process.env.RESEND_API_KEY },
            { name: 'BREVO',   fn: sendViaBrevo,   limit: 300, used: 0, enabled: !!process.env.BREVO_API_KEY },
        ];

        let totalSent = 0;
        let totalFailed = 0;
        const isDryRun = process.env.DRY_RUN === 'true';

        for (const [index, agency] of validLeads.entries()) {
            const label = `[${index + 1}/${validLeads.length}]`;
            console.log(`${label} 📨 ${agency.name} → ${agency.email}`);

            // Find the next available provider
            const provider = providers.find(p => p.enabled && p.used < p.limit);
            if (!provider) {
                console.log(`\n🛑 ALL PROVIDERS EXHAUSTED. Stopping.`);
                break;
            }

            const sourceLower = (agency.source || "").toLowerCase();
            const isMarketing = sourceLower.includes("marketing") || 
                                sourceLower.includes("advertising") || 
                                sourceLower.includes("lead generation") || 
                                sourceLower.includes("ppc") ||
                                sourceLower.includes("seo");
                                
            const subject = isMarketing ? getMarketingSubjectLine(agency.name) : getWebDevSubjectLine(agency.name);
            const htmlContent = isMarketing ? buildMarketingEmailHtml(agency) : buildWebDevEmailHtml(agency);

            try {
                console.log(`${label} 📡 Via: ${provider.name} (${provider.used + 1}/${provider.limit})`);

                if (!isDryRun) {
                    await provider.fn(agency.email, agency.name, subject, htmlContent);
                } else {
                    console.log(`${label} [DRY RUN] Simulated send.`);
                }
                provider.used++;

                // Update database
                await supabase
                    .from('agencies')
                    .update({
                        status: 'SENT',
                        last_contacted_at: new Date().toISOString(),
                        provider: provider.name,
                        subject: subject
                    })
                    .eq('id', agency.id);

                console.log(`${label} ✅ SENT → DB updated`);
                totalSent++;

            } catch (err) {
                console.error(`${label} ❌ FAILED: ${err.message}`);
                totalFailed++;

                // Mark as FAILED in DB so we don't retry it infinitely
                await supabase
                    .from('agencies')
                    .update({ status: 'FAILED' })
                    .eq('id', agency.id);
            }

            // Humanized delay between sends
            if (index < validLeads.length - 1) {
                const waitMs = isDryRun ? 50 : randomDelay(warmupSettings.minDelay, warmupSettings.maxDelay);
                if (!isDryRun) {
                    console.log(`${label} ⏳ Waiting ${Math.round(waitMs / 1000)}s...\n`);
                }
                await sleep(waitMs);
            }
        }

        // ── Summary Report ──
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n${'═'.repeat(60)}`);
        console.log(`  📋 SENDER REPORT`);
        console.log(`${'═'.repeat(60)}`);
        console.log(`  ✅ Sent:       ${totalSent}`);
        console.log(`  ❌ Failed:     ${totalFailed}`);
        console.log(`  🗑️  Invalid:    ${invalidLeads.length}`);
        providers.filter(p => p.enabled).forEach(p => {
            console.log(`  📡 ${p.name}: ${p.used}/${p.limit}`);
        });
        console.log(`  ⏱️  Duration:   ${elapsed}s`);
        console.log(`${'═'.repeat(60)}\n`);

    } catch (err) {
        console.error('❌ FATAL ERROR:', err.message);
        process.exit(1);
    }
}

runSender();
