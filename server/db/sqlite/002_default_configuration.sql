INSERT INTO form_fields (id, label, field_key, type, required, enabled, position, updated_at)
VALUES
  ('field-name', 'Full name', 'name', 'text', 1, 1, 0, CURRENT_TIMESTAMP),
  ('field-phone', 'Phone', 'phone', 'tel', 1, 1, 1, CURRENT_TIMESTAMP),
  ('field-email', 'Email', 'email', 'email', 1, 1, 2, CURRENT_TIMESTAMP),
  ('field-age', 'Age', 'age', 'number', 0, 1, 3, CURRENT_TIMESTAMP),
  ('field-address', 'Address', 'address', 'textarea', 0, 1, 4, CURRENT_TIMESTAMP);

INSERT INTO settings (key, value, updated_at)
VALUES
  ('general', '{"brandName":"Nexus Support","widgetGreeting":"Hi! How can I help today?","officeHours":"","autoHandoff":true}', CURRENT_TIMESTAMP),
  ('quickReplies', '[]', CURRENT_TIMESTAMP),
  ('persona', '"You are a helpful, concise customer support assistant."', CURRENT_TIMESTAMP),
  ('rules', '[]', CURRENT_TIMESTAMP),
  ('requestedPermissions', '{"location":true,"camera":true,"microphone":true,"screen":true}', CURRENT_TIMESTAMP),
  ('activeProviderId', '"groq"', CURRENT_TIMESTAMP),
  ('activeModel', '"openai/gpt-oss-20b"', CURRENT_TIMESTAMP);
