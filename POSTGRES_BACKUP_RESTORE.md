# PostgreSQL Backup & Disaster Recovery Runbook
**Compliance**: Privacy Act 1988 (Cth) Part IIIA & Privacy (Credit Reporting) Code 2014

---

## 1. Automated Daily Backup Strategy

The CRMS database maintains daily cold and warm backups stored under `/backups/` with a 30-day retention horizon.

### Automated Execution
- **Linux/Container (Cron)**:
  ```bash
  # Run daily at 01:00 UTC
  0 1 * * * /path/to/scripts/backup_postgres.sh >> /var/log/crms_backup.log 2>&1
  ```
- **Windows Task Scheduler (PowerShell)**:
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\scripts\backup_postgres.ps1
  ```
- **Docker Compose Volume**:
  The `db` service mounts the `./backups` volume, enabling host-level persistence outside ephemeral container lifecycles.

---

## 2. Documented Restore Test Procedure

Follow these verified steps to execute a disaster recovery restoration test:

### Step 1: Provision Isolated Staging Database
```bash
# Create an isolated restore verification database
docker exec -it crms-postgres psql -U crms_user -d postgres -c "CREATE DATABASE credit_system_restore_test;"
```

### Step 2: Restore from Backup Archive
- **From uncompressed SQL**:
  ```bash
  docker exec -i crms-postgres psql -U crms_user -d credit_system_restore_test < ./backups/crms_backup_credit_system_20260921_120000.sql
  ```
- **From gzipped archive**:
  ```bash
  gunzip -c ./backups/crms_backup_credit_system_20260921_120000.sql.gz | docker exec -i crms-postgres psql -U crms_user -d credit_system_restore_test
  ```

### Step 3: Verify Integrity & Row Counts
Execute the verification query to compare row counts across tables:
```sql
SELECT 
    'entities' as table_name, count(*) as count FROM entities
UNION ALL
SELECT 'credit_ledger', count(*) FROM credit_ledger
UNION ALL
SELECT 'scores', count(*) FROM scores
UNION ALL
SELECT 'users', count(*) FROM users
UNION ALL
SELECT 'model_versions', count(*) FROM model_versions
UNION ALL
SELECT 'disputes', count(*) FROM disputes;
```

### Step 4: Verify Cryptographic Decryption
Run a test lookup against the restored database using `backend/scripts/verify_encryption.py` to confirm that `identifier` and `basic_info` fields decrypt cleanly with `FIELD_ENCRYPTION_KEY`.

### Step 5: Tear Down Test Database
```bash
docker exec -it crms-postgres psql -U crms_user -d postgres -c "DROP DATABASE credit_system_restore_test;"
```
