# SVADHINA Open Papers

The GitHub Pages call for papers is at https://svadhina-alt.github.io/svadhina/open-papers/. Email intake works independently of the review portal. The portal runs as a Cloudflare Worker, authenticates authors through GitHub, and stores files and review records in a private R2 bucket. Manuscripts submitted by email must be handled by the editorial desk separately.

## Connect the independent portal

Use Node 22.13 or later. In the Cloudflare account intended to own SVADHINA, enable R2, review the account's pricing and usage limits, and keep the bucket private. Use a workers.dev subdomain or an institutional domain with HTTPS.

1. From the repository run `cd editorial`, `npm ci`, `npx wrangler login`, and `npx wrangler r2 bucket create svadhina-manuscripts`. Run `npm run deploy` to obtain the portal origin.
2. Register a GitHub OAuth app under the institutional account. Set the homepage to the portal origin and the authorization callback to `https://YOUR-PORTAL-HOST/auth/callback`. This app only reads the user's basic GitHub identity.
3. In the editorial directory run `npx wrangler secret put GITHUB_CLIENT_ID` and `npx wrangler secret put GITHUB_CLIENT_SECRET`. Enter the values at the prompts. The designated editor is GitHub account **svadhina-alt** (numeric ID 268329256). To change the editor, change EDITOR_GITHUB_ID in wrangler.jsonc and redeploy.
4. Open the portal, sign in as an author, submit a sample PDF, and confirm the receipt. Sign in as the editor in a separate browser profile. Verify screening, revision, author approval and release using sample material appropriate for publication.
5. After the live test, set `portal` in the repository's `open-papers/portal.js` to the HTTPS portal URL ending in `/open-papers/`. Commit it to main. The GitHub Pages call will then show the portal link alongside email.
6. To deploy subsequent edits automatically, connect this repository in Cloudflare Workers Builds, choose main, set the root directory to editorial, and use `npm run deploy` as the deploy command.

The names of the legacy service's authors cannot establish ownership in the GitHub identity system. This installation starts with its own records. Any transfer of existing private manuscripts requires an export, an authorized identity mapping, and private import. Never commit private records or manuscript PDFs to this repository. For storage hygiene, configure R2 lifecycle expiration for the login/ prefix after one day and sessions/ after two days. Protect the manuscript, revision and workflow prefixes from expiration.
