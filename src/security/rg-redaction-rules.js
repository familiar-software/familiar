const RULES = Object.freeze([
  {
    id: 'openai_sk',
    rgPattern: String.raw`\bsk-[A-Za-z0-9_-]{20,}\b`,
    jsPattern: String.raw`\bsk-[A-Za-z0-9_-]{20,}\b`,
    jsFlags: 'g',
    maskStrategy: 'full',
    action: 'redact'
  },
  {
    id: 'anthropic_sk_ant',
    rgPattern: String.raw`\bsk-ant-[A-Za-z0-9_-]{20,}\b`,
    jsPattern: String.raw`\bsk-ant-[A-Za-z0-9_-]{20,}\b`,
    jsFlags: 'g',
    maskStrategy: 'full',
    action: 'redact'
  },
  {
    id: 'google_aiza',
    rgPattern: String.raw`\bAIza[0-9A-Za-z_-]{35}\b`,
    jsPattern: String.raw`\bAIza[0-9A-Za-z_-]{35}\b`,
    jsFlags: 'g',
    maskStrategy: 'full',
    action: 'redact'
  },
  {
    id: 'github_pat_classic',
    rgPattern: String.raw`\bgh[pousr]_[A-Za-z0-9]{30,}\b`,
    jsPattern: String.raw`\bgh[pousr]_[A-Za-z0-9]{30,}\b`,
    jsFlags: 'g',
    maskStrategy: 'full',
    action: 'redact'
  },
  {
    id: 'github_pat_fine_grained',
    rgPattern: String.raw`\bgithub_pat_[A-Za-z0-9_]{60,}\b`,
    jsPattern: String.raw`\bgithub_pat_[A-Za-z0-9_]{60,}\b`,
    jsFlags: 'g',
    maskStrategy: 'full',
    action: 'redact'
  },
  {
    id: 'aws_access_key_id',
    rgPattern: String.raw`\b(?:AKIA|ASIA|AIDA|AROA|AGPA|A3T|AIPA|ANPA|ANVA)[A-Z0-9]{16}\b`,
    jsPattern: String.raw`\b(?:AKIA|ASIA|AIDA|AROA|AGPA|A3T|AIPA|ANPA|ANVA)[A-Z0-9]{16}\b`,
    jsFlags: 'g',
    maskStrategy: 'full',
    action: 'redact'
  },
  {
    id: 'slack_token',
    rgPattern: String.raw`\bxox(?:a|b|p|r|s)-[A-Za-z0-9-]{10,}\b`,
    jsPattern: String.raw`\bxox(?:a|b|p|r|s)-[A-Za-z0-9-]{10,}\b`,
    jsFlags: 'g',
    maskStrategy: 'full',
    action: 'redact'
  },
  {
    id: 'stripe_secret',
    rgPattern: String.raw`\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b`,
    jsPattern: String.raw`\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b`,
    jsFlags: 'g',
    maskStrategy: 'full',
    action: 'redact'
  },
  {
    id: 'sendgrid_api_key',
    rgPattern: String.raw`\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b`,
    jsPattern: String.raw`\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b`,
    jsFlags: 'g',
    maskStrategy: 'full',
    action: 'redact'
  },
  {
    id: 'twilio_sid',
    rgPattern: String.raw`\b(?:SK|AC)[A-Fa-f0-9]{32}\b`,
    jsPattern: String.raw`\b(?:SK|AC)[A-Fa-f0-9]{32}\b`,
    jsFlags: 'g',
    maskStrategy: 'full',
    action: 'redact'
  },
  {
    id: 'auth_bearer',
    rgPattern: String.raw`(?i)authorization\s*:\s*bearer\s+[A-Za-z0-9._~+/=-]{12,}`,
    jsPattern: String.raw`authorization\s*:\s*bearer\s+[A-Za-z0-9._~+/=-]{12,}`,
    jsFlags: 'gi',
    maskStrategy: 'full',
    action: 'redact'
  },
  {
    id: 'generic_api_assignment',
    rgPattern: String.raw`(?i)\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|secret[_-]?key|client[_-]?secret|token)\b\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{12,}["']?`,
    jsPattern: String.raw`\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|secret[_-]?key|client[_-]?secret|token)\b\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{12,}["']?`,
    jsFlags: 'gi',
    maskStrategy: 'value_after_separator',
    action: 'redact'
  },
  {
    id: 'url_basic_auth',
    rgPattern: String.raw`\b[a-zA-Z][a-zA-Z0-9+.-]*://[^\s/@:]+:[^\s/@]+@[^\s]+`,
    jsPattern: String.raw`\b[a-zA-Z][a-zA-Z0-9+.-]*://[^\s/@:]+:[^\s/@]+@[^\s]+`,
    jsFlags: 'g',
    maskStrategy: 'full',
    action: 'redact'
  },
  {
    id: 'password_assignment',
    rgPattern: String.raw`(?i)\b(?:password|passwd|pwd|passphrase)\b\s*[:=]\s*["']?[^\s"']{4,}["']?`,
    jsPattern: String.raw`\b(?:password|passwd|pwd|passphrase)\b\s*[:=]\s*["']?[^\s"']{4,}["']?`,
    jsFlags: 'gi',
    maskStrategy: 'value_after_separator',
    action: 'redact'
  },
  {
    id: 'password_field_structured',
    rgPattern: String.raw`(?i)["']?(?:password|passwd|pwd|passphrase)["']?\s*:\s*["'][^"']{4,}["']`,
    jsPattern: String.raw`["']?(?:password|passwd|pwd|passphrase)["']?\s*:\s*["'][^"']{4,}["']`,
    jsFlags: 'gi',
    maskStrategy: 'value_after_separator',
    action: 'redact'
  },
  {
    id: 'password_env_var',
    rgPattern: String.raw`(?i)\b(?:DB_PASSWORD|PGPASSWORD|MYSQL_PWD|REDIS_PASSWORD|RABBITMQ_PASSWORD|BASIC_AUTH_PASSWORD)\b\s*[:=]\s*["']?[^\s"']{4,}["']?`,
    jsPattern: String.raw`\b(?:DB_PASSWORD|PGPASSWORD|MYSQL_PWD|REDIS_PASSWORD|RABBITMQ_PASSWORD|BASIC_AUTH_PASSWORD)\b\s*[:=]\s*["']?[^\s"']{4,}["']?`,
    jsFlags: 'gi',
    maskStrategy: 'value_after_separator',
    action: 'redact'
  },
  {
    id: 'generic_long_token_contextual',
    rgPattern: String.raw`(?i)\b(?:key|token|secret|bearer|credential)\b[^\n]{0,30}[A-Za-z0-9_-]{24,}`,
    jsPattern: String.raw`\b(?:key|token|secret|bearer|credential)\b[^\n]{0,30}[A-Za-z0-9_-]{24,}`,
    jsFlags: 'gi',
    maskStrategy: 'full',
    action: 'redact'
  },
  {
    id: 'payment_keyword_context',
    rgPattern: String.raw`(?i)\b(?:credit|debit|card|card number|security code|cvv|cvc|amex|axp|expiry|expiration|exp date|checkout|payment|billing|cardholder|pay now|place order|confirm payment)\b`,
    jsPattern: String.raw`\b(?:credit|debit|card|card number|security code|cvv|cvc|amex|axp|expiry|expiration|exp date|checkout|payment|billing|cardholder|pay now|place order|confirm payment)\b`,
    jsFlags: 'gi',
    maskStrategy: 'none',
    action: 'drop',
    dropCategory: 'payment_keyword'
  },
  {
    id: 'payment_card_number_sequence',
    rgPattern: String.raw`(?i)\b(?:\d[ -]*){10,}\b`,
    jsPattern: String.raw`\b(?:\d[ -]*){10,}\b`,
    jsFlags: 'g',
    maskStrategy: 'none',
    action: 'drop',
    dropCategory: 'payment_card_number'
  }
])

module.exports = {
  RULES
}
