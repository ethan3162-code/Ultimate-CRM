// Your business's own contact info, as it should appear on customer-facing documents (the
// Estimate landing page, the Invoice PDF). Backed by the generic key/value `settings` table (see
// settings.js) so it can be changed later without a redeploy, but defaults to your real info so
// nothing here needs to be set before these documents look right.
const { getSetting } = require('./settings');

function getCompanyProfile() {
  return {
    name: getSetting('company_name') || 'Precision Paving & Masonry',
    address_line1: getSetting('company_address_line1') || '825 E Gate Blvd. Suite 310',
    city_state_zip: getSetting('company_city_state_zip') || 'Garden City, NY 11530',
    phone: getSetting('company_phone') || '(631) 892-6379',
    email: getSetting('company_email') || 'admin@precisionpavingpro.com',
    website: getSetting('company_website') || 'www.precisionpavingpro.com',
  };
}

module.exports = { getCompanyProfile };

