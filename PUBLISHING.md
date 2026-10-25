# Putting the site online (GitHub Pages, free)

This gives you a web address like `https://your-name.github.io/beef-prices/` that you can open on any phone or laptop and send to others. You only set it up once. It takes about 20 minutes.

## Before you start: who can see it

- A free GitHub Pages site is **public**. Anyone who has the link can open it, and the files behind it (including the price CSV files) can be seen on GitHub.
- The pages are marked "don't list in search engines", so people are unlikely to find it by searching. That isn't a guarantee.
- AHDB's terms say its prices are for internal business use only. Only share the link with people you mean to.

## Part 1: create a GitHub account (5 minutes)

1. Go to **github.com** and click **Sign up**.
2. Enter your email, a password and a **username**. The username becomes part of your web address, so pick something sensible, e.g. `yeofarm`.
3. Confirm your email when GitHub sends you a code. Choose the **Free** plan.

## Part 2: install GitHub Desktop (5 minutes)

GitHub Desktop is a free app that copies this folder up to GitHub with a couple of clicks, so you never need to type commands.

1. Go to **desktop.github.com** and click **Download for macOS**.
2. Open the downloaded file and drag **GitHub Desktop** into Applications. Open it.
3. Click **Sign in to GitHub.com** and sign in with the account from Part 1. Click **Authorize** when the browser asks.
4. When it asks for your name and email, keep what it suggests and click **Finish**.

## Part 3: put this folder on GitHub (5 minutes)

The folder has already been prepared for GitHub, with a first snapshot saved (25 October 2026).

1. In GitHub Desktop, choose **File → Add Local Repository…** (or "Add an Existing Repository from your Local Drive").
2. Click **Choose…** next to "Local path". In the window that opens, click your home folder (**benyeo**) in the left-hand list, click **Beef model** once, then click **Open**. The box should now read `/Users/benyeo/Beef model`.
3. Click **Add Repository**.
4. Click **Publish repository** (top right).
   - **Name:** change it to `beef-prices` (no spaces; this becomes the end of your web address)
   - **Untick** "Keep this code private". Free GitHub Pages only works for public repositories.
   - Click **Publish Repository**.

## Part 4: switch on the website (3 minutes)

1. Go to **github.com**, sign in, and open your **beef-prices** repository. GitHub Desktop has a menu item for this: **Repository → View on GitHub**.
2. Click **Settings** (top row, the cog), then **Pages** in the left-hand menu.
3. Under **Build and deployment**:
   - **Source:** Deploy from a branch
   - **Branch:** `main`, folder `/ (root)`, then click **Save**.
4. Wait 1–2 minutes and refresh the page. A box appears saying **"Your site is live at https://your-name.github.io/beef-prices/"**.
5. Open that link on your phone to check it. That's the link to send to the farmer.

## Every week after updating the prices

The website only changes when you send the updated files up to GitHub:

1. In Claude Code, say **"update the prices"** (see UPDATING.md). Claude updates the files, saves a snapshot (called a "commit"), and tells you it's ready to publish.
2. Open **GitHub Desktop** and click **Push origin** (top right).
3. Within a couple of minutes, the online site shows the new prices.

If Claude didn't save a snapshot, GitHub Desktop shows the changed files on the left. Type a short note like "Weekly prices" in the **Summary** box (bottom left), click **Commit to main**, then **Push origin**.

## If something goes wrong

- **"404 – There isn't a GitHub Pages site here":** wait a few more minutes, and check Part 4 was saved with branch `main` and `/ (root)`.
- **The site shows old prices:** check you clicked **Push origin**. On your phone, refresh the page, or close and reopen it.
- **Ask Claude:** "the online site isn't updating, can you help?"
