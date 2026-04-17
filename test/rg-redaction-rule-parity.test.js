const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const { RULES } = require('../src/security/rg-redaction-rules')

const getBundledRgCandidate = () => {
  const archSuffix = process.arch === 'arm64' ? 'darwin-arm64' : process.arch === 'x64' ? 'darwin-x64' : ''
  if (!archSuffix) {
    return ''
  }
  return path.join(__dirname, '..', 'scripts', 'bin', 'rg', `rg-${archSuffix}`)
}

const resolveRgBinaryForParityTest = () => {
  const envOverride = process.env.FAMILIAR_RG_BINARY
  if (envOverride && fs.existsSync(envOverride)) {
    return envOverride
  }

  const bundled = getBundledRgCandidate()
  if (bundled && fs.existsSync(bundled)) {
    return bundled
  }

  return ''
}

const rgBinaryPath = resolveRgBinaryForParityTest()

const maskValueAfterSeparator = ({ matchText, ruleId }) => {
  const separatorIndex = matchText.search(/[:=]/)
  if (separatorIndex < 0) {
    return `[REDACTED:${ruleId}]`
  }

  const beforeSeparator = matchText.slice(0, separatorIndex + 1)
  const remainder = matchText.slice(separatorIndex + 1)
  const leadingWhitespace = (remainder.match(/^\s*/) || [''])[0]
  const trimmedRemainder = remainder.slice(leadingWhitespace.length)

  if (!trimmedRemainder) {
    return `${beforeSeparator}${leadingWhitespace}[REDACTED:${ruleId}]`
  }

  const openingQuote = trimmedRemainder[0] === '"' || trimmedRemainder[0] === "'"
    ? trimmedRemainder[0]
    : ''
  const trailingQuote = openingQuote && trimmedRemainder.endsWith(openingQuote)
    ? openingQuote
    : ''

  if (!openingQuote) {
    const trailingWhitespace = (trimmedRemainder.match(/\s*$/) || [''])[0]
    return `${beforeSeparator}${leadingWhitespace}[REDACTED:${ruleId}]${trailingWhitespace}`
  }

  return `${beforeSeparator}${leadingWhitespace}${openingQuote}[REDACTED:${ruleId}]${trailingQuote}`
}

const applyRuleMask = ({ rule, input }) => {
  if (rule.action === 'drop') {
    return input
  }
  const regex = new RegExp(rule.jsPattern, rule.jsFlags)
  return input.replace(regex, (matchText) => {
    if (rule.maskStrategy === 'value_after_separator') {
      return maskValueAfterSeparator({ matchText, ruleId: rule.id })
    }
    return `[REDACTED:${rule.id}]`
  })
}

const rgMatches = ({ pattern, input }) => {
  const result = spawnSync(
    rgBinaryPath,
    ['--engine', 'auto', '--line-number', '--no-heading', '-e', pattern, '-'],
    {
      input,
      encoding: 'utf8'
    }
  )

  if (result.status !== 0 && result.status !== 1) {
    throw new Error(
      `rg failed for pattern "${pattern}" (status ${result.status}): ${(result.stderr || '').trim()}`
    )
  }

  return result.status === 0
}

