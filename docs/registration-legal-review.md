# MSS registration legal review

**REVIEW NEEDED BEFORE PUBLIC LAUNCH — non-lawyer draft, not legal advice or a legal-compliance guarantee.**

Draft date and both acceptance versions: `2026-10-03`.
Public contact: **support@midnightsoundsyndicate.com**.

## Scope and status

This deliverable is proposed publishable Terms and Privacy Notice text for the authorized registration rollout, not a certification that the rollout is implemented or deployed. The original legal drafting scope was `mss-web/src/content/registrationLegal.js` and this review note; the frontend reconciliation below records the later email-first implementation, not deployment approval. The content module exports `TERMS_VERSION`, `PRIVACY_VERSION`, `LEGAL_CONTACT`, `termsSections` and `privacySections`; each section has a title and string paragraphs, with no JSX.

Owner-supplied requirements: public registration creates role `user`; email verification, Terms assent and an 18+ confirmation are required; no date of birth is collected. A single optional, unchecked choice covers live-stream and upcoming-event email alerts. Only consent is stored now; alert delivery is future work. The preference can be changed through the account. Changed email addresses require confirmation. Transactional delivery is intended to use Resend. The sender domain is still being configured. The corrected public support address above is owner-supplied, not verified as deliverable by this task.

The draft describes the intended release and must not be treated as deployment approval. The initial inspection saw a disabled registration stub and missing account controls; those observations are historical, not a description of the final frontend.

### Email-first frontend reconciliation

The registration entry page collects only username and email, then asks the user to follow the email link to finish securely. The verification page removes the fragment before rendering and makes a read-only token-info POST. For registration it presents an editable suggested username, a new password, separate required 18+ and Terms/Privacy acknowledgments (versions `2026-10-03`), and one optional unchecked alert choice. The user must explicitly submit fresh choices to complete registration; the browser does not auto-verify or auto-login. Legal documents open in another tab so reading them does not discard the in-memory token.

Email-change confirmation requires a signed-in account and its current password. A 401 instructs the user to sign in in a separate tab and retry without losing the in-memory token. Invalid/expired link recovery distinguishes signup resend from requesting a new email-change link while authenticated in Account Settings. Account Settings contains email and preference controls. The privacy wording describes only the preference and its most recent update time, not a historical consent ledger.

Focused frontend regressions and isolated browser fixtures cover these contracts, StrictMode stale-response protection, legal rendering and authenticated email-change recovery. They do not establish backend persistence, deployed behavior, mail delivery, operator identity or legal compliance. Backend security/DB acceptance and all operational gates below require separate verification. This frontend task made no live API/email mutations, database changes, service restarts or runtime configuration changes.

## Source-grounded implementation observations

These observations come from local code inspection, not the legal sources below:

- `mss-api/db.js` implements scrypt hashing for new passwords and a legacy verification path. The public wording says passwords are hashed, not that every historical record uses one algorithm.
- `mss-web/src/Data.Helper.Api.js` stores the token, username, account ID, role and artist ID in `localStorage`; its session-clearing function removes those fields. The notice does not describe these as session cookies or promise browser-close deletion.
- `mss-api/index.js` uses `req.ip` in login/comment rate limiting, serves uploaded files and public artist/event/comment information, and applies permissions to upload operations. Public content does not imply every ordinary user can upload or edit every page.
- Email verification hashes, acceptance/age timestamps and version records, preference updates, and confirmed email changes are requirements of the proposed registration work. The frontend sends fresh completion choices and supports account controls; verify hashing, persistence and enforcement against final backend code and isolated tests before publishing the notice.
- Hosting logs, retention schedules, backups, provider regions, contracts, analytics and all deployed third-party behavior were not audited. No assertion of universal encryption, compliance certification, an automatic erasure workflow, or blanket “no sale/no sharing” status is made.

## Operator identity and liability: launch review

**Owner/counsel decision required:** MSS is a website/community name; incorporation and operator identity have not been confirmed. The draft uses “the person or persons operating” the site and does not invent a corporation, legal address, registered agent, jurisdiction or forum. Confirm who the actual contracting operator and responsible data handler are, what identifying details must be disclosed for the target audience, and whether this description is adequate before launch. Assess personal operator exposure, insurance and organizational arrangements with counsel; this draft does not provide a liability shield.

