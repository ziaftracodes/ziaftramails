require('dotenv').config({ path: '../sender/.env' }); // Share the same .env file!
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');

// 1. Setup Supabase (Using the exact same keys you already have)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// You can change this search query to whatever niche you want to scrape today
const SEARCH_QUERY = "digital marketing agencies in New York";
const GOOGLE_MAPS_URL = `https://www.google.com/maps/search/${encodeURIComponent(SEARCH_QUERY)}`;

async function scrapeGoogleMaps() {
    console.log(`🤖 Booting up Ziaftra AI Scraper...`);
    console.log(`🌍 Target: ${SEARCH_QUERY}`);

    // 2. Launch Puppeteer (Invisible browser)
    const browser = await puppeteer.launch({ 
        headless: "new", // Run in background silently
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    
    const page = await browser.newPage();
    
    try {
        console.log(`\n📍 Navigating to Google Maps...`);
        await page.goto(GOOGLE_MAPS_URL, { waitUntil: 'networkidle2' });

        // 3. Scroll the left pane to load more results (Google Maps uses infinite scroll)
        console.log(`📜 Scrolling through results to find agencies...`);
        await page.waitForSelector('div[role="feed"]');
        
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
        
        const agencies = [];
        
        // Google Maps classes change often, but a links with 'hfpxzc' usually wrap the results
        $('a.hfpxzc').each((i, el) => {
            const name = $(el).attr('aria-label');
            const mapsUrl = $(el).attr('href');
            
            // Note: Google Maps doesn't directly show emails. 
            // We usually have to grab the website URL first, then visit the website to find the email.
            // For V1, we will insert them into Supabase so we can process emails later!
            
            if (name) {
                agencies.push({
                    name: name,
                    website: 'Pending Extraction', // We'd write a secondary bot to visit their site and find the email
                    email: `hello@${name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}.com`, // Placeholder logic
                    status: 'PENDING',
                    source: 'Google Maps Scraper V1'
                });
            }
        });

        console.log(`✅ Found ${agencies.length} agencies!`);

        // 5. Inject into Supabase Database
        if (agencies.length > 0) {
            console.log(`\n💾 Injecting into Supabase...`);
            
            // We use upsert to avoid putting the exact same agency in twice
            const { error } = await supabase
                .from('agencies')
                .upsert(
                    agencies.map(a => ({ ...a, created_at: new Date() })),
                    { onConflict: 'name' } 
                );

            if (error) {
                console.error("❌ Failed to push to database:", error);
            } else {
                console.log(`✅ Successfully added ${agencies.length} fresh leads to the Living Database!`);
            }
        }

    } catch (error) {
        console.error("❌ Scraper crashed:", error);
    } finally {
        await browser.close();
        console.log(`\n🛑 Scraper finished and shut down.`);
    }
}

scrapeGoogleMaps();
