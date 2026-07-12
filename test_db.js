const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://app_user:SecurePass123!@40.233.124.200:5432/db1',
  ssl: { rejectUnauthorized: false }
});

client.connect()
  .then(() => {
    return client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
  })
  .then(res => {
    console.log('Tables:', res.rows.map(r => r.table_name));
    return client.end();
  })
  .catch(e => {
    console.error('Connection failed:', e.message);
    process.exit(1);
  });
