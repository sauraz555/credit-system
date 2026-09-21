import sqlite3
import json

conn = sqlite3.connect('backend/credit_system.db')
c = conn.cursor()

count = c.execute("select count(*) from entities").fetchone()[0]
print(f"Total entities: {count}")

ind = c.execute("select id, identifier, basic_info from entities where type='INDIVIDUAL' limit 3").fetchall()
print("\n--- SAMPLE INDIVIDUALS ---")
for row in ind:
    print(row[0], row[1], row[2])

comp = c.execute("select id, identifier, basic_info from entities where type='COMPANY' limit 3").fetchall()
print("\n--- SAMPLE COMPANIES ---")
for row in comp:
    print(row[0], row[1], row[2])

links = c.execute("select * from director_links limit 3").fetchall()
print("\n--- SAMPLE DIRECTOR LINKS ---")
for row in links:
    print(row)
