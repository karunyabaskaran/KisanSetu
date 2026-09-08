import sqlite3

conn = sqlite3.connect('kisansetu.db')
c = conn.cursor()
tables = [row[0] for row in c.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
print('Tables in database:', tables)

# Delete any test records
c.execute("DELETE FROM orders WHERE buyer_id IN (SELECT id FROM users WHERE mobile IN ('9840123456', '9884123456'))")
c.execute("DELETE FROM support_tickets WHERE raised_by_id IN (SELECT id FROM users WHERE mobile IN ('9840123456', '9884123456'))")
if 'pricing_slabs' in tables:
    c.execute("DELETE FROM pricing_slabs WHERE product_id IN (SELECT id FROM products WHERE farmer_id IN (SELECT id FROM users WHERE mobile IN ('9840123456', '9884123456')))")
c.execute("DELETE FROM products WHERE farmer_id IN (SELECT id FROM users WHERE mobile IN ('9840123456', '9884123456'))")
c.execute("DELETE FROM users WHERE mobile IN ('9840123456', '9884123456')")
conn.commit()

print('Active Users:', c.execute('SELECT COUNT(*) FROM users').fetchone()[0])
print('Active Products:', c.execute('SELECT COUNT(*) FROM products').fetchone()[0])
print('Active Orders:', c.execute('SELECT COUNT(*) FROM orders').fetchone()[0])
print('Active Tickets:', c.execute('SELECT COUNT(*) FROM support_tickets').fetchone()[0])
conn.close()
