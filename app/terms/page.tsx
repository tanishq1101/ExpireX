import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { APP_NAME, CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: `Terms & Conditions — ${APP_NAME}`,
  description: `The terms that govern your use of ${APP_NAME}.`,
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms & Conditions"
      intro={`These Terms & Conditions ("Terms") govern your use of ${APP_NAME}. By creating an account or using the app, you agree to these Terms. If you do not agree, please do not use the service.`}
    >
      <h2>1. The service</h2>
      <p>
        {APP_NAME} helps you track expiry and renewal dates for items such as food, medicine,
        cosmetics, documents, warranties and subscriptions. It lets you add items manually, scan a
        product label with your camera (OCR), or scan a barcode to identify a product, and it sends
        reminder emails before items expire.
      </p>

      <h2>2. Eligibility and account</h2>
      <ul>
        <li>You must be at least 13 years old to use {APP_NAME}.</li>
        <li>You are responsible for the activity under your account and for keeping it secure.</li>
        <li>You must provide accurate information when signing up.</li>
      </ul>

      <h2>3. AI estimates and reminders — important disclaimer</h2>
      <p>
        Barcodes identify a product but <strong>do not contain expiry or manufacture dates</strong>.
        Where a printed date is not read, {APP_NAME} may provide an <strong>AI-generated shelf-life
        estimate</strong>. These estimates, OCR results, and reminders are provided for convenience
        only and may be inaccurate.
      </p>
      <ul>
        <li>
          Always rely on the actual printed expiry/use-by date and your own judgement, especially for
          food and medicine.
        </li>
        <li>
          {APP_NAME} does not provide medical, health, food-safety, or legal advice, and is not a
          substitute for professional advice.
        </li>
        <li>
          Reminder emails depend on third-party delivery and correct data; we cannot guarantee they
          will always be delivered or read on time.
        </li>
      </ul>

      <h2>4. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the service for any unlawful purpose or to store unlawful content.</li>
        <li>Attempt to break, overload, reverse-engineer, or gain unauthorised access to the service.</li>
        <li>Upload content that infringes others&apos; rights or contains malware.</li>
        <li>Abuse the scanning or AI features in a way that disrupts the service for others.</li>
      </ul>

      <h2>5. Your content</h2>
      <p>
        You retain ownership of the data and images you add. You grant us a limited licence to store
        and process that content solely to operate the service for you (for example, to run OCR,
        generate estimates, and send reminders). You are responsible for the legality of the content
        you upload.
      </p>

      <h2>6. Third-party services</h2>
      <p>
        The service uses third parties including Clerk, Supabase, Google Gemini, Open Food Facts,
        Resend and Vercel. Your use of the service is also subject to their terms, and we are not
        responsible for third-party services.
      </p>

      <h2>7. Availability</h2>
      <p>
        The service is provided on an &quot;as is&quot; and &quot;as available&quot; basis. We may
        modify, suspend or discontinue features at any time, and we run on free-tier infrastructure
        that may have limits or downtime.
      </p>

      <h2>8. Disclaimer of warranties</h2>
      <p>
        To the maximum extent permitted by law, we disclaim all warranties, express or implied,
        including fitness for a particular purpose and accuracy of AI/OCR output and reminders.
      </p>

      <h2>9. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, {APP_NAME} and its operators will not be liable for
        any indirect, incidental, or consequential damages, or for any loss arising from spoiled
        goods, missed reminders, expired documents, or reliance on AI estimates.
      </p>

      <h2>10. Termination</h2>
      <p>
        You may stop using the service and delete your data at any time. We may suspend or terminate
        accounts that violate these Terms.
      </p>

      <h2>11. Changes to these Terms</h2>
      <p>
        We may update these Terms; the &quot;Last updated&quot; date above reflects the latest
        version. Continued use after changes means you accept them.
      </p>

      <h2>12. Governing law</h2>
      <p>These Terms are governed by the laws of India, without regard to conflict-of-law rules.</p>

      <h2>13. Contact</h2>
      <p>
        Questions about these Terms? Email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalPage>
  );
}
