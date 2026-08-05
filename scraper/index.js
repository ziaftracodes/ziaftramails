require('dotenv').config({ path: '../sender/.env' }); // Share the same .env file!
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
const Groq = require('groq-sdk');

// 1. Setup Supabase (Using the exact same keys you already have)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 1.5 Setup Groq AI
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// You can change this search query to whatever niche you want to scrape today
const SEARCH_QUERY = "web development agencies in Australia";
const GOOGLE_MAPS_URL = `https://www.google.com/maps/search/${encodeURIComponent(SEARCH_QUERY)}`;

async function scrapeGoogleMaps() {
    console.log(`🤖 Booting up Ziaftra AI Scraper...`);
    console.log(`🌍 Target: ${SEARCH_QUERY}`);

    // 2. Launch Puppeteer (Invisible browser)
    const browser = await puppeteer.launch({ 
        headless: "new", // Run in background silently
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-zygote',
            '--single-process'
        ] 
    });
    
    const page = await browser.newPage();
    
    try {
        console.log(`\n📍 Navigating to Google Maps...`);
        await page.goto(GOOGLE_MAPS_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        // Wait a few seconds for the initial load just to be safe
        await new Promise(r => setTimeout(r, 5000));

        // 3. Scroll the left pane to load more results (Google Maps uses infinite scroll)
        console.log(`📜 Scrolling through results to find agencies...`);
        try {
            await page.waitForSelector('div[role="feed"]', { timeout: 10000 });
        } catch (e) {
            console.log("⚠️ Could not find div[role='feed']. The layout might have changed or there are no results.");
        }
        let previousHeight = 0;
        let scrollAttempts = 0;
        
        while (scrollAttempts < 10) { // Limit scrolls so it doesn't run forever
            const currentHeight = await page.evaluate(() => {
                const feed = document.querySelector('div[role="feed"]');
                feed.scrollTo(0, feed.scrollHeight);
                return feed.scrollHeight;
            });

            if (currentHeight === previousHeight) {
                console.log("🛑 Reached bottom of the list!");
                break;
            }
            previousHeight = currentHeight;
            await new Promise(r => setTimeout(r, 2000)); // Wait for new items to load
            scrollAttempts++;
        }

        // 4. Extract Data using Cheerio
        console.log(`\n🔍 Extracting Agency Data...`);
        const html = await page.content();
        const $ = cheerio.load(html);
        
        const rawAgencies = [];
        
        $('a.hfpxzc').each((i, el) => {
            const name = $(el).attr('aria-label');
            const mapsUrl = $(el).attr('href');
            if (name && mapsUrl) {
                rawAgencies.push({ name, mapsUrl });
            }
        });

        console.log(`✅ Found ${rawAgencies.length} raw agencies! Let's extract real websites and emails for the first 5 (to test)...`);

        const validAgencies = [];
        const seenEmails = new Set();

        // Let's just do 5 for the test run so it doesn't take 20 minutes
        for (let i = 0; i < Math.min(10, rawAgencies.length); i++) {
            const agency = rawAgencies[i];
            console.log(`\n🕵️ Investigating [${i+1}/${Math.min(10, rawAgencies.length)}]: ${agency.name}`);
            let agencyPage;
            try {
                agencyPage = await browser.newPage();
                // 1. Go to their specific Google Maps page to find their Website button
                await agencyPage.goto(agency.mapsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await new Promise(r => setTimeout(r, 2000)); // Let the sidebar load

                // Google Maps often puts the website in an 'a' tag with data-item-id="authority"
                const websiteUrl = await agencyPage.evaluate(() => {
                    const webBtn = document.querySelector('a[data-item-id="authority"]');
                    return webBtn ? webBtn.href : null;
                });

                if (!websiteUrl) {
                    console.log(`⚠️ No website listed on Google Maps for ${agency.name}. Skipping.`);
                    if(agencyPage) await agencyPage.close();
                    continue;
                }
                
                console.log(`🔗 Found Website: ${websiteUrl}`);

                // 2. Go to their actual website to hunt for an email
                await agencyPage.goto(websiteUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                
                // Extract all text and HTML to hunt for emails
                const siteHtml = await agencyPage.content();
                
                // Regex to find standard emails
                const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
                const foundEmails = siteHtml.match(emailRegex);

                if (foundEmails && foundEmails.length > 0) {
                    // Filter out weird image artifacts (like .png / .jpg) that get caught in regex
                    let realEmail = foundEmails.find(e => !e.endsWith('.png') && !e.endsWith('.jpg') && !e.includes('sentry') && !e.includes('wix'));
                    
                    if (realEmail && !seenEmails.has(realEmail)) {
                        console.log(`🎯 EMAIL FOUND: ${realEmail}`);
                        seenEmails.add(realEmail);
                        
                        // Extract text for Groq
                        const site$ = cheerio.load(siteHtml);
                        const plainText = site$('body').text().replace(/\s+/g, ' ').trim().substring(0, 4000);
                        
                        let personalizedIntro = `I was just looking at your agency's website and I absolutely love the recent web development projects you've launched.`;
                        
                        try {
                            console.log(`🧠 Asking Groq to analyze the website for ${agency.name}...`);
                            const chatCompletion = await groq.chat.completions.create({
                                messages: [
                                    {
                                        role: 'system',
                                        content: 'You are an expert lead researcher. Read the provided text from a web agency website. Write a single short, highly personalized sentence complimenting their specific work, clients, or niche based on the text. Address it to the agency as a whole, not a specific person. Return a JSON object with a single key "personalizedIntro". DO NOT return any markdown formatting, just raw JSON.'
                                    },
                                    {
                                        role: 'user',
                                        content: plainText
                                    }
                                ],
                                model: 'llama-3.1-8b-instant',
                                response_format: { type: 'json_object' }
                            });
                            
                            const groqResponse = JSON.parse(chatCompletion.choices[0].message.content);
                            if(groqResponse.personalizedIntro) personalizedIntro = groqResponse.personalizedIntro;
                            console.log(`✨ Groq extracted - Intro: ${personalizedIntro}`);
                        } catch (groqErr) {
                            console.error("⚠️ Groq API failed for this agency:", groqErr.message);
                        }

                        validAgencies.push({
                            name: agency.name,
                            website: websiteUrl,
                            email: realEmail.toLowerCase(),
                            personalized_intro: personalizedIntro,
                            status: 'PENDING',
                            source: 'Google Maps Scraper V2',
                            created_at: new Date()
                        });
                        
                        // Respect Groq API Rate Limits (Sleep for 3 seconds)
                        await new Promise(r => setTimeout(r, 3000));
                    } else {
                        console.log(`⚠️ Email was a duplicate or invalid.`);
                    }
                } else {
                    console.log(`⚠️ No email found on the homepage.`);
                }
            } catch (err) {
                console.log(`❌ Failed to scrape ${agency.name}: ${err.message}`);
            } finally {
                if (agencyPage && !agencyPage.isClosed()) {
                    await agencyPage.close().catch(() => {});
                }
            }
        }

        // 5. Inject into Supabase Database
        if (validAgencies.length > 0) {
            console.log(`\n💾 Injecting ${validAgencies.length} REAL leads into Supabase...`);

            // We use upsert to avoid putting the exact same agency in twice based on their email
            const { error } = await supabase
                .from('agencies')
                .upsert(
                    validAgencies,
                    { onConflict: 'email' } 
                );

            if (error) {
                console.error("❌ Failed to push to database:", error);
            } else {
                console.log(`✅ Successfully added ${validAgencies.length} fresh leads to the Living Database!`);
            }
        } else {
            console.log(`\n🤷‍♂️ Could not find any valid emails in this batch.`);
        }

    } catch (error) {
        console.error("❌ Scraper crashed:", error);
    } finally {
        await browser.close();
        console.log(`\n🛑 Scraper finished and shut down.`);
    }
}

scrapeGoogleMaps();
