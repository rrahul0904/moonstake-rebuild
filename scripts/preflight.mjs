const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateProductionEnv(env = process.env) {
  const errors = [];
  const warnings = [];
  const required = [
    'APP_URL',
    'SUPABASE_URL',
    'SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_SECRET_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'ADMIN_EMAILS',
  ];

  for (const key of required) {
    if (!String(env[key] || '').trim()) errors.push(`${key} is required`);
  }

  if (env.BACKEND_MODE && env.BACKEND_MODE !== 'supabase') {
    errors.push('BACKEND_MODE must be supabase for production');
  }
  if (env.NODE_ENV && env.NODE_ENV !== 'production') {
    warnings.push('NODE_ENV is not production');
  }

  if (env.APP_URL) {
    try {
      const url = new URL(env.APP_URL);
      if (url.protocol !== 'https:') errors.push('APP_URL must use https');
      if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) errors.push('APP_URL must not point to localhost');
    } catch {
      errors.push('APP_URL must be a valid absolute URL');
    }
  }

  if (env.SUPABASE_URL) {
    try {
      const url = new URL(env.SUPABASE_URL);
      if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co')) {
        errors.push('SUPABASE_URL must be an https://*.supabase.co URL');
      }
    } catch {
      errors.push('SUPABASE_URL must be a valid absolute URL');
    }
  }

  if (env.SUPABASE_PUBLISHABLE_KEY && !String(env.SUPABASE_PUBLISHABLE_KEY).startsWith('sb_publishable_')) {
    errors.push('SUPABASE_PUBLISHABLE_KEY must use the modern sb_publishable_ key format');
  }
  if (env.SUPABASE_SECRET_KEY && !String(env.SUPABASE_SECRET_KEY).startsWith('sb_secret_')) {
    errors.push('SUPABASE_SECRET_KEY must use the modern sb_secret_ key format');
  }
  if (env.SUPABASE_SECRET_KEY && env.SUPABASE_SECRET_KEY === env.SUPABASE_PUBLISHABLE_KEY) {
    errors.push('Supabase publishable and secret keys must be different');
  }

  if (env.STRIPE_WEBHOOK_SECRET && !String(env.STRIPE_WEBHOOK_SECRET).startsWith('whsec_')) {
    errors.push('STRIPE_WEBHOOK_SECRET must start with whsec_');
  }
  if (env.STRIPE_SECRET_KEY) {
    const key = String(env.STRIPE_SECRET_KEY);
    if (!/^(rk|sk)_(test|live)_/.test(key)) {
      errors.push('STRIPE_SECRET_KEY must be a Stripe restricted or secret key');
    } else if (key.startsWith('sk_')) {
      warnings.push('Use a restricted rk_ Stripe key instead of a full sk_ key when possible');
    }
  }

  if (env.STRIPE_CONNECT_ENABLED && !['true','false'].includes(String(env.STRIPE_CONNECT_ENABLED).toLowerCase())) {
    errors.push('STRIPE_CONNECT_ENABLED must be true or false when set');
  }
  if (String(env.STRIPE_CONNECT_ENABLED || '').toLowerCase() === 'true') {
    const country=String(env.STRIPE_CONNECT_DEFAULT_COUNTRY || 'US').toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) errors.push('STRIPE_CONNECT_DEFAULT_COUNTRY must be a 2-letter country code');
  } else {
    warnings.push('Stripe Connect seller payouts are disabled; secondary-market seller acceptance remains launch-gated');
  }

  if (env.ADMIN_EMAILS) {
    const emails = String(env.ADMIN_EMAILS).split(',').map((x) => x.trim()).filter(Boolean);
    if (!emails.length || emails.some((email) => !emailPattern.test(email))) {
      errors.push('ADMIN_EMAILS must contain one or more valid comma-separated email addresses');
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = validateProductionEnv(process.env);
  for (const warning of result.warnings) console.warn(`WARN: ${warning}`);
  if (!result.ok) {
    for (const error of result.errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
  } else {
    console.log('Moonstake production environment preflight passed.');
  }
}
