# 🔐 Security

This page explains how Personal Result Tracker protects your data, and what you should set up in your own Firebase project.

## What the app does

| Area | Protection |
|------|------------|
| **Your data** | Stored under your own Google account id. Firestore rules allow only that signed-in user to read, write or delete it. |
| **Data shape** | The rules also check every write: only known fields, correct types, number ranges (marks, credit, GPA), grade values and text lengths. Broken or oversized data is rejected by the server. |
| **Share links** | Each link uses a random 20-character id (not guessable). Links can be read one by one but **never listed**. Only the owner can create, update or delete a share. Ongoing courses are never shared. |
| **Expiring links** | When you create a share link you choose how long it lives (default 7 days). The database refuses to serve an expired link. **New link** replaces the id and deletes the old one. |
| **Delete everything** | **Privacy & data → Delete all my data** removes every profile, course and share link from the cloud (you must type DELETE). |
| **PDF libraries** | Loaded from a copy in `vendor/` when you add it (see `vendor/README.md`), so no outside server is needed. Falls back to cdnjs otherwise. |
| **Shared data is untrusted** | A share is built from another person's account, so the app rebuilds every course from known fields, limits text length, and never puts shared text into HTML or attributes unescaped. Grade points always come from the grade, not from the shared numbers. |
| **XSS protection** | All user text is escaped before display. A **Content-Security-Policy** limits scripts to this site, Firebase/Google and the PDF library host. Inline event handlers and `eval` are not used. |
| **Clickjacking** | The page hides itself if another website embeds it in a frame. |
| **Log out** | Logging out also removes the offline copy of your results from that browser (important on shared computers). It asks first if you are offline, because unsynced changes would be lost. |
| **Spreadsheet export** | Cells that start with `=`, `+`, `-` or `@` are neutralised, so an imported course name cannot run a formula in Excel. |
| **Import** | Pasted text is limited in size and parsed with plain pattern matching only. Nothing from it is executed. |
| **Privacy** | No ads, no analytics, no third-party trackers. The referrer is trimmed when you open outside links. |

## What you should set up (your own Firebase project)

1. **Publish the rules** from [`firestore.rules`](firestore.rules) (Firestore → Rules → Publish). Do this every time the file changes.
2. **Authorised domains:** Authentication → Settings → Authorised domains. Keep only `localhost` and your own site (for example `yourname.github.io`). Remove anything you do not use.
3. **Sign-in methods:** enable **only Google**. Disable email/password, anonymous and others.
4. **Restrict the API key:** Google Cloud Console → APIs & Services → Credentials → your *Browser key* → *Application restrictions* → **Websites** → add `https://yourname.github.io/*` and `http://localhost:*`. The Firebase web key is not a secret, but this stops other sites using your quota.
5. **Budget alert:** Google Cloud → Billing → Budgets, set a small alert so unusual usage is noticed.
6. *(Optional)* turn on **Firebase App Check** with reCAPTCHA to block traffic that does not come from your site.
7. **Protect your GitHub account and repo:** turn on two-factor authentication, and enable branch protection on `main` (Settings → Branches), so nobody can change the app code without you.
8. *(Recommended)* download the PDF libraries into `vendor/` (see `vendor/README.md`), then you can remove `https://cdnjs.cloudflare.com` from the Content-Security-Policy.

> ℹ️ `firebase-config.js` contains public identifiers, not passwords. It is safe to keep in a public repository. Never put a service-account key or any private key in this repo.

## Good habits for users

- Use **Logout** on shared or public computers.
- A share link shows your results to anyone who has it. Use **Stop sharing** when you no longer need it, and tick **Hide marks** if you only want to show grades.
- Share links created before this update keep working and never expire. Press **New link** and pick an expiry to replace them.

## Known limits

- The Content-Security-Policy is set with a `<meta>` tag because GitHub Pages cannot send custom HTTP headers. Real headers (for example from Firebase Hosting or Cloudflare) would be stronger, including `frame-ancestors`.
- Until you add the files in `vendor/`, the PDF library is loaded from cdnjs without a Subresource Integrity hash.
- Anyone with a share link can read it. This is by design.

## Reporting a problem

Please open a [GitHub issue](https://github.com/abdurrahmancce/personal-result-tracker/issues) without including personal data. For a sensitive report, contact the author through the profile at [github.com/abdurrahmancce](https://github.com/abdurrahmancce).
