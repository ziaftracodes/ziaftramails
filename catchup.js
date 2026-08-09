const { execSync } = require('child_process');

const QUERIES = [
    // Web Dev
    "web development agencies in London UK",
    "web design companies in Birmingham UK",
    "creative agencies in Edinburgh UK",
    "software development agencies in Glasgow UK",
    "web development companies in Bristol UK",
    "ecommerce development in Sheffield UK",
    "mobile app development in Newcastle UK",
    "UI UX design agencies in Nottingham UK",
    "WordPress development in Cardiff UK",
    "Shopify agencies in Belfast UK",
    "web design agencies in Brighton UK",
    
    // Marketing
    "Performance marketing agencies in Manchester UK",
    "Digital advertising agencies in Liverpool UK",
    "Lead generation companies in London UK",
    "B2B marketing firms in Cambridge UK",
    "PPC management agencies in Oxford UK",
    "Performance marketing agencies in Southampton UK",
    "Digital advertising agencies in Leicester UK",
    "Lead generation companies in Coventry UK",
    "PPC management agencies in Aberdeen UK",
    "Social media marketing agencies in Swansea UK"
];

const FIVE_HOURS = 5 * 60 * 60 * 1000;
const startTime = Date.now();

console.log("🚀 STARTING MASSIVE LEAD BANK SCRAPER (NO SENDING) 🚀");

async function run() {
    for (let i = 0; i < QUERIES.length; i++) {
        if (Date.now() - startTime >= FIVE_HOURS) {
            console.log("⏳ 5 Hours elapsed! Stopping script safely.");
            break;
        }

        const query = QUERIES[i];
        console.log(`\n\n======================================================`);
        console.log(`🎯 BANKING LEADS FOR: ${query}`);
        console.log(`======================================================\n`);

        try {
            // Run Scraper with a massive limit
            execSync(`node index.js`, {
                cwd: './scraper',
                env: { ...process.env, SCRAPE_LIMIT: 50, CATCHUP_QUERY: query },
                stdio: 'inherit'
            });

            // WE NO LONGER RUN THE SENDER HERE. 
            // JUST SCRAPING NON-STOP TO BUILD THE BANK.

        } catch (e) {
            console.log(`❌ Pipeline failed for ${query}, but pushing forward...`);
        }
        
        // Small delay between cities to not get rate limited by Google/SerpApi
        console.log("⏳ Waiting 5 seconds before next city...");
        await new Promise(r => setTimeout(r, 5000));
    }
    
    console.log("✅ MASSIVE LEAD BANK GENERATION COMPLETE.");
}

run();
