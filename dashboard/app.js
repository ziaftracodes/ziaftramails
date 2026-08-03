// Supabase Configuration
const SUPABASE_URL = 'https://fpsoftdxghvuefazvmxe.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_5wcrxQzi6qzJJPbIDclalg_Z5SyTA07';

// Initialize Supabase Client
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// DOM Elements
const elements = {
    metricTotal: document.getElementById('metric-total'),
    metricPending: document.getElementById('metric-pending'),
    metricSent: document.getElementById('metric-sent'),
    metricReplied: document.getElementById('metric-replied'),
    leadsBody: document.getElementById('leads-body'),
    refreshBtn: document.getElementById('refresh-btn')
};

// Fetch and render data
async function fetchDashboardData() {
    try {
        elements.refreshBtn.innerHTML = '<i class="ph ph-spinner-gap spin"></i> Loading...';
        elements.refreshBtn.disabled = true;

        // Fetch all agencies
        const { data: agencies, error } = await supabaseClient
            .from('agencies')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        updateMetrics(agencies);
        renderTable(agencies);

    } catch (error) {
        console.error('Error fetching data:', error);
        alert('Failed to load data from Supabase. Check console for details.');
    } finally {
        elements.refreshBtn.innerHTML = '<i class="ph ph-arrows-clockwise"></i> Refresh Data';
        elements.refreshBtn.disabled = false;
    }
}

// Update the top metric cards
function updateMetrics(agencies) {
    const total = agencies.length;
    const pending = agencies.filter(a => a.status === 'PENDING').length;
    const sent = agencies.filter(a => a.status === 'SENT').length;
    const replied = agencies.filter(a => a.status === 'REPLIED').length;

    elements.metricTotal.textContent = total;
    elements.metricPending.textContent = pending;
    elements.metricSent.textContent = sent;
    elements.metricReplied.textContent = replied;
}

// Render the data table
function renderTable(agencies) {
    if (agencies.length === 0) {
        elements.leadsBody.innerHTML = `
            <tr>
                <td colspan="4" class="empty-state">
                    <i class="ph ph-ghost empty-icon"></i>
                    <p>No leads found in the database yet.</p>
                </td>
            </tr>
        `;
        return;
    }

    elements.leadsBody.innerHTML = agencies.map(agency => `
        <tr>
            <td>
                <div class="agency-name-cell">
                    <strong>${agency.name}</strong>
                    ${agency.website ? `<a href="${agency.website}" target="_blank" class="website-link"><i class="ph ph-link"></i></a>` : ''}
                </div>
            </td>
            <td class="email-cell">${agency.email}</td>
            <td><span class="status-badge status-${agency.status}">
                ${agency.status === 'PENDING' ? '<i class="ph ph-hourglass"></i>' : ''}
                ${agency.status === 'SENT' ? '<i class="ph ph-paper-plane-tilt"></i>' : ''}
                ${agency.status === 'REPLIED' ? '<i class="ph ph-envelope-open"></i>' : ''}
                ${agency.status}
            </span></td>
            <td class="date-cell">${new Date(agency.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
        </tr>
    `).join('');
}

// Event Listeners
elements.refreshBtn.addEventListener('click', fetchDashboardData);

// Initial Load
document.addEventListener('DOMContentLoaded', fetchDashboardData);
