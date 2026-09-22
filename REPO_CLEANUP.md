# Repository History Cleansing Runbook (git-filter-repo)

> [!WARNING]
> **DO NOT EXECUTE AUTOMATICALLY**.  
> This runbook contains exact commands for the repository administrator to purge `credit_system.db`, SQLite database files, and sensitive credentials/tokens from `main` history.

---

## 1. Prerequisites & Safety Preparation

### Step 1.1: Install `git-filter-repo`
`git-filter-repo` requires Python 3.8+ and Git 2.24+.
```bash
pip install git-filter-repo
```
Verify the installation:
```bash
git filter-repo --version
```

### Step 1.2: Create a Fresh Standalone Mirror Backup
Before rewriting history, create a full bare mirror backup in a separate directory outside your working tree:
```bash
# Clone a bare mirror to a backup directory
git clone --mirror "https://github.com/sauraz555/credit-sysyem.git" ../credit_system_mirror_backup.git
```

---

## 2. Exact History Cleansing Commands

### Step 2.1: Clone a Fresh Working Copy
`git-filter-repo` refuses to run on a repo that is not a fresh clone unless `--force` is used. A dedicated clone ensures no uncommitted working files are lost:
```bash
git clone "https://github.com/sauraz555/credit-sysyem.git" ../credit_system_cleanup
cd ../credit_system_cleanup
```

### Step 2.2: Purge SQLite Database Artifacts from History
Remove `credit_system.db`, `backend/credit_system.db`, and all `*.db` / `*.sqlite` files across every commit and tag in repository history:
```bash
git filter-repo --invert-paths \
  --path credit_system.db \
  --path backend/credit_system.db \
  --path-glob "*.db" \
  --path-glob "*.sqlite" \
  --path-glob "*.sqlite3"
```

### Step 2.3: Purge Secret Files and Plaintext Credentials
Create a replacement expressions file `expressions.txt` for any residual static secrets that may have been committed in previous revisions:
```bash
cat << 'EOF' > expressions.txt
# Replace static JWT secrets with randomized placeholders
regex:bureau-super-secret-production-jwt-key-2026-auth==>CLEANED_HISTORICAL_SECRET
regex:bureau-super-aes256-master-encryption-key-32b==>CLEANED_HISTORICAL_ENCRYPTION_KEY
regex:bureau-super-hmac-blind-index-key-2026-sha256==>CLEANED_HISTORICAL_HMAC_KEY
# Replace old default passwords with placeholders
regex:AdminPass2026!Sec==>REDACTED_HISTORICAL_PASSWORD
EOF
```

Run content filtering across all commits:
```bash
git filter-repo --replace-text expressions.txt
rm expressions.txt
```

### Step 2.4: Clean Specific Secret Files if Committed Previously
Ensure sensitive files such as `.env`, `TEST_ACCOUNTS.md`, and credential caches are expunged from history:
```bash
git filter-repo --invert-paths \
  --path .env \
  --path TEST_ACCOUNTS.md \
  --path backend/.env \
  --path-glob "*.key" \
  --path-glob "*.pem"
```

---

## 3. Post-Purge Verification

### Step 3.1: Verify That Database Files Are Completely Gone
```bash
# Should return zero output
git log --all --full-history -- "**/credit_system.db"
git log --all --full-history -- "*.db"
```

### Step 3.2: Verify Git Repository Object Size
```bash
git count-objects -vH
```

---

## 4. Re-adding Remote and Pushing (Admin Only)
Because `git filter-repo` intentionally strips remotes to prevent accidental pushes:
```bash
# Re-add remote
git remote add origin https://github.com/sauraz555/credit-sysyem.git

# Verify branch state
git status

# When fully verified and approved, force push updated branches and tags to GitHub:
# git push origin --force --all
# git push origin --force --tags
```
