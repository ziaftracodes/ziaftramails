# Product Requirements Document (PRD): Automated Agency Outreach System

## 1. Project Overview
**Objective:** Build an automated cold email outreach system to contact web development agencies, offering extra full-stack development capacity during their busy periods.
**Goal:** Secure freelance overflow work without the need for manual, time-consuming international phone calls.
**Budget constraint:** $0 monthly recurring cost.

## 2. Core Strategy (The "Zero-Cost Professional" Hack)
*   **Outbound (Sending):** Utilize a free Transactional Email API (e.g., Resend or Brevo) to send emails via a script.
*   **Identity:** Authenticate a custom domain (e.g., `fayz@yourdomain.com`) via DNS (SPF/DKIM) to establish a professional agency-level appearance.
*   **Inbound (Receiving):** Configure free Email Routing (via the domain registrar or Cloudflare) to automatically forward all replies directly to the user's standard personal Gmail account.

## 3. System Architecture & Workflow (The "Living Machine")
The system will act as a local, fully automated lead-generation machine divided into three distinct modules:

### Module 1: The Scraper (Lead Generation)
*   **Target Sources:** Predefined platforms, directories, or Google Maps where web development agencies are listed.
*   **Action:** Runs daily to scrape new agency names, websites, and emails.
*   **Output:** Automatically inserts new, deduplicated leads into the Local Database with a status of `PENDING`.

### Module 2: The Local Database (The Brain)
*   **Storage:** A local SQLite database (or robust JSON file) living on the computer.
*   **Function:** Acts as the single source of truth. Tracks every agency, their email, and their current status (`PENDING`, `SENT`, `REPLIED`, `FOLLOW-UP-NEEDED`).
*   **Deduplication:** Ensures no agency is ever emailed twice by checking records before sending.

### Module 3: The Sender & Tracker (Outreach & Follow-Up)
*   **Action:** Wakes up daily, queries the database for a batch of `PENDING` agencies (e.g., 50 per day).
*   **Execution:** Sends personalized emails using the Transactional API (Resend/Brevo), with a human-like delay between sends.
*   **Tracking:** Instantly updates the database status to `SENT`.
*   **Follow-Up Logic (Future Feature):** Checks for replies (via IMAP or Webhooks) and schedules automated follow-ups for agencies that haven't responded in X days.

### Module 4: The Command Center (The Dashboard)
*   **Purpose:** A beautiful, visual interface (built with React/Next.js) running locally on your machine.
*   **Visibility:** Hooked directly into your Supabase database to show you exactly what the GitHub Actions are doing behind the scenes.
*   **Metrics:** Shows how many emails were sent today, total pending leads, open rates (if tracked), and any replies.

## 4. Technical Stack (The $0 Cloud Setup)
Since this needs to run 24/7 even when your laptop is closed, we will build this entirely in the cloud using free-tier services.
*   **Environment:** Node.js
*   **Database (The Brain):** Supabase (Free Tier PostgreSQL) or MongoDB Atlas (Free Tier). This replaces the local SQLite DB so it lives in the cloud.
*   **The "Always On" Engine:** GitHub Actions. We can set up a free scheduled workflow (Cron Job) that runs your scripts automatically every single day at a specific time. You get 2,000 free minutes a month, which is plenty.
*   **Scraping:** Puppeteer/Cheerio running inside GitHub Actions.
*   **Email Sending:** Resend API or Brevo API.

## 5. Next Steps
1.  **Define Target Sources:** Where exactly do you want the scraper to look for these agencies? (e.g., Clutch.co, Google Maps, LinkedIn, specific directories).
2.  **Set Up the Domain:** Create an account on Resend/Brevo and configure your domain's DNS.
3.  **Set Up Cloud DB:** Create a free Supabase project to act as our cloud brain.
4.  **Build Phase 1 (The DB and Sender):** Start by manually feeding it a small list to test the email sending and status-tracking logic before building the scraper.