const CASES = Object.freeze([
  {
    ruleId: 'openai_sk',
    positive: 'openai: sk-abcdefghijklmnopqrstuvwxyz123456',
    negative: 'openai: sk-short',
    expected: 'openai: [REDACTED:openai_sk]'
  },
  {
    ruleId: 'anthropic_sk_ant',
    positive: 'anthropic: sk-ant-abcdefghijklmnopqrstuvwxyz123456',
    negative: 'anthropic: sk-ant-short',
    expected: 'anthropic: [REDACTED:anthropic_sk_ant]'
  },
  {
    ruleId: 'google_aiza',
    positive: 'google: AIza12345678901234567890123456789012345',
    negative: 'google: AIza1234567890',
    expected: 'google: [REDACTED:google_aiza]'
  },
  {
    ruleId: 'github_pat_classic',
    positive: 'github: ghp_abcdefghijklmnopqrstuvwxyz123456',
    negative: 'github: ghp_short',
    expected: 'github: [REDACTED:github_pat_classic]'
  },
  {
    ruleId: 'github_pat_fine_grained',
    positive: 'github: github_pat_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_ab',
    negative: 'github: github_pat_short',
    expected: 'github: [REDACTED:github_pat_fine_grained]'
  },
  {
    ruleId: 'aws_access_key_id',
    positive: 'aws: AKIA1234567890ABCDEF',
    negative: 'aws: AKIA1234',
    expected: 'aws: [REDACTED:aws_access_key_id]'
  },
  {
    ruleId: 'slack_token',
    positive: 'slack: xoxb-1234567890-abcdefghijklmnopqrst',
    negative: 'slack: xoxb-short',
    expected: 'slack: [REDACTED:slack_token]'
  },
  {
    ruleId: 'stripe_secret',
    positive: 'stripe: sk_live_abcdefghijklmnopqrstuvwxyz1234',
    negative: 'stripe: sk_live_short',
    expected: 'stripe: [REDACTED:stripe_secret]'
  },
  {
    ruleId: 'sendgrid_api_key',
    positive: 'sendgrid: SG.abcdefghijklmnop.ABCDEFGHIJKLMNOP',
    negative: 'sendgrid: SG.short.short',
    expected: 'sendgrid: [REDACTED:sendgrid_api_key]'
  },
  {
    ruleId: 'twilio_sid',
    positive: 'twilio: SK0123456789abcdef0123456789abcdef',
    negative: 'twilio: SK1234',
    expected: 'twilio: [REDACTED:twilio_sid]'
  },
  {
    ruleId: 'auth_bearer',
    positive: 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345',
    negative: 'Authorization: Bearer short',
    expected: '[REDACTED:auth_bearer]'
  },
  {
    ruleId: 'jwt_like_token',
    positive: 'token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IlRlc3QgVXNlciIsImlhdCI6MTUxNjIzOTAyMn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
    negative: 'token: eyJ-short.jwt',
    expected: 'token: [REDACTED:jwt_like_token]'
  },
  {
    ruleId: 'generic_api_assignment',
    positive: 'api_key = "abcDEF1234567890XYZ_+-/="',
    negative: 'api_key = short',
    expected: 'api_key = "[REDACTED:generic_api_assignment]"'
  },
  {
    ruleId: 'url_basic_auth',
    positive: 'https://user:supersecret@acme.local/path',
    negative: 'https://acme.local/path',
    expected: '[REDACTED:url_basic_auth]'
  },
  {
    ruleId: 'password_assignment',
    positive: 'password = "mysecretpass"',
    negative: 'password = abc',
    expected: 'password = "[REDACTED:password_assignment]"'
  },
  {
    ruleId: 'password_field_structured',
    positive: '"password": "json-secret"',
    negative: '"password": "abc"',
    expected: '"password": "[REDACTED:password_field_structured]"'
  },
  {
    ruleId: 'password_env_var',
    positive: 'DB_PASSWORD=mydbpass',
    negative: 'DB_PASSWORD=abc',
    expected: 'DB_PASSWORD=[REDACTED:password_env_var]'
  },
  {
    ruleId: 'generic_long_token_contextual',
    positive: 'credential: abcdefghijklmnopqrstuvwxyz123456',
    negative: 'credential: short',
    expected: '[REDACTED:generic_long_token_contextual]'
  },
  {
    ruleId: 'payment_keyword_context',
    positive: 'Please confirm payment method at checkout',
    negative: 'Please confirm your profile details',
    expected: 'Please confirm payment method at checkout'
  },
  {
    ruleId: 'payment_card_number_sequence',
    positive: 'card token 4242 4242 4242',
    negative: 'card token 4242 4242',
    expected: 'card token 4242 4242 4242'
  },
  {
    ruleId: 'us_ssn_dashed',
    positive: 'id: 123-45-6789',
    negative: 'id: 12-345-6789',
    expected: 'id: [REDACTED:us_ssn_dashed]'
  },
  {
    ruleId: 'us_ssn_spaced',
    positive: 'id: 123 45 6789',
    negative: 'id: 12 345 6789',
    expected: 'id: [REDACTED:us_ssn_spaced]'
  },
  {
    ruleId: 'google_oauth_client_secret',
    positive: 'client_secret: GOCSPX-abcdefghijklmnopqrstuvwxyz01',
    negative: 'client_secret: GOCSPX-short',
    expected: 'client_secret: [REDACTED:google_oauth_client_secret]'
  },
  {
    ruleId: 'slack_webhook_url',
    positive: 'webhook https://hooks.slack.com/services/T12345/B67890/AbCdEf12345',
    negative: 'webhook https://example.com/services/T12345/B67890/abc',
    expected: 'webhook [REDACTED:slack_webhook_url]'
  },
  {
    ruleId: 'npm_token',
    positive: 'npm: npm_abcdefghijklmnopqrstuvwxyz0123456789',
    negative: 'npm: npm_short',
    expected: 'npm: [REDACTED:npm_token]'
  },
  {
    ruleId: 'huggingface_token',
    positive: 'hf: hf_abcdefghijklmnopqrstuvwxyz01234567ABcd',
    negative: 'hf: hf_short',
    expected: 'hf: [REDACTED:huggingface_token]'
  },
  {
    ruleId: 'digitalocean_token',
    positive: 'do: dop_v1_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    negative: 'do: dop_v1_short',
    expected: 'do: [REDACTED:digitalocean_token]'
  },
  {
    ruleId: 'postman_api_key',
    positive: 'pm: PMAK-abcdef012345abcdef012345-abcdef012345abcdef012345abcdef0123',
    negative: 'pm: PMAK-short',
    expected: 'pm: [REDACTED:postman_api_key]'
  },
  {
    ruleId: 'linear_api_key',
    positive: 'lin: lin_api_0123456789abcdefghij0123456789abcdefghij',
    negative: 'lin: lin_api_short',
    expected: 'lin: [REDACTED:linear_api_key]'
  },
  {
    ruleId: 'figma_token',
    positive: 'figma: figd_0123456789abcdefghij0123456789abcdefghij0',
    negative: 'figma: figd_short',
    expected: 'figma: [REDACTED:figma_token]'
  },
  {
    ruleId: 'notion_secret',
    positive: 'notion: secret_0123456789abcdefghij0123456789abcdefghij012',
    negative: 'notion: secret_short',
    expected: 'notion: [REDACTED:notion_secret]'
  },
  {
    ruleId: 'databricks_token',
    positive: 'db: dapi0123456789abcdef0123456789abcdef',
    negative: 'db: dapi_short',
    expected: 'db: [REDACTED:databricks_token]'
  },
  {
    ruleId: 'cloudflare_api_token',
    positive: 'cf: CFPAT-abcdefghijklmnopqrstuvwxyz0123456789abcd',
    negative: 'cf: CFPAT-short',
    expected: 'cf: [REDACTED:cloudflare_api_token]'
  },
  {
    ruleId: 'square_token',
    positive: 'sq: sq0csp-abcdefghijklmnopqrstuv',
    negative: 'sq: sq0csp-short',
    expected: 'sq: [REDACTED:square_token]'
  },
  {
    ruleId: 'mailgun_key',
    positive: 'mg: key-0123456789abcdef0123456789abcdef',
    negative: 'mg: key-short',
    expected: 'mg: [REDACTED:mailgun_key]'
  },
  {
    ruleId: 'mailchimp_key',
    positive: 'mc: 0123456789abcdef0123456789abcdef-us1',
    negative: 'mc: 0123-us1',
    expected: 'mc: [REDACTED:mailchimp_key]'
  },
  {
    ruleId: 'discord_bot_token',
    positive: 'dc: MTAxMjM0NTY3ODkwMTIzNDU2Nzg.AbcDef.ghijklmnopqrstuvwxyz0123456789AB',
    negative: 'dc: M.short.t',
    expected: 'dc: [REDACTED:discord_bot_token]'
  },
  {
    ruleId: 'telegram_bot_token',
    positive: 'tg: 123456789:abcdefghijklmnopqrstuvwxyzABCDEFGHI',
    negative: 'tg: 123:short',
    expected: 'tg: [REDACTED:telegram_bot_token]'
  },
  {
    ruleId: 'aws_secret_access_key_contextual',
    positive: 'AWS_SECRET_ACCESS_KEY = "abcd/efgh+ijklmnopqrstuvwxyz0123456789AB"',
    negative: 'AWS_SECRET_ACCESS_KEY = "short"',
    expected: 'AWS_SECRET_ACCESS_KEY = "[REDACTED:aws_secret_access_key_contextual]"'
  },
  {
    ruleId: 'oauth_url_code_or_token',
    positive: 'visit https://app.example.com/callback?code=abcdefghijklmnopqrstuvwxyz0123456789&state=x',
    negative: 'visit https://app.example.com/callback?foo=short',
    expected: 'visit https://app.example.com/callback?code=[REDACTED:oauth_url_code_or_token]&state=x'
  },
  {
    ruleId: 'otp_verification_code_contextual',
    positive: 'Your verification code is 427192',
    negative: 'Your daily note is 427192',
    expected: 'Your [REDACTED:otp_verification_code_contextual]'
  },
  {
    ruleId: 'iban_contextual',
    positive: 'IBAN: DE89370400440532013000',
    negative: 'IBAN: short',
    expected: '[REDACTED:iban_contextual]'
  },
  {
    ruleId: 'bitcoin_wif_private_key',
    positive: 'wif: 5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ',
    negative: 'wif: 5short',
    expected: 'wif: [REDACTED:bitcoin_wif_private_key]'
  },
  {
    ruleId: 'crypto_seed_phrase_keyword',
    positive: 'Here is my seed phrase',
    negative: 'Here is my daily note',
    expected: 'Here is my seed phrase'
  }
])

test(
  'each redaction rule has JS and rg parity for positive/negative inputs and expected transform',
  { skip: !rgBinaryPath && 'No rg binary available for parity test in this environment.' },
  () => {
    for (const testCase of CASES) {
      const rule = RULES.find((entry) => entry.id === testCase.ruleId)
      assert.ok(rule, `Missing rule for test case: ${testCase.ruleId}`)

      const jsRegex = new RegExp(rule.jsPattern, rule.jsFlags)
      assert.equal(jsRegex.test(testCase.positive), true, `${rule.id} JS should match positive input`)
      assert.equal(jsRegex.test(testCase.negative), false, `${rule.id} JS should not match negative input`)

      assert.equal(
        rgMatches({ pattern: rule.rgPattern, input: `${testCase.positive}\n` }),
        true,
        `${rule.id} rg should match positive input`
      )
      assert.equal(
        rgMatches({ pattern: rule.rgPattern, input: `${testCase.negative}\n` }),
        false,
        `${rule.id} rg should not match negative input`
      )

      assert.equal(
        applyRuleMask({ rule, input: testCase.positive }),
        testCase.expected,
        `${rule.id} should produce expected redaction output`
      )
    }
  }
)
