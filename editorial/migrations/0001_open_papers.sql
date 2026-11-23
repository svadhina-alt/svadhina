CREATE TABLE records (
  key TEXT PRIMARY KEY,
  etag TEXT NOT NULL,
  metadata TEXT NOT NULL,
  expires INTEGER
);
CREATE INDEX record_expiration ON records(expires) WHERE expires IS NOT NULL;
CREATE TABLE segments (
  key TEXT NOT NULL REFERENCES records(key) ON DELETE CASCADE,
  offset INTEGER NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY(key, offset)
);
