// Hatch-style outbound sequence templates (Sept 2026) — the built-in library a rep can start a
// campaign from instead of writing a sequence by hand. Each template expands into one row per
// step in campaign_steps (see db.js's CREATE TABLE campaign_steps and routes/campaigns.js's
// POST / templates handling) the moment a campaign is created with a template_key naming one of
// these — the template's own steps here are never referenced again after that, so editing this
// file later never changes a campaign that already exists.
//
// Placeholder tokens get substituted at send time by campaignEngine.js's render() call:
// {{first_name}} / {{last_name}} / {{contact_name}} from the contact; {{user_name}} from
// whichever rep enrolled the contact (this CRM stores one username per rep, not separate
// first/last names, so that's the one "it's so-and-so" token available — every step below was
// written around a single name rather than the two-token "[[User First Name]] [[User Last
// Name]]" signature some outbound-texting tools use); {{company_name}} from Settings (the same
// source Estimate/Invoice documents use); {{link}} from the campaign's own custom_link field
// (only the two templates below with needsLink: true use it — a payment link or a review-site
// link a rep types in once when creating the campaign); and {{appointment_time}} from that
// contact's next upcoming appointment, already rendered as a clause like " on Tue, Oct 6 at
// 10:00 AM" (or '' if they have none booked, so the sentence still reads fine either way).
//
// step.channel is 'sms' or 'email'; an email step also carries `subject`. day_offset is days
// after enrollment (0 = sent right away, same tick the enrollment is created if a rep enrolls
// someone right after creating the campaign). Unlike a plain campaign's single message (which
// campaignEngine.js auto-bookends with its own "Hi {{first_name}}, ... — {{company_name}}"
// wrapper), these bodies are the complete, final wording step to step — campaignEngine.js does
// NOT add any wrapper around a sequence step, since every step here already opens and signs off
// on its own.

const CATEGORIES = [
  { key: 'lead_outreach', label: 'Lead outreach campaign templates', blurb: 'Beat your competitors to leads and book more appointments.' },
  { key: 'sales_followup', label: 'Sales follow-up campaign templates', blurb: 'Seize more opportunities and close more deals.' },
  { key: 'customer_experience', label: 'Customer experience campaign templates', blurb: 'Keep customers informed and engaged, to increase satisfaction, loyalty, and retention.' },
  { key: 'nurture', label: 'Nurture campaign templates', blurb: 'Reach out to aged leads or past customers in your database to drum up new opportunities.' },
  { key: 'review_referral', label: 'Review & referral campaign templates', blurb: 'Ask satisfied customers to spread the word about your business.' },
];

