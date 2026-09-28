# Put Smart Retail online

The supplied `render.yaml` prepares a durable Render deployment with a Docker web service, PostgreSQL database, HTTPS, and a persistent backup disk. It selects paid resources. Review the charges in Render before creating them. The public URL is assigned by Render only after deployment.

1. Put the source files in a GitHub repository. Exclude `.env`, `data`, `backups`, `LOCAL-ACCESS.txt`, and all JSON shop backups. The source archive already excludes these.
2. In a Render account, create a Blueprint from that repository's `render.yaml`. Enter `ADMIN_EMAIL` and a strong, unique `ADMIN_PASSWORD` in Render's private prompts. Render generates `JWT_SECRET` and connects the app to its database.
3. Wait for `/api/health` on the new `https://...onrender.com` URL to return OK. Sign in with the bootstrap credentials. The server automatically uses Render's HTTPS URL for request-origin checks. If you later attach a custom domain, set `APP_ORIGIN` to that exact HTTPS origin.
4. To carry over the current local shop data, download a fresh backup from the local application's Settings page and restore it in the hosted Settings page. This replaces the new empty database and signs everyone out. Sign in with the administrator credentials from the restored local database. Check product counts, stock, a sample invoice, and the Reports totals before using the hosted site for new sales.
5. Keep a separate encrypted copy of the backup. Do not upload a shop backup to GitHub or share it as a public link. After the restore, change administrator and cashier passwords and verify the hosted backup status.

The local `127.0.0.1` URL remains separate from the hosted database. Do not enter new transactions in both places after migration. A free Render PostgreSQL database currently expires after 30 days and is not suitable for durable shop data; the supplied Blueprint uses paid resources. See [Render's free database limits](https://render.com/docs/free) and [Blueprint specification](https://render.com/docs/blueprint-spec).
