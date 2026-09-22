"""Database Inspection and Diagnostic Script.

This utility script connects directly to the local SQLite development database to inspect
table counts and print sample records for individuals, companies, and corporate director links.

Architecture Tier:
    Operational & Diagnostic Scripts (`backend/scripts/`).
"""

import sqlite3
import json

conn = sqlite3.connect('backend/credit_system.db')
c = conn.cursor()

# Query total entity count
count = c.execute("select count(*) from entities").fetchone()[0]
print(f"Total entities: {count}")

# Fetch sample consumer individuals
ind = c.execute("select id, identifier, basic_info from entities where type='INDIVIDUAL' limit 3").fetchall()
print("\n--- SAMPLE INDIVIDUALS ---")
for row in ind:
    print(row[0], row[1], row[2])

# Fetch sample commercial companies
comp = c.execute("select id, identifier, basic_info from entities where type='COMPANY' limit 3").fetchall()
print("\n--- SAMPLE COMPANIES ---")
for row in comp:
    print(row[0], row[1], row[2])

# Fetch sample corporate directorship associations
links = c.execute("select * from director_links limit 3").fetchall()
print("\n--- SAMPLE DIRECTOR LINKS ---")
for row in links:
    print(row)
