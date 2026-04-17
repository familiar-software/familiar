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
    id: 'jwt_like_token',
    rgPattern: String.raw`\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b`,
    jsPattern: String.raw`\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b`,
    jsFlags: 'g',
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
  },
  {
    id: 'us_ssn_dashed',
    rgPattern: String.raw`\b\d{3}-\d{2}-\d{4}\b`,
    jsPattern: String.raw`\b\d{3}-\d{2}-\d{4}\b`,
    jsFlags: 'g',
    maskStrategy: 'full',
    action: 'redact'
  },
  {
    id: 'us_ssn_spaced',
    rgPattern: String.raw`\b\d{3}\s\d{2}\s\d{4}\b`,
    jsPattern: String.raw`\b\d{3}\s\d{2}\s\d{4}\b`,
    jsFlags: 'g',
    maskStrategy: 'full',
    action: 'redact'
  },
  {
    id: 'google_oauth_client_secret',
    rgPattern: String.raw`\bGOCSPX-[A-Za-z0-9_-]{28,}\b`,
    jsPattern: String.raw`\bGOCSPX-[A-Za-z0-9_-]{28,}\b`,
    jsFlags: 'g',
    maskStrategy: 'full',
    action: 'redact'
  },
  {
    id: 'slack_webhook_url',
    rgPattern: String.raw`\bhttps://hooks\.slack\.com/services/T[A-Z0-9]+/B[A-Z0-9]+/[A-Za-z0-9]+\b`,
    jsPattern: String.raw`\bhttps://hooks\.slack\.com/services/T[A-Z0-9]+/B[A-Z0-9]+/[A-Za-z0-9]+\b`,
    jsFlags: 'g',
    maskStrategy: 'full',
    action: 'redact'
  },
  {
    id: 'npm_token',
    rgPattern: String.raw`\bnpm_[A-Za-z0-9]{36}\b`,
    jsPattern: String.raw`\bnpm_[A-Za-z0-9]{36}\b`,
    jsFlags: 'g',
    maskStrategy: 'full',
    action: 'redact'
  },
  {
    id: 'huggingface_token',
    rgPattern: String.raw`\bhf_[A-Za-z0-9]{34,}\b`,
    jsPattern: String.raw`\bhf_[A-Za-z0-9]{34,}\b`,
    jsFlags: 'g',
    maskStrategy: 'full',
    action: 'redact'
  },
  {
    id: 'digitalocean_token',
    rgPattern: String.raw`\b(?:dop|doo|dor|dot)_v1_[a-f0-9]{64}\b`,
    jsPattern: String.raw`\b(?:dop|doo|dor|dot)_v1_[a-f0-9]{64}\b`,
    jsFlags: 'g',
    maskStrategy: 'full',
    action: 'redact'
  },
  {
    id: 'postman_api_key',
    rgPattern: String.raw`\bPMAK-[a-f0-9]{24}-[a-f0-9]{34}\b`,
    jsPattern: String.raw`\bPMAK-[a-f0-9]{24}-[a-f0-9]{34}\b`,
    jsFlags: 'g',
    maskStrategy: 'full',
    action: 'redact'
  },
  {
    id: 'linear_api_key',
    rgPattern: String.raw`\blin_(?:api|oauth)_[A-Za-z0-9]{40}\b`,
    jsPattern: String.raw`\blin_(?:api|oauth)_[A-Za-z0-9]{40}\b`,
    jsFlags: 'g',
    maskStrategy: 'full',
    action: 'redact'
  },
  {
    id: 'figma_token',
    rgPattern: String.raw`\bfig[dupo]_[A-Za-z0-9_-]{40,}\b`,
    jsPattern: String.raw`\bfig[dupo]_[A-Za-z0-9_-]{40,}\b`,
    jsFlags: 'g',
    maskStrategy: 'full',
    action: 'redact'
  },
  {
    id: 'notion_secret',
    rgPattern: String.raw`\bsecret_[A-Za-z0-9]{43}\b`,
    jsPattern: String.raw`\bsecret_[A-Za-z0-9]{43}\b`,
    jsFlags: 'g',
    maskStrategy: 'full',
    action: 'redact'
  },
  {
    id: 'databricks_token',
    rgPattern: String.raw`\bdapi[a-f0-9]{32}\b`,
    jsPattern: String.raw`\bdapi[a-f0-9]{32}\b`,
    jsFlags: 'g',
    maskStrategy: 'full',
    action: 'redact'
  },
  {
    id: 'cloudflare_api_token',
    rgPattern: String.raw`\bCFPAT-[A-Za-z0-9_-]{40,}\b`,
    jsPattern: String.raw`\bCFPAT-[A-Za-z0-9_-]{40,}\b`,
    jsFlags: 'g',
    maskStrategy: 'full',
    action: 'redact'
  },
  {
    id: 'square_token',
    rgPattern: String.raw`\b(?:sq0[a-z]{3}-[A-Za-z0-9_-]{22,}|EAAA[A-Za-z0-9_-]{60,})\b`,
    jsPattern: String.raw`\b(?:sq0[a-z]{3}-[A-Za-z0-9_-]{22,}|EAAA[A-Za-z0-9_-]{60,})\b`,
    jsFlags: 'g',
    maskStrategy: 'full',
    action: 'redact'
  },
  {
    id: 'mailgun_key',
    rgPattern: String.raw`\bkey-[a-f0-9]{32}\b`,
    jsPattern: String.raw`\bkey-[a-f0-9]{32}\b`,
    jsFlags: 'g',
    maskStrategy: 'full',
    action: 'redact'
  },
  {
    id: 'mailchimp_key',
    rgPattern: String.raw`\b[a-f0-9]{32}-us\d{1,2}\b`,
    jsPattern: String.raw`\b[a-f0-9]{32}-us\d{1,2}\b`,
    jsFlags: 'g',
    maskStrategy: 'full',
    action: 'redact'
  },
  {
    id: 'discord_bot_token',
    rgPattern: String.raw`\b[MN][A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6,7}\.[A-Za-z0-9_-]{27,}\b`,
    jsPattern: String.raw`\b[MN][A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6,7}\.[A-Za-z0-9_-]{27,}\b`,
    jsFlags: 'g',
    maskStrategy: 'full',
    action: 'redact'
  },
  {
    id: 'telegram_bot_token',
    rgPattern: String.raw`\b\d{8,10}:[A-Za-z0-9_-]{35}\b`,
    jsPattern: String.raw`\b\d{8,10}:[A-Za-z0-9_-]{35}\b`,
    jsFlags: 'g',
    maskStrategy: 'full',
    action: 'redact'
  },
  {
    id: 'aws_secret_access_key_contextual',
    rgPattern: String.raw`(?i)\baws[_-]?secret[_-]?access[_-]?key\b\s*[:=]\s*["']?[A-Za-z0-9/+=]{40}["']?`,
    jsPattern: String.raw`\baws[_-]?secret[_-]?access[_-]?key\b\s*[:=]\s*["']?[A-Za-z0-9/+=]{40}["']?`,
    jsFlags: 'gi',
    maskStrategy: 'value_after_separator',
    action: 'redact'
  },
  {
    id: 'oauth_url_code_or_token',
    rgPattern: String.raw`(?i)[?&](?:code|(?:access|id|refresh)_token|state)=[A-Za-z0-9._~+/=-]{16,}`,
    jsPattern: String.raw`[?&](?:code|(?:access|id|refresh)_token|state)=[A-Za-z0-9._~+/=-]{16,}`,
    jsFlags: 'gi',
    maskStrategy: 'value_after_separator',
    action: 'redact'
  },
  {
    id: 'otp_verification_code_contextual',
    rgPattern: String.raw`(?i)\b(?:verification|auth(?:entication)?|security|login|sign[- ]?in|one[- ]?time|otp|2fa|mfa|two[- ]?factor)\s+(?:code|pin)\b[^\n]{0,20}\b\d{4,8}\b`,
    jsPattern: String.raw`\b(?:verification|auth(?:entication)?|security|login|sign[- ]?in|one[- ]?time|otp|2fa|mfa|two[- ]?factor)\s+(?:code|pin)\b[^\n]{0,20}\b\d{4,8}\b`,
    jsFlags: 'gi',
    maskStrategy: 'full',
    action: 'redact'
  },
  {
    id: 'iban_contextual',
    rgPattern: String.raw`(?i)\bIBAN\b[^\n]{0,30}\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b`,
    jsPattern: String.raw`\bIBAN\b[^\n]{0,30}\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b`,
    jsFlags: 'gi',
    maskStrategy: 'full',
    action: 'redact'
  },
  {
    id: 'bitcoin_wif_private_key',
    rgPattern: String.raw`\b[5KL][1-9A-HJ-NP-Za-km-z]{50,51}\b`,
    jsPattern: String.raw`\b[5KL][1-9A-HJ-NP-Za-km-z]{50,51}\b`,
    jsFlags: 'g',
    maskStrategy: 'full',
    action: 'redact'
  },
  {
    id: 'crypto_seed_phrase_keyword',
    rgPattern: String.raw`(?i)\b(?:seed\s*phrase|recovery\s*phrase|wallet\s*phrase|mnemonic\s*phrase|BIP\s*0?39)\b`,
    jsPattern: String.raw`\b(?:seed\s*phrase|recovery\s*phrase|wallet\s*phrase|mnemonic\s*phrase|BIP\s*0?39)\b`,
    jsFlags: 'gi',
    maskStrategy: 'none',
    action: 'drop',
    dropCategory: 'crypto_seed_keyword'
  }
])

// Label regex for the document-level SSN pass in rg-redaction.js. If
// any of these labels appears ANYWHERE in the captured content, every
// 9-digit number (dashed, spaced, or bare) elsewhere in the same
// document gets redacted. Intentionally broad — user prefers over-
// redacting to under-redacting SSNs.
const SSN_LABEL_REGEX = /(?:\bssn\b|\bss\s*#|\bsocial\s*security(?:\s*(?:no\.?|number|#))?|\btax\s*id\b)/i

module.exports = {
  RULES,
  SSN_LABEL_REGEX
}