const TEMPLATES = [
  {
    key: 'hatch_chat', category: 'lead_outreach', audience: 'lead', name: 'Hatch chat',
    description: 'Engage contacts who have requested text outreach through your website.',
    needsLink: false,
    steps: [
      { day_offset: 0, channel: 'sms', message: "Hi {{first_name}}, this is {{user_name}} with {{company_name}}. Thanks for texting us! Can you tell me more about what you need help with? Reply END to stop texts." },
      { day_offset: 2, channel: 'sms', message: "Thanks again for texting us the other day. I didn't hear back from you — text me back with what you need, I'm here to help." },
      { day_offset: 3, channel: 'sms', message: "Hi {{first_name}}, it's {{company_name}}. Text me back when you have some time so I can help you out!" },
      { day_offset: 5, channel: 'sms', message: "Hi {{first_name}}, it's {{company_name}}. If you ever need help with anything, text me at this number!" },
    ],
  },
  {
    key: 'home_show', category: 'lead_outreach', audience: 'lead', name: 'Home show or conference',
    description: 'Follow up with leads from a home show or conference.',
    needsLink: false,
    steps: [
      { day_offset: 0, channel: 'sms', message: "Hi {{first_name}}, it's {{user_name}} from {{company_name}}. Great meeting you at the home show! Are you looking to get any work done in the next couple of months? Reply END to stop texts." },
      { day_offset: 2, channel: 'sms', message: "I'm setting aside time this week to connect with people I met at the home show. Do you have time to talk?" },
      { day_offset: 4, channel: 'sms', message: "Are you looking to get any work done this year, or should I stop reaching out for now?" },
    ],
  },
  {
    key: 'speed_to_lead', category: 'lead_outreach', audience: 'lead', name: 'Speed to lead',
    description: 'Engage new leads instantly (from your website and other lead sources).',
    needsLink: false,
    steps: [
      { day_offset: 0, channel: 'sms', message: "Hi {{first_name}}, it's {{user_name}} with {{company_name}}. I got your information from the form you submitted. Text me back with what you are looking for! Reply END to stop texts." },
      { day_offset: 0, channel: 'email', subject: 'Thanks for inquiring with {{company_name}}', message: "Hi {{first_name}}, I got your information from the form that you submitted online. I'd love to learn more about your request, or get you scheduled for an appointment. Please email me back the details! Talk soon, {{user_name}}, {{company_name}}" },
      { day_offset: 2, channel: 'sms', message: "Hi {{first_name}}. I haven't heard back since you submitted your form. Text me back with the details." },
      { day_offset: 3, channel: 'email', subject: '{{first_name}} - reminder about your request!', message: "{{first_name}}, I haven't heard back yet regarding the request you submitted. Can you email me back the details of what you want to do? Thank you, {{user_name}}, {{company_name}}" },
      { day_offset: 3, channel: 'sms', message: "Hi {{first_name}}. Are you still looking to get work done? Text me back with details, I would love to help." },
      { day_offset: 4, channel: 'sms', message: "Hi {{first_name}} — following up again on the form you submitted — are you still interested? I would love to help!" },
      { day_offset: 5, channel: 'sms', message: "Hi {{first_name}} — reaching out one last time — would you prefer a phone call?" },
    ],
  },
  {
    key: 'canceled_appointments', category: 'sales_followup', audience: 'opportunity', name: 'Canceled appointments',
    description: 'Reach out to canceled prospects to reschedule their estimate.',
    needsLink: false,
    steps: [
      { day_offset: 0, channel: 'sms', message: "Hi {{first_name}}! This is {{user_name}} with {{company_name}}. Your appointment with us got canceled, and I'd love to get you back on the calendar. What day works best for you? Reply END to stop texts." },
      { day_offset: 0, channel: 'email', subject: 'Reschedule your appointment with {{company_name}}', message: "Hi {{first_name}}, I saw that you recently canceled an appointment with us. Is your project still on the table? If so, I'm happy to reschedule you and get the ball rolling. Let me know! {{user_name}}, {{company_name}}" },
      { day_offset: 2, channel: 'sms', message: "When is a better day/time to get you on the books?" },
      { day_offset: 3, channel: 'sms', message: "Hi again, {{first_name}}. Are you interested in rescheduling your appointment?" },
      { day_offset: 5, channel: 'sms', message: "Before I close this out, reaching out one more time to see if we can reschedule your appointment. When works for you?" },
    ],
  },
  {
    key: 'appointment_followup_feedback', category: 'sales_followup', audience: 'opportunity', name: 'Appointment follow-up — feedback approach',
    description: 'Engage prospects after their appointment/estimate.',
    needsLink: false,
    steps: [
      { day_offset: 0, channel: 'sms', message: "Hi {{first_name}}! This is {{user_name}} with {{company_name}}. I want to follow up on your recent appointment. How did everything go? Reply END to stop texts." },
      { day_offset: 0, channel: 'email', subject: "{{first_name}}, how'd it go?", message: "Hi {{first_name}}, {{user_name}} here from {{company_name}}. Thanks for having us out! How did everything go during your visit? Do you have any feedback or questions I can help answer? Best, {{user_name}}, {{company_name}}" },
      { day_offset: 2, channel: 'sms', message: "Hey {{first_name}}, checking in again to see how your appointment went. Do you have any questions or feedback?" },
      { day_offset: 4, channel: 'sms', message: "Hi {{first_name}}, I just want to make sure we met your expectations. A yes or no is perfectly fine!" },
      { day_offset: 4, channel: 'email', subject: '{{first_name}}, {{company_name}} feedback', message: "Hi {{first_name}}, it's {{user_name}} at {{company_name}}. Typically, people don't get back to us for one of a few reasons: too busy, affordability, or something didn't go well at the appointment. I'm happy to work with you to better understand what it will take to earn your business — is one of those affecting your response? Thank you, {{user_name}}, {{company_name}}" },
      { day_offset: 5, channel: 'sms', message: "Is your project still on the table, {{first_name}}?" },
      { day_offset: 7, channel: 'sms', message: "Hi {{first_name}}, are you still looking to get your project done soon, or should I touch base in a few months?" },
    ],
  },
  {
    key: 'estimate_followup', category: 'sales_followup', audience: 'opportunity', name: 'Estimate follow-up',
    description: 'Follow up directly on an estimate you provided.',
    needsLink: false,
    steps: [
      { day_offset: 0, channel: 'sms', message: "Hi {{first_name}}! This is {{user_name}} with {{company_name}}. Do you have any questions on the estimate we sent over? Reply END to stop texts." },
      { day_offset: 0, channel: 'email', subject: '{{first_name}}, how can I help?', message: "Hi {{first_name}}, {{user_name}} here with {{company_name}}. It was great to meet you at our recent appointment, thanks for giving us the opportunity to earn your business! Do you have any questions on the estimate we sent over? {{user_name}}, {{company_name}}" },
      { day_offset: 3, channel: 'sms', message: "Hey {{first_name}}, let me know if you have everything you need to make an informed decision." },
      { day_offset: 4, channel: 'sms', message: "Hey {{first_name}}, {{user_name}} again, checking in on your estimate. I'm happy to talk through any questions or concerns you have — let me know how I can help!" },
      { day_offset: 4, channel: 'email', subject: 'Your estimate with {{company_name}}', message: "Hi {{first_name}}, it's {{user_name}} again from {{company_name}}. I haven't heard from you since we provided your estimate — is it the price, the timing, or are you considering someone else? I'm happy to work with you on any of these, we want to earn your business! Thank you, {{user_name}}, {{company_name}}" },
      { day_offset: 5, channel: 'sms', message: "Is your project still on the table, {{first_name}}?" },
      { day_offset: 7, channel: 'sms', message: "Hi {{first_name}}, are you still looking to get your project done soon, or should I touch base in a few months?" },
    ],
  },
  {
    key: 'accounts_receivable', category: 'customer_experience', audience: 'opportunity', name: 'Accounts receivable',
    description: 'Reach out to customers for payments.',
    needsLink: true,
    steps: [
      { day_offset: 0, channel: 'sms', message: "Hi {{first_name}}. {{user_name}} from {{company_name}} here. We are ready to collect payment for your completed service. You can pay by calling or online through this link: {{link}}. Thanks! Reply END to stop texts." },
      { day_offset: 0, channel: 'email', subject: 'Your payment is due', message: "Hi {{first_name}} — {{user_name}} from {{company_name}} here. We are ready to collect payment for your completed service. You can pay by calling or online through this link: {{link}}. Thanks! {{user_name}}" },
      { day_offset: 3, channel: 'sms', message: "Hi again {{first_name}}, this is {{user_name}} from {{company_name}}. Reminding you that your payment is due. Please either give me a call to resolve your payment, or you can pay online through this link: {{link}}." },
      { day_offset: 5, channel: 'sms', message: "{{first_name}}, your payment to {{company_name}} is due. Please either give me a call to make a payment, or you can pay online through this link: {{link}}." },
      { day_offset: 6, channel: 'email', subject: 'Reminder: your payment to {{company_name}}', message: "Hi {{first_name}} — we have not had luck getting in touch with you to resolve your balance for your completed service. Are there questions I can answer for you? If you're able to make the payment online, here's a link to do so: {{link}}. Thanks! {{user_name}}" },
      { day_offset: 6, channel: 'sms', message: "Hi {{first_name}}. We haven't heard back from you to collect payment on your completed service. When can we get this resolved? Call me when you get a chance." },
    ],
  },
  {
    key: 'appointment_reminder', category: 'customer_experience', audience: 'opportunity', name: 'Upcoming appointment reminder',
    description: 'Remind customers about their upcoming appointment.',
    needsLink: false,
    steps: [
      { day_offset: 0, channel: 'sms', message: "Hi {{first_name}}, it's {{user_name}} from {{company_name}}. Just sending a reminder about your upcoming appointment{{appointment_time}} — we are excited to see you! Reply END to stop texts." },
      { day_offset: 0, channel: 'email', subject: 'Appointment reminder with {{company_name}}', message: "Hi {{first_name}}, just sending a quick reminder about your upcoming appointment{{appointment_time}}. Please let me know if you have any questions or need to reschedule. We're excited to see you soon! Thanks, {{user_name}}, {{company_name}}" },
    ],
  },
  {
    key: 'appointment_confirmation', category: 'customer_experience', audience: 'opportunity', name: 'Appointment confirmation',
    description: 'Confirm with customers that their appointment is booked.',
    needsLink: false,
    steps: [
      { day_offset: 0, channel: 'sms', message: "Hi {{first_name}}, thank you for scheduling your appointment with {{company_name}}{{appointment_time}}. If you have any questions, let us know! Reply END to stop texts." },
      { day_offset: 0, channel: 'email', subject: 'Your appointment is confirmed', message: "Thank you for scheduling your appointment with {{company_name}}{{appointment_time}}. If you have any questions, you can call, text, or email us. We look forward to seeing you! Best, {{user_name}}, {{company_name}}" },
    ],
  },
  {
    key: 'schedule_installation', category: 'customer_experience', audience: 'opportunity', name: 'Schedule installation',
    description: "Let customers know their product has arrived and it's time to schedule the install.",
    needsLink: false,
    steps: [
      { day_offset: 0, channel: 'sms', message: "Hi {{first_name}}, it's {{user_name}} from {{company_name}}! Great news, your products will be arriving soon, so I can go ahead and schedule the installation. What day/time works for you? Reply END to stop texts." },
      { day_offset: 0, channel: 'email', subject: '{{first_name}} - your order is ready', message: "Hi {{first_name}}, your products from {{company_name}} should be here within the next few days, so let's schedule a day and time for the installation to begin. What day works best for you? Best, {{user_name}}, {{company_name}}" },
      { day_offset: 3, channel: 'sms', message: "Hi again — quick reminder to contact us to get scheduled for installation. We're eager to get your job started!" },
      { day_offset: 3, channel: 'email', subject: 'Reminder - your order is ready', message: "Hi {{first_name}}, reminding you that your installation is ready to be scheduled. Give me a call or shoot over a text/email with your availability. We look forward to starting your project! Thanks, {{user_name}}, {{company_name}}" },
      { day_offset: 5, channel: 'sms', message: "Hi {{first_name}}. Did you have a date in mind to start your installation?" },
    ],
  },
  {
    key: 'nurture_canceled', category: 'nurture', audience: 'lead', name: 'Nurture — canceled appointments',
    description: 'Re-engage old leads who canceled their appointments.',
    needsLink: false,
    steps: [
      { day_offset: 0, channel: 'sms', message: "Hi {{first_name}}, it's {{user_name}} from {{company_name}}. We never met on the project you inquired about a while back. Are you still interested in getting work done? Reply END to stop texts." },
      { day_offset: 0, channel: 'email', subject: 'Your canceled appointment with {{company_name}}', message: "{{first_name}}, you inquired about an appointment in the past, and we were never able to meet with you. Did you complete this project, or does it make sense for us to reconnect and schedule an appointment? Thanks, {{user_name}}, {{company_name}}" },
      { day_offset: 3, channel: 'sms', message: "Are you interested in us taking a look at the project you inquired about in the past?" },
      { day_offset: 6, channel: 'sms', message: "Circling back one last time! Did you want to talk to a specialist about your project?" },
    ],
  },
  {
    key: 'nurture_dead_estimate', category: 'nurture', audience: 'opportunity', name: 'Nurture — dead, open estimate',
    description: 'Reach out to aged leads who never responded to your estimate.',
    needsLink: false,
    steps: [
      { day_offset: 0, channel: 'sms', message: "Hi {{first_name}}, it's {{user_name}} with {{company_name}}. We never got the opportunity to discuss your estimate. Are you still looking to get this project done? Reply END to stop texts." },
      { day_offset: 0, channel: 'email', subject: 'Still thinking it over?', message: "Hi {{first_name}}, I hope you're doing well! We never got the opportunity to finalize your estimate. Could you let us know your current thoughts on it? Looking forward to hearing from you, {{user_name}}, {{company_name}}" },
      { day_offset: 3, channel: 'sms', message: "Just checking in to see if you received my last message. When would be a good time for you to discuss the estimate we provided?" },
      { day_offset: 6, channel: 'sms', message: "I would love the opportunity to review the estimate we provided with you. Do you have time this week to discuss it?" },
      { day_offset: 8, channel: 'sms', message: "Hey {{first_name}}, before I close this out, is this project something you'd like to revisit in the future?" },
    ],
  },
  {
    key: 'nurture_never_booked', category: 'nurture', audience: 'lead', name: 'Nurture — never booked an appointment',
    description: 'Reach out to aged leads who never booked an appointment.',
    needsLink: false,
    steps: [
      { day_offset: 0, channel: 'sms', message: "Hi {{first_name}}, it's {{user_name}} from {{company_name}}. We never got around to scheduling an estimate for you. Are you still looking to get work done? Reply END to stop texts." },
      { day_offset: 0, channel: 'email', subject: '{{first_name}}, still looking to complete your project?', message: "Hi {{first_name}}, I hope you're doing well! We never got around to scheduling an estimate for you. Are you still looking to get work done? Looking forward to hearing from you, {{user_name}}, {{company_name}}" },
      { day_offset: 3, channel: 'sms', message: "Hi {{first_name}}, are you still looking to get an estimate on your project? I'd be glad to get you scheduled." },
      { day_offset: 6, channel: 'sms', message: "Hey {{first_name}}, before I close this out, is this project something you'd like to revisit in the future?" },
    ],
  },
  {
    key: 'nurture_previous_customer', category: 'nurture', audience: 'opportunity', name: 'Nurture — previous customer',
    description: 'Reach out to past customers about new projects.',
    needsLink: false,
    steps: [
      { day_offset: 0, channel: 'sms', message: "Hi {{first_name}}, it's {{user_name}} from {{company_name}}. We enjoyed working with you in the past! Do you have any new projects coming up that we can help with? Reply END to stop texts." },
      { day_offset: 0, channel: 'email', subject: '{{first_name}}, another project?', message: "{{first_name}}, I hope you've been well since we completed your last project! We enjoyed working with you, so I'm reaching out to see if you have any additional projects coming up that we can help with? Let me know! {{user_name}}, {{company_name}}" },
      { day_offset: 3, channel: 'sms', message: "Circling back around to see if you have upcoming projects we can help with. I'm happy to jump on a quick call — are you free this week?" },
      { day_offset: 3, channel: 'email', subject: "{{first_name}}, what's next?", message: "{{first_name}}, checking in once more to see if you have any new projects on your mind that we can help with. We value our past customers and would love to talk more about what's next. What day/time works best to catch up? Thank you, {{user_name}}, {{company_name}}" },
      { day_offset: 5, channel: 'sms', message: "I'm going to close this out. Please reach out in the future if you're interested in working on another project with us!" },
      { day_offset: 5, channel: 'email', subject: '{{first_name}} - keep us in mind!', message: "Hi {{first_name}}, I haven't heard back from you, so I'll go ahead and close this out. Please reach out in the future when you're ready to discuss another project! Best, {{user_name}}, {{company_name}}" },
    ],
  },
  {
    key: 'referrals', category: 'review_referral', audience: 'opportunity', name: 'Referrals',
    description: 'Tell satisfied customers about your referral program.',
    needsLink: false,
    steps: [
      { day_offset: 0, channel: 'sms', message: "Hi {{first_name}}, it's {{user_name}} from {{company_name}}. Thank you for being our customer! We have a referral program for referring friends and neighbors — do you know anyone we can help? Reply END to stop texts." },
      { day_offset: 0, channel: 'email', subject: 'Refer us and save!', message: "Hi {{first_name}}, it's {{user_name}} from {{company_name}}. Thank you for being our customer! As referrals are a huge help to us, I wanted to let you know that we have a referral program. Do you have any friends or neighbors who could benefit from our services? Email back any questions you have! Best, {{user_name}}, {{company_name}}" },
      { day_offset: 3, channel: 'sms', message: "Hi {{first_name}}, {{user_name}} here once more from {{company_name}}. Do you want me to send over the details of our referral program?" },
      { day_offset: 7, channel: 'email', subject: 'Refer us and save!', message: "Hi {{first_name}}, it's {{user_name}} once more from {{company_name}}. We really appreciate your business, and wanted to let you know one last time that you get perks for referring friends and family to us! Call, email, or simply refer a customer to us to learn more! Best, {{user_name}}, {{company_name}}" },
    ],
  },
  {
    key: 'reviews', category: 'review_referral', audience: 'opportunity', name: 'Reviews',
    description: 'Share a link with customers to leave a review.',
    needsLink: true,
    steps: [
      { day_offset: 0, channel: 'sms', message: "Hi {{first_name}}, it's {{user_name}} from {{company_name}}! Thank you for choosing us! Would you be open to writing a quick review for us? Here is the link: {{link}}. Thank you in advance! Reply STOP to stop texts." },
      { day_offset: 0, channel: 'email', subject: '{{first_name}}, leave us a review?', message: "Hi {{first_name}}, reviews don't just help us, they also help future customers like you feel confident in choosing a service provider. If you had a positive experience with us, would you take a minute to leave a quick review? You can do so at this link: {{link}}. Thank you in advance! {{user_name}}, {{company_name}}" },
      { day_offset: 3, channel: 'sms', message: "Hi {{first_name}}, {{user_name}} here again from {{company_name}}! Reviews mean a lot to us! If you have 45 seconds to leave a sentence or two, we'd be so appreciative. Here is the link: {{link}}. Thank you in advance!" },
      { day_offset: 5, channel: 'email', subject: 'Leave a review for {{company_name}}', message: "Hi {{first_name}}, {{user_name}} here again from {{company_name}}! Reviews mean a lot to us! If you have 45 seconds to leave a sentence or two, we'd be so appreciative. Here is the link: {{link}}. Thank you in advance! {{user_name}}, {{company_name}}" },
    ],
  },
];

function getTemplate(key) {
  return TEMPLATES.find((t) => t.key === key) || null;
}

module.exports = { CATEGORIES, TEMPLATES, getTemplate };
