CREATE TABLE IF NOT EXISTS users (
 id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('admin','cashier')), active BOOLEAN NOT NULL DEFAULT TRUE,
 phone TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', session_version INTEGER NOT NULL DEFAULT 1,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS categories (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS brands (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS suppliers (
 id SERIAL PRIMARY KEY, name TEXT NOT NULL, company TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
 address TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS customers (
 id SERIAL PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '',
 email TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS products (
 id SERIAL PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE, barcode TEXT NOT NULL UNIQUE,
 category_id INTEGER REFERENCES categories(id), brand_id INTEGER REFERENCES brands(id), supplier_id INTEGER REFERENCES suppliers(id),
 purchase_price INTEGER NOT NULL CHECK(purchase_price>=0), selling_price INTEGER NOT NULL CHECK(selling_price>=0),
 discount INTEGER NOT NULL DEFAULT 0 CHECK(discount BETWEEN 0 AND 10000), tax INTEGER NOT NULL DEFAULT 0 CHECK(tax BETWEEN 0 AND 10000),
 quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity>=0), min_stock INTEGER NOT NULL DEFAULT 5 CHECK(min_stock>=0),
 image TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', unit TEXT NOT NULL DEFAULT 'piece',
 active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sales (
 id SERIAL PRIMARY KEY, invoice_number TEXT UNIQUE NOT NULL, request_id UUID UNIQUE NOT NULL,
 customer_id INTEGER REFERENCES customers(id), cashier_id INTEGER NOT NULL REFERENCES users(id),
 subtotal INTEGER NOT NULL CHECK(subtotal>=0), discount INTEGER NOT NULL CHECK(discount>=0),
 tax INTEGER NOT NULL CHECK(tax>=0), total INTEGER NOT NULL CHECK(total>=0), cost INTEGER NOT NULL CHECK(cost>=0),
 paid INTEGER NOT NULL CHECK(paid>=0), tendered INTEGER NOT NULL CHECK(tendered>=0),
 method TEXT NOT NULL CHECK(method IN ('cash','card','credit')), shop_snapshot JSONB NOT NULL,
 customer_snapshot JSONB, cashier_name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sale_items (
 id SERIAL PRIMARY KEY, sale_id INTEGER NOT NULL REFERENCES sales(id), product_id INTEGER NOT NULL REFERENCES products(id),
 name TEXT NOT NULL, code TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity>0),
 price INTEGER NOT NULL CHECK(price>=0), cost INTEGER NOT NULL CHECK(cost>=0), discount INTEGER NOT NULL CHECK(discount>=0),
 tax INTEGER NOT NULL CHECK(tax>=0), total INTEGER NOT NULL CHECK(total>=0)
);
CREATE TABLE IF NOT EXISTS purchases (
 id SERIAL PRIMARY KEY, supplier_id INTEGER NOT NULL REFERENCES suppliers(id), reference TEXT NOT NULL,
 total INTEGER NOT NULL CHECK(total>=0), paid INTEGER NOT NULL CHECK(paid>=0 AND paid<=total),
 created_by INTEGER NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS purchase_items (
 id SERIAL PRIMARY KEY, purchase_id INTEGER NOT NULL REFERENCES purchases(id), product_id INTEGER NOT NULL REFERENCES products(id),
 quantity INTEGER NOT NULL CHECK(quantity>0), cost INTEGER NOT NULL CHECK(cost>=0)
);
CREATE TABLE IF NOT EXISTS payments (
 id SERIAL PRIMARY KEY, sale_id INTEGER REFERENCES sales(id), purchase_id INTEGER REFERENCES purchases(id),
 amount INTEGER NOT NULL CHECK(amount>0), method TEXT NOT NULL CHECK(method IN ('cash','card','bank')),
 reference TEXT NOT NULL DEFAULT '', created_by INTEGER NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK((sale_id IS NOT NULL)::integer + (purchase_id IS NOT NULL)::integer = 1)
);
CREATE TABLE IF NOT EXISTS expenses (
 id SERIAL PRIMARY KEY, category TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', amount INTEGER NOT NULL CHECK(amount>0),
 date DATE NOT NULL, created_by INTEGER NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS stock_history (
 id SERIAL PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id), delta INTEGER NOT NULL,
 balance INTEGER NOT NULL CHECK(balance>=0), reason TEXT NOT NULL, reference TEXT NOT NULL DEFAULT '',
 created_by INTEGER NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), value JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS audit_logs (
 id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id), action TEXT NOT NULL, entity TEXT NOT NULL,
 entity_id TEXT NOT NULL DEFAULT '', detail JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sales_date_idx ON sales(created_at);
CREATE INDEX IF NOT EXISTS sales_customer_idx ON sales(customer_id);
CREATE INDEX IF NOT EXISTS stock_product_idx ON stock_history(product_id,created_at);
CREATE INDEX IF NOT EXISTS sale_items_product_idx ON sale_items(product_id);
CREATE INDEX IF NOT EXISTS expenses_date_idx ON expenses(date);

ALTER TABLE customers ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS removal_reason TEXT;

CREATE TABLE IF NOT EXISTS sale_corrections (
 id SERIAL PRIMARY KEY, sale_id INTEGER NOT NULL REFERENCES sales(id), item_id INTEGER NOT NULL UNIQUE REFERENCES sale_items(id),
 reason TEXT NOT NULL, created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 amount INTEGER NOT NULL, tax INTEGER NOT NULL, cost INTEGER NOT NULL, quantity INTEGER NOT NULL, restock BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS sale_refunds (
 id SERIAL PRIMARY KEY, sale_id INTEGER NOT NULL REFERENCES sales(id), request_id UUID NOT NULL UNIQUE,
 amount INTEGER NOT NULL CHECK(amount>0), method TEXT NOT NULL CHECK(method IN ('cash','card','bank')),
 reason TEXT NOT NULL, reference TEXT NOT NULL DEFAULT '', created_by INTEGER NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO sale_corrections(sale_id,item_id,reason,created_by,created_at,amount,tax,cost,quantity)
 SELECT i.sale_id,i.id,COALESCE(i.removal_reason,'Legacy correction'),(SELECT a.user_id FROM audit_logs a WHERE a.entity='sale' AND a.entity_id=i.sale_id::text AND a.action='remove_item' AND (a.detail->'item'->>'id')=i.id::text ORDER BY a.id LIMIT 1),i.removed_at,i.total,i.tax,i.cost*i.quantity,i.quantity FROM sale_items i WHERE i.removed_at IS NOT NULL ON CONFLICT(item_id) DO NOTHING;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS deletion_reason TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS deleted_by INTEGER REFERENCES users(id);
CREATE OR REPLACE VIEW sales_state AS
 SELECT s.id,s.invoice_number,s.request_id,s.customer_id,s.cashier_id,s.subtotal,s.discount,s.tax,s.total,s.cost,s.paid,s.tendered,s.method,s.shop_snapshot,s.customer_snapshot,s.cashier_name,s.created_at,COALESCE(r.refunded,0)::bigint refunded,GREATEST(s.paid-COALESCE(r.refunded,0)-s.total,0)::bigint refund_due,
 GREATEST(s.total-s.paid+COALESCE(r.refunded,0),0)::bigint outstanding,
 CASE WHEN NOT EXISTS(SELECT 1 FROM sale_items i WHERE i.sale_id=s.id AND i.removed_at IS NULL) THEN 'Voided' ELSE 'Completed' END transaction_status,
 CASE WHEN s.paid-COALESCE(r.refunded,0)>s.total THEN 'Refund Pending'
 WHEN COALESCE(r.refunded,0)>0 AND NOT EXISTS(SELECT 1 FROM sale_items i WHERE i.sale_id=s.id AND i.removed_at IS NULL) THEN 'Refunded'
 WHEN COALESCE(r.refunded,0)>0 THEN 'Partially Refunded'
 WHEN NOT EXISTS(SELECT 1 FROM sale_items i WHERE i.sale_id=s.id AND i.removed_at IS NULL) THEN 'Voided' ELSE 'Completed' END status,s.deleted_at,s.deletion_reason,s.deleted_by
 FROM sales s LEFT JOIN (SELECT sale_id,SUM(amount) refunded FROM sale_refunds GROUP BY sale_id) r ON r.sale_id=s.id;
ALTER TABLE products ADD COLUMN IF NOT EXISTS tax_mode TEXT;
UPDATE products SET tax_mode=CASE WHEN tax=0 THEN 'shop' ELSE 'custom' END WHERE tax_mode IS NULL;
ALTER TABLE products ALTER COLUMN tax_mode SET DEFAULT 'shop';
ALTER TABLE products ALTER COLUMN tax_mode SET NOT NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt TEXT NOT NULL DEFAULT '';
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS request_id UUID UNIQUE;
CREATE TABLE IF NOT EXISTS expense_categories(id SERIAL PRIMARY KEY,name TEXT NOT NULL UNIQUE);
INSERT INTO expense_categories(name) SELECT DISTINCT category FROM expenses ON CONFLICT(name) DO NOTHING;
INSERT INTO expense_categories(name) VALUES('Rent'),('Electricity'),('Transport'),('Salary'),('Other') ON CONFLICT(name) DO NOTHING;
CREATE TABLE IF NOT EXISTS backup_status(id INTEGER PRIMARY KEY CHECK(id=1),last_success TIMESTAMPTZ,last_error TEXT);
INSERT INTO backup_status(id) VALUES(1) ON CONFLICT(id) DO NOTHING;
CREATE TABLE IF NOT EXISTS stock_batches(id SERIAL PRIMARY KEY,request_id UUID NOT NULL UNIQUE,created_by INTEGER NOT NULL REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
