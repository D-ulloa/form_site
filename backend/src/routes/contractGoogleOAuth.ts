import { Router, type Request, type Response } from 'express';
import {
  clearContractOAuthCookies,
  contractOAuthFrontendRedirect,
  createContractOAuthState,
  exchangeContractGoogleCode,
  getContractGoogleAuthorizationUrl,
  getContractGoogleOAuthSession,
  getContractOAuthStateCookie,
  isValidContractOAuthState,
  serializeContractOAuthSessionCookie,
  serializeContractOAuthStateCookie,
  ContractGoogleOAuthConfigurationError,
  ContractGoogleOAuthError,
} from '../services/contractGoogleOAuth.js';

function setPrivateHeaders(res: Response): void {
  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'no-referrer');
}

function redirectWithError(res: Response, environment: NodeJS.ProcessEnv): void {
  const target = new URL(contractOAuthFrontendRedirect(environment), 'http://localhost');
  target.searchParams.set('oauth', 'error');
  if (contractOAuthFrontendRedirect(environment).startsWith('http')) {
    res.redirect(target.toString());
  } else {
    res.redirect(`${target.pathname}${target.search}`);
  }
}

export function createContractGoogleOAuthRouter(
  environment: NodeJS.ProcessEnv = process.env,
): Router {
  const router = Router();

  router.get('/google', (_req, res) => {
    setPrivateHeaders(res);
    try {
      const state = createContractOAuthState(environment);
      res.set('Set-Cookie', serializeContractOAuthStateCookie(state, environment));
      res.redirect(getContractGoogleAuthorizationUrl(state, environment));
    } catch (error) {
      if (!(error instanceof ContractGoogleOAuthConfigurationError)) {
        console.error('[contract-oauth] unable to start Google login', error instanceof Error ? error.name : 'UnknownError');
      }
      res.status(503).json({
        error: 'GOOGLE_OAUTH_UNAVAILABLE',
        message: 'El inicio de sesión con Google no está configurado.',
        retriable: false,
      });
    }
  });

  router.get('/google/callback', async (req: Request, res: Response) => {
    setPrivateHeaders(res);
    const state = typeof req.query.state === 'string' ? req.query.state : undefined;
    if (!isValidContractOAuthState(state, getContractOAuthStateCookie(req), environment)) {
      res.status(400).json({
        error: 'INVALID_OAUTH_STATE',
        message: 'La sesión de Google expiró. Volvé a iniciar sesión.',
        retriable: false,
      });
      return;
    }
    res.set('Set-Cookie', clearContractOAuthCookies(environment)[0] ?? '');
    const code = typeof req.query.code === 'string' ? req.query.code : undefined;
    if (!code) {
      redirectWithError(res, environment);
      return;
    }
    try {
      const user = await exchangeContractGoogleCode(code, environment);
      res.set('Set-Cookie', [
        clearContractOAuthCookies(environment)[0] ?? '',
        serializeContractOAuthSessionCookie(user, environment),
      ]);
      res.redirect(contractOAuthFrontendRedirect(environment));
    } catch (error) {
      if (!(error instanceof ContractGoogleOAuthError) && !(error instanceof ContractGoogleOAuthConfigurationError)) {
        console.error('[contract-oauth] Google callback failed', error instanceof Error ? error.name : 'UnknownError');
      }
      redirectWithError(res, environment);
    }
  });

  router.get('/session', (req, res) => {
    setPrivateHeaders(res);
    const session = getContractGoogleOAuthSession(req, environment);
    if (!session) {
      res.status(200).json({ authenticated: false });
      return;
    }
    res.status(200).json({
      authenticated: true,
      user: { id: session.userId, email: session.email, name: session.name },
    });
  });

  router.post('/logout', (_req, res) => {
    setPrivateHeaders(res);
    res.set('Set-Cookie', clearContractOAuthCookies(environment));
    res.status(204).end();
  });

  return router;
}

export default createContractGoogleOAuthRouter();
