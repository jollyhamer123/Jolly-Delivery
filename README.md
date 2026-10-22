# Jolly Delivery

A red-and-blue shopping storefront with photographic product cards, category/search/sort controls, product-detail galleries, a cart, favourites, a demo checkout, signup/login buttons, and smooth transitions.

## Customer accounts, private carts, and private orders (Supabase)

The website now uses Supabase Authentication and PostgreSQL Row Level Security (RLS) for customer accounts and customer data. Supabase Auth remembers a signed-in session in the browser by default. The cart, favourites, and demo order history are stored per Supabase user, rather than in a single shared browser cart. RLS restricts a signed-in customer to their own customer-state row and orders.

**Account features are not live until you connect your own Supabase project.** The downloaded files contain placeholders because each site owner must use their own project credentials.

### 1. Create a Supabase project

1. Create a project at https://supabase.com/.
2. In **Project Settings / API** (or the project's Connect/API panel), copy the **Project URL** and the public **anon/publishable key**.
3. In the Supabase Dashboard, open **SQL Editor** and run all of `supabase-schema.sql`.
4. If Supabase asks you to expose tables through the Data API, make sure the `public` schema is exposed. The SQL file grants only the needed customer-table privileges and enables RLS policies.

### 2. Connect the storefront

Open `supabase-config.js` and replace these placeholders with the Project URL and public anon/publishable key:

```js
window.JOLLY_SUPABASE_CONFIG = {
  url: "https://YOUR_PROJECT_ID.supabase.co",
  anonKey: "YOUR_SUPABASE_PUBLIC_ANON_KEY"
};
```

This is browser-side configuration, so the public key can be visible. **Never put a Supabase `service_role` or secret key in this file or in HTML.** The RLS policies are essential; do not remove them.

### 3. Configure email confirmation and your deployment URL

In Supabase **Authentication → URL Configuration**, set the site URL to the deployed Jolly Delivery URL and add any preview/deployment URLs to the allowed redirect URLs. If email confirmation is enabled, new customers will need to click the confirmation email before logging in. Test on a deployed HTTPS site (such as Netlify); a `file://` preview is not enough for real hosted authentication.

### 4. Deploy the entire site

Keep these files in the site's publish folder:

- `index.html`
- `supabase-config.js`
- `supabase-schema.sql` (setup reference; it does not run automatically)
- `admin-deals.html`
- `netlify.toml`
- `package.json`
- `netlify/functions/`

Deploy the project on Netlify or another HTTPS host. After Supabase is configured, test with two separate accounts: add different items in each cart and confirm each account only sees its own cart and orders.

### What is private?

- **Account:** signup and login are handled by Supabase Auth.
- **Cart and favourites:** each saved customer-state row is bound to one user ID and protected by RLS.
- **Orders:** a customer can select only their own order rows; order creation also checks that the row's user ID matches the signed-in user.
- **Delivery details:** order address/name/email data is stored in the associated private order row, protected by the same RLS policy.
- **Sign out:** signs out of the current session but does not delete the cart or orders stored on that account.

The security policy pattern follows Supabase's official guidance for filtering rows with `auth.uid()` and enabling RLS: https://supabase.com/docs/guides/database/postgres/row-level-security.

## Payments and card details

This is still a **demo checkout**: it saves a demo order to the signed-in account, but does not charge money or arrange shipping. The website and database do **not** ask for or store card numbers, CVVs, or expiry dates. Do not add raw card fields or store card numbers in this database. Before accepting real payments, connect a payment provider's hosted/secure checkout and use the provider's supported saved-payment-method/customer features. The `jolly_orders` table deliberately accepts only `order_kind = 'demo'`.

## Real email setup (Netlify + Brevo)

The newsletter signup can add an opted-in subscriber to a Brevo contact list and send a welcome email saying they are part of the Jolly Delivery community. The separate `admin-deals.html` page can create and send a branded email campaign to the configured list.

### 1. Create a Brevo account and list

1. Create/sign into Brevo at https://www.brevo.com/.
2. Create a contact list for people who explicitly opted in to Jolly Delivery deal emails. Find its numeric list ID.
3. Create a Brevo API key.
4. Verify/authenticate the sender email or domain in Brevo.

### 2. Add environment variables in Netlify

In **Site configuration → Environment variables**, add the following. Keep these private values out of the HTML and repository.

| Variable | Value |
|---|---|
| `BREVO_API_KEY` | Private Brevo API key |
| `BREVO_LIST_ID` | Numeric ID of your opted-in deals list |
| `BREVO_SENDER_EMAIL` | Your verified sender email |
| `BREVO_SENDER_NAME` | `Jolly Delivery` |
| `JOLLY_DEALS_ADMIN_TOKEN` | Long, random secret for the deal admin page |
| `BREVO_REPLY_TO` | Optional reply-to email |

`SITE_URL` is optional; Netlify's `URL` value is used automatically for the welcome email link. Redeploy after changing variables.

### 3. Send email

- The home page newsletter form requires an explicit marketing-email consent checkbox.
- Open `/admin-deals.html` on the deployed site, enter the admin token, preview the deal email, and confirm sending.
- Send marketing campaigns only to people who opted in, and keep unsubscribe options in place.

## Product photography

The storefront uses product and lifestyle photos served from Unsplash, so an internet connection is required. Catalogue names, prices, ratings, and some photos are illustrative and may not match an exact retail SKU.
