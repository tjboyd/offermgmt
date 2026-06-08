import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { db, config } from '../db';

const router = Router();

const BRANDING_KEYS = [
  'org_name', 'logo_url', 'brand_primary', 'brand_secondary',
  'org_location', 'org_website', 'org_contact_email',
  'accept_page_instructions', 'accept_confirmation_text',
] as const;
type BrandingKey = typeof BRANDING_KEYS[number];

const DEFAULTS: Record<BrandingKey, string | null> = {
  org_name:                  'Jr Chargers',
  logo_url:                  null,
  brand_primary:             '#AD0303',
  brand_secondary:           null,
  org_location:              null,
  org_website:               null,
  org_contact_email:         null,
  accept_page_instructions:  null,
  accept_confirmation_text:  null,
};

const HEX_RE = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

function parseValue(raw: string | undefined): string | null {
  if (raw === undefined || raw === '') return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'string' ? parsed : raw;
  } catch {
    return raw;  // already a plain string, not JSON-encoded
  }
}

function rowsToResponse(rows: { key: string; value: string }[]) {
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    orgName:                parseValue(map['org_name'])                ?? DEFAULTS.org_name,
    logoUrl:                parseValue(map['logo_url'])                ?? DEFAULTS.logo_url,
    brandPrimary:           parseValue(map['brand_primary'])           ?? DEFAULTS.brand_primary,
    brandSecondary:         parseValue(map['brand_secondary'])         ?? DEFAULTS.brand_secondary,
    orgLocation:            parseValue(map['org_location'])            ?? DEFAULTS.org_location,
    orgWebsite:             parseValue(map['org_website'])             ?? DEFAULTS.org_website,
    orgContactEmail:        parseValue(map['org_contact_email'])       ?? DEFAULTS.org_contact_email,
    acceptPageInstructions: parseValue(map['accept_page_instructions']) ?? DEFAULTS.accept_page_instructions,
    acceptConfirmationText: parseValue(map['accept_confirmation_text']) ?? DEFAULTS.accept_confirmation_text,
  };
}

// GET /api/v1/org/branding — public, no auth required
router.get('/', async (_req, res, next) => {
  try {
    const rows = await db
      .select({ key: config.key, value: config.value })
      .from(config);

    const branding = rowsToResponse(rows.filter((r) => (BRANDING_KEYS as readonly string[]).includes(r.key)));
    res.json(branding);
  } catch (err) { next(err); }
});

// PATCH /api/v1/org/branding — admin only
router.patch('/', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const { orgName, logoUrl, brandPrimary, brandSecondary,
            orgLocation, orgWebsite, orgContactEmail,
            acceptPageInstructions, acceptConfirmationText,
          } = req.body as Record<string, unknown>;

    // Validate hex colors if provided
    if (brandPrimary !== undefined && brandPrimary !== null) {
      if (typeof brandPrimary !== 'string' || !HEX_RE.test(brandPrimary)) {
        return res.status(400).json({ error: 'brandPrimary must be a valid hex color (#RRGGBB or #RGB)' });
      }
    }
    if (brandSecondary !== undefined && brandSecondary !== null) {
      if (typeof brandSecondary !== 'string' || !HEX_RE.test(brandSecondary)) {
        return res.status(400).json({ error: 'brandSecondary must be a valid hex color (#RRGGBB or #RGB)' });
      }
    }

    const updates: Array<{ key: BrandingKey; value: string | null }> = [];
    if (orgName                !== undefined) updates.push({ key: 'org_name',                 value: orgName                as string | null });
    if (logoUrl                !== undefined) updates.push({ key: 'logo_url',                 value: logoUrl                as string | null });
    if (brandPrimary           !== undefined) updates.push({ key: 'brand_primary',            value: brandPrimary           as string | null });
    if (brandSecondary         !== undefined) updates.push({ key: 'brand_secondary',          value: brandSecondary         as string | null });
    if (orgLocation            !== undefined) updates.push({ key: 'org_location',             value: orgLocation            as string | null });
    if (orgWebsite             !== undefined) updates.push({ key: 'org_website',              value: orgWebsite             as string | null });
    if (orgContactEmail        !== undefined) updates.push({ key: 'org_contact_email',        value: orgContactEmail        as string | null });
    if (acceptPageInstructions !== undefined) updates.push({ key: 'accept_page_instructions', value: acceptPageInstructions as string | null });
    if (acceptConfirmationText !== undefined) updates.push({ key: 'accept_confirmation_text', value: acceptConfirmationText as string | null });

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields provided' });
    }

    for (const { key, value } of updates) {
      const storedValue = JSON.stringify(value ?? '');
      await db
        .insert(config)
        .values({ key, value: storedValue, updatedBy: req.user!.id })
        .onConflictDoUpdate({
          target: config.key,
          set: { value: storedValue, updatedBy: req.user!.id, updatedAt: new Date() },
        });
    }

    // Re-fetch all branding keys for response
    const rows = await db
      .select({ key: config.key, value: config.value })
      .from(config);

    const branding = rowsToResponse(rows.filter((r) => (BRANDING_KEYS as readonly string[]).includes(r.key)));
    res.json(branding);
  } catch (err) { next(err); }
});

// GET /api/v1/org/branding/accept-preview?page=accept|expired|confirmed — admin only
router.get('/accept-preview', authenticate, requireRole('admin', 'board'), async (req, res, next) => {
  try {
    const page = (req.query.page === 'expired' ? 'expired' : req.query.page === 'confirmed' ? 'confirmed' : 'accept') as 'accept' | 'expired' | 'confirmed';
    const rows = await db.select({ key: config.key, value: config.value }).from(config);
    const branding = rowsToResponse(rows.filter((r) => (BRANDING_KEYS as readonly string[]).includes(r.key)));
    const { renderAcceptPreview } = await import('./public');
    const html = renderAcceptPreview(branding, page);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) { next(err); }
});

export default router;