**Drafting choice:** the liability provision limits ordinary responsibility to caused, reasonably foreseeable loss and addresses business loss; it does not impose an arbitrary zero-dollar or fixed-dollar cap. It expressly preserves death/personal-injury claims, fraud, deliberate misconduct, gross negligence and nonwaivable rights. Counsel must assess the complete clause under the laws actually applicable to the operator and users, rather than assuming the savings language makes every exclusion enforceable. The UK CMA guidance is a jurisdiction-specific illustration, not a determination that UK law governs MSS: it warns against broad disclaimers and says not to exclude responsibility for death or injury.[3]

The UK guidance also says customers should have a real opportunity to read and understand the contract before being bound.[3] **Implementation recommendation:** expose readable Terms and Privacy links before submission, keep affirmative Terms assent separate from optional promotional consent, provide a copy/version users can retain, and store server-side evidence of the exact accepted version. Do not rely on browsing alone as assent. Preserve evidence of superseded versions rather than rewriting an accepted version in place.

**Review checklist:** assess consumer remedies and local mandatory rights; fair and proportionate moderation, notice and review; contract changes and renewed assent; copyright/music licensing and any applicable notice/takedown requirements; uploaded likeness/privacy permissions; and treatment of under-18 reports. These are review topics, not a claim that a particular safe harbor or regulatory regime applies. No mandatory arbitration, class-action waiver, indemnity, exclusive venue, choice of law or statutory safe-harbor qualification is asserted. The photosensitivity advisory is information, not a release of legal rights, and does not replace safe player design or content warnings.

## Privacy accuracy and operational readiness

The FTC says express and implied privacy promises must be honored, and that appropriate security obligations exist even without specific promises.[2] **Release gate:** confirm every public statement against deployed behavior and actual provider arrangements; do not publish claims just because the implementation is planned.

**Owner/counsel review required:** identify the operator and relevant jurisdictions; inventory data, recipients, provider regions and international transfers; determine applicable disclosure, lawful-basis, cookie/embed-consent, sale/sharing, opt-out, consumer-rights and breach-response requirements. This notice is not a jurisdiction-specific GDPR/CCPA assessment. Add any required disclosures only from verified facts and applicable legal advice. Absence of a “we sell data” statement is not a conclusion that statutory sale/sharing definitions are inapplicable to embeds.

**Operational checklist:**

- Confirm that new-account verification is mandatory, new users cannot self-assign privileged roles, passwords and persisted verification tokens are hashed, verification links expire and are single-use, and secrets do not enter routine logs. Token expiry is not a promise of record erasure.
- Confirm age, Terms/Privacy version and acceptance timestamps are server-recorded; distinguish Privacy acknowledgment from promotional consent. Verify storage of the default false preference and its most recent update time; do not imply a full preference-change history. Do not collect birth dates just to support this draft.
- Verify Account Settings supports preference changes and confirmation of a new email before adoption. Check that pending/unverified addresses cannot receive future marketing simply because an account checkbox was selected.
- Validate session removal on sign-out, essential localStorage disclosures, actual proxy/IP handling, permissions on private account fields, and all third-party embeds. Determine whether additional consent controls are needed before embeds load; none are promised as an existing feature here.
- Establish a documented retention and backup policy, proportionate identity checks, a request-handling procedure and deadlines appropriate to applicable law. The notice deliberately does not invent automatic deletion periods. Account closure, public-content removal and backups need separate handling. Confirm staff can fulfill the described manual requests.
- Test that **support@midnightsoundsyndicate.com** actually receives and can respond to messages before launch. A DNS/domain setup in progress is not a working support channel. Do not silently replace this with a guessed address.
- Arrange an operational process for moderation reviews, underage reports, security incidents and notices of material changes. The text commits to reasonable notice and renewed agreement when needed; it does not claim a re-assent mechanism has already been built.

## Email: do not launch alerts with consent storage alone

The FTC CAN-SPAM guide requires accurate sender/routing information and subject lines, appropriate advertisement identification, a valid physical postal address, and a clear way to opt out of commercial email.[1] It says an opt-out mechanism must work for at least 30 days after sending, and opt-outs must be honored within 10 business days without a fee or requirements beyond an email address and a reply email or single web page.[1] Hiring an email provider does not remove the sender’s compliance responsibility.[1]

