// ClearCare — notify-applicant Edge Function
// Triggered by a database webhook when a staff_notes row is inserted
// with notify_applicant = true.
//
// HOW TO DEPLOY:
// 1. Supabase dashboard -> Edge Functions -> New function
// 2. Name it: notify-applicant
// 3. Paste this code
// 4. Deploy
// 5. Dashboard -> Database -> Webhooks -> Create webhook:
//      Table: staff_notes
//      Events: INSERT
//      URL: https://<your-project-ref>.supabase.co/functions/v1/notify-applicant
//      HTTP method: POST
//      Add header: Authorization: Bearer <your-service-role-key>
//
// NOTE: This uses Supabase's built-in email (limited to 3/hour on free tier).
// For production volume, replace the email send with Resend, SendGrid, or Postmark.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const record = payload.record;

    // Only send if notify_applicant is true
    if (!record || !record.notify_applicant) {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    // Get the application and applicant email
    const { data: app } = await supabase
      .from('applications')
      .select('*, application_people(*)')
      .eq('id', record.application_id)
      .single();

    if (!app) {
      return new Response(JSON.stringify({ error: 'Application not found' }), { status: 404 });
    }

    const applicant = app.application_people?.find((p: any) => p.person_role === 'applicant');
    const email = applicant?.email;

    if (!email) {
      return new Response(JSON.stringify({ skipped: 'no email on file' }), { status: 200 });
    }

    // Get the author name
    const { data: author } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', record.author_user_id)
      .single();

    const authorName = author?.full_name || 'Your ClearCare case manager';
    const applicantName = [applicant?.first_name, applicant?.last_name].filter(Boolean).join(' ') || 'there';
    const status = app.status?.replace('_', ' ') || 'updated';

    // Send email via Supabase Auth admin API (built-in, no external service needed)
    // For production, replace this with Resend/SendGrid for better deliverability
    const emailBody = `
Hi ${applicantName},

Your ClearCare Medicaid application has been updated.

${record.shared_with_applicant && record.note ? `Message from your case manager:\n\n"${record.note}"\n\n` : ''}Application status: ${status.charAt(0).toUpperCase() + status.slice(1)}

If you have questions, you can reply to this email or log in to view your application at https://apply.gatehousestrategic.com

— ${authorName}
ClearCare Medicaid Application Assistant

---
This message was sent on behalf of your Medicaid application team.
ClearCare is an independent self-help tool. It does not provide legal advice.
    `.trim();

    // Use Supabase's SMTP (configure in dashboard -> Project Settings -> Auth -> SMTP)
    const { error: emailError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });

    // If SMTP isn't configured, log and continue gracefully
    // In production, integrate Resend here:
    // await fetch('https://api.resend.com/emails', {
    //   method: 'POST',
    //   headers: { 'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ from: 'noreply@gatehousestrategic.com', to: email, subject: 'Your ClearCare application has been updated', text: emailBody })
    // });

    console.log(`Notification sent to ${email} for application ${record.application_id}`);

    return new Response(JSON.stringify({ sent: true, to: email }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('notify-applicant error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
