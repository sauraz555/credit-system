import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { mfa_token, totp_code } = body;

    if (!totp_code || totp_code.trim().length !== 6) {
      return NextResponse.json(
        { detail: 'Please enter a valid 6-digit TOTP authentication code.' },
        { status: 400 }
      );
    }

    // Determine role from recent login or fallback to ADMIN
    let role = 'ADMIN';
    let email = 'admin@creditreporting.gov.np';
    let tenantId = 'CIC-GOV-NP';

    if (mfa_token && typeof mfa_token === 'string') {
      if (mfa_token.includes('analyst') || mfa_token.includes('ANALYST')) {
        role = 'ANALYST';
        email = 'analyst@creditreporting.gov.np';
      } else if (mfa_token.includes('provider') || mfa_token.includes('PROVIDER')) {
        role = 'PROVIDER';
        email = 'provider@nabilbank.com';
        tenantId = 'PRV-NABIL-001';
      }
    }

    const maxAge = 7 * 24 * 60 * 60;
    const res = NextResponse.json({
      access_token: `jwt-${role.toLowerCase()}-${Date.now()}`,
      refresh_token: `refresh-${role.toLowerCase()}-${Date.now()}`,
      user: {
        email,
        role,
        tenant_id: tenantId,
        name: `${role} Officer`
      }
    });

    res.cookies.set('auth_token', `jwt-${role.toLowerCase()}-${Date.now()}`, {
      path: '/',
      maxAge,
      sameSite: 'lax'
    });
    res.cookies.set('auth_role', role, {
      path: '/',
      maxAge,
      sameSite: 'lax'
    });

    return res;
  } catch (err: any) {
    return NextResponse.json(
      { detail: err?.message || 'MFA verification failed' },
      { status: 500 }
    );
  }
}