**Future-alert release gates:** select and confirm a lawful physical postal address (none was supplied; do not invent one), sender identity and ad disclosure; implement and test working unsubscribe and suppression handling before enabling campaigns. Account Settings alone must not be assumed to satisfy email unsubscribe requirements. Honor the current preference at send time, including subsequent withdrawals, and avoid stale exports or resends to suppressed recipients. Retain proportionate consent and withdrawal evidence. Assess any additional audience-specific rules with counsel; the FTC guide is not worldwide clearance.

The FTC treats transactional/relationship categories narrowly; a membership or account relationship alone does not make every message transactional.[1] **Design requirement:** keep verification/account-security email separate from live-stream/event promotion, without inserting promotional content into verification messages. The present feature stores consent only; do not imply scheduled campaigns or functioning unsubscribe links already exist. Before future alerts are activated, update the notice to reflect the real delivery arrangement and functionality.

**Transactional launch blocker:** Resend sender-domain verification is pending. Configure and verify the authorized sender, delivery and support/reply routing, then run separately authorized delivery tests. This task did not configure DNS, verify a Resend domain or send any email. Consent and legal text do not solve mail deliverability.

## Integration acceptance checklist

- [ ] Counsel/owner resolves operator identity, audience/jurisdiction, liability wording and outstanding privacy disclosures.
- [ ] Support mailbox is working; sender domain and transactional delivery are verified.
- [ ] Frontend renders both documents accessibly and shows version `2026-10-03`.
- [ ] Backend acceptance versions exactly match both exports; mismatched or absent required assent is rejected.
- [ ] Required 18+ confirmation and Terms assent are separate from the single optional unchecked alert choice; notice acknowledgment is not blanket marketing consent.
- [ ] Successful registration has role `user` and cannot sign in before required verification.
- [ ] New-email confirmation and Account Settings preference changes work; no promotional alerts are sent by this release.
- [ ] Final source/runtime behavior matches all privacy representations; manual request, moderation and change-notice processes exist.
- [ ] Future email-alert work separately passes the email gates above before any campaign.

## Research provenance and limits

Primary sources were retrieved on 2026-10-03. The configured extraction tool could not extract URLs; the browser was blocked by FTC but read the CMA page. A direct HTTPS retrieval then obtained the FTC page bodies, not search snippets. Evidence quotes were checked against those fetched bodies using the grounded-citations ledger. The citations below support only the attributed guidance, not an opinion that MSS is compliant or that any clause is enforceable. The review checklist and implementation observations are expressly distinguished from source-derived legal statements.

## Sources

[1] https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
    > "Your message must include your valid physical postal address."
    > "You must honor a recipient’s opt-out request within 10 business days."
    > "Any opt-out mechanism you offer must be able to process opt-out requests for at least 30 days after you send your message."
    > "The subject line must accurately reflect the content of the message."
    > "Keep in mind that the law views these categories narrowly."
    > "The law makes clear that even if you hire another company to handle your email marketing, you can’t contract away your legal responsibility to comply with the law."
    > "Your “From,” “To,” “Reply-To,” and routing information – including the originating domain name and email address – must be accurate and identify the person or business who initiated the message."
    > "The law gives you a lot of leeway in how to do this, but you must disclose clearly and conspicuously that your message is an advertisement."
    > "Your message must include a clear and conspicuous explanation of how the recipient can opt out of getting marketing email from you in the future."
    > "You can’t charge a fee, require the recipient to give you any personally identifying information beyond an email address, or make the recipient take any step other than sending a reply email or visiting a single page on an Internet website as a condition for honoring an opt-out request."
    > "That means you shouldn’t assume that any message you send to recipients who have an ongoing commercial relationship with you – including subscribers or recipients who participate in a membership program – are transactional or relationship messages."
[2] https://www.ftc.gov/business-guidance/privacy-security
    > "If your company makes privacy promises – either expressly or by implication – the FTC Act requires you to live up to those claims."
    > "In addition, even if you don’t make specific claims, you still have an obligation to maintain security that's appropriate in light of the nature of the data you possess."
[3] https://www.gov.uk/guidance/writing-a-fair-contract-for-customers
    > "Never use wording that excludes or limits your responsibility for the death or injury of any customer."
    > "Customers should always have a real opportunity to read (or hear, if the contract is made over the phone) and understand a contract before being bound to it."
    > "It is unlikely to be fair to use disclaimers that are too broad (including unintentionally so) or unexplained legal jargon about their extent (such as ‘liability is excluded so far as the law permits’). Avoiding liability by forcing customers to say you have met their expectations or refusing to accept responsibility for anything done by your agents or subcontractors is also unlikely to be fair."
