const { execSync } = require('child_process');

// Massive list of American cities to build the lead bank
const QUERIES = [
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
    "web design agencies in Phoenix AZ",
    "digital marketing agencies in Las Vegas NV",
    "web development in Philadelphia PA",
    "SEO agencies in Houston TX",
    "digital agencies in Miami FL",
    "creative agencies in Los Angeles CA",
    "web design agencies in Seattle WA",
    "web development companies in Charlotte NC",
    "ecommerce development in Columbus OH",
    "mobile app development in Indianapolis IN",
    "UI UX design agencies in San Jose CA",
    "software development companies in Fort Worth TX",
    "IT consulting in Jacksonville FL",
    "WordPress agencies in San Antonio TX",
    "Shopify developers in Detroit MI",
    "web agencies in El Paso TX",
    "digital marketing in Memphis TN",
    "web design in Baltimore MD",
    "creative agencies in Boston MA",
    "marketing firms in Nashville TN",
    "branding agencies in Portland OR",
    "web development in Oklahoma City OK",
    "SEO consultants in Louisville KY",
    "ecommerce design in Milwaukee WI",
    "software firms in Albuquerque NM",
    "web design companies in Tucson AZ",
    "digital marketing in Fresno CA",
    "web development in Sacramento CA",
    "UI UX design in Kansas City MO",
    "app developers in Mesa AZ",
    "creative agencies in Atlanta GA"
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
